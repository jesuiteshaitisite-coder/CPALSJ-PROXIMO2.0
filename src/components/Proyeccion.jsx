import { useEffect, useMemo, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine,
} from 'recharts';
import { useAppState } from '../state/AppStateContext.jsx';
import { provinciasDelAlcance } from '../utils/calculations.js';
import {
  resolverCfg, proyectarPorProvincia, curvaEscenarios, curvaNucleoB, serieTSsinRep,
  chequearDiscrepancia, cohortesActivas, tablaEscenarios, semaforoCruce,
  ANIOS_CURVA, PROY_FIN,
} from '../utils/motor.js';
import { COLORS } from '../utils/colors.js';

function fmt(n) {
  if (n === null || n === undefined) return '—';
  return Math.round(n).toLocaleString('es-CL');
}

const SEM_COLOR = { verde: 'var(--ok)', amarillo: 'var(--warn)', rojo: 'var(--alert)' };
const SEM_SIMB  = { verde: '✓', amarillo: '⚠', rojo: '✗' };

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
  const fai = escenario.fai;

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

    const esc = tablaEscenarios(data.sheets, provs, cfg, [0, 1, 2, 3], [2050, 2080, 2100]);

    return { tabla, curvaConTS, discrepancia, nucleo, tot, primerDeficit, base2100, Kalcance, esc };
  }, [data, alcance, provincia, haitiActivo, escenario]); // eslint-disable-line react-hooks/exhaustive-deps

  const { tabla, curvaConTS, discrepancia, nucleo, tot, primerDeficit, base2100, Kalcance, esc } = calc;

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
  const scopeLabel = esCpalsj ? 'CPALSJ' : provincia;
  const fraseScope = esCpalsj ? 'la CPALSJ' : provincia;
  const semCruceTotal = semaforoCruce(nucleo.cruces[0]);

  // Fragmentos de texto: qué pasa con el cruce bajo reposición +1 / +3.
  const txtCruce = a => (a ? t.pyNucleoCruzaEn(a) : t.pyNucleoNoCruza);

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
                <Line type="monotone" dataKey="base" name={t.pySerieBase} stroke={COLORS.rojoCl}   strokeWidth={2.4} dot={false} />
                <Line type="monotone" dataKey="r1"   name={t.pySerie1}    stroke={COLORS.azulMedio} strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="r3"   name={t.pySerie3}    stroke={COLORS.verdeCl}  strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
            <p className="panel-nota">{t.pyEquilibrio(fmt(base2100), Kalcance ?? '—')}</p>
          </section>

          {/* Núcleo dedicable a B vs umbral mínimo (segundo gráfico, aparte) */}
          <section className="panel">
            <h3>{t.pyNucleoTitulo} — {scopeLabel}</h3>
            <p className="panel-sub">{t.pyNucleoSub}</p>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={nucleo.filas} margin={{ top: 8, right: 16, bottom: 4, left: -8 }}>
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
                {/* Marca del año de cruce (curva sin reposición) */}
                {nucleo.cruces[0] && (
                  <ReferenceLine
                    x={nucleo.filas.reduce((best, f) => (f.año >= nucleo.cruces[0] && (best === null || f.año < best) ? f.año : best), null) ?? nucleo.cruces[0]}
                    stroke={COLORS.rojoCl}
                    strokeDasharray="2 3"
                    label={{ value: t.pyNucleoCruceMarca(nucleo.cruces[0]), position: 'top', fontSize: 11, fill: COLORS.rojoCl }}
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

          {/* Escenarios de ingreso 0–3 */}
          <section className="panel">
            <h3>{t.pyEscTitulo}</h3>
            <p className="panel-sub">{t.pyEscSub}</p>
            <div className="table-wrap">
              <table>
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

          {/* Tabla de validación por provincia */}
          <section className="panel">
            <h3>{t.pyTablaTitulo}</h3>
            <p className="panel-sub">{t.pyTablaSub}</p>

            <div className="fai-control">
              <label htmlFor="faiRange">
                {t.pyFaiControl}: <strong>{t.pyFaiUnidad(fai)}</strong>
              </label>
              <input
                id="faiRange"
                type="range"
                min="1"
                max="5"
                step="1"
                value={fai}
                onChange={e => setEscenario({ ...escenario, fai: Number(e.target.value) })}
              />
            </div>

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
                    <th className="num">{t.pyColObrasB}</th>
                    <th className="num">{t.pyColNucleoB}</th>
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
                      <td>—</td>
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

        </div>
      </div>
    </div>
  );
}
