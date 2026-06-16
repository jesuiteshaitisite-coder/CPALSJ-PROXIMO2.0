// ─── Motor de proyección demográfica 2026→2100 (Fase 4) ─────────────────────
// Modelo validado con Alex (15-jun-2026) provincia por provincia. Detalle del
// modelo y supuestos en la memoria del proyecto (cpalsj_fase4_modelo).
//
// Principios:
//  · Fuente única = PERSONAS, envejecida individuo a individuo hasta los 85.
//  · Los que hoy están en formación son RELEVO REAL: se incorporan en su año de
//    activación (AÑO_ENTRADA + AÑOS_FORMACION) y ponderados por perseverancia.
//  · Un único factor de perseverancia gobierna a la vez el relevo real y los
//    ingresos futuros simulados (reposición).
//  · Disponibilidad = DISPONIBLE OBRAS (NO se infiere de ESTADO ACTIVIDAD).
//  · Residencias/comunidades NUNCA computan como demanda.
//  · Degradación elegante ante campos vacíos en cualquier hoja.

import { normProv, parseNum } from '../services/sheetsService.js';
import {
  provinciaDePersona, provinciaDeObra, esResidencia, tipoDeObra,
} from './calculations.js';

export const PROY_INICIO = 2026;
export const PROY_FIN = 2100;
const EDAD_INGRESO_ACTIVO = 30;

// Años con columna en TS_SIN_REP (sirven de eje del gráfico y de control).
export const ANIOS_CURVA = [2026, 2030, 2035, 2040, 2045, 2050, 2055, 2060, 2070, 2080, 2090, 2100];

// ── Lectura de campos de una persona ────────────────────────────────────────

// Año desde un valor gviz "Date(AAAA,M,D)" o un número/año suelto.
function añoDeValor(v) {
  if (!v) return null;
  const s = String(v).trim();
  const m = s.match(/Date\((\d{4})/);
  if (m) return Number(m[1]);
  const n = parseInt(s, 10);
  return n > 1800 && n < 2100 ? n : null;
}

function nacimientoDe(p) { return añoDeValor(p['FECHA_NACIMIENTO']); }
function entradaDe(p)    { return añoDeValor(p['AÑO_ENTRADA']); }
function fuerzaDe(p)     { return (p['FUERZA APOSTOLICA'] || '').trim(); }
function estadoDe(p)     { return (p['ESTADO NORMALIZADO'] || '').trim().toUpperCase(); }
function disponibleDe(p) { return (p['DISPONIBLE OBRAS'] || '').trim().toLowerCase().startsWith('s'); }

const DEDICABLES = new Set(['P', 'S', 'F', 'O']); // novicios (NS) excluidos

// ── Configuración resuelta (PARAMETROS + escenario de los sliders) ───────────

export function resolverCfg(params, escenario) {
  const pp = params || {};
  const persevGlobalDe10 = pp.PERSEVERANCIA_DE_CADA_10 ?? 6;

  // Perseverancia POR PROVINCIA: cada Provincial la fija en la hoja dedicada
  // PERSEVERANCIA_PROVINCIA (la capa de datos ya la leyó, normalizó por provincia
  // y validó 1–10 → `params.persevPorProvincia`). Mientras una provincia no tenga
  // su dato, cae al global (fallback 6). Funciona desde hoy con datos incompletos.
  const persevPorProv = pp.persevPorProvincia || {};

  // Override puntual del slider (Fase 5): { provincia, de10 } | null. Cuando el
  // alcance es una sola provincia, el slider mueve la perseverancia de ESA prov.
  const persevOverride = escenario?.persevOverride ?? null;

  return {
    salida:          pp.EDAD_SALIDA ?? 85,
    finDireccionA:   pp.EDAD_FIN_DIRECCION_A ?? 70,
    aniosFormacion:  pp['AÑOS_FORMACION'] ?? pp.ANIOS_FORMACION ?? 10,
    anioBase:        pp.ANIO_BASE ?? 2026,
    persevGlobalDe10,
    persevPorProv,
    persevOverride,
    // Compat: perseverancia «global» (último fallback; se usa solo cuando una
    // función opera sin contexto de provincia). El cálculo real es por provincia.
    perseveranciaDe10: persevGlobalDe10,
    perseverancia:   persevGlobalDe10 / 10,
    fai:             escenario?.fai ?? pp.FAI ?? 2,
    ingresosAnuales: escenario?.ingresosAnuales ?? 0,
  };
}

const clamp1a10 = n => Math.min(10, Math.max(1, n));

// PUNTO ÚNICO de resolución de la perseverancia (de 10) de una provincia. Toda
// la app pasa por aquí — no se duplica la lógica de fallback en ningún sitio.
// Prioridad EXACTA:
//   1. Override activo del slider (Fase 5) sobre ESA provincia → simula escenarios.
//   2. Valor propio de la provincia en la hoja PERSEVERANCIA_PROVINCIA (ya leído,
//      normalizado y validado 1–10 por la capa de datos).
//   3. Fallback global PERSEVERANCIA_DE_CADA_10 (hoy 6).
// Siempre acotado a 1–10 antes de devolverse (defensivo).
export function persevDe10DeProvincia(cfg, prov) {
  const pv = normProv(prov);
  if (cfg.persevOverride && normProv(cfg.persevOverride.provincia) === pv) {
    return clamp1a10(cfg.persevOverride.de10);
  }
  const v = cfg.persevPorProv?.[pv];
  return clamp1a10(v != null ? v : cfg.persevGlobalDe10);
}

// Clona cfg fijando la perseverancia de una provincia, para reutilizar las
// funciones por-persona (que leen cfg.perseverancia) con el valor correcto.
export function cfgDeProvincia(cfg, prov) {
  const de10 = persevDe10DeProvincia(cfg, prov);
  return { ...cfg, perseveranciaDe10: de10, perseverancia: de10 / 10 };
}

// Suma de factores de perseverancia (de10/10) de un conjunto de provincias.
// Es la sensibilidad de la reposición agregada por cada ingreso/año (porque
// cohortes_activas(Y) es igual para todas las provincias).
export function sumaPersev(provincias, cfg) {
  return provincias.reduce((s, prov) => s + persevDe10DeProvincia(cfg, prov) / 10, 0);
}

// Perseverancia ponderada del alcance: el único número representativo a MOSTRAR
// cuando el alcance es CPALSJ (en la vista de una sola provincia devuelve su
// propio valor, porque la media ponderada de un único elemento es ese elemento).
// NO se usa en el cálculo demográfico (ahí cada provincia aplica su propio valor
// a su gente); sirve para frases y glosario.
// PONDERACIÓN = «futuros relevos» de cada provincia, que es justo lo que la
// perseverancia afecta = (escolares en formación que se activarán) + (ingresos
// anuales simulados que le corresponden a esa provincia, a lo largo del horizonte
// = ingresosAnuales × nº de cohortes que siguen activas en 2100). Así una
// provincia con 40 escolares pesa mucho más que una con 3. Si no hay relevos en
// ninguna (0 escolares y 0 ingresos), cae a media simple; sin provincias, al global.
export function perseveranciaPonderadaDe10(sheets, provincias, cfg) {
  if (!provincias.length) return cfg.persevGlobalDe10;
  const ingresosFuturosPorProv = cfg.ingresosAnuales > 0
    ? cfg.ingresosAnuales * cohortesActivas(PROY_FIN, cfg)
    : 0;
  let num = 0, den = 0, sumaSimple = 0;
  for (const prov of provincias) {
    const de10 = persevDe10DeProvincia(cfg, prov);
    const escolares = personasDeProvincia(sheets, prov)
      .filter(p => fuerzaDe(p) === 'Formación').length;
    const peso = escolares + ingresosFuturosPorProv; // futuros relevos de la provincia
    num += de10 * peso;
    den += peso;
    sumaSimple += de10;
  }
  return den > 0 ? num / den : sumaSimple / provincias.length;
}

// ── Aporte de una persona a la fuerza activa / al pool A en un año ───────────

// Fuerza activa: ya activos cuentan 1; en formación cuentan «perseverancia»
// desde su año de activación; retirados y fuera de 30–84 cuentan 0.
function aporteActivo(p, Y, cfg) {
  const nac = nacimientoDe(p);
  if (nac === null) return 0;
  const edad = Y - nac;
  if (edad < EDAD_INGRESO_ACTIVO || edad >= cfg.salida) return 0;
  const f = fuerzaDe(p);
  if (f === 'Formación') {
    const ent = entradaDe(p);
    if (ent === null) return 0;                       // sin año de entrada: no se puede activar
    if (Y < ent + cfg.aniosFormacion) return 0;       // aún en formación
    return cfg.perseverancia;                          // relevo real, descontado por perseverancia
  }
  if (f === 'Plena' || f === 'Acompañamiento') return 1;
  return 0;
}

// Pool A: como aporteActivo, pero exige estado dedicable (no novicios) y, para
// los ya activos, DISPONIBLE OBRAS = Sí. Los que se activan desde formación se
// asumen disponibles+dedicables (ponderados por perseverancia).
function aportePoolA(p, Y, cfg) {
  const nac = nacimientoDe(p);
  if (nac === null) return 0;
  const edad = Y - nac;
  if (edad < EDAD_INGRESO_ACTIVO || edad >= cfg.salida) return 0;
  if (!DEDICABLES.has(estadoDe(p))) return 0;
  const f = fuerzaDe(p);
  if (f === 'Formación') {
    const ent = entradaDe(p);
    if (ent === null) return 0;
    if (Y < ent + cfg.aniosFormacion) return 0;
    return cfg.perseverancia;
  }
  if (f === 'Plena' || f === 'Acompañamiento') return disponibleDe(p) ? 1 : 0;
  return 0;
}

// ── Agregados por año sobre un conjunto de personas ──────────────────────────

export function fuerzaActivaEn(personas, Y, cfg) {
  let s = 0;
  for (const p of personas) s += aporteActivo(p, Y, cfg);
  return s;
}

export function poolABaseEn(personas, Y, cfg) {
  let s = 0;
  for (const p of personas) s += aportePoolA(p, Y, cfg);
  return s;
}

// ── Reposición (ingresos futuros simulados) ──────────────────────────────────
// Cada cohorte entra a los 30 y sigue activa mientras (Y − año_ingreso) < 55.
// nProvincias permite que, en alcance CPALSJ, la tasa sea POR provincia.
export function cohortesActivas(Y, cfg) {
  const ventana = cfg.salida - EDAD_INGRESO_ACTIVO; // 55
  let n = 0;
  for (let y = cfg.anioBase; y <= Y; y++) if (Y - y < ventana) n++;
  return n;
}

export function reposicionEn(Y, cfg, nProvincias = 1) {
  if (Y < cfg.anioBase) return 0;
  return cfg.ingresosAnuales * cfg.perseverancia * cohortesActivas(Y, cfg) * nProvincias;
}

// ── Demanda de obras (residencias ya excluidas por el caller) ────────────────
export function demandaDeObras(obras) {
  let A = 0, B = 0, C = 0;
  for (const o of obras) {
    const t = tipoDeObra(o);
    if (t === 'A') {
      const mn = parseNum(o['MINIMO_JESUITAS REQUERIDOS'] ?? o['MINIMO_JESUITAS']);
      A += (mn && mn > 0) ? mn : 1;          // fallback razonable: 1 por obra A
    } else if (t === 'B') B++;
    else if (t === 'C') C++;
  }
  return { A, B, C };
}

// ── Cruce oferta–demanda en un año (con reposición incluida) ─────────────────
export function cruceEn(personas, demanda, Y, cfg, nProvincias = 1) {
  const rep      = reposicionEn(Y, cfg, nProvincias);
  const activos  = fuerzaActivaEn(personas, Y, cfg) + rep;
  const poolA    = poolABaseEn(personas, Y, cfg) + rep;

  const dedicados   = Math.min(poolA, demanda.A);
  const huerfanasA  = Math.max(0, demanda.A - dedicados);
  const libresB     = Math.max(0, activos - dedicados);
  const capacidadB  = libresB * cfg.fai;
  const huerfanasB  = Math.max(0, demanda.B - capacidadB);
  const coberturaB  = demanda.B > 0 ? Math.min(1, capacidadB / demanda.B) : 1;

  let semaforo;
  if (huerfanasA > 0) semaforo = 'rojo';
  else if (coberturaB >= 1) semaforo = 'verde';
  else if (coberturaB >= 0.7) semaforo = 'amarillo';
  else semaforo = 'rojo';

  return { año: Y, activos, poolA, demanda, dedicados, huerfanasA, libresB, capacidadB, huerfanasB, coberturaB, semaforo };
}

// Semáforo de cobertura genérico (capacidad vs demanda): ✓ ≥100% · ⚠ 70–100% · ✗ <70%
export function semaforoCobertura(capacidad, demanda) {
  if (demanda <= 0) return 'verde';
  const r = capacidad / demanda;
  if (r >= 1) return 'verde';
  if (r >= 0.7) return 'amarillo';
  return 'rojo';
}

// Semáforo del año de cruce del núcleo de B contra su umbral mínimo:
//  · verde  → no cruza en el horizonte o cruza tarde (> 2080)
//  · amarillo → cruza dentro de una generación larga (2051–2080)
//  · rojo   → cruza pronto (≤ 2050)
export function semaforoCruce(añoCruce) {
  if (añoCruce === null || añoCruce === undefined) return 'verde';
  if (añoCruce > 2080) return 'verde';
  if (añoCruce > 2050) return 'amarillo';
  return 'rojo';
}

// Año de cruce del núcleo dedicable a B (libres tras cubrir A) bajo su umbral
// mínimo (obras B ÷ capacidad de acompañamiento). Barrido AÑO A AÑO. tasa = 0
// es el peor caso «si nadie entra». Devuelve null si nunca cae bajo el umbral.
export function anioCruceNucleoB(personas, demanda, cfg, tasa = 0) {
  if (demanda.B <= 0 || cfg.fai <= 0) return null;
  const umbral = demanda.B / cfg.fai;
  const cfgK = { ...cfg, ingresosAnuales: tasa };
  for (let Y = cfg.anioBase; Y <= PROY_FIN; Y++) {
    if (cruceEn(personas, demanda, Y, cfgK, 1).libresB < umbral) return Y;
  }
  return null;
}

// ── Métricas clave por provincia ─────────────────────────────────────────────
export function metricasProvincia(personas, obras, cfg) {
  const demanda = demandaDeObras(obras);

  // Primer déficit A: barrido AÑO A AÑO (sin reposición = lectura "si nadie entra").
  let primerDeficitA = null;
  for (let Y = cfg.anioBase; Y <= PROY_FIN; Y++) {
    if (poolABaseEn(personas, Y, cfg) < demanda.A) { primerDeficitA = Y; break; }
  }

  const hoy = fuerzaActivaEn(personas, cfg.anioBase, cfg);
  const fin = fuerzaActivaEn(personas, PROY_FIN, cfg);
  const ca  = cohortesActivas(PROY_FIN, cfg);
  // Número de equilibrio K: ingresos/año para que con_rep[2100] ≥ activos hoy.
  const equilibrioK = ca > 0 ? Math.max(0, Math.ceil((hoy - fin) / (cfg.perseverancia * ca))) : null;

  return { demanda, primerDeficitA, hoy, equilibrioK };
}

// ── Personas / obras de una provincia ────────────────────────────────────────
export function personasDeProvincia(sheets, prov) {
  return sheets['PERSONAS'].rows.filter(p => provinciaDePersona(p) === prov);
}
export function obrasDeProvincia(sheets, prov) {
  return sheets['OBRAS'].rows.filter(o => !esResidencia(o) && provinciaDeObra(o) === prov);
}

// ── Proyección por provincia → matriz para la tabla de validación ────────────
export function proyectarPorProvincia(sheets, provincias, cfg) {
  return provincias.map(prov => {
    const cfgP     = cfgDeProvincia(cfg, prov);
    const personas = personasDeProvincia(sheets, prov);
    const obras    = obrasDeProvincia(sheets, prov);
    const m = metricasProvincia(personas, obras, cfgP);
    const cruce2050 = cruceEn(personas, m.demanda, 2050, cfgP, 1);
    const cruceHoy  = cruceEn(personas, m.demanda, cfgP.anioBase, cfgP, 1);
    const anioCruceB = anioCruceNucleoB(personas, m.demanda, cfgP, 0);
    return {
      provincia: prov,
      personas: personas.length,
      escolares: personas.filter(p => fuerzaDe(p) === 'Formación').length,
      persevDe10: cfgP.perseveranciaDe10,
      activosHoy: m.hoy,
      activos2050: fuerzaActivaEn(personas, 2050, cfgP),
      activos2080: fuerzaActivaEn(personas, 2080, cfgP),
      poolA2050: poolABaseEn(personas, 2050, cfgP),
      demanda: m.demanda,
      primerDeficitA: m.primerDeficitA,
      equilibrioK: m.equilibrioK,
      semaforo2050: cruce2050.semaforo,
      // Obras B y núcleo dedicable a B (reacciona a cfg.fai vía el umbral/cruce)
      obrasB: m.demanda.B,
      obrasC: m.demanda.C,
      // Núcleo honesto: jesuitas libres hoy para B, umbral mínimo y año de cruce.
      nucleoBHoy: cruceHoy.libresB,
      umbralB: cfg.fai > 0 ? m.demanda.B / cfg.fai : 0,
      anioCruceB,
      semCruceB: semaforoCruce(anioCruceB),
    };
  });
}

// ── Curva de escenarios para el gráfico (agrega un conjunto de provincias) ────
// tasas = lista de ingresos/año a graficar (p.ej. [0,1,3]). En CPALSJ la tasa
// es POR provincia, así que la reposición se multiplica por nº de provincias.
export function curvaEscenarios(sheets, provincias, cfg, años, tasas) {
  const datos = provincias.map(prov => ({
    cfgP: cfgDeProvincia(cfg, prov),
    personas: personasDeProvincia(sheets, prov),
  }));
  // Cada provincia activa sus escolares y repone ingresos con SU perseverancia.
  const suma = datos.reduce((s, d) => s + d.cfgP.perseverancia, 0);
  return años.map(Y => {
    let base = 0;
    for (const d of datos) base += fuerzaActivaEn(d.personas, Y, d.cfgP);
    const coh = cohortesActivas(Y, cfg);
    const fila = { año: Y, base };
    for (const k of tasas) fila['r' + k] = base + k * coh * suma;
    // Línea de simulación: la tasa de ingreso elegida en el panel (escenario).
    fila.sim = base + cfg.ingresosAnuales * coh * suma;
    return fila;
  });
}

// ── Curva del núcleo dedicable a B vs umbral mínimo (segundo gráfico) ─────────
// Por cada año y cada tasa de ingreso, suma PROVINCIA A PROVINCIA los jesuitas
// libres para B (activos − los que dirigen A). El cruce A→B es un tope por
// provincia, por eso se agrega así y no sobre el total. Devuelve además el
// umbral mínimo (obras B ÷ capacidad de acompañamiento) y el año de cruce de
// cada tasa (barrido anual; el de tasa 0 es el dato accionable «si nadie entra»).
export function curvaNucleoB(sheets, provincias, cfg, años, tasas) {
  const datos = provincias.map(prov => ({
    cfgP:     cfgDeProvincia(cfg, prov),
    personas: personasDeProvincia(sheets, prov),
    demanda:  demandaDeObras(obrasDeProvincia(sheets, prov)),
  }));
  const demandaBTotal = datos.reduce((s, d) => s + d.demanda.B, 0);
  const umbral = cfg.fai > 0 ? demandaBTotal / cfg.fai : 0;

  const nucleoEn = (Y, tasa) => {
    let libres = 0;
    for (const d of datos) {
      const cfgK = { ...d.cfgP, ingresosAnuales: tasa };
      libres += cruceEn(d.personas, d.demanda, Y, cfgK, 1).libresB;
    }
    return libres;
  };

  const filas = años.map(Y => {
    const fila = { año: Y, umbral };
    for (const k of tasas) fila['n' + k] = nucleoEn(Y, k);
    return fila;
  });

  // Año de cruce por tasa: primer año (barrido anual) con núcleo < umbral.
  const cruces = {};
  for (const k of tasas) {
    let añoCruce = null;
    if (demandaBTotal > 0 && umbral > 0) {
      for (let Y = cfg.anioBase; Y <= PROY_FIN; Y++) {
        if (nucleoEn(Y, k) < umbral) { añoCruce = Y; break; }
      }
    }
    cruces[k] = añoCruce;
  }

  return { filas, umbral, demandaBTotal, cruces };
}

// ── Tabla de escenarios de ingreso (0..N al año) para el alcance ─────────────
// Devuelve, por cada tasa, los activos en los años clave y si sostiene el nivel
// de hoy (activos en el último año ≥ activos hoy). La tasa es POR provincia.
export function tablaEscenarios(sheets, provincias, cfg, tasas, años) {
  const datos = provincias.map(prov => ({
    cfgP: cfgDeProvincia(cfg, prov),
    personas: personasDeProvincia(sheets, prov),
  }));
  const suma = datos.reduce((s, d) => s + d.cfgP.perseverancia, 0);
  const activosHoy = datos.reduce((s, d) => s + fuerzaActivaEn(d.personas, cfg.anioBase, d.cfgP), 0);
  const baseEn = Y => datos.reduce((s, d) => s + fuerzaActivaEn(d.personas, Y, d.cfgP), 0);
  const ultimo = años[años.length - 1];
  const filas = tasas.map(k => {
    const valores = {};
    for (const Y of años) valores[Y] = baseEn(Y) + k * cohortesActivas(Y, cfg) * suma;
    return { tasa: k, valores, sostiene: valores[ultimo] >= activosHoy };
  });
  return { activosHoy, filas };
}

// ── Serie TS_SIN_REP de la hoja (control de calidad, no fuente) ──────────────
export function serieTSsinRep(sheets, provincias) {
  const ts = sheets['TS_SIN_REP'];
  const set = new Set(provincias);
  const acc = {}; // año -> suma
  if (ts && ts.rows) {
    for (const r of ts.rows) {
      const prov = normProv(r['PROVINCIA']);
      if (!set.has(prov)) continue;
      const año = parseInt(r['AÑO'], 10);
      const val = parseNum(r['SIN REP']);
      if (Number.isFinite(año) && val !== null) acc[año] = (acc[año] || 0) + val;
    }
  }
  return acc; // {2026: n, 2030: n, ...}
}

// Compara la curva calculada (sin reposición) con TS_SIN_REP. Umbral decidido
// por Alex: marca si |dif| > 5 jesuitas O > 10% (lo que ocurra primero).
export function chequearDiscrepancia(curvaBase, tsMap) {
  let maxAbs = 0, marca = false, añoMarca = null;
  for (const fila of curvaBase) {
    const ts = tsMap[fila.año];
    if (ts === undefined) continue;
    const dif = Math.abs(fila.base - ts);
    const pct = ts > 0 ? dif / ts : (dif > 0 ? 1 : 0);
    if (dif > maxAbs) maxAbs = dif;
    if (dif > 5 || pct > 0.10) { marca = true; if (añoMarca === null) añoMarca = fila.año; }
  }
  return { marca, maxAbs: Math.round(maxAbs), añoMarca };
}
