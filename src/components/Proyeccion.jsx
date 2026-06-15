import { useEffect, useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { useAppState } from '../state/AppStateContext.jsx';
import { provinciasDelAlcance } from '../utils/calculations.js';
import {
  resolverCfg, proyectarPorProvincia, curvaEscenarios, serieTSsinRep,
  chequearDiscrepancia, cohortesActivas, ANIOS_CURVA, PROY_FIN,
} from '../utils/motor.js';
import { COLORS } from '../utils/colors.js';

function fmt(n) {
  if (n === null || n === undefined) return '—';
  return Math.round(n).toLocaleString('es-CL');
}

const SEM_COLOR = { verde: 'var(--ok)', amarillo: 'var(--warn)', rojo: 'var(--alert)' };
const SEM_SIMB  = { verde: '✓', amarillo: '⚠', rojo: '✕' };

// Orden de los términos del glosario (claves de t.pyGloss)
const GLOSARIO = [
  'activa', 'poolA', 'reposicion', 'perseverancia', 'formacion',
  'fai', 'demanda', 'huerfanas', 'equilibrio', 'semaforo', 'deficit',
];

function ChipGlosario({ term }) {
  return (
    <span className="tipo-item glos-chip">
      {term.t}
      <span className="glos-q">?</span>
      <div className="tipo-tip">
        <div className="tipo-tip-head">{term.t}</div>
        <p>{term.d}</p>
      </div>
    </span>
  );
}

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
  const { alcance, provincia, haitiActivo, escenario } = appState;

  const calc = useMemo(() => {
    const provs = provinciasDelAlcance(appState);
    const cfg = resolverCfg(data.params, escenario);

    const tabla = proyectarPorProvincia(data.sheets, provs, cfg)
      .sort((a, b) => b.personas - a.personas);

    const curva = curvaEscenarios(data.sheets, provs, cfg, ANIOS_CURVA, [1, 3]);
    const tsMap = serieTSsinRep(data.sheets, provs);
    const curvaConTS = curva.map(f => ({ ...f, ts: tsMap[f.año] ?? null }));
    const discrepancia = chequearDiscrepancia(curva, tsMap);

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
      K: a.K + (r.equilibrioK || 0),
    }), { personas: 0, activosHoy: 0, activos2050: 0, activos2080: 0, poolA2050: 0, demandaA: 0, demandaB: 0, demandaC: 0, K: 0 });

    // Primer déficit A más cercano del alcance
    const deficits = tabla.map(r => r.primerDeficitA).filter(Boolean);
    const primerDeficit = deficits.length ? Math.min(...deficits) : null;

    // Número de equilibrio del alcance (recalculado sobre el agregado, no suma de Ks)
    const base2100 = curva[curva.length - 1].base;
    const ca = cohortesActivas(PROY_FIN, cfg);
    const nProv = provs.length;
    const Kalcance = ca > 0
      ? Math.max(0, Math.ceil((tot.activosHoy - base2100) / (cfg.perseverancia * ca * nProv)))
      : null;

    return { tabla, curvaConTS, discrepancia, tot, primerDeficit, base2100, Kalcance };
  }, [data, alcance, provincia, haitiActivo, escenario]); // eslint-disable-line react-hooks/exhaustive-deps

  const { tabla, curvaConTS, discrepancia, tot, primerDeficit, base2100, Kalcance } = calc;

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
    console.groupEnd();
  }, [curvaConTS, discrepancia, alcance, provincia]);

  const esCpalsj = alcance === 'cpalsj';
  const heroSub = esCpalsj ? t.pyHeroSub : provincia;

  return (
    <div className="vista">
      <div className="vista-general">

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
            </div>
            <div className="hero-stat">
              <div className="hero-stat-num">{primerDeficit ?? '—'}</div>
              <div className="hero-stat-lbl">{t.pyMiniDeficit}</div>
            </div>
            <div className="hero-stat">
              <div className="hero-stat-num">{fmt(tot.demandaA)}</div>
              <div className="hero-stat-lbl">{t.pyMiniDemandaA}</div>
            </div>
            <div className="hero-stat">
              <div className="hero-stat-num">{fmt(tot.activos2080)}</div>
              <div className="hero-stat-lbl">{t.pyMiniColapso}</div>
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
              {GLOSARIO.map(k => <ChipGlosario key={k} term={t.pyGloss[k]} />)}
            </div>
          </section>

          {/* Curva de proyección */}
          <section className="panel">
            <h3>{t.pyCurvaTitulo} — {heroSub}</h3>
            <p className="panel-sub">{t.pyCurvaSub}</p>
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={curvaConTS} margin={{ top: 8, right: 16, bottom: 4, left: -8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#EEF2F6" />
                <XAxis dataKey="año" tick={{ fontSize: 11, fill: COLORS.gris }} />
                <YAxis tick={{ fontSize: 11, fill: COLORS.gris }} allowDecimals={false} />
                <Tooltip content={<TooltipCurva t={t} />} />
                <Legend wrapperStyle={{ fontSize: '0.74rem' }} />
                <Line type="monotone" dataKey="base" name={t.pySerieBase} stroke={COLORS.rojoCl}   strokeWidth={2.4} dot={false} />
                <Line type="monotone" dataKey="r1"   name={t.pySerie1}    stroke={COLORS.azulMedio} strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="r3"   name={t.pySerie3}    stroke={COLORS.verdeCl}  strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
            <p className="panel-nota">{t.pyEquilibrio(fmt(base2100), Kalcance ?? '—')}</p>
          </section>

          {/* Tabla de validación por provincia */}
          <section className="panel">
            <h3>{t.pyTablaTitulo}</h3>
            <p className="panel-sub">{t.pyTablaSub}</p>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{t.pyColProvincia}</th>
                    <th className="num">{t.pyColActivosHoy}</th>
                    <th className="num">{t.pyCol2050}</th>
                    <th className="num">{t.pyCol2080}</th>
                    <th className="num">{t.pyColDemandaA}</th>
                    <th className="num">{t.pyColPoolA2050}</th>
                    <th className="num">{t.pyColDeficit}</th>
                    <th className="num">{t.pyColK}</th>
                    <th>{t.pyColEstado}</th>
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
                      <td>
                        <span className="sem-badge" style={{ color: SEM_COLOR[r.semaforo2050] }}>
                          {SEM_SIMB[r.semaforo2050]} {t.pySemaforo[r.semaforo2050]}
                        </span>
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
                      <td>—</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
            <p className="panel-nota">{t.pyNotaPie}</p>
          </section>

        </div>
      </div>
    </div>
  );
}
