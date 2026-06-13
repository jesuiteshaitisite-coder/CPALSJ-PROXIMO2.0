import { useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LabelList,
} from 'recharts';
import { useAppState } from '../state/AppStateContext.jsx';
import {
  provinciasDelAlcance, filtrarPersonas,
  statsDemograficas, piramideEdad, comparativaProvincias,
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
      comparativa: alcance === 'cpalsj' ? comparativaProvincias(data.sheets, provs) : null,
    };
  }, [data, alcance, provincia, haitiActivo]); // eslint-disable-line react-hooks/exhaustive-deps

  const { stats, piramide, comparativa } = calc;

  const estadoData = Object.entries(stats.porEstado)
    .filter(([, n]) => n > 0)
    .map(([k, n]) => ({ name: `${t.vpEstados[k]} (${k})`, key: k, value: n }));

  return (
    <div className="vista">

      {/* KPIs (se cuentan todas las filas del Sheet, sin filtro REGISTRO_VALIDO) */}
      <div className="kpi-row">
        <div className="kpi">
          <div className="kpi-valor">{fmt(stats.total)}</div>
          <div className="kpi-label">{t.vpTotalJesuitas}</div>
        </div>
        <div className="kpi">
          <div className="kpi-valor">{fmt(stats.edadMedia, 1)} <span className="kpi-unidad">{t.vpAnios}</span></div>
          <div className="kpi-label">{t.vpEdadMedia}</div>
        </div>
        <div className="kpi">
          <div className="kpi-valor">{fmt(stats.pctMayores70, 1)}%</div>
          <div className="kpi-label">{t.vpMayores70}</div>
        </div>
        <div className="kpi">
          <div className="kpi-valor">{fmt(stats.enEdadActiva)}</div>
          <div className="kpi-label">{t.vpEnEdadActiva}</div>
        </div>
        <div className="kpi kpi-hover">
          <div className="kpi-valor">{fmt(stats.conVotos)}</div>
          <div className="kpi-label">{t.vpKpiConVotos}</div>
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

      {/* Pirámide + Estado canónico */}
      <div className="two-cols">
        <div className="panel">
          <h3>{t.vpPiramide}</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={piramide.tramos} layout="vertical" margin={{ left: 8, right: 40 }}>
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="tramo" width={50} tick={{ fontSize: 12 }} />
              <Tooltip formatter={v => [fmt(v), '']} separator="" />
              <Bar dataKey="n" fill={COLORS.azulMedio} radius={[0, 4, 4, 0]}>
                <LabelList dataKey="n" position="right" style={{ fontSize: 11, fill: COLORS.gris }} formatter={fmt} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <p className="panel-nota">{t.vpPiramideNota}</p>
          {piramide.sinEdad > 0 && <p className="panel-nota">{t.vpPersonasSinEdad(piramide.sinEdad)}</p>}
        </div>

        <div className="panel">
          <h3>{t.vpEstadoCanonico}</h3>
          <div className="estado-layout">
            <div className="estado-chart">
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={estadoData} dataKey="value" nameKey="name"
                    cx="50%" cy="50%" innerRadius={58} outerRadius={92}
                    paddingAngle={2}
                    label={({ percent }) => (percent > 0.04 ? `${(percent * 100).toFixed(0)}%` : '')}
                    labelLine={false}
                  >
                    {estadoData.map(d => <Cell key={d.key} fill={ESTADO_COLORS[d.key]} />)}
                  </Pie>
                  <Tooltip formatter={(v, name) => [`${fmt(v)} (${fmt(v / stats.total * 100, 1)}%)`, name]} />
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
