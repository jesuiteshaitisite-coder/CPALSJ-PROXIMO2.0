import { useAppState } from '../state/AppStateContext.jsx';
import { PROVINCIAS } from '../config.js';

export default function Header({ t }) {
  const {
    alcance, setAlcance,
    provincia, setProvincia,
    haitiActivo, setHaitiActivo,
    idioma, setIdioma,
  } = useAppState();

  function onAlcanceChange(e) {
    const v = e.target.value;
    if (v === 'cpalsj') {
      setAlcance('cpalsj');
    } else {
      setAlcance('provincia');
      setProvincia(v);
    }
  }

  return (
    <>
      <header className="app-header">
        <div className="header-brand">
          <span className="header-title">{t.titulo}</span>
        </div>

        <div className="header-controls">
          <label className="control">
            <span className="control-label">{t.alcance}</span>
            <select value={alcance === 'cpalsj' ? 'cpalsj' : provincia} onChange={onAlcanceChange}>
              <option value="cpalsj">{t.cpalsjCompleta}</option>
              {PROVINCIAS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>

          <label className="control toggle">
            <input
              type="checkbox"
              checked={haitiActivo}
              onChange={e => setHaitiActivo(e.target.checked)}
            />
            <span className="control-label">{t.incluirHaiti}</span>
          </label>

          <div className="lang-toggle" role="group" aria-label="Idioma">
            <button
              className={idioma === 'es' ? 'active' : ''}
              onClick={() => setIdioma('es')}
            >ES</button>
            <button
              className={idioma === 'pt' ? 'active' : ''}
              onClick={() => setIdioma('pt')}
            >PT</button>
          </div>

          <button className="btn-pdf" title={t.exportarPDF} disabled>
            ⬇ PDF
          </button>
        </div>
      </header>

      {haitiActivo && (
        <div className="haiti-banner" role="alert">
          ⚠ {t.bannerHaiti}
        </div>
      )}
    </>
  );
}
