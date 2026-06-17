import { useEffect, useMemo, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine,
  ScatterChart, Scatter,
} from 'recharts';
import { useAppState } from '../state/AppStateContext.jsx';
import { provinciasDelAlcance } from '../utils/calculations.js';
import {
  resolverCfg, proyectarPorProvincia, curvaEscenarios, curvaNucleoB, serieTSsinRep,
  chequearDiscrepancia, cohortesActivas, tablaEscenarios, semaforoCruce,
  sumaPersev, perseveranciaPonderadaDe10, persevDe10DeProvincia,
  primerDeficitASim, fuerzaActivaSimEn, tablaHorizontes, cruceAlcanceEn, metricasPista,
  sostenibilidadProvincia, puntosRiesgo,
  ANIOS_CURVA, ANIOS_PROGRESION, PROY_FIN,
} from '../utils/motor.js';
import { COLORS } from '../utils/colors.js';
import { construirInforme } from '../utils/informe.js';
import Informe from './Informe.jsx';

function fmt(n) {
  if (n === null || n === undefined) return '—';
  return Math.round(n).toLocaleString('es-CL');
}

const SEM_COLOR = { verde: 'var(--ok)', amarillo: 'var(--warn)', rojo: 'var(--alert)' };
const SEM_SIMB  = { verde: '✓', amarillo: '⚠', rojo: '✗' };
// Para SVG (recharts no resuelve var(--…) en atributos fill) usamos hex de la paleta.
const SEM_HEX = { verde: COLORS.verde, amarillo: COLORS.ambar, rojo: COLORS.rojoCl };

// Color de la celda del heatmap (Bloque D.1): gradiente continuo rojo(0)→verde(100).
function colorPuntaje(s) {
  const v = Math.max(0, Math.min(100, s ?? 0));
  const hue = (v / 100) * 125;        // 0 = rojo, 125 = verde
  return `hsl(${hue}, 62%, 42%)`;      // saturado y medio-oscuro → texto blanco legible
}

// Orden y clave de los 4 cuadrantes del mapa de riesgos (Bloque D.2).
const QUADRANTS = [
  { key: 'prioritario' }, { key: 'planificable' }, { key: 'vocacion' }, { key: 'estable' },
];

// Punto del scatter: radio = √(obras A) con piso y techo (Alex: que las grandes no
// aplasten a las pequeñas). Color = semáforo 2050. Etiqueta de provincia encima.
function PuntoRiesgo({ cx, cy, payload }) {
  if (cx == null || cy == null) return null;
  const r = Math.min(22, Math.max(5, Math.sqrt(payload.obrasA || 1) * 3.2));
  const color = SEM_HEX[payload.semaforo] || COLORS.gris;
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill={color} fillOpacity={0.5} stroke={color} strokeWidth={1.6} />
      <text x={cx} y={cy - r - 3} textAnchor="middle" fontSize={10} fontWeight={600} fill={COLORS.texto}>{payload.provincia}</text>
    </g>
  );
}

function TooltipRiesgo({ active, payload, t }) {
  if (!active || !payload || !payload.length) return null;
  const p = payload[0].payload;
  return (
    <div className="tt-card">
      <div className="tt-title">{p.provincia}</div>
      <div className="tt-row"><span className="tt-name">{t.pyRiesgoTtX}</span><span className="tt-val">{p.sinDeficit ? t.pyNunca : p.añoDeficit}</span></div>
      <div className="tt-row"><span className="tt-name">{t.pyRiesgoTtY}</span><span className="tt-val">{p.y}</span></div>
      <div className="tt-row"><span className="tt-name">{t.pyRiesgoTtSize}</span><span className="tt-val">{p.obrasA}</span></div>
    </div>
  );
}

// Orden de los términos del glosario (claves de t.pyGloss)
const GLOSARIO = [
  'activa', 'poolA', 'reposicion', 'perseverancia', 'formacion',
  'fai', 'demanda', 'huerfanas', 'equilibrio', 'semaforo', 'deficit',
];

function TooltipCurva({ active, payload, label, t }) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="tt-card">
      <div className="tt-title">{label}</div>
      {payload.map(s => (
        <div className="tt-row" key={s.dataKey}>
          <span className="tt-dot" style={{ background: s.color }} />
          <span className="tt-name">{s.name}</span>
          <span className="tt-val">{fmt(s.value)}</span>
        </div>
      ))}
    </div>
  );
}

export default function Proyeccion({ t, data }) {
  const appState = useAppState();
  const { alcance, provincia, haitiActivo, escenario, setEscenario } = appState;
  const [gloss, setGloss] = useState('activa');
  const [tip, setTip] = useState(null); // pop de ayuda de las columnas de Cobertura
  const [mostrarInforme, setMostrarInforme] = useState(false); // §6.9: ¿vista informe?

  // Pop flotante (posición fija → no lo recorta el scroll de la tabla). Se centra
  // bajo el encabezado y se acota a la pantalla para no salirse por los bordes.
  const mostrarTip = (e, text) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = Math.min(Math.max(r.left + r.width / 2, 150), window.innerWidth - 150);
    setTip({ text, x, y: r.bottom + 6 });
  };
  const ocultarTip = () => setTip(null);
  const thTip = i => ({ onMouseEnter: e => mostrarTip(e, t.pyCobCards[i].d), onMouseLeave: ocultarTip });
  const thTipHor = i => ({ onMouseEnter: e => mostrarTip(e, t.pyHorCols[i].d), onMouseLeave: ocultarTip });
  const thTipHeat = i => ({ onMouseEnter: e => mostrarTip(e, t.pyHeatCols[i].d), onMouseLeave: ocultarTip });

  const calc = useMemo(() => {
    const provs = provinciasDelAlcance(appState);
    const cfg = resolverCfg(data.params, escenario);

    const tabla = proyectarPorProvincia(data.sheets, provs, cfg)
      .sort((a, b) => b.personas - a.personas);

    const curva = curvaEscenarios(data.sheets, provs, cfg, ANIOS_CURVA, [1, 3]);
    const tsMap = serieTSsinRep(data.sheets, provs);
    const curvaConTS = curva.map(f => ({ ...f, ts: tsMap[f.año] ?? null }));
    const discrepancia = chequearDiscrepancia(curva, tsMap);

    // Núcleo dedicable a B vs umbral mínimo (segundo gráfico). Series 0/+1/+3.
    const nucleo = curvaNucleoB(data.sheets, provs, cfg, ANIOS_CURVA, [0, 1, 3]);

    // Totales del alcance
    const tot = tabla.reduce((a, r) => ({
      personas: a.personas + r.personas,
      activosHoy: a.activosHoy + r.activosHoy,
      activos2050: a.activos2050 + r.activos2050,
      activos2080: a.activos2080 + r.activos2080,
      poolA2050: a.poolA2050 + r.poolA2050,
      demandaA: a.demandaA + r.demanda.A,
      demandaB: a.demandaB + r.demanda.B,
      demandaC: a.demandaC + r.demanda.C,
      nucleoBHoy: a.nucleoBHoy + r.nucleoBHoy,
      K: a.K + (r.equilibrioK || 0),
    }), { personas: 0, activosHoy: 0, activos2050: 0, activos2080: 0, poolA2050: 0, demandaA: 0, demandaB: 0, demandaC: 0, nucleoBHoy: 0, K: 0 });

    // Primer déficit A más cercano del alcance (ANCLA «si nadie entra», para la narrativa)
    const deficits = tabla.map(r => r.primerDeficitA).filter(Boolean);
    const primerDeficit = deficits.length ? Math.min(...deficits) : null;
    // Provincia que entra primero en déficit A (para la subetiqueta del hero).
    const conDef = tabla.filter(r => r.primerDeficitA != null);
    const provDeficit = conDef.length
      ? conDef.reduce((a, b) => (b.primerDeficitA < a.primerDeficitA ? b : a)).provincia : null;
    const nProv = provs.length;

    // KPIs proyectivos REACTIVOS al slider de ingresos (con reposición simulada)
    const primerDeficitSim = primerDeficitASim(data.sheets, provs, cfg);
    const fuerza2080Sim = fuerzaActivaSimEn(data.sheets, provs, cfg, 2080);

    // Número de equilibrio del alcance (recalculado sobre el agregado, no suma
    // de Ks). La sensibilidad por ingreso/año es cohortes × Σ perseverancia_prov.
    const base2100 = curva[curva.length - 1].base;
    const ca = cohortesActivas(PROY_FIN, cfg);
    const sp = sumaPersev(provs, cfg);
    const Kalcance = ca > 0 && sp > 0
      ? Math.max(0, Math.ceil((tot.activosHoy - base2100) / (ca * sp)))
      : null;

    const esc = tablaEscenarios(data.sheets, provs, cfg, [0, 1, 2, 3], [2050, 2080, 2100]);

    // Perseverancia ponderada del alcance (CPALSJ = media ponderada por escolares).
    const persevPond = perseveranciaPonderadaDe10(data.sheets, provs, cfg);

    // Tabla de horizontes: cruce demanda↔oferta agregado por año (reactivo).
    const horizontes = tablaHorizontes(data.sheets, provs, cfg, [2030, 2050, 2080]);

    // Línea de progresión agregada (fila TOTAL CPALSJ de la tabla de Cobertura).
    const lineaTotalSem = ANIOS_PROGRESION.map(Y => ({ año: Y, sem: cruceAlcanceEn(data.sheets, provs, cfg, Y).semaforo }));

    // Pistas de decisión (Bloque C): ancla "si nadie entra" + cada palanca aislada.
    const cfgAncla = { ...cfg, ingresosAnuales: 0 };
    const pistaBase = metricasPista(data.sheets, provs, cfgAncla, {});
    const pistas = {
      base: pistaBase,
      cerrar:     metricasPista(data.sheets, provs, cfgAncla, { cerrarA: escenario.cerrarA }),
      soltar:     metricasPista(data.sheets, provs, cfgAncla, { pctBtoC: escenario.pctBtoC }),
      refuerzo:   metricasPista(data.sheets, provs, cfgAncla, { extraPool: escenario.extraPool, añoDesde: escenario.añoDesde }),
      vocaciones: metricasPista(data.sheets, provs, cfgAncla, { ingresos: escenario.ingresosAnuales }),
    };

    // Bloque D: heatmap de sostenibilidad (0–100 por provincia×año) + mapa de riesgos.
    const sosten = sostenibilidadProvincia(data.sheets, provs, cfg, ANIOS_PROGRESION);
    const riesgo = puntosRiesgo(data.sheets, provs, cfg);

    return { cfg, tabla, curvaConTS, discrepancia, nucleo, tot, primerDeficit, provDeficit, nProv, primerDeficitSim, fuerza2080Sim, base2100, Kalcance, esc, persevPond, horizontes, lineaTotalSem, pistas, sosten, riesgo };
  }, [data, alcance, provincia, haitiActivo, escenario]); // eslint-disable-line react-hooks/exhaustive-deps

  const { cfg, tabla, curvaConTS, discrepancia, nucleo, tot, primerDeficit, provDeficit, nProv, primerDeficitSim, fuerza2080Sim, base2100, Kalcance, esc, persevPond, horizontes, lineaTotalSem, pistas, sosten, riesgo } = calc;

  // Render de una línea de progresión (6 semáforos por año, comparables entre filas).
  const LineaProgresion = ({ pasos }) => (
    <div className="cob-prog">
      {pasos.map(p => (
        <span key={p.año} className="prog-cell" title={`${p.año}: ${t.pySemaforo[p.sem]}`}>
          <span className="prog-sym" style={{ color: SEM_COLOR[p.sem] }}>{SEM_SIMB[p.sem]}</span>
          <span className="prog-yr">{String(p.año).slice(2)}</span>
        </span>
      ))}
    </div>
  );

  // Tendencia del heatmap (Bloque D.1): caída del puntaje 2030→2080. <0 = pierde.
  const Tendencia = ({ delta }) => {
    const d = Math.round(delta);
    const cls = d < -2 ? 'tend-baja' : d > 2 ? 'tend-sube' : 'tend-est';
    const arrow = d < -2 ? '▼' : d > 2 ? '▲' : '▬';
    return <span className={'heat-tend ' + cls}>{arrow} {d > 0 ? '+' : ''}{d}</span>;
  };

  // ── Pistas de decisión (Bloque C): MetricaDiff y estrellas ──────────────────
  const añoTxt = v => (v == null ? t.pyMdNoFalta : v);
  // Una métrica comparada: base → ahora, con delta coloreado. kind 'año' (más=mejor) u 'obras' (menos=mejor).
  const MDiff = ({ label, base, ahora, kind }) => {
    let estado = 'igual', detalle = t.pyMdSinCambio;
    if (kind === 'año') {
      const b = base ?? PROY_FIN + 1, a = ahora ?? PROY_FIN + 1;
      if (a > b) { estado = 'mejor'; detalle = ahora == null ? t.pyMdPosterga : t.pyMdMasMargen(a - b); }
      else if (a < b) { estado = 'peor'; detalle = t.pyMdMenosMargen(b - a); }
    } else {
      if (ahora < base) { estado = 'mejor'; detalle = t.pyMdMasCubiertas(base - ahora); }
      else if (ahora > base) { estado = 'peor'; detalle = t.pyMdMenosCubiertas(ahora - base); }
    }
    return (
      <div className="md-row">
        <span className="md-label">{label}</span>
        <span className="md-vals">{kind === 'año' ? añoTxt(base) : fmt(base)} → <strong>{kind === 'año' ? añoTxt(ahora) : fmt(ahora)}</strong></span>
        <span className={'md-delta md-' + estado}>{detalle}</span>
      </div>
    );
  };
  const PistaDiffs = ({ p }) => (
    <div className="pista-diffs">
      <MDiff label={t.pyMdFaltaA} base={pistas.base.faltaA} ahora={p.faltaA} kind="año" />
      <MDiff label={t.pyMdFaltaB} base={pistas.base.faltaB} ahora={p.faltaB} kind="año" />
      <MDiff label={t.pyMdSin2080} base={pistas.base.sinJesuita2080} ahora={p.sinJesuita2080} kind="obras" />
    </div>
  );
  const Estrellas = ({ label, n }) => (
    <span className="pista-star"><span className="ps-lbl">{label}</span>
      <span className="ps-stars">{'★'.repeat(n)}<span className="ps-empty">{'★'.repeat(5 - n)}</span></span></span>
  );
  // ¿El refuerzo externo llega a tiempo respecto al umbral crítico de A?
  const refuerzoUmbral = pistas.base.faltaA;
  const refuerzoATiempo = escenario.extraPool > 0 && refuerzoUmbral != null
    ? escenario.añoDesde <= refuerzoUmbral : null;

  // Control interno de calidad de datos (solo en modo desarrollo, NO en el
  // dashboard): permite al equipo cotejar la curva calculada desde PERSONAS
  // contra la hoja TS_SIN_REP. La diferencia es de definición (fuerza activa =
  // Plena + Acompañamiento + formación×perseverancia), no un error.
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const detalle = curvaConTS
      .filter(f => f.ts !== null)
      .map(f => ({ año: f.año, calculado: Math.round(f.base), TS_SIN_REP: f.ts, dif: Math.round(f.base - f.ts) }));
    console.groupCollapsed(
      `[CPALSJ · QA interno] Curva PERSONAS vs TS_SIN_REP — ${alcance === 'cpalsj' ? 'CPALSJ' : provincia}` +
      (discrepancia.marca ? ` · máx. dif ${discrepancia.maxAbs} desde ${discrepancia.añoMarca}` : ' · dentro de umbral')
    );
    console.table(detalle);
    console.info('La fuente válida es el cálculo desde PERSONAS. TS_SIN_REP es control de calidad; conviene actualizarla si la diferencia crece.');
    console.info(`Perseverancia ponderada del alcance: ${persevPond.toFixed(2)} de 10.`);
    console.table(tabla.map(r => ({ provincia: r.provincia, escolares: r.escolares, persevDe10: r.persevDe10 })));
    console.groupEnd();
  }, [curvaConTS, discrepancia, alcance, provincia, persevPond, tabla]);

  // DEV: expone el JSON del Informe (§6.9) para inspección aislada antes de la
  // vista y el PDF. Solo en desarrollo; nunca en producción.
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    try {
      window.__informe = construirInforme(data.sheets, data.params, appState, { idioma: appState.idioma || 'es', cargadoEn: data.cargadoEn });
      console.info('[CPALSJ] window.__informe listo (', window.__informe.meta.scopeLabel, ')');
    } catch (e) { console.error('[CPALSJ] construirInforme falló:', e); }
  }, [data, alcance, provincia, haitiActivo, escenario]); // eslint-disable-line react-hooks/exhaustive-deps

  const esCpalsj = alcance === 'cpalsj';
  const heroSub = esCpalsj ? t.pyHeroSub : provincia;
  const scopeLabel = esCpalsj ? 'CPALSJ' : provincia;
  const fraseScope = esCpalsj ? 'la CPALSJ' : provincia;
  const semCruceTotal = semaforoCruce(nucleo.cruces[0]);

  // Fragmentos de texto: qué pasa con el cruce bajo reposición +1 / +3.
  const txtCruce = a => (a ? t.pyNucleoCruzaEn(a) : t.pyNucleoNoCruza);

  // ── Panel de simulación (Fase 5 · Bloque A) ────────────────────────────────
  const baseIngresos = data.params.INGRESOS_ANUALES_BASE ?? 0;
  const baseFai = data.params.FAI ?? 2;
  // Perseverancia del slider: en provincia, su valor resuelto (override si lo hay);
  // en CPALSJ no se simula (se muestra el promedio ponderado real, solo lectura).
  const persevSliderVal = esCpalsj ? Math.round(persevPond) : persevDe10DeProvincia(cfg, provincia);
  const setIngresos = v => setEscenario({ ...escenario, ingresosAnuales: Number(v) });
  const setFai = v => setEscenario({ ...escenario, fai: Number(v) });
  const setPersevProv = v => setEscenario({ ...escenario, persevOverride: { provincia, de10: Number(v) } });
  // Palancas de las pistas de decisión (Bloque C)
  const setLever = (k, v) => setEscenario({ ...escenario, [k]: Number(v) });
  const restablecer = () => setEscenario({
    ...escenario, ingresosAnuales: baseIngresos, fai: baseFai, persevOverride: null,
    cerrarA: 0, pctBtoC: 0, extraPool: 0, añoDesde: 2030,
  });
  // ¿Hay algo simulado fuera de los valores de la hoja?
  const haySimulacion = escenario.ingresosAnuales !== baseIngresos || escenario.fai !== baseFai
    || !!escenario.persevOverride || escenario.cerrarA > 0 || escenario.pctBtoC > 0 || escenario.extraPool > 0;

  // Etiqueta de escenario para los KPIs proyectivos (hablan el idioma del slider).
  const ingActual = escenario.ingresosAnuales;
  const escTag = ingActual > 0 ? t.pyEscCon(ingActual) : t.pyEscSiNadie;
  const kSostiene = Kalcance != null && ingActual >= Kalcance;

  // §6.9 — El informe se RECONSTRUYE con el alcance/idioma/escenario actuales (no es
  // un snapshot congelado): si cambias de provincia con el informe abierto, se
  // regenera para esa provincia. El cuerpo sigue anclado en «si nadie entra».
  const informe = useMemo(
    () => (mostrarInforme
      ? construirInforme(data.sheets, data.params, appState, { idioma: appState.idioma || 'es', cargadoEn: data.cargadoEn })
      : null),
    [mostrarInforme, data, alcance, provincia, haitiActivo, escenario, appState.idioma] // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Vista del informe: reemplaza los bloques por el documento de gobierno (§6.9).
  if (mostrarInforme && informe) return <Informe informe={informe} t={t} onVolver={() => setMostrarInforme(false)} />;

  return (
    <div className="vista">
      <div className="vista-general">
        <div className="inf-generar-bar no-print">
          <button className="inf-generar-btn" onClick={() => setMostrarInforme(true)}>📄 {t.infGenerar}</button>
        </div>

        {/* Hero panel */}
        <aside className="hero-panel">
          <div className="hero-label">{t.pyHeroLabel}</div>
          <div className="hero-num">{fmt(tot.activosHoy)}</div>
          <div className="hero-sublabel">{heroSub}</div>
          <div className="hero-rule" />
          <p className="hero-narrativa">
            {t.pyNarrativa(Kalcance ?? '—', primerDeficit ?? '> 2100')}
          </p>
          <div className="hero-ministats">
            <div className="hero-stat">
              <div className="hero-stat-num">{Kalcance ?? '—'}<span className="hero-stat-unit"> /año</span></div>
              <div className="hero-stat-lbl">{t.pyMiniK}</div>
              {ingActual > 0 && Kalcance != null && (
                <div className={'hero-stat-esc' + (kSostiene ? ' is-ok' : ' is-no')}>{t.pyKSimula(ingActual, kSostiene)}</div>
              )}
            </div>
            <div className="hero-stat">
              <div className="hero-stat-num">{primerDeficitSim ?? '> 2100'}</div>
              <div className="hero-stat-lbl">{t.pyMiniDeficit}</div>
              <div className="hero-stat-esc">{escTag}</div>
              {esCpalsj && provDeficit && <div className="hero-stat-prov">{t.pyHeroPrimeraProv(provDeficit)}</div>}
            </div>
            <div className="hero-stat">
              <div className="hero-stat-num">{fmt(tot.demandaA)}</div>
              <div className="hero-stat-lbl">{t.pyMiniDemandaA}</div>
            </div>
            <div className="hero-stat">
              <div className="hero-stat-num">{fmt(fuerza2080Sim)}</div>
              <div className="hero-stat-lbl">{t.pyMiniColapso}</div>
              <div className="hero-stat-esc">{escTag}</div>
            </div>
          </div>
        </aside>

        {/* Columna derecha */}
        <div className="vg-derecha">

          {/* Glosario con tarjetas pop */}
          <section className="panel">
            <h3>{t.pyGlosarioTitulo}</h3>
            <p className="panel-sub">{t.pyGlosarioSub}</p>
            <div className="glos-grid">
              {GLOSARIO.map(k => (
                <button
                  key={k}
                  type="button"
                  className={'glos-chip' + (gloss === k ? ' is-active' : '')}
                  onMouseEnter={() => setGloss(k)}
                  onFocus={() => setGloss(k)}
                  onClick={() => setGloss(k)}
                >
                  {t.pyGloss[k].t}<span className="glos-q">?</span>
                </button>
              ))}
            </div>
            <div className="glos-def">
              <div className="glos-def-head">{t.pyGloss[gloss].t}</div>
              <p>{t.pyGloss[gloss].d}</p>
            </div>
          </section>

          {/* Panel de simulación en vivo (Fase 5 · Bloque A) */}
          <section className="panel sim-panel">
            <div className="sim-head">
              <div>
                <h3>{t.pySimTitulo}</h3>
                <p className="panel-sub">{t.pySimSub}</p>
              </div>
              <button
                type="button"
                className="sim-reset"
                onClick={restablecer}
                disabled={!haySimulacion}
                title={t.pySimResetTitle}
              >
                ↺ {t.pySimReset}
              </button>
            </div>
            <div className="sim-grid">
              {/* Vocaciones nuevas al año */}
              <div className="sim-row">
                <label htmlFor="simIngresos">
                  {t.pySimIngresos}: <strong>{t.pySimIngresosUnidad(escenario.ingresosAnuales, esCpalsj)}</strong>
                </label>
                <input id="simIngresos" type="range" min="0" max="5" step="1"
                  value={escenario.ingresosAnuales} onChange={e => setIngresos(e.target.value)} />
              </div>
              {/* Perseverancia: solo simulable en alcance provincia */}
              <div className={'sim-row' + (esCpalsj ? ' is-disabled' : '')}>
                {esCpalsj ? (
                  <>
                    <label>{t.pySimPersev}: <strong>{t.pySimPersevCpalsj(persevPond.toFixed(1))}</strong></label>
                    <input type="range" min="1" max="10" step="1" value={persevSliderVal} disabled readOnly />
                    <span className="sim-nota">{t.pySimPersevCpalsjNota}</span>
                  </>
                ) : (
                  <>
                    <label htmlFor="simPersev">
                      {t.pySimPersev}: <strong>{t.pySimPersevUnidad(persevSliderVal)}</strong>
                    </label>
                    <input id="simPersev" type="range" min="1" max="10" step="1"
                      value={persevSliderVal} onChange={e => setPersevProv(e.target.value)} />
                  </>
                )}
              </div>
              {/* Capacidad de acompañamiento (FAI) */}
              <div className="sim-row">
                <label htmlFor="simFai">
                  {t.pyFaiControl}: <strong>{t.pyFaiUnidad(escenario.fai)}</strong>
                </label>
                <input id="simFai" type="range" min="1" max="5" step="1"
                  value={escenario.fai} onChange={e => setFai(e.target.value)} />
              </div>
            </div>
          </section>

          {/* Curva de proyección */}
          <section className="panel">
            <h3>{t.pyCurvaTitulo} — {scopeLabel}</h3>
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={curvaConTS} margin={{ top: 8, right: 16, bottom: 4, left: -8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#EEF2F6" />
                <XAxis dataKey="año" tick={{ fontSize: 11, fill: COLORS.gris }} />
                <YAxis tick={{ fontSize: 11, fill: COLORS.gris }} allowDecimals={false} />
                <Tooltip content={<TooltipCurva t={t} />} />
                <Legend wrapperStyle={{ fontSize: '0.74rem' }} />
                {/* Piso: sin reposición (gris, de referencia) */}
                <Line type="monotone" dataKey="base" name={t.pySerieBase} stroke={COLORS.gris} strokeWidth={1.6} strokeDasharray="5 4" dot={false} />
                {/* Tu simulación: la línea viva que siguen los sliders (dorada) */}
                <Line type="monotone" dataKey="sim" name={t.pySerieSim(escenario.ingresosAnuales)} stroke={COLORS.acento} strokeWidth={3.2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
            <p className="panel-nota">{t.pyEquilibrio(fmt(base2100), Kalcance ?? '—')}</p>
          </section>

          {/* Núcleo dedicable a B vs umbral mínimo (segundo gráfico, aparte) */}
          <section className="panel">
            <h3>{t.pyNucleoTitulo} — {scopeLabel}</h3>
            <p className="panel-sub">{t.pyNucleoSub}</p>
            <ResponsiveContainer width="100%" height={272}>
              <LineChart data={nucleo.filas} margin={{ top: 24, right: 16, bottom: 4, left: -8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#EEF2F6" />
                <XAxis dataKey="año" tick={{ fontSize: 11, fill: COLORS.gris }} />
                <YAxis tick={{ fontSize: 11, fill: COLORS.gris }} allowDecimals={false} domain={[0, 'auto']} />
                <Tooltip content={<TooltipCurva t={t} />} />
                <Legend wrapperStyle={{ fontSize: '0.74rem' }} />
                {/* Umbral mínimo: obras B ÷ capacidad de acompañamiento */}
                <ReferenceLine
                  y={nucleo.umbral}
                  stroke={COLORS.gris}
                  strokeDasharray="6 4"
                  strokeWidth={1.6}
                  label={{ value: t.pyNucleoUmbral(Math.round(nucleo.umbral)), position: 'insideTopRight', fontSize: 11, fill: COLORS.gris }}
                />
                {/* Marca del año de cruce (curva sin reposición) — con pop de ayuda */}
                {nucleo.cruces[0] && (
                  <ReferenceLine
                    x={nucleo.filas.reduce((best, f) => (f.año >= nucleo.cruces[0] && (best === null || f.año < best) ? f.año : best), null) ?? nucleo.cruces[0]}
                    stroke={COLORS.rojoCl}
                    strokeDasharray="2 3"
                    label={({ viewBox }) => (
                      <g
                        style={{ cursor: 'help' }}
                        onMouseEnter={e => mostrarTip(e, t.pyNucleoCruceAyuda)}
                        onMouseLeave={ocultarTip}
                      >
                        <text x={viewBox.x} y={viewBox.y - 8} fill={COLORS.rojoCl} fontSize={11} fontWeight={600} textAnchor="middle">
                          {t.pyNucleoCruceMarca(nucleo.cruces[0])} ⓘ
                        </text>
                      </g>
                    )}
                  />
                )}
                <Line type="monotone" dataKey="n0" name={t.pySerieBase} stroke={COLORS.rojoCl}   strokeWidth={2.4} dot={false} />
                <Line type="monotone" dataKey="n1" name={t.pySerie1}    stroke={COLORS.azulMedio} strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="n3" name={t.pySerie3}    stroke={COLORS.verdeCl}  strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
            <p className="panel-nota">{t.pyNucleoNotaCruce(nucleo.cruces[0])}</p>
            <p className="panel-nota">{t.pyNucleoNotaRep(txtCruce(nucleo.cruces[1]), txtCruce(nucleo.cruces[3]))}</p>
          </section>

          {/* Tabla de horizontes 2030 / 2050 / 2080 (cruce reactivo al slider) */}
          <section className="panel">
            <h3>{t.pyHorTitulo} — {scopeLabel}</h3>
            <p className="panel-sub">{t.pyHorSub} {t.pyCobAyuda}</p>
            <div className="table-wrap">
              <table className="hor-table">
                <thead>
                  <tr>
                    <th />
                    {horizontes.map(h => <th key={h.año} className="num">{h.año}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {[
                    { i: 1, get: h => fmt(h.activos) },
                    { i: 2, get: h => fmt(h.demandaA) },
                    { i: 3, get: h => fmt(h.poolA) },
                    { i: 4, get: h => (h.huerfanasA > 0 ? fmt(h.huerfanasA) : '—') },
                    { i: 5, get: h => fmt(h.demandaB) },
                    { i: 6, get: h => fmt(h.cubiertasB) },
                    { i: 7, get: h => (h.huerfanasB > 0 ? fmt(h.huerfanasB) : '—') },
                    { i: 8, estado: true },
                  ].map(m => (
                    <tr key={m.i}>
                      <td className="hor-rowlabel" {...thTipHor(m.i)}>{t.pyHorCols[m.i].t}</td>
                      {horizontes.map(h => (
                        <td key={h.año} className="num">
                          {m.estado
                            ? <span className="sem-badge" style={{ color: SEM_COLOR[h.semaforo] }}>{SEM_SIMB[h.semaforo]} {t.pySemaforo[h.semaforo]}</span>
                            : m.get(h)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="panel-nota">{t.pyHorNota}</p>
          </section>

          {/* Escenarios de ingreso 0–3 */}
          <section className="panel">
            <h3>{t.pyEscTitulo}</h3>
            <p className="panel-sub">{t.pyEscSub}</p>
            <div className="table-wrap">
              <table className="esc-table">
                <thead>
                  <tr>
                    <th>{t.pyEscColEntran}</th>
                    <th className="num">{t.pyCol2050}</th>
                    <th className="num">{t.pyCol2080}</th>
                    <th className="num">{t.pyEscCol2100}</th>
                    <th>{t.pyEscColSostiene}</th>
                  </tr>
                </thead>
                <tbody>
                  {esc.filas.map(f => (
                    <tr key={f.tasa} className={f.tasa === Kalcance ? 'esc-row-ok' : undefined}>
                      <td>{f.tasa === 0 ? `0 (${t.pyEscNadie})` : f.tasa}</td>
                      <td className="num">{fmt(f.valores[2050])}</td>
                      <td className="num">{fmt(f.valores[2080])}</td>
                      <td className="num">{fmt(f.valores[2100])}</td>
                      <td>
                        {f.tasa === 0 && primerDeficit
                          ? t.pyEscNoDeficit(primerDeficit)
                          : f.sostiene
                            ? <span className="esc-si">✓ {t.pyEscSi}</span>
                            : t.pyEscNo}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {Kalcance !== null && Kalcance > 3 && (
              <p className="panel-nota">{t.pyEscNotaK(Kalcance)}</p>
            )}
          </section>

          {/* Tabla de cobertura por provincia */}
          <section className="panel">
            <h3>{t.pyTablaTitulo}</h3>
            <p className="panel-sub">{t.pyTablaSub} {t.pyCobAyuda}</p>

            <div className="table-wrap">
              <table className="cob-table">
                <thead>
                  <tr>
                    <th {...thTip(0)}>{t.pyColProvincia}</th>
                    <th className="num" {...thTip(1)}>{t.pyColActivosHoy}</th>
                    <th className="num" {...thTip(2)}>{t.pyCol2050}</th>
                    <th className="num" {...thTip(3)}>{t.pyCol2080}</th>
                    <th className="num" {...thTip(4)}>{t.pyColDemandaA}</th>
                    <th className="num" {...thTip(5)}>{t.pyColPoolA2050}</th>
                    <th className="num" {...thTip(6)}>{t.pyColDeficit}</th>
                    <th className="num" {...thTip(7)}>{t.pyColK}</th>
                    <th {...thTip(8)}>{t.pyColEstado}</th>
                    <th className="num" {...thTip(9)}>{t.pyColObrasB}</th>
                    <th className="num" {...thTip(10)}>{t.pyColNucleoB}</th>
                  </tr>
                </thead>
                <tbody>
                  {tabla.map(r => (
                    <tr key={r.provincia}>
                      <td>{r.provincia}</td>
                      <td className="num">{fmt(r.activosHoy)}</td>
                      <td className="num">{fmt(r.activos2050)}</td>
                      <td className="num">{fmt(r.activos2080)}</td>
                      <td className="num">{fmt(r.demanda.A)}</td>
                      <td className="num">{fmt(r.poolA2050)}</td>
                      <td className="num">{r.primerDeficitA ?? t.pyNunca}</td>
                      <td className="num">{r.equilibrioK ?? '—'}</td>
                      <td><LineaProgresion pasos={r.semaforosPorAnio} /></td>
                      <td className="num">{fmt(r.obrasB)}</td>
                      <td className="num">
                        {fmt(r.nucleoBHoy)} → {r.anioCruceB ?? '—'}{' '}
                        <span className="sem-badge" style={{ color: SEM_COLOR[r.semCruceB] }}>{SEM_SIMB[r.semCruceB]}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
                {esCpalsj && (
                  <tfoot>
                    <tr>
                      <td>{t.pyTotalCpalsj}</td>
                      <td className="num">{fmt(tot.activosHoy)}</td>
                      <td className="num">{fmt(tot.activos2050)}</td>
                      <td className="num">{fmt(tot.activos2080)}</td>
                      <td className="num">{fmt(tot.demandaA)}</td>
                      <td className="num">{fmt(tot.poolA2050)}</td>
                      <td className="num">—</td>
                      <td className="num">{tot.K}</td>
                      <td><LineaProgresion pasos={lineaTotalSem} /></td>
                      <td className="num">{fmt(tot.demandaB)}</td>
                      <td className="num">
                        {fmt(tot.nucleoBHoy)} → {nucleo.cruces[0] ?? '—'}{' '}
                        <span className="sem-badge" style={{ color: SEM_COLOR[semCruceTotal] }}>{SEM_SIMB[semCruceTotal]}</span>
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
            <p className="panel-nota">{t.pyBFrase(fraseScope, tot.demandaB, Math.round(tot.nucleoBHoy), nucleo.cruces[0])}</p>
            <p className="panel-nota">{t.pyObrasCNota(tot.demandaC)}</p>
            <p className="panel-nota">{t.pyNotaPie}</p>
          </section>

          {/* Pistas de decisión (Fase 7 · Bloque C) */}
          <section className="panel">
            <h3>{t.pyPistasTitulo} — {scopeLabel}</h3>
            <p className="panel-sub">{t.pyPistasSub}</p>

            {/* Fila-resumen base (ancla "si nadie entra") */}
            <div className="pista-base">
              <span className="pb-lbl">{t.pyPistasBaseLbl}</span>
              <span className="pb-pill">{añoTxt(pistas.base.faltaA)}<span className="pb-k">{t.pyPbFaltaA}</span><span className="pb-sub">{t.pyPbConjuntoSub(nProv)}</span></span>
              <span className="pb-pill">{añoTxt(pistas.base.faltaB)}<span className="pb-k">{t.pyPbFaltaB}</span></span>
              <span className="pb-pill">{fmt(pistas.base.sinJesuita2050)}<span className="pb-k">{t.pyPbSin2050}</span></span>
              <span className="pb-pill">{fmt(pistas.base.sinJesuita2080)}<span className="pb-k">{t.pyPbSin2080}</span></span>
            </div>

            <div className="pista-grid">
              {/* ① Cerrar obras A */}
              <div className="pista-card">
                <div className="pista-h">{t.pyP1Titulo}</div>
                <p className="pista-d">{t.pyP1Desc}</p>
                <label className="pista-ctl">{t.pyP1Slider(escenario.cerrarA)}
                  <input type="range" min="0" max={pistas.base.demandaA} step="1" value={escenario.cerrarA} onChange={e => setLever('cerrarA', e.target.value)} /></label>
                <PistaDiffs p={pistas.cerrar} />
                <div className="pista-stars"><Estrellas label={t.pyPsImpacto} n={3} /><Estrellas label={t.pyPsRiesgo} n={4} /><Estrellas label={t.pyPsViabilidad} n={2} /></div>
              </div>

              {/* ② Soltar a manos laicas */}
              <div className="pista-card">
                <div className="pista-h">{t.pyP2Titulo}</div>
                <p className="pista-d">{t.pyP2Desc}</p>
                <label className="pista-ctl">{t.pyP2Slider(escenario.pctBtoC)}
                  <input type="range" min="0" max="80" step="5" value={escenario.pctBtoC} onChange={e => setLever('pctBtoC', e.target.value)} /></label>
                <PistaDiffs p={pistas.soltar} />
                <div className="pista-stars"><Estrellas label={t.pyPsImpacto} n={2} /><Estrellas label={t.pyPsRiesgo} n={2} /><Estrellas label={t.pyPsViabilidad} n={4} /></div>
              </div>

              {/* ③ Refuerzo externo */}
              <div className="pista-card">
                <div className="pista-h">{t.pyP3Titulo}</div>
                <p className="pista-d">{t.pyP3Desc}</p>
                <label className="pista-ctl">{t.pyP3SliderN(escenario.extraPool)}
                  <input type="range" min="0" max="10" step="1" value={escenario.extraPool} onChange={e => setLever('extraPool', e.target.value)} /></label>
                <label className="pista-ctl">{t.pyP3SliderAño(escenario.añoDesde)}
                  <input type="range" min="2026" max="2080" step="1" value={escenario.añoDesde} onChange={e => setLever('añoDesde', e.target.value)} /></label>
                <PistaDiffs p={pistas.refuerzo} />
                {refuerzoATiempo !== null && (
                  <p className={'pista-timing ' + (refuerzoATiempo ? 'is-ok' : 'is-late')}>
                    {refuerzoATiempo ? t.pyP3ATiempo(refuerzoUmbral) : t.pyP3Tarde(refuerzoUmbral)}
                  </p>
                )}
                <div className="pista-stars"><Estrellas label={t.pyPsImpacto} n={2} /><Estrellas label={t.pyPsRiesgo} n={1} /><Estrellas label={t.pyPsViabilidad} n={2} /></div>
              </div>

              {/* ④ Más vocaciones (unificada con el slider de ingresos del panel) */}
              <div className="pista-card">
                <div className="pista-h">{t.pyP4Titulo}</div>
                <p className="pista-d">{t.pyP4Desc}</p>
                <label className="pista-ctl">{t.pyP4Slider(escenario.ingresosAnuales)}
                  <input type="range" min="0" max="5" step="1" value={escenario.ingresosAnuales} onChange={e => setIngresos(e.target.value)} /></label>
                <PistaDiffs p={pistas.vocaciones} />
                <div className="pista-stars"><Estrellas label={t.pyPsImpacto} n={5} /><Estrellas label={t.pyPsRiesgo} n={1} /><Estrellas label={t.pyPsViabilidad} n={2} /></div>
              </div>
            </div>
            <p className="panel-nota">{t.pyPistasNota}</p>
          </section>

          {/* Bloque D.1 — Heatmap de sostenibilidad (0–100 por provincia × año) */}
          <section className="panel">
            <h3>{t.pyHeatTitulo} — {scopeLabel}</h3>
            <p className="panel-sub">{t.pyHeatSub} {t.pyCobAyuda}</p>
            <div className="table-wrap">
              <table className="cob-table heat-table">
                <thead>
                  <tr>
                    <th {...thTipHeat(0)}>{t.pyColProvincia}</th>
                    {ANIOS_PROGRESION.map(Y => (
                      <th key={Y} className="num" onMouseEnter={e => mostrarTip(e, t.pyHeatAñoAyuda(Y))} onMouseLeave={ocultarTip}>{Y}</th>
                    ))}
                    <th className="num" {...thTipHeat(1)}>{t.pyHeatTendencia}</th>
                  </tr>
                </thead>
                <tbody>
                  {sosten.filas.slice().sort((a, b) => b.personas - a.personas).map(f => (
                    <tr key={f.provincia}>
                      <td>{f.provincia}</td>
                      {ANIOS_PROGRESION.map(Y => (
                        <td key={Y} className="num heat-cell" style={{ background: colorPuntaje(f.puntajes[Y]) }}>{Math.round(f.puntajes[Y])}</td>
                      ))}
                      <td className="num"><Tendencia delta={f.tendencia} /></td>
                    </tr>
                  ))}
                </tbody>
                {esCpalsj && (
                  <tfoot>
                    <tr>
                      <td>{t.pyHeatPromedio}</td>
                      {ANIOS_PROGRESION.map(Y => (
                        <td key={Y} className="num heat-cell" style={{ background: colorPuntaje(sosten.promedio[Y]) }}>{Math.round(sosten.promedio[Y])}</td>
                      ))}
                      <td className="num"><Tendencia delta={sosten.tendenciaProm} /></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
            <p className="panel-nota">{t.pyHeatNota}</p>
          </section>

          {/* Bloque D.2 — Mapa de riesgos (scatter de 4 cuadrantes) */}
          <section className="panel">
            <h3>{t.pyRiesgoTitulo} — {scopeLabel}</h3>
            <p className="panel-sub">{t.pyRiesgoSub}</p>
            <ResponsiveContainer width="100%" height={360}>
              <ScatterChart margin={{ top: 16, right: 28, bottom: 28, left: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#EEF2F6" />
                <XAxis type="number" dataKey="x" name="años" domain={[0, dataMax => Math.max(30, dataMax + 6)]}
                  tick={{ fontSize: 11, fill: COLORS.gris }}
                  label={{ value: t.pyRiesgoEjeX, position: 'insideBottom', offset: -12, fontSize: 11, fill: COLORS.gris }} />
                <YAxis type="number" dataKey="y" name="obras" allowDecimals={false} domain={[0, 'auto']}
                  tick={{ fontSize: 11, fill: COLORS.gris }}
                  label={{ value: t.pyRiesgoEjeY, angle: -90, position: 'insideLeft', fontSize: 11, fill: COLORS.gris, style: { textAnchor: 'middle' } }} />
                {/* Referencia secundaria: el umbral fijo de 25 años (gris claro, punteado). */}
                <ReferenceLine x={riesgo.refX} stroke={COLORS.borde} strokeDasharray="2 4"
                  label={{ value: t.pyRiesgoRef25, position: 'insideBottomLeft', fontSize: 10, fill: COLORS.gris }} />
                {/* Corte principal: mediana de años hasta déficit (urgencia relativa). */}
                <ReferenceLine x={riesgo.medianaX} stroke={COLORS.azul} strokeDasharray="5 4"
                  label={{ value: t.pyRiesgoRefX(Math.round(riesgo.medianaX)), position: 'insideTopLeft', fontSize: 11, fill: COLORS.azul }} />
                <ReferenceLine y={riesgo.medianaY} stroke={COLORS.azul} strokeDasharray="5 4"
                  label={{ value: t.pyRiesgoRefY(Math.round(riesgo.medianaY)), position: 'insideBottomRight', fontSize: 11, fill: COLORS.azul }} />
                <Tooltip content={<TooltipRiesgo t={t} />} cursor={{ strokeDasharray: '3 3' }} />
                <Scatter data={riesgo.puntos} shape={<PuntoRiesgo />} isAnimationActive={false} />
              </ScatterChart>
            </ResponsiveContainer>
            <div className="riesgo-cuadrantes">
              {QUADRANTS.map(q => {
                const provs = riesgo.puntos.filter(p => p.cuadrante === q.key);
                return (
                  <div key={q.key} className={'rq-card rq-' + q.key}>
                    <div className="rq-h">{t.pyRiesgoCuad[q.key].t}</div>
                    <div className="rq-d">{t.pyRiesgoCuad[q.key].d}</div>
                    <div className="rq-provs">
                      {provs.length
                        ? provs.map(p => <span key={p.provincia} className="rq-chip">{p.provincia}</span>)
                        : <span className="rq-empty">{t.pyRiesgoVacio}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="panel-nota">{t.pyRiesgoNota}</p>
          </section>

        </div>
      </div>

      {tip && (
        <div className="cob-tip" style={{ left: tip.x, top: tip.y }} role="tooltip">{tip.text}</div>
      )}
    </div>
  );
}
