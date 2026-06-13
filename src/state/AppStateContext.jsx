import { createContext, useContext, useMemo, useState } from 'react';
import { PROVINCIAS, HAITI, CONFIG_FALLBACKS } from '../config.js';

const AppStateContext = createContext(null);

export function AppStateProvider({ children, params }) {
  const [alcance, setAlcance] = useState('cpalsj');        // 'cpalsj' | 'provincia'
  const [provincia, setProvincia] = useState('CHILE');
  const [haitiActivo, setHaitiActivo] = useState(false);
  const [idioma, setIdioma] = useState('es');              // 'es' | 'pt'

  const p = params || CONFIG_FALLBACKS;
  const [escenario, setEscenario] = useState({
    fai: p.FAI ?? 2,
    ingresosAnuales: p.INGRESOS_ANUALES_BASE ?? 0,
    perseveranciaDe10: p.PERSEVERANCIA_DE_CADA_10 ?? 6,
    cerrarA: 0,
    pctBtoC: 0,
    extraPool: 0,
    añoDesde: 2030,
    tasaRep: 0,
  });

  const value = useMemo(() => {
    const provinciasActivas = haitiActivo ? [...PROVINCIAS, HAITI] : [...PROVINCIAS];
    return {
      alcance, setAlcance,
      provincia, setProvincia,
      haitiActivo, setHaitiActivo,
      idioma, setIdioma,
      escenario, setEscenario,
      provinciaEfectiva: alcance === 'cpalsj' ? 'CPAL' : provincia,
      provinciasActivas,
      params: p,
    };
  }, [alcance, provincia, haitiActivo, idioma, escenario, p]);

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState() {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error('useAppState debe usarse dentro de <AppStateProvider>');
  return ctx;
}
