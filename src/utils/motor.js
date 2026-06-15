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
  const persevDe10 = escenario?.perseveranciaDe10 ?? pp.PERSEVERANCIA_DE_CADA_10 ?? 6;
  return {
    salida:          pp.EDAD_SALIDA ?? 85,
    finDireccionA:   pp.EDAD_FIN_DIRECCION_A ?? 70,
    aniosFormacion:  pp['AÑOS_FORMACION'] ?? pp.ANIOS_FORMACION ?? 10,
    anioBase:        pp.ANIO_BASE ?? 2026,
    perseveranciaDe10: persevDe10,
    perseverancia:   persevDe10 / 10,
    fai:             escenario?.fai ?? pp.FAI ?? 2,
    ingresosAnuales: escenario?.ingresosAnuales ?? 0,
  };
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
    const personas = personasDeProvincia(sheets, prov);
    const obras    = obrasDeProvincia(sheets, prov);
    const m = metricasProvincia(personas, obras, cfg);
    const cruce2050 = cruceEn(personas, m.demanda, 2050, cfg, 1);
    return {
      provincia: prov,
      personas: personas.length,
      activosHoy: m.hoy,
      activos2050: fuerzaActivaEn(personas, 2050, cfg),
      activos2080: fuerzaActivaEn(personas, 2080, cfg),
      poolA2050: poolABaseEn(personas, 2050, cfg),
      demanda: m.demanda,
      primerDeficitA: m.primerDeficitA,
      equilibrioK: m.equilibrioK,
      semaforo2050: cruce2050.semaforo,
    };
  });
}

// ── Curva de escenarios para el gráfico (agrega un conjunto de provincias) ────
// tasas = lista de ingresos/año a graficar (p.ej. [0,1,3]). En CPALSJ la tasa
// es POR provincia, así que la reposición se multiplica por nº de provincias.
export function curvaEscenarios(sheets, provincias, cfg, años, tasas) {
  const porProv = provincias.map(prov => personasDeProvincia(sheets, prov));
  const nProv = provincias.length;
  return años.map(Y => {
    let base = 0;
    for (const personas of porProv) base += fuerzaActivaEn(personas, Y, cfg);
    const fila = { año: Y, base };
    for (const k of tasas) {
      fila['r' + k] = base + k * cfg.perseverancia * cohortesActivas(Y, cfg) * nProv;
    }
    return fila;
  });
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
