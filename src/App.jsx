import { useState } from 'react';
import { AppStateProvider, useAppState } from './state/AppStateContext.jsx';
import { useSheetData } from './hooks/useSheetData.js';
import { TEXTS } from './i18n.js';
import Login from './components/Login.jsx';
import Header from './components/Header.jsx';
import VistaPresente from './components/VistaPresente.jsx';

const TABS = [
  { id: 'presente',   labelKey: 'tabPresente' },
  { id: 'obras',      labelKey: 'tabObras' },
  { id: 'proyeccion', labelKey: 'tabProyeccion' },
];

function Dashboard() {
  const { idioma } = useAppState();
  const t = TEXTS[idioma];
  const { data, loading, error, reintentar } = useSheetData();
  const [tab, setTab] = useState('presente');

  return (
    <div className="app">
      <Header t={t} />

      <nav className="tabs">
        {TABS.map(tb => (
          <button
            key={tb.id}
            className={tab === tb.id ? 'tab active' : 'tab'}
            onClick={() => setTab(tb.id)}
          >
            {t[tb.labelKey]}
          </button>
        ))}
      </nav>

      <main className="content">
        {loading && (
          <div className="status-block">
            <div className="spinner" />
            <p>{t.cargando}</p>
          </div>
        )}

        {error && !loading && (
          <div className="status-block error">
            <p><strong>{t.errorCarga}</strong></p>
            <p className="error-detail">{error}</p>
            <button onClick={reintentar}>{t.reintentar}</button>
          </div>
        )}

        {data && !loading && !error && (
          tab === 'presente' ? (
            <VistaPresente t={t} data={data} />
          ) : (
            <div className="placeholder">
              <h2>{t[TABS.find(tb => tb.id === tab).labelKey]}</h2>
              <p>{t.proximamente}</p>
            </div>
          )
        )}
      </main>

      <footer className="app-footer">{t.nota}</footer>
    </div>
  );
}

export default function App() {
  const [autenticado, setAutenticado] = useState(
    () => !!sessionStorage.getItem('cpalsj_session')
  );
  const [idiomaLogin, setIdiomaLogin] = useState('es');

  if (!autenticado) {
    return (
      <>
        <Login t={TEXTS[idiomaLogin]} onAccess={() => setAutenticado(true)} />
        <div className="login-lang">
          <button onClick={() => setIdiomaLogin(idiomaLogin === 'es' ? 'pt' : 'es')}>
            {idiomaLogin === 'es' ? 'PT' : 'ES'}
          </button>
        </div>
      </>
    );
  }

  return (
    <AppStateProvider>
      <Dashboard />
    </AppStateProvider>
  );
}
