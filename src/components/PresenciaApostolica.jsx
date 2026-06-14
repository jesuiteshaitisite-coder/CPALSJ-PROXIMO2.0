import { useState, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LabelList,
} from 'recharts';
import { useAppState } from '../state/AppStateContext.jsx';
import {
  provinciasDelAlcance, filtrarObras, filtrarResidencias,
  distribObrasPorTipo, distribObrasPorAmbito, comparativaObrasProvincias,
  TIPOS_OBRA, tipoDeObra, ambitoDeObra, provinciaDeObra, ANIO_REF,
} from '../utils/calculations.js';
import { COLORS } from '../utils/colors.js';

const TIPO_COLORS = { A: COLORS.azulMedio, B: COLORS.verdeCl, C: COLORS.acento };

function fmt(n) {
  return n === null || n === undefined ? '—' : n.toLocaleString('es-CL');
}

export default function PresenciaApostolica({ t, data }) {
  const appState = useAppState();
  const { alcance, provincia, haitiActivo } = appState;

  const [fProv, setFProv] = useState('');
  const [fAmb, setFAmb] = useState('');
  const [fTipo, setFTipo] = useState('');

  const calc = useMemo(() => {
    const provs = provinciasDelAlcance(appState);
    const obras = filtrarObras(data.sheets, provs);
    const residencias = filtrarObras ? filtrarResidencias(data.sheets, provs) : [];
    return {
      obras,
      residencias,
      porTipo: distribObrasPorTipo(obras),
      porAmbito: distribObrasPorAmbito(obras),
      comparativa: alcance === 'cpalsj' ? comparativaObrasProvincias(data.sheets, provs) : null,
    };
  }, [data, alcance, provincia, haitiActivo]); // eslint-disable-line react-hooks/exhaustive-deps

  const { obras, residencias, porTipo, porAmbito, comparativa } = calc;
  const totalComputables = obras.length;

  const tipoData = TIPOS_OBRA
    .filter(k => porTipo[k] > 0)
    .map(k => ({ key: k, name: t.paTipoCategorias[k], value: porTipo[k] }));

  const ambitosUnicos = useMemo(
    () => [...new Set(obras.map(ambitoDeObra).filter(Boolean))].sort(),
    [obras]
  );
  const provinciasUnicas = useMemo(
    () => [...new Set(obras.map(provinciaDeObra).filter(Boolean))].sort(),
    [obras]
  );

  const obrasFiltradas = useMemo(
    () => obras.filter(o =>
      (!fProv || provinciaDeObra(o) === fProv) &&
      (!fAmb || ambitoDeObra(o) === fAmb) &&
      (!fTipo || tipoDeObra(o) === fTipo)
    ),
    [obras, fProv, fAmb, fTipo]
  );

  const heroSub = alcance === 'cpalsj' ? t.paHeroSub : provincia;
  const ambitoChartH = Math.max(220, porAmbito.length * 26);

  return (
    <div className="vista">

      <div className="vista-general">

        {/* Hero panel */}
        <aside className="hero-panel">
          <div className="hero-label">{t.paHeroLabel} · {ANIO_REF}</div>
          <div className="hero-num">{fmt(totalComputables)}</div>
          <div className="hero-sublabel">{heroSub}</div>
          <div className="hero-rule" />
          <p className="hero-narrativa">{t.paNarrativa(fmt(porTipo.A), fmt(residencias.length))}</p>
          <div className="hero-ministats">
            <div className="hero-stat">
              <div className="hero-stat-num">{fmt(porTipo.A)}</div>
              <div className="hero-stat-lbl">{t.paMiniTipoA}</div>
            </div>
            <div className="hero-stat">
              <div className="hero-stat-num">{fmt(porTipo.B)}</div>
              <div className="hero-stat-lbl">{t.paMiniTipoB}</div>
            </div>
            <div className="hero-stat">
              <div className="hero-stat-num">{fmt(porTipo.C)}</div>
              <div className="hero-stat-lbl">{t.paMiniTipoC}</div>
            </div>
            <div className="hero-stat">
              <div className="hero-stat-num">{fmt(residencias.length)}</div>
              <div className="hero-stat-lbl">{t.paKpiResidencias}</div>
            </div>
          </div>
        </aside>

        {/* Columna derecha */}
        <div className="vg-derecha">

          <div className="kpi-strip" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
            <div className="kpi2 is-navy">
              <div className="kpi2-valor">{fmt(totalComputables)}</div>
              <div className="kpi2-label">{t.paKpiComputables}</div>
            </div>
            <div className="kpi2 is-navy">
              <div className="kpi2-valor">{fmt(ambitosUnicos.length)}</div>
              <div className="kpi2-label">{t.paKpiAmbitos}</div>
            </div>
            <div className="kpi2 is-muted">
              <div className="kpi2-valor">{fmt(residencias.length)}</div>
              <div className="kpi2-label">{t.paKpiResidencias}</div>
            </div>
          </div>

          <div className="vg-charts">

            {/* Distribución por tipo A/B/C */}
            <div className="panel">
              <h3>{t.paTipoTitulo}</h3>
              <div className="estado-layout">
                <div className="estado-chart">
                  <ResponsiveContainer width="100%" height={250}>
                    <PieChart>
                      <Pie
                        data={tipoData} dataKey="value" nameKey="name"
                        cx="50%" cy="50%" innerRadius={58} outerRadius={92} paddingAngle={2}
                        label={({ percent }) => (percent > 0.04 ? `${(percent * 100).toFixed(0)}%` : '')}
                        labelLine={false}
                      >
                        {tipoData.map(d => <Cell key={d.key} fill={TIPO_COLORS[d.key]} />)}
                      </Pie>
                      <Tooltip formatter={(v, name) => [`${fmt(v)} (${(v / totalComputables * 100).toFixed(1)}%)`, name]} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="estado-centro">
                    <div className="estado-centro-num">{fmt(totalComputables)}</div>
                    <div className="estado-centro-label">{t.paUnidadObras}</div>
                  </div>
                </div>
                <ul className="estado-lista">
                  {tipoData.map(d => (
                    <li key={d.key}>
                      <span className="dot" style={{ background: TIPO_COLORS[d.key] }} />
                      <span className="estado-nombre">{d.name}</span>
                      <span className="estado-cifra">
                        <strong>{fmt(d.value)}</strong> · {(d.value / totalComputables * 100).toFixed(1)}%
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Distribución por ámbito */}
            <div className="panel">
              <h3>{t.paAmbitoTitulo}</h3>
              <ResponsiveContainer width="100%" height={ambitoChartH}>
                <BarChart data={porAmbito} layout="vertical" margin={{ left: 8, right: 36 }}>
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="ambito" width={150} tick={{ fontSize: 10 }} interval={0} />
                  <Tooltip formatter={v => [fmt(v), t.paUnidadObras]} separator=": " />
                  <Bar dataKey="n" fill={COLORS.azulMedio} radius={[0, 3, 3, 0]}>
                    <LabelList dataKey="n" position="right" style={{ fontSize: 10, fill: COLORS.gris }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Obras por provincia (solo CPALSJ) */}
            {comparativa && (
              <div className="panel">
                <h3>{t.paProvinciaTitulo}</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={comparativa} margin={{ left: 0, right: 8 }}>
                    <XAxis dataKey="provincia" tick={{ fontSize: 10 }} interval={0} angle={-35} textAnchor="end" height={60} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip formatter={v => [fmt(v), t.paUnidadObras]} separator=": " />
                    <Bar dataKey="total" fill={COLORS.azulMedio} radius={[3, 3, 0, 0]}>
                      <LabelList dataKey="total" position="top" style={{ fontSize: 10, fill: COLORS.gris }} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Tipo de obra por provincia (apiladas, solo CPALSJ) */}
            {comparativa && (
              <div className="panel">
                <h3>{t.paComposicionTitulo}</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={comparativa} margin={{ left: 0, right: 8 }}>
                    <XAxis dataKey="provincia" tick={{ fontSize: 10 }} interval={0} angle={-35} textAnchor="end" height={60} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v, name) => [fmt(v), name]} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="A" name={t.paMiniTipoA} stackId="a" fill={TIPO_COLORS.A} />
                    <Bar dataKey="B" name={t.paMiniTipoB} stackId="a" fill={TIPO_COLORS.B} />
                    <Bar dataKey="C" name={t.paMiniTipoC} stackId="a" fill={TIPO_COLORS.C} radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

          </div>
        </div>
      </div>

      {/* Detalle de obras (tabla filtrable) */}
      <div className="panel">
        <h3>{t.paTablaTitulo}</h3>
        <div className="filtros">
          {alcance === 'cpalsj' && (
            <select value={fProv} onChange={e => setFProv(e.target.value)}>
              <option value="">{t.paFiltroProvincia}: {t.paFiltroTodas}</option>
              {provinciasUnicas.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          )}
          <select value={fAmb} onChange={e => setFAmb(e.target.value)}>
            <option value="">{t.paFiltroAmbito}: {t.paFiltroTodos}</option>
            {ambitosUnicos.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <select value={fTipo} onChange={e => setFTipo(e.target.value)}>
            <option value="">{t.paFiltroTipo}: {t.paFiltroTodos}</option>
            {TIPOS_OBRA.map(k => <option key={k} value={k}>{t.paTipoCategorias[k]}</option>)}
          </select>
          <span className="filtros-cuenta">{t.paTablaCuenta(obrasFiltradas.length)}</span>
        </div>
        <div className="table-wrap table-scroll">
          <table>
            <thead>
              <tr>
                <th>{t.paColNombre}</th>
                <th>{t.vpColProvincia}</th>
                <th>{t.paColPais}</th>
                <th>{t.paColAmbito}</th>
                <th className="num">{t.paColTipo}</th>
                <th className="num">{t.paColPresencia}</th>
              </tr>
            </thead>
            <tbody>
              {obrasFiltradas.map((o, i) => (
                <tr key={i}>
                  <td>{o['NOMBRE_OBRA'] || '—'}</td>
                  <td>{provinciaDeObra(o)}</td>
                  <td>{o['PAIS'] || '—'}</td>
                  <td>{ambitoDeObra(o) || '—'}</td>
                  <td className="num">{tipoDeObra(o) || '—'}</td>
                  <td className="num">{o['PRESENCIA ACTUAL DE SJS'] || '—'}</td>
                </tr>
              ))}
              {obrasFiltradas.length === 0 && (
                <tr><td colSpan={6} className="tabla-vacia">{t.paTablaVacia}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Residencias y comunidades: informativo, no computan como obra */}
      <div className="panel">
        <h3>{t.paResidenciasTitulo}</h3>
        <p className="panel-sub">{t.paResidenciasNota(residencias.length)}</p>
        <div className="table-wrap table-scroll">
          <table>
            <thead>
              <tr>
                <th>{t.paColNombre}</th>
                <th>{t.vpColProvincia}</th>
                <th>{t.paColPais}</th>
                <th>{t.paColLugar}</th>
                <th className="num">{t.paColPresencia}</th>
              </tr>
            </thead>
            <tbody>
              {residencias.map((o, i) => (
                <tr key={i}>
                  <td>{o['NOMBRE_OBRA'] || '—'}</td>
                  <td>{provinciaDeObra(o)}</td>
                  <td>{o['PAIS'] || '—'}</td>
                  <td>{o['LUGAR'] || '—'}</td>
                  <td className="num">{o['PRESENCIA ACTUAL DE SJS'] || '—'}</td>
                </tr>
              ))}
              {residencias.length === 0 && (
                <tr><td colSpan={5} className="tabla-vacia">{t.paTablaVacia}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
