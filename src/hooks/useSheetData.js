import { useCallback, useEffect, useState } from 'react';
import { loadAllData, limpiarCache } from '../services/sheetsService.js';

export function useSheetData() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const cargar = useCallback(() => {
    setLoading(true);
    setError(null);
    loadAllData()
      .then(setData)
      .catch(e => setError(e.message || String(e)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const reintentar = useCallback(() => {
    limpiarCache();
    cargar();
  }, [cargar]);

  return { data, loading, error, reintentar };
}
