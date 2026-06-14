import { useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LabelList,
} from 'recharts';
import { useAppState } from '../state/AppStateContext.jsx';
import {
  provinciasDelAlcance, filtrarPersonas,
  statsDemograficas, piramideEdad, comparativaProvincias,
  distribucionFuerza, FUERZA_ORDEN, statsIngreso, ANIO_REF,
} from '../utils/calculations.js';
import { COLORS } from '../utils/colors.js';

const ESTADO_COLORS = {
  P: COLORS.azulMedio,
  S: COLORS.verdeCl,
  F: COLORS.acento,
  NS: COLORS.ambar,
  O: '#7C3AED',
  otros: COLORS.gris,
};

// Fuerza apostólica: del verde (plena fuerza) al gris (retiro)
const FUERZA_COLORS = {
  'Plena': COLORS.verde,
  'Formación': COLORS.azulMedio,
  'Acompañamiento': COLORS.acento,
  'Retiro': COLORS.gris,
};

// Pirámide por zonas vocacionales (formación / activa / mayores)
const ZONAS = {
  '<30': 'form', '30-39': 'form',
  '40-49': 'active', '50-59': 'active', '60-69': 'active',
  '70-79': 'senior', '80+': 'senior',
};
const ZONE_BAR = { form: 'var(--zone-form)', active: 'var(--zone-active)', senior: 'var(--zone-senior)' };
const ZONE_BG = { form: 'rgba(91,141,184,0.10)', active: 'rgba(27,58,92,0.06)', senior: 'rgba(154,163,176,0.12)' };

function fmt(n, dec = 0) {
  return n === null || n === undefined ? '—'
    : n.toLocaleString('es-CL', { maximumFractionDigits: dec, minimumFractionDigits: dec });
}

// Tarjeta de hover del gráfico de composición: detalla cada estado y la suma
// total de la provincia (las barras apiladas no muestran el total por sí solas).
function TooltipComposicion({ active, payload, label, t }) {
  if (!active || !payload || !payload.length) return null;
  // Total real de la provincia (incluye jesuitas sin estado canónico, que no se
  // dibujan como segmento): coincide con la tabla "Cantidad de jesuitas".
  const total = payload[0]?.payload?.total ?? payload.reduce((s, p) => s + (p.value || 0), 0);
  return (
    <div className="tt-card">
      <div className="tt-title">{label}</div>
      {payload.filter(p => p.value > 0).map(p => (
        <div className="tt-row" key={p.dataKey}>
          <span className="tt-dot" style={{ background: p.color }} />
          <span className="tt-name">{p.name}</span>
          <span className="tt-val">{fmt(p.value)}</span>
        </div>
      ))}
      <div className="tt-total">
        <span>{t.vpColTotal} {label}</span>
        <span>{fmt(total)}</span>
      </div>
    </div>
  );
}

export default function VistaPresente({ t, data }) {
  const appState = useAppState();
  const { alcance, provincia, haitiActivo } = appState;

  const calc = useMemo(() => {
    const provs = provinciasDelAlcance(appState);
    const personas = filtrarPersonas(data.sheets, provs);
    return {
      provs,
      stats: statsDemograficas(personas),
      piramide: piramideEdad(personas),
      fuerza: distribucionFuerza(personas),
      ingreso: statsIngreso(personas),
      comparativa: alcance === 'cpalsj' ? comparativaProvincias(data.sheets, provs) : null,
    };
  }, [data, alcance, provincia, haitiActivo]); // eslint-disable-line react-hooks/exhaustive-deps

  const { stats, piramide, fuerza, ingreso, comparativa } = calc;

  const estadoData = Object.entries(stats.porEstado)
    .filter(([, n]) => n > 0)
    .map(([k, n]) => ({ name: `${t.vpEstados[k]} (${k})`, key: k, value: n }));

  const fuerzaData = FUERZA_ORDEN
    .filter(f => fuerza.conteo[f] > 0)
    .map(f => ({ key: f, name: t.vpFuerzaCategorias[f] || f, value: fuerza.conteo[f] }));

  // Hero panel + narrativa dinámica
  const pctPlena = fuerza.total ? (fuerza.conteo['Plena'] / fuerza.total) * 100 : 0;
  const heroSub = alcance === 'cpalsj' ? t.vgHeroSub : provincia;

  // Pirámide: datos por zona y callout dinámico de inversión demográfica
  const pirTotal = piramide.tramos.reduce((s, x) => s + x.n, 0);
  const pirMax = Math.max(...piramide.tramos.map(x => x.n), 1);
  const pirSorted = [...piramide.tramos].reverse(); // 80+ arriba, <30 abajo
  const nDe = label => piramide.tramos.find(x => x.tramo === label)?.n || 0;
  const n80 = nDe('80+');
  const menor40 = nDe('<30') + nDe('30-39');
  const inversionCritica = n80 > menor40;

  return (
    <div className="vista">

      {/* ── Bloque de comando: Hero panel + KPI strip + 4 charts ── */}
      <div className="vista-general">

        {/* Hero panel (columna izquierda, navy) */}
        <aside className="hero-panel">
          <div className="hero-label">{t.vgHeroLabel} · {ANIO_REF}</div>
          <div className="hero-num">{fmt(stats.total)}</div>
          <div className="hero-sublabel">{heroSub}</div>
          <div className="hero-rule" />
          <p className="hero-narrativa">
            {t.vgNarrativa(Math.round(stats.pctMayores70), Math.round(pctPlena))}
          </p>
          <div className="hero-ministats">
            <div className="hero-stat">
              <div className="hero-stat-num">{fmt(stats.edadMedia, 1)}<span className="hero-stat-unit"> {t.vpAnios}</span></div>
              <div className="hero-stat-lbl">{t.vpEdadMedia}</div>
            </div>
            <div className="hero-stat">
              <div className="hero-stat-num">{fmt(pctPlena, 0)}%</div>
              <div className="hero-stat-lbl">{t.vgFuerzaPlena}</div>
            </div>
            <div className="hero-stat">
              <div className="hero-stat-num">{fmt(fuerza.conteo['Formación'])}</div>
              <div className="hero-stat-lbl">{t.vgEnFormacion}</div>
            </div>
            <div className="hero-stat">
              <div className="hero-stat-num">{fmt(n80)}</div>
              <div className="hero-stat-lbl">{t.vgMayores80}</div>
            </div>
          </div>
        </aside>

        {/* Columna derecha: KPI strip + grid de charts */}
        <div className="vg-derecha">

          {/* KPI strip con semántica de color (sin tendencias inventadas) */}
          <div className="kpi-strip">
            <div className="kpi2 is-navy">
              <div className="kpi2-valor">{fmt(stats.total)}</div>
              <div className="kpi2-label">{t.vpTotalJesuitas}</div>
            </div>
            <div className="kpi2 is-warn">
              <div className="kpi2-valor">{fmt(stats.edadMedia, 1)}<span className="kpi2-unit"> {t.vpAnios}</span></div>
              <div className="kpi2-label">{t.vpEdadMedia}</div>
            </div>
            <div className="kpi2 is-alert">
              <div className="kpi2-valor">{fmt(stats.pctMayores70, 1)}%</div>
              <div className="kpi2-label">{t.vpMayores70}</div>
            </div>
            <div className="kpi2 is-navy">
              <div className="kpi2-valor">{fmt(stats.enEdadActiva)}</div>
              <div className="kpi2-label">{t.vpEnEdadActiva}</div>
            </div>
            <div className="kpi2 is-ok kpi-hover">
              <div className="kpi2-valor">{fmt(stats.conVotos)}</div>
              <div className="kpi2-label">{t.vpKpiConVotos}</div>
              <div className="kpi-tip">
                <div className="tt-title">{t.vpSinVotosTitulo}</div>
                <div className="tt-row">
                  <span className="dot" style={{ background: ESTADO_COLORS.P }} />
                  <span className="tt-name">{t.vpEstados.P} (P)</span>
                  <span className="tt-val">{fmt(stats.sinVotosPorEstado.P)}</span>
                </div>
                <div className="tt-row">
                  <span className="dot" style={{ background: ESTADO_COLORS.F }} />
                  <span className="tt-name">{t.vpEstados.F} (F)</span>
                  <span className="tt-val">{fmt(stats.sinVotosPorEstado.F)}</span>
                </div>
                <div className="tt-row">
                  <span className="dot" style={{ background: ESTADO_COLORS.O }} />
                  <span className="tt-name">{t.vpEstados.O} (O)</span>
                  <span className="tt-val">{fmt(stats.sinVotosPorEstado.O)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Grid 2×2 de charts */}
          <div className="vg-charts">

            {/* Pirámide de edad con zonas vocacionales */}
            <div className="panel piramide-panel">
              <h3>{t.vpPiramide}</h3>
              <p className="panel-sub">{t.vgPiramideSub}</p>
              <div className="pir-legend">
                <span>
                  <i style={{ background: 'var(--zone-form)' }} />{t.vgZonaFormacion}
                  <div className="tipo-tip">
                    <div className="tipo-tip-head"><span className="dot" style={{ background: 'var(--zone-form)' }} />{t.vgZonaFormacion}</div>
                    <p>{t.vgZonaExplica.form}</p>
                  </div>
                </span>
                <span>
                  <i style={{ background: 'var(--zone-active)' }} />{t.vgZonaActiva}
                  <div className="tipo-tip">
                    <div className="tipo-tip-head"><span className="dot" style={{ background: 'var(--zone-active)' }} />{t.vgZonaActiva}</div>
                    <p>{t.vgZonaExplica.active}</p>
                  </div>
                </span>
                <span>
                  <i style={{ background: 'var(--zone-senior)' }} />{t.vgZonaMayores}
                  <div className="tipo-tip">
                    <div className="tipo-tip-head"><span className="dot" style={{ background: 'var(--zone-senior)' }} />{t.vgZonaMayores}</div>
                    <p>{t.vgZonaExplica.senior}</p>
                  </div>
                </span>
              </div>
              <div className="pir-rows">
                {pirSorted.map(tr => {
                  const zona = ZONAS[tr.tramo];
                  const pct = pirTotal ? (tr.n / pirTotal) * 100 : 0;
                  return (
                    <div className="pir-row" key={tr.tramo} style={{ background: ZONE_BG[zona] }}
                         title={`${tr.tramo}: ${fmt(tr.n)} (${fmt(pct, 0)}%)`}>
                      <span className="pir-label">{tr.tramo}</span>
                      <div className="pir-track">
                        <div className="pir-bar" style={{ width: `${(tr.n / pirMax) * 100}%`, background: ZONE_BAR[zona] }} />
                      </div>
                      <span className="pir-num">{fmt(tr.n)}</span>
                      <span className="pir-pct">{fmt(pct, 0)}%</span>
                    </div>
                  );
                })}
              </div>
              {inversionCritica && (
                <div className="pir-callout">
                  <span className="pir-callout-ico" aria-hidden="true">⚠️</span>
                  <div>
                    <div className="pir-callout-tit">{t.vgCalloutTitulo}</div>
                    <div className="pir-callout-txt">{t.vgCalloutTexto(fmt(n80), fmt(menor40))}</div>
                  </div>
                </div>
              )}
            </div>

            {/* Estado canónico (donut) */}
            <div className="panel">
              <h3>{t.vpEstadoCanonico}</h3>
              <div className="estado-layout">
                <div className="estado-chart">
                  <ResponsiveContainer width="100%" height={250}>
                    <PieChart>
                      <Pie
                        data={estadoData} dataKey="value" nameKey="name"
                        cx="50%" cy="50%" innerRadius="58%" outerRadius="92%"
                        paddingAngle={0}
                      >
                        {estadoData.map(d => <Cell key={d.key} fill={ESTADO_COLORS[d.key]} />)}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="estado-centro">
                    <div className="estado-centro-num">{fmt(stats.total)}</div>
                    <div className="estado-centro-label">{t.vpColTotal}</div>
                  </div>
                </div>
                <ul className="estado-lista">
                  {estadoData.map(d => (
                    <li key={d.key}>
                      <span className="dot" style={{ background: ESTADO_COLORS[d.key] }} />
                      <span className="estado-nombre">{d.name}</span>
                      <span className="estado-cifra">
                        <strong>{fmt(d.value)}</strong> · {fmt(d.value / stats.total * 100, 1)}%
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Fuerza apostólica (donut) */}
            <div className="panel">
              <h3>{t.vpFuerzaTitulo}</h3>
              <div className="estado-layout">
                <div className="estado-chart">
                  <ResponsiveContainer width="100%" height={250}>
                    <PieChart>
                      <Pie
                        data={fuerzaData} dataKey="value" nameKey="name"
                        cx="50%" cy="50%" innerRadius="58%" outerRadius="92%"
                        paddingAngle={0}
                      >
                        {fuerzaData.map(d => <Cell key={d.key} fill={FUERZA_COLORS[d.key]} />)}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="estado-centro">
                    <div className="estado-centro-num">{fmt(fuerza.total)}</div>
                    <div className="estado-centro-label">{t.vpColTotal}</div>
                  </div>
                </div>
                <ul className="estado-lista">
                  {fuerzaData.map(d => {
                    const pct = fuerza.total ? (d.value / fuerza.total) * 100 : 0;
                    return (
                      <li key={d.key} className="fuerza-item">
                        <div className="fuerza-item-fila">
                          <span className="dot" style={{ background: FUERZA_COLORS[d.key] }} />
                          <span className="estado-nombre">{d.name}</span>
                          <span className="estado-cifra"><strong>{fmt(d.value)}</strong> · {fmt(pct, 1)}%</span>
                        </div>
                        <div className="fuerza-barra"><div style={{ width: `${pct}%`, background: FUERZA_COLORS[d.key] }} /></div>
                        <div className="tipo-tip">
                          <div className="tipo-tip-head">
                            <span className="dot" style={{ background: FUERZA_COLORS[d.key] }} />
                            {d.name}
                          </div>
                          <p>{t.vpFuerzaExplica[d.key]}</p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>

            {/* Ingreso y antigüedad */}
            <div className="panel">
              <h3>{t.vpIngresoTitulo}</h3>
              <div className="ingreso-stats">
                <div className="ingreso-stat">
                  <div className="ingreso-num">{fmt(ingreso.edadIngresoMedia, 1)} <span className="kpi-unidad">{t.vpAnios}</span></div>
                  <div className="ingreso-lbl">{t.vpEdadIngresoMedia}</div>
                </div>
                <div className="ingreso-stat">
                  <div className="ingreso-num">{fmt(ingreso.antiguedadMedia, 1)} <span className="kpi-unidad">{t.vpAnios}</span></div>
                  <div className="ingreso-lbl">{t.vpAntiguedadMedia}</div>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={170}>
                <BarChart data={ingreso.decadas} margin={{ left: 0, right: 8, top: 12 }}>
                  <XAxis dataKey="decada" tick={{ fontSize: 11 }} />
                  <YAxis hide domain={[0, dataMax => dataMax + 4]} />
                  <Tooltip formatter={v => [`${fmt(v, 1)} ${t.vpAnios}`, t.vpEdadIngreso]} />
                  <Bar dataKey="edadIngreso" fill={COLORS.acento} radius={[3, 3, 0, 0]}>
                    <LabelList dataKey="edadIngreso" position="top" style={{ fontSize: 10, fill: COLORS.gris }} formatter={v => fmt(v, 1)} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <p className="panel-nota">{t.vpIngresoSub}</p>
            </div>

          </div>
        </div>
      </div>

      {/* Impacto apostólico: en construcción. El IIA se retiró de la Vista General
          porque la cobertura de beneficiarios en el Sheet es insuficiente (~3% de
          obras); se cuantificará en la vista Presencia Apostólica (Fase 3). */}
      <div className="franja-construccion">
        <span className="fc-badge" aria-hidden="true">
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7.5v4.7l3 1.8" />
          </svg>
        </span>
        <div className="fc-texto">
          <span className="fc-titulo">{t.vpImpactoTitulo}</span>
          <span className="fc-sub">{t.vpImpactoSub}</span>
        </div>
      </div>

      {/* Composición por provincia: barras apiladas por estado canónico */}
      {comparativa && (
        <div className="panel">
          <h3>{t.vpComposicion}</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={comparativa} margin={{ left: 0, right: 8 }}>
              <XAxis dataKey="provincia" tick={{ fontSize: 10 }} interval={0} angle={-35} textAnchor="end" height={60} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip content={<TooltipComposicion t={t} />} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="porEstado.P"  name={t.vpColSacerdotes} stackId="a" fill={ESTADO_COLORS.P} />
              <Bar dataKey="porEstado.S"  name={t.vpColEscolares}  stackId="a" fill={ESTADO_COLORS.S} />
              <Bar dataKey="porEstado.F"  name={t.vpColHermanos}   stackId="a" fill={ESTADO_COLORS.F} />
              <Bar dataKey="porEstado.NS" name={t.vpColNovicios}   stackId="a" fill={ESTADO_COLORS.NS} />
              <Bar dataKey="porEstado.O"  name={t.vpColObispos}    stackId="a" fill={ESTADO_COLORS.O} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Cantidad de jesuitas por provincia (disposición de la versión 2.0) */}
      {comparativa && (
        <div className="panel">
          <h3>{t.vpComparativa}</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t.vpColProvincia}</th>
                  <th className="num">{t.vpColSacerdotes}</th>
                  <th className="num">{t.vpColEscolares}</th>
                  <th className="num">{t.vpColHermanos}</th>
                  <th className="num">{t.vpColNovicios}</th>
                  <th className="num">{t.vpColObispos}</th>
                  <th className="num col-total">{t.vpColTotal}</th>
                  <th className="num col-votos">{t.vpColConVotos}</th>
                  <th className="num">{t.vpColPctCpalsj}</th>
                  <th className="num">{t.vpColEdadProm}</th>
                </tr>
              </thead>
              <tbody>
                {comparativa.map(c => (
                  <tr key={c.provincia}>
                    <td>{c.provincia}</td>
                    <td className="num">{fmt(c.porEstado.P)}</td>
                    <td className="num">{fmt(c.porEstado.S)}</td>
                    <td className="num">{fmt(c.porEstado.F)}</td>
                    <td className="num">{fmt(c.porEstado.NS)}</td>
                    <td className="num">{fmt(c.porEstado.O)}</td>
                    <td className="num col-total"><strong>{fmt(c.total)}</strong></td>
                    <td className="num col-votos">{fmt(c.conVotos)}</td>
                    <td className="num">{fmt(c.total / stats.total * 100, 1)}%</td>
                    <td className="num">{fmt(c.edadMedia, 1)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td>{t.vpTotalCpalsj}</td>
                  <td className="num">{fmt(stats.porEstado.P)}</td>
                  <td className="num">{fmt(stats.porEstado.S)}</td>
                  <td className="num">{fmt(stats.porEstado.F)}</td>
                  <td className="num">{fmt(stats.porEstado.NS)}</td>
                  <td className="num">{fmt(stats.porEstado.O)}</td>
                  <td className="num col-total">{fmt(stats.total)}</td>
                  <td className="num col-votos">{fmt(stats.conVotos)}</td>
                  <td className="num">100%</td>
                  <td className="num">{fmt(stats.edadMedia, 1)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Jesuitas por país (columna MAPA): en construcción. Un jesuita pertenece
          a una provincia, y algunas provincias agrupan más de un país; el dato de
          país aún está incompleto en el Sheet, por eso no se cuantifica todavía. */}
      <div className="panel">
        <h3>{t.vpPaisTitulo}</h3>
        <div className="panel-construccion">
          <span className="fc-badge" aria-hidden="true">
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7.5v4.7l3 1.8" />
            </svg>
          </span>
          <span className="fc-sub">{t.vpEnConstruccion}</span>
        </div>
      </div>
    </div>
  );
}
