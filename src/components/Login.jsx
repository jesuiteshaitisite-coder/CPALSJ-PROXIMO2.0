import { useState } from 'react';
import { ACCESS_KEY_HASH } from '../config.js';

async function sha256hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export default function Login({ t, onAccess }) {
  const [clave, setClave] = useState('');
  const [error, setError] = useState(false);
  const [checking, setChecking] = useState(false);
  const [mostrar, setMostrar] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!clave || checking) return;
    setChecking(true);
    const hash = await sha256hex(clave);
    if (hash === ACCESS_KEY_HASH) {
      sessionStorage.setItem('cpalsj_session', hash);
      onAccess();
    } else {
      setError(true);
      setChecking(false);
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <div className="login-logo">CPALSJ <span>PRÓXIMO</span></div>
        <h1>{t.accesoTitulo}</h1>
        <p>{t.accesoTexto}</p>
        <div className="login-pass">
          <input
            type={mostrar ? 'text' : 'password'}
            placeholder={t.accesoPlaceholder}
            value={clave}
            autoFocus
            onChange={e => { setClave(e.target.value); setError(false); }}
          />
          <button
            type="button"
            className="login-pass-toggle"
            onClick={() => setMostrar(m => !m)}
            aria-label={mostrar ? t.accesoOcultar : t.accesoMostrar}
            title={mostrar ? t.accesoOcultar : t.accesoMostrar}
          >
            {mostrar ? '🙈' : '👁'}
          </button>
        </div>
        {error && <div className="login-error">{t.accesoError}</div>}
        <button type="submit" disabled={!clave || checking}>{t.accesoBoton}</button>
      </form>
    </div>
  );
}
