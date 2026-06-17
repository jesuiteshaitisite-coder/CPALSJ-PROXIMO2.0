// ─── Ensamblador del Informe estructurado (§6.9) ────────────────────────────
// Construye UN objeto JSON con todas las cifras clave del alcance. El informe en
// pantalla y el PDF se renderizan SOLO desde este objeto (datos ≠ presentación).
// Pensado, además, como CONTEXTO para una fase de IA posterior (análisis,
// preguntas, recomendaciones) — por eso es autoexplicativo y serializable.
//
// Decisiones de Alex (17-jun-2026):
//  · El CUERPO es el retrato conservador y REPRODUCIBLE: ancla «si nadie entra»
//    (ingresos = 0), perseverancia y capacidad por defecto de la hoja, sin tocar
//    sliders. Generarlo dos veces el mismo día da el mismo documento.
//  · meta.anclaCuerpo = 'ingresos_cero' avisa a la IA futura que el cuerpo es el
//    PISO conservador, no un pronóstico.
//  · Si el equipo de gobierno dejó alguna palanca movida, se añade `escenarioExplorado`
//    (claramente etiquetado como exploración, no diagnóstico). Si no, queda null.
//  · El informe SIGUE el alcance y el idioma actuales (CPALSJ o una provincia).

import { normProv } from '../services/sheetsService.js';
import {
  provinciasDelAlcance, filtrarPersonas, filtrarObras,
  statsDemograficas, piramideEdad, distribucionFuerza, statsIngreso,
  distribObrasPorTipo, distribObrasPorAmbito, comparativaObrasProvincias, calcularIIA,
} from './calculations.js';
import {
  resolverCfg, proyectarPorProvincia, cruceAlcanceEn, tablaHorizontes,
  curvaEscenarios, curvaNucleoB, tablaEscenarios,
  sostenibilidadProvincia, puntosRiesgo, perseveranciaPonderadaDe10,
  metricasPista, cohortesActivas, sumaPersev,
  ANIOS_CURVA, ANIOS_PROGRESION, PROY_FIN,
} from './motor.js';

const pad2 = n => String(n).padStart(2, '0');
const fechaISO = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

// Cifra glosada: el VALOR viaja con su DEFINICIÓN, para que ni la pantalla ni la
// IA futura confundan dos números parecidos en el mismo documento (p.ej. todas
// las personas vs fuerza activa, o déficit per-provincia vs agregado). Mismo
// principio que meta.anclaCuerpo: las advertencias viajan con el dato.
const glosa = (valor, definicion) => ({ valor, definicion });

// Una métrica del escenario explorado: base → ahora, con delta y si mejora.
// kind 'año' → más tarde es MEJOR; kind 'obras' → menos es MEJOR.
function diffMetrica(clave, kind, base, ahora) {
  const finOpen = PROY_FIN + 1; // «no falta / indefinido» se trata como el más lejano
  let delta, mejora;
  if (kind === 'año') {
    const b = base ?? finOpen, a = ahora ?? finOpen;
    delta = a - b; mejora = delta > 0;
  } else {
    delta = ahora - base; mejora = delta < 0;
  }
  return { metrica: clave, kind, de: base, a: ahora, delta, mejora };
}

export function construirInforme(sheets, params, appState, opts = {}) {
  const idioma = opts.idioma || 'es';
  const ahora  = opts.ahora instanceof Date ? opts.ahora : new Date();

  const provs      = provinciasDelAlcance(appState);
  const esCpalsj   = appState.alcance === 'cpalsj';
  const scopeLabel = esCpalsj ? 'CPALSJ' : appState.provincia;
  const scopeFile  = esCpalsj ? 'CPALSJ' : normProv(appState.provincia);

  const baseFai      = params.FAI ?? 2;
  const baseIngresos = params.INGRESOS_ANUALES_BASE ?? 0;

  // ── Ancla del CUERPO: conservador, reproducible, sin sliders ───────────────
  const anclaEscenario = {
    fai: baseFai, ingresosAnuales: 0, persevOverride: null,
    cerrarA: 0, pctBtoC: 0, extraPool: 0, añoDesde: 2030,
  };
  const cfg = resolverCfg(params, anclaEscenario);

  const personas = filtrarPersonas(sheets, provs);
  const obras    = filtrarObras(sheets, provs);

  // ── Demografía (reusa calculations.js) ─────────────────────────────────────
  const demo     = statsDemograficas(personas);
  const piramide = piramideEdad(personas);
  const fuerza   = distribucionFuerza(personas);
  const ingreso  = statsIngreso(personas);
  // Resumen demográfico por provincia (limpio, sin incrustar personas).
  const demoPorProvincia = provs.map(prov => {
    const s = statsDemograficas(filtrarPersonas(sheets, [prov]));
    return {
      provincia: prov, total: s.total, edadMedia: s.edadMedia,
      pctMayores70: s.pctMayores70, enEdadActiva: s.enEdadActiva, porEstado: s.porEstado,
    };
  }).sort((a, b) => b.total - a.total);

  // ── Obras (reusa calculations.js) ──────────────────────────────────────────
  const obrasTipo    = distribObrasPorTipo(obras);
  const obrasAmbito  = distribObrasPorAmbito(obras);
  const obrasPorProv = comparativaObrasProvincias(sheets, provs);
  // IIA + aviso de fiabilidad EN EL DATO (no solo en la §3): hoy casi ninguna obra
  // tiene poblado «PRESENCIA ACTUAL DE SJS», así que el IIA es poco fiable. La IA
  // futura debe verlo sin depender del render. Umbral 30% (regla de calidad del
  // proyecto).
  const iiaRaw = calcularIIA(obras);
  const iia = {
    ...iiaRaw,
    coberturaDatos: {
      obrasConPresenciaPoblada: iiaRaw.obrasConPresencia,
      totalObras: iiaRaw.obrasTotal,
      fiable: iiaRaw.obrasTotal > 0 && iiaRaw.obrasConPresencia / iiaRaw.obrasTotal >= 0.30,
    },
  };

  // ── Cobertura y proyección (motor, ancla) ──────────────────────────────────
  const tabla      = proyectarPorProvincia(sheets, provs, cfg).sort((a, b) => b.personas - a.personas);
  const horizontes = tablaHorizontes(sheets, provs, cfg, [2030, 2050, 2080]);
  const curva      = curvaEscenarios(sheets, provs, cfg, ANIOS_CURVA, [1, 3]);
  const nucleo     = curvaNucleoB(sheets, provs, cfg, ANIOS_CURVA, [0, 1, 3]);
  const escTabla   = tablaEscenarios(sheets, provs, cfg, [0, 1, 2, 3], [2050, 2080, 2100]);
  const heatmap    = sostenibilidadProvincia(sheets, provs, cfg, ANIOS_PROGRESION);
  const riesgo     = puntosRiesgo(sheets, provs, cfg);

  // Totales del alcance
  const tot = tabla.reduce((a, r) => ({
    personas:    a.personas + r.personas,
    activosHoy:  a.activosHoy + r.activosHoy,
    activos2050: a.activos2050 + r.activos2050,
    activos2080: a.activos2080 + r.activos2080,
    demandaA:    a.demandaA + r.demanda.A,
    demandaB:    a.demandaB + r.demanda.B,
    demandaC:    a.demandaC + r.demanda.C,
    nucleoBHoy:  a.nucleoBHoy + r.nucleoBHoy,
  }), { personas: 0, activosHoy: 0, activos2050: 0, activos2080: 0, demandaA: 0, demandaB: 0, demandaC: 0, nucleoBHoy: 0 });

  // 1er déficit A del alcance (ancla) + provincia que entra primero
  const conDef       = tabla.filter(r => r.primerDeficitA != null);
  const primerDeficit = conDef.length ? Math.min(...conDef.map(r => r.primerDeficitA)) : null;
  const provDeficit   = conDef.length
    ? conDef.reduce((a, b) => (b.primerDeficitA < a.primerDeficitA ? b : a)).provincia : null;

  // Número de equilibrio del alcance (recalculado sobre el agregado)
  const base2100 = curva[curva.length - 1].base;
  const ca = cohortesActivas(PROY_FIN, cfg);
  const sp = sumaPersev(provs, cfg);
  const Kalcance = ca > 0 && sp > 0
    ? Math.max(0, Math.ceil((tot.activosHoy - base2100) / (ca * sp))) : null;

  const persevPond  = perseveranciaPonderadaDe10(sheets, provs, cfg);
  const semaforo2050 = cruceAlcanceEn(sheets, provs, cfg, 2050).semaforo;
  const pistaBase   = metricasPista(sheets, provs, cfg, {});

  // ── Escenario explorado (opcional) ─────────────────────────────────────────
  const esc = appState.escenario || {};
  const haySim =
    (esc.ingresosAnuales ?? 0) !== baseIngresos ||
    (esc.fai ?? baseFai) !== baseFai ||
    !!esc.persevOverride ||
    (esc.cerrarA ?? 0) > 0 ||
    (esc.pctBtoC ?? 0) > 0 ||
    (esc.extraPool ?? 0) > 0;

  let escenarioExplorado = null;
  if (haySim) {
    const palancas = [];
    const moved = (clave, valor, porDefecto) => { if (valor !== porDefecto) palancas.push({ clave, valor, porDefecto }); };
    moved('ingresosAnuales', esc.ingresosAnuales ?? 0, baseIngresos);
    moved('fai',             esc.fai ?? baseFai,        baseFai);
    if (esc.persevOverride) palancas.push({ clave: 'persevOverride', valor: esc.persevOverride, porDefecto: null });
    moved('cerrarA',   esc.cerrarA ?? 0,   0);
    moved('pctBtoC',   esc.pctBtoC ?? 0,   0);
    moved('extraPool', esc.extraPool ?? 0, 0);
    if ((esc.extraPool ?? 0) > 0) palancas.push({ clave: 'añoDesde', valor: esc.añoDesde ?? 2030, porDefecto: null });

    // Efecto COMBINADO del escenario que el equipo de gobierno dejó puesto, vs el
    // cuerpo conservador. Usa el cfg en vivo (incluye fai y perseverancia simulados) y
    // las palancas de tipo «pista». Es el «pasa de X a Y» del Bloque C, pero del
    // escenario completo (no palanca-a-palanca), porque documenta UN escenario.
    const cfgLive = resolverCfg(params, esc);
    const mEsc = metricasPista(sheets, provs, cfgLive, {
      cerrarA: esc.cerrarA ?? 0, pctBtoC: esc.pctBtoC ?? 0,
      extraPool: esc.extraPool ?? 0, añoDesde: esc.añoDesde ?? 2030,
      ingresos: esc.ingresosAnuales ?? 0,
    });

    escenarioExplorado = {
      etiqueta: 'exploracion_equipo_gobierno',  // NO es parte del diagnóstico
      palancas,
      base:      { faltaA: pistaBase.faltaA, faltaB: pistaBase.faltaB, sinJesuita2050: pistaBase.sinJesuita2050, sinJesuita2080: pistaBase.sinJesuita2080 },
      escenario: { faltaA: mEsc.faltaA,      faltaB: mEsc.faltaB,      sinJesuita2050: mEsc.sinJesuita2050,      sinJesuita2080: mEsc.sinJesuita2080 },
      efectos: [
        diffMetrica('faltaA',         'año',   pistaBase.faltaA,         mEsc.faltaA),
        diffMetrica('faltaB',         'año',   pistaBase.faltaB,         mEsc.faltaB),
        diffMetrica('sinJesuita2080', 'obras', pistaBase.sinJesuita2080, mEsc.sinJesuita2080),
      ],
    };
  }

  return {
    meta: {
      generadoISO: ahora.toISOString(),
      fecha: fechaISO(ahora),
      idioma,
      version: '3.0',
      alcance: appState.alcance,
      provincia: esCpalsj ? null : appState.provincia,
      scopeLabel,
      scopeFile,
      provincias: provs,
      haitiActivo: !!appState.haitiActivo,
      anclaCuerpo: 'ingresos_cero',
      supuestos: {
        perseveranciaPonderadaDe10: persevPond,
        fai: baseFai,
        aniosFormacion: cfg.aniosFormacion,
        anioBase: cfg.anioBase,
        edadSalida: cfg.salida,
        anclaIngresos: 0,
      },
      // Procedencia de las cifras (para auditar de dónde salieron). La fecha de
      // EDICIÓN de la hoja no la expone la lectura pública gviz (requeriría la
      // Drive API), así que queda null y se registra cuándo las cargó esta sesión.
      fuenteDatos: {
        datosCargadosISO: opts.cargadoEn instanceof Date ? opts.cargadoEn.toISOString() : null,
        hojaModificadaISO: null,
        nota: 'La fecha de edición de la hoja no está disponible con la lectura pública (gviz); requeriría la Drive API. Las cifras reflejan los valores de la hoja al momento de cargarse. Si la perseverancia por provincia aún tiene valores de prueba, el informe no debe considerarse definitivo.',
      },
    },
    resumen: {
      activosHoy: glosa(tot.activosHoy, 'Fuerza apostólica activa ponderada (Plena + Acompañamiento en edad 30–84, más los escolares ya formados descontados por perseverancia). Es el dato operativo, distinto del total de personas registradas.'),
      demandaA: tot.demandaA, demandaB: tot.demandaB, demandaC: tot.demandaC,
      primerDeficitA: glosa(primerDeficit, `Primer año en que UNA provincia (la primera, ${provDeficit || '—'}) deja de cubrir sus obras A, si nadie nuevo entra. Lectura por provincia; el conjunto aguanta más porque puede reasignar entre provincias.`),
      provDeficit,
      equilibrioK: Kalcance,
      fuerzaActiva2080: tot.activos2080,
      nucleoBHoy: tot.nucleoBHoy,
      perseveranciaPonderadaDe10: persevPond,
      semaforo2050,
    },
    demografia: {
      total: glosa(demo.total, 'Todas las personas registradas en la hoja del alcance (incluye novicios, formación y retirados). Es el censo completo, no la fuerza activa.'),
      edadMedia: demo.edadMedia, pctMayores70: demo.pctMayores70,
      enEdadActiva: demo.enEdadActiva, conVotos: demo.conVotos,
      porEstado: demo.porEstado, sinVotosPorEstado: demo.sinVotosPorEstado,
      piramide: piramide.tramos, sinEdad: piramide.sinEdad,
      fuerza: fuerza.conteo, fuerzaSinDato: fuerza.sinDato,
      ingreso: { edadIngresoMedia: ingreso.edadIngresoMedia, antiguedadMedia: ingreso.antiguedadMedia, decadas: ingreso.decadas },
      porProvincia: demoPorProvincia,
    },
    obras: {
      total: obras.length,
      porTipo: obrasTipo,
      porAmbito: obrasAmbito,
      porProvincia: obrasPorProv,
      iia,
    },
    cobertura: {
      porProvincia: tabla,
      total: { activosHoy: tot.activosHoy, activos2050: tot.activos2050, activos2080: tot.activos2080, demandaA: tot.demandaA, demandaB: tot.demandaB, demandaC: tot.demandaC, nucleoBHoy: tot.nucleoBHoy },
      horizontes,
    },
    proyeccion: {
      curva,
      nucleoB: nucleo,
      escenariosIngreso: escTabla,
      equilibrioK: Kalcance,
      base2100,
    },
    sostenibilidad: { heatmap, riesgo },
    pistasBase: {
      faltaA: glosa(pistaBase.faltaA, 'Año en que el CONJUNTO del alcance deja de cubrir sus obras A (visión agregada, asume reasignación libre entre provincias). Es más tardío que el primer déficit por provincia de resumen.primerDeficitA.'),
      faltaB: pistaBase.faltaB,
      sinJesuita2050: pistaBase.sinJesuita2050,
      sinJesuita2080: pistaBase.sinJesuita2080,
    },
    escenarioExplorado,
  };
}
