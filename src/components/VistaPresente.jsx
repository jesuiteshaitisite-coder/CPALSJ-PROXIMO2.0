import { useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LabelList,
} from 'recharts';
import { useAppState } from '../state/AppStateContext.jsx';
import {
  provinciasDelAlcance, filtrarPersonas, filtrarObras,
  statsDemograficas, piramideEdad, comparativaProvincias, calcularIIA,
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

export default function VistaPresente({ t, data }) {
  const appState = useAppState();
  const { alcance, provincia, haitiActivo } = appState;

  const calc = useMemo(() => {
    const provs = provinciasDelAlcance(appState);
    const personas = filtrarPersonas(data.sheets, provs);
    const obras = filtrarObras(data.sheets, provs);
    return {
      provs,
      stats: statsDemograficas(personas),
      piramide: piramideEdad(personas),
      iia: calcularIIA(obras),
      comparativa: alcance === 'cpalsj' ? comparativaProvincias(data.sheets, provs) : null,
    };
  }, [data, alcance, provincia, haitiActivo]); // eslint-disable-line react-hooks/exhaustive-deps

  const { stats, piramide, iia, comparativa } = calc;

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
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={estadoData} dataKey="value" nameKey="name"
                cx="50%" cy="50%" innerRadius={55} outerRadius={95}
                paddingAngle={2}
              >
                {estadoData.map(d => <Cell key={d.key} fill={ESTADO_COLORS[d.key]} />)}
              </Pie>
              <Tooltip formatter={v => [fmt(v), '']} separator="" />
              <Legend wrapperStyle={{ fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* IIA */}
      <div className="panel iia-panel">
        <h3>{t.vpIIATitulo}</h3>
        {iia.iia !== null ? (
          <>
            <div className="iia-valor">
              {fmt(iia.iia, 0)} <span className="kpi-unidad">{t.vpBeneficiarios}</span>
            </div>
            <p className="iia-detalle">{t.vpIIADetalle(iia.benef, iia.asignados)}</p>
          </>
        ) : (
          <p className="iia-detalle">{t.vpIIASinDatos}</p>
        )}
        <div className="nota-limitacion">⚠ {t.vpIIANota}</div>
        <p className="panel-nota">{t.vpIIACobertura(iia.obrasConBenef, iia.obrasConPresencia, iia.obrasTotal)}</p>
      </div>

      {/* Comparativa por provincia (solo alcance CPALSJ) */}
      {comparativa && (
        <div className="panel">
          <h3>{t.vpComparativa}</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={comparativa} margin={{ left: 0, right: 8 }}>
              <XAxis dataKey="provincia" tick={{ fontSize: 10 }} interval={0} angle={-35} textAnchor="end" height={60} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={v => [fmt(v), '']} separator="" />
              <Bar dataKey="total" fill={COLORS.azul} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t.vpColProvincia}</th>
                  <th className="num">{t.vpColTotal}</th>
                  <th className="num">{t.vpColEdadMedia}</th>
                  <th className="num">{t.vpColMayores70}</th>
                  <th className="num">{t.vpColActiva}</th>
                  <th className="num">P</th>
                  <th className="num">S</th>
                  <th className="num">F</th>
                  <th className="num">NS</th>
                </tr>
              </thead>
              <tbody>
                {comparativa.map(c => (
                  <tr key={c.provincia}>
                    <td>{c.provincia}</td>
                    <td className="num"><strong>{fmt(c.total)}</strong></td>
                    <td className="num">{fmt(c.edadMedia, 1)}</td>
                    <td className="num">{fmt(c.pctMayores70, 1)}%</td>
                    <td className="num">{fmt(c.enEdadActiva)}</td>
                    <td className="num">{fmt(c.porEstado.P)}</td>
                    <td className="num">{fmt(c.porEstado.S)}</td>
                    <td className="num">{fmt(c.porEstado.F)}</td>
                    <td className="num">{fmt(c.porEstado.NS)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
