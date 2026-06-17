import { useRef, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer,
} from 'recharts';
import { COLORS } from '../utils/colors.js';

// El Informe se RENDERIZA SOLO desde el objeto `informe` (datos ≠ presentación).
// Visual robusto para html2canvas: todo HTML/CSS salvo la curva (Recharts), que
// lleva tabla de respaldo y captura validada por dimensiones (fallback por sección).

function fmt(n) {
  if (n === null || n === undefined) return '—';
  return Math.round(n).toLocaleString('es-CL');
}
// Desenvuelve una cifra glosada { valor, definicion } o devuelve el valor crudo.
const val = x => (x && typeof x === 'object' && 'valor' in x ? x.valor : x);
const def = x => (x && typeof x === 'object' && 'definicion' in x ? x.definicion : null);

const SEM_COLOR = { verde: 'var(--ok)', amarillo: 'var(--warn)', rojo: 'var(--alert)' };
const SEM_SIMB  = { verde: '✓', amarillo: '⚠', rojo: '✗' };
const colorPuntaje = s => `hsl(${Math.max(0, Math.min(100, s ?? 0)) / 100 * 125}, 62%, 42%)`;

const QUAD_KEYS = ['prioritario', 'planificable', 'vocacion', 'estable'];

const PDF_GAP = 12; // separación vertical entre secciones empaquetadas (pt)

// Trocea una sección MÁS ALTA que una página en cortes A4 sucesivos. Devuelve la
// y final (tras el último corte) para que la siguiente sección pueda continuar.
function addCanvasSliced(doc, canvas, margin, usableW, pageH, ratio) {
  const pageContentH = pageH - margin * 2;
  const sliceHpx = Math.max(1, Math.floor(pageContentH / ratio));
  let sy = 0, first = true, endY = margin;
  while (sy < canvas.height) {
    const hpx = Math.min(sliceHpx, canvas.height - sy);
    const tmp = document.createElement('canvas');
    tmp.width = canvas.width; tmp.height = hpx;
    const ctx = tmp.getContext('2d');
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, tmp.width, tmp.height);
    ctx.drawImage(canvas, 0, sy, canvas.width, hpx, 0, 0, canvas.width, hpx);
    if (!first) doc.addPage();
    // JPEG (no PNG): el fondo es blanco opaco, así el PDF pesa ~20× menos.
    doc.addImage(tmp.toDataURL('image/jpeg', 0.92), 'JPEG', margin, margin, usableW, hpx * ratio);
    endY = margin + hpx * ratio + PDF_GAP;
    sy += hpx; first = false;
  }
  return endY;
}

export default function Informe({ informe, t, onVolver }) {
  const docRef = useRef(null);
  const [progreso, setProgreso] = useState(null);
  const m = informe.meta, r = informe.resumen, d = informe.demografia, o = informe.obras;

  const piramideMax = Math.max(1, ...d.piramide.map(p => p.n));
  const fuerzaMax = Math.max(1, ...Object.values(d.fuerza));
  const obrasMax = Math.max(1, o.porTipo.A, o.porTipo.B, o.porTipo.C);
  const heat = informe.sostenibilidad.heatmap;
  const aniosHeat = Object.keys(heat.promedio).map(Number);
  const riesgo = informe.sostenibilidad.riesgo;
  const ee = informe.escenarioExplorado;

  const nombreBase = `Informe-CPALSJ-${m.scopeFile}-${m.fecha}`;

  const descargarJSON = () => {
    const blob = new Blob([JSON.stringify(informe, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${nombreBase}.json`; a.click();
    URL.revokeObjectURL(url);
  };

  const descargarPDF = async () => {
    const jsPDFns = window.jspdf, h2c = window.html2canvas;
    if (!jsPDFns || !h2c) { console.error('[CPALSJ] jsPDF/html2canvas no cargados'); return; }
    const { jsPDF } = jsPDFns;
    setProgreso(10);
    try {
      const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait' });
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      const margin = 26, usableW = pageW - margin * 2;

      // Fallback por sección: probar cada gráfico; si la captura sale con
      // dimensiones irrazonables, conmutar esa sección a su tabla de respaldo.
      const swapped = [];
      for (const box of docRef.current.querySelectorAll('[data-chart]')) {
        try {
          const probe = await h2c(box, { scale: 1, backgroundColor: '#ffffff', logging: false });
          if (probe.width < 40 || probe.height < 40) throw new Error('dim');
        } catch {
          const sec = box.closest('[data-sec]');
          if (sec) { sec.classList.add('inf-fallback-on'); swapped.push(sec); }
        }
      }
      setProgreso(25);

      // Flujo COMPACTO: empaqueta varias secciones por página y solo abre página
      // nueva cuando la siguiente no cabe (o trocea las que superan una página).
      // La portada (i=0) va sola; el cuerpo empieza en página nueva tras ella.
      const secs = [...docRef.current.querySelectorAll('[data-sec]')];
      const pageContentH = pageH - margin * 2;
      let y = margin;
      for (let i = 0; i < secs.length; i++) {
        const canvas = await h2c(secs[i], { scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false });
        const ratio = usableW / canvas.width;
        const imgH = canvas.height * ratio;
        if (i === 1) { doc.addPage(); y = margin; } // cuerpo en página nueva tras la portada
        if (imgH <= pageContentH) {
          if (i > 0 && y + imgH > pageH - margin) { doc.addPage(); y = margin; }
          doc.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', margin, y, usableW, imgH);
          y += imgH + PDF_GAP;
        } else {
          if (y > margin) { doc.addPage(); y = margin; } // secciones altas empiezan limpias
          y = addCanvasSliced(doc, canvas, margin, usableW, pageH, ratio);
        }
        setProgreso(25 + Math.round(((i + 1) / secs.length) * 65));
      }

      swapped.forEach(s => s.classList.remove('inf-fallback-on'));
      setProgreso(95);
      doc.save(`${nombreBase}.pdf`);
      setProgreso(100);
    } catch (e) {
      console.error('[CPALSJ] Error generando PDF:', e);
    } finally {
      setTimeout(() => setProgreso(null), 900);
    }
  };

  return (
    <div className="informe-wrap">
      {/* Toolbar fija (no se imprime ni entra al PDF) */}
      <div className="informe-toolbar no-print">
        <button onClick={onVolver}>← {t.infVolver}</button>
        <span className="inf-tb-spacer" />
        <button onClick={() => window.print()}>🖨 {t.infImprimir}</button>
        <button onClick={descargarJSON}>⬇ {t.infJSON}</button>
        <button className="inf-tb-primary" onClick={descargarPDF} disabled={progreso !== null}>
          {progreso !== null ? `${t.infGenerando} ${progreso}%` : `⬇ ${t.infPDF}`}
        </button>
        {progreso !== null && (
          <span className="inf-prog"><span className="inf-prog-bar" style={{ width: `${progreso}%` }} /></span>
        )}
      </div>

      <div className="informe-doc" ref={docRef}>

        {/* ── Portada ── */}
        <section data-sec className="inf-sec inf-portada">
          <div className="inf-marca">CPALSJ PRÓXIMO</div>
          <h1 className="inf-h1">{t.infTitulo}</h1>
          <p className="inf-sub">{t.infSubtitulo}</p>
          <div className="inf-portada-scope">
            <span className="inf-portada-lbl">{t.infAlcanceLbl}</span>
            <span className="inf-portada-val">{m.scopeLabel}</span>
          </div>
          <p className="inf-portada-fecha">{t.infGeneradoEl(m.fecha)}</p>
          <p className="inf-confidencial">{t.infConfidencial}</p>
          <p className="inf-portada-ancla">{t.infAnclaNota}</p>
        </section>

        {/* ── §1 Resumen ejecutivo ── */}
        <section data-sec className="inf-sec">
          <h2 className="inf-h2">{t.infS1}</h2>
          <div className="inf-kpis">
            <Kpi label={t.infKActivos} value={fmt(val(r.activosHoy))} note={def(r.activosHoy)} />
            <Kpi label={t.infKObrasA} value={fmt(r.demandaA)} />
            <Kpi label={t.infKDeficit} value={`${fmt(val(r.primerDeficitA))} · ${r.provDeficit || '—'}`} note={def(r.primerDeficitA)} />
            <Kpi label={t.infKEquilibrio} value={`${r.equilibrioK ?? '—'}/año`} />
            <Kpi label={t.infKFuerza2080} value={fmt(r.fuerzaActiva2080)} />
          </div>
          <p className="inf-nota">{t.infAnclaNota}</p>
        </section>

        {/* ── §2 Distribución demográfica ── */}
        <section data-sec className="inf-sec">
          <h2 className="inf-h2">{t.infS2}</h2>
          <div className="inf-statline">
            <Stat label={t.infDemTotal} value={fmt(val(d.total))} note={def(d.total)} />
            <Stat label={t.infDemEdad} value={d.edadMedia ? d.edadMedia.toFixed(1) : '—'} />
            <Stat label={t.infDemMayores70} value={d.pctMayores70 != null ? `${d.pctMayores70.toFixed(0)}%` : '—'} />
            <Stat label={t.infDemActiva} value={fmt(d.enEdadActiva)} />
          </div>

          <h3 className="inf-h3">{t.infPiramide}</h3>
          <div className="inf-bars">
            {d.piramide.map(p => (
              <div className="inf-bar-row" key={p.tramo}>
                <span className="inf-bar-lbl">{p.tramo}</span>
                <span className="inf-bar-track"><span className="inf-bar-fill" style={{ width: `${(p.n / piramideMax) * 100}%` }} /></span>
                <span className="inf-bar-val">{fmt(p.n)}</span>
              </div>
            ))}
          </div>

          <div className="inf-cols2">
            <div>
              <h3 className="inf-h3">{t.infFuerzaTit}</h3>
              <div className="inf-bars">
                {Object.entries(d.fuerza).map(([k, v]) => (
                  <div className="inf-bar-row" key={k}>
                    <span className="inf-bar-lbl inf-bar-lbl-wide">{k}</span>
                    <span className="inf-bar-track"><span className="inf-bar-fill inf-bar-acc" style={{ width: `${(v / fuerzaMax) * 100}%` }} /></span>
                    <span className="inf-bar-val">{fmt(v)}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h3 className="inf-h3">{t.infEstadoTit}</h3>
              <table className="inf-table">
                <tbody>
                  {Object.entries(d.porEstado).filter(([k]) => k !== 'otros' || d.porEstado.otros > 0).map(([k, v]) => (
                    <tr key={k}><td>{k}</td><td className="num">{fmt(v)}</td></tr>
                  ))}
                </tbody>
              </table>
              <p className="inf-mini">{t.infIngresoTit}: {d.ingreso.edadIngresoMedia ? d.ingreso.edadIngresoMedia.toFixed(0) : '—'} · {d.ingreso.antiguedadMedia ? d.ingreso.antiguedadMedia.toFixed(0) : '—'}</p>
            </div>
          </div>
        </section>

        {/* ── §3 Catastro de obras ── */}
        <section data-sec className="inf-sec">
          <h2 className="inf-h2">{t.infS3}</h2>
          <h3 className="inf-h3">{t.infObrasTipo}</h3>
          <div className="inf-bars">
            {['A', 'B', 'C'].map(k => (
              <div className="inf-bar-row" key={k}>
                <span className="inf-bar-lbl">{k}</span>
                <span className="inf-bar-track"><span className="inf-bar-fill" style={{ width: `${(o.porTipo[k] / obrasMax) * 100}%` }} /></span>
                <span className="inf-bar-val">{fmt(o.porTipo[k])}</span>
              </div>
            ))}
          </div>

          <div className="inf-cols2">
            <div>
              <h3 className="inf-h3">{t.infObrasAmbito}</h3>
              <table className="inf-table">
                <tbody>
                  {o.porAmbito.slice(0, 6).map(a => (
                    <tr key={a.ambito}><td>{a.ambito}</td><td className="num">{fmt(a.n)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div>
              <h3 className="inf-h3">{t.infIIA}</h3>
              <div className="inf-iia">{o.iia.iia != null ? fmt(o.iia.iia) : '—'}</div>
              {!o.iia.coberturaDatos.fiable && (
                <p className="inf-aviso">{t.infIIANoFiable.replace('{n}', o.iia.coberturaDatos.obrasConPresenciaPoblada).replace('{t}', o.iia.coberturaDatos.totalObras)}</p>
              )}
            </div>
          </div>
        </section>

        {/* ── §4 Proyección 2026–2100 ── */}
        <section data-sec className="inf-sec">
          <h2 className="inf-h2">{t.infS4}</h2>

          <h3 className="inf-h3">{t.infCurvaTit}</h3>
          <div data-chart className="inf-chart">
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={informe.proyeccion.curva} margin={{ top: 8, right: 16, bottom: 4, left: -6 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#EEF2F6" />
                <XAxis dataKey="año" tick={{ fontSize: 11, fill: COLORS.gris }} />
                <YAxis tick={{ fontSize: 11, fill: COLORS.gris }} allowDecimals={false} />
                <Line type="monotone" dataKey="base" stroke={COLORS.azul} strokeWidth={2.4} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="inf-fallback">
            <p className="inf-mini">{t.infCurvaFallback}</p>
            <table className="inf-table inf-table-wide">
              <thead><tr>{informe.proyeccion.curva.map(f => <th key={f.año} className="num">{f.año}</th>)}</tr></thead>
              <tbody><tr>{informe.proyeccion.curva.map(f => <td key={f.año} className="num">{fmt(f.base)}</td>)}</tr></tbody>
            </table>
          </div>

          <h3 className="inf-h3">{t.infHeatTit}</h3>
          <table className="inf-table inf-heat">
            <thead>
              <tr><th>{t.pyColProvincia}</th>{aniosHeat.map(y => <th key={y} className="num">{y}</th>)}</tr>
            </thead>
            <tbody>
              {heat.filas.slice().sort((a, b) => b.personas - a.personas).map(f => (
                <tr key={f.provincia}>
                  <td>{f.provincia}</td>
                  {aniosHeat.map(y => <td key={y} className="num inf-heat-cell" style={{ background: colorPuntaje(f.puntajes[y]) }}>{Math.round(f.puntajes[y])}</td>)}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr><td>{t.pyHeatPromedio}</td>{aniosHeat.map(y => <td key={y} className="num inf-heat-cell" style={{ background: colorPuntaje(heat.promedio[y]) }}>{Math.round(heat.promedio[y])}</td>)}</tr>
            </tfoot>
          </table>

          <h3 className="inf-h3">{t.infRiesgoTit}</h3>
          <div className="inf-quads">
            {QUAD_KEYS.map(k => {
              const provs = riesgo.puntos.filter(p => p.cuadrante === k);
              return (
                <div key={k} className={'inf-quad inf-quad-' + k}>
                  <div className="inf-quad-h">{t.pyRiesgoCuad[k].t}</div>
                  <div className="inf-quad-provs">{provs.length ? provs.map(p => p.provincia).join(' · ') : '—'}</div>
                </div>
              );
            })}
          </div>
        </section>

        {/* ── §5 Pistas de decisión ── */}
        <section data-sec className="inf-sec">
          <h2 className="inf-h2">{t.infS5}</h2>
          <p className="inf-nota">{t.pyPistasSub}</p>
          <div className="inf-statline">
            <Stat label={t.pyPbFaltaA} value={fmt(val(informe.pistasBase.faltaA))} note={def(informe.pistasBase.faltaA)} />
            <Stat label={t.pyPbFaltaB} value={fmt(informe.pistasBase.faltaB)} />
            <Stat label={t.pyPbSin2050} value={fmt(informe.pistasBase.sinJesuita2050)} />
            <Stat label={t.pyPbSin2080} value={fmt(informe.pistasBase.sinJesuita2080)} />
          </div>
          <p className="inf-nota">{t.pyPistasNota}</p>
        </section>

        {/* ── §6 Metodología ── */}
        <section data-sec className="inf-sec">
          <h2 className="inf-h2">{t.infS6}</h2>
          <ul className="inf-metodo">
            {t.infMetodologia.map((p, i) => <li key={i}>{p}</li>)}
          </ul>
          <p className="inf-fuente">{t.infFuenteNota(m.fecha)}</p>
        </section>

        {/* ── Cierre ── */}
        <section data-sec className="inf-sec inf-cierre-sec">
          <h2 className="inf-h2">{t.infCierre}</h2>
          <p className="inf-cierre">{t.infCierreTexto}</p>
        </section>

        {/* ── Escenario explorado (opcional, NO diagnóstico) ── */}
        {ee && (
          <section data-sec className="inf-sec inf-escenario">
            <h2 className="inf-h2">{t.infEscTitulo}</h2>
            <p className="inf-aviso inf-aviso-block">{t.infEscAviso}</p>
            <h3 className="inf-h3">{t.infEscPalancas}</h3>
            <table className="inf-table">
              <tbody>
                {ee.palancas.map((p, i) => (
                  <tr key={i}>
                    <td>{t.infPalancaNombre[p.clave] || p.clave}</td>
                    <td className="num">{typeof p.valor === 'object' ? `${p.valor.de10 ?? ''} (${p.valor.provincia ?? ''})` : p.valor}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <h3 className="inf-h3">{t.infEscEfectos}</h3>
            <table className="inf-table">
              <tbody>
                {ee.efectos.map((f, i) => (
                  <tr key={i}>
                    <td>{f.metrica === 'faltaA' ? t.pyMdFaltaA : f.metrica === 'faltaB' ? t.pyMdFaltaB : t.pyMdSin2080}</td>
                    <td className="num">{f.kind === 'año' ? (f.de ?? t.pyMdNoFalta) : fmt(f.de)} → <strong>{f.kind === 'año' ? (f.a ?? t.pyMdNoFalta) : fmt(f.a)}</strong></td>
                    <td className={'inf-delta ' + (f.mejora ? 'is-mejor' : 'is-peor')}>{f.mejora ? '✓' : '✗'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

      </div>
    </div>
  );
}

const Kpi = ({ label, value, note }) => (
  <div className="inf-kpi">
    <div className="inf-kpi-num">{value}</div>
    <div className="inf-kpi-lbl">{label}</div>
    {note && <div className="inf-kpi-note">{note}</div>}
  </div>
);
const Stat = ({ label, value, note }) => (
  <div className="inf-stat">
    <div className="inf-stat-num">{value}</div>
    <div className="inf-stat-lbl">{label}</div>
    {note && <div className="inf-stat-note">{note}</div>}
  </div>
);
