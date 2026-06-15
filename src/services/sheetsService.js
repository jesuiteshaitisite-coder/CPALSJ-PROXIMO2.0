// ─── Acceso a Google Sheets (gviz/tq) + caché de sesión + normalización ─────
// Lógica verificada en la Fase 0 contra el Sheet real.

import {
  SHEET_ID, SHEET_NAMES, OPTIONAL_SHEETS, SHEET_HEADER_OVERRIDES, CONFIG_FALLBACKS,
} from '../config.js';

let cache = null;

export function limpiarCache() {
  cache = null;
}

// ── Normalización ───────────────────────────────────────────────────────────

export function normHeader(h) {
  return (h || '')
    .replace(/\s+/g, ' ')      // colapsa espacios y saltos de línea
    .replace(/\s*_\s*/g, '_')  // "TIPO _OBRA" → "TIPO_OBRA"
    .trim();
}

export function normProv(p) {
  if (!p) return '';
  const s = String(p).trim()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // quita tildes (PERÚ → PERU, HAITÍ → HAITI)
    .toUpperCase()
    .replace(/\s+/g, ' ');
  const MAP = {
    'BRAZIL': 'BRASIL',
    'ARGENTINA URUGUAY': 'ARU',
    'CENTROAMERICA': 'CAM',
    'CENTRO AMERICA': 'CAM',
  };
  return MAP[s] || s;
}

// "1.000" → 1000; vacío o #REF! → null
export function parseNum(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!s || s === '#REF!') return null;
  const n = Number(s.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

// ── Fetcher gviz ────────────────────────────────────────────────────────────

async function fetchSheet(sheetName) {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(sheetName)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();

  const match = text.match(/google\.visualization\.Query\.setResponse\(([\s\S]*)\);?\s*$/);
  if (!match) throw new Error('Formato de respuesta inesperado');

  const parsed = JSON.parse(match[1]);
  if (parsed.status === 'error') {
    const msgs = (parsed.errors || []).map(e => e.detailed_message || e.message).join('; ');
    throw new Error(msgs || 'Error de Google Sheets');
  }

  let cols = (parsed.table?.cols || []).map(c => normHeader(c.label || c.id || ''));
  let rows = (parsed.table?.rows || []).map(r =>
    (r.c || []).map(cell => (cell && cell.v !== null && cell.v !== undefined ? String(cell.v) : ''))
  );

  // Si gviz devuelve solo etiquetas genéricas (A, B, C…), los encabezados
  // reales están en la primera fila. Una hoja real puede tener columnas
  // vacías a la derecha etiquetadas O, P, Q… sin ser genérica, por eso se
  // exige que TODAS las etiquetas no vacías sean genéricas.
  const nonEmpty = cols.filter(c => c);
  const allGeneric = nonEmpty.length === 0 || nonEmpty.every(c => /^[A-Z]{1,2}$/.test(c));
  const override = SHEET_HEADER_OVERRIDES[sheetName];
  if (override && allGeneric) {
    if (rows.length > 0 && normHeader(rows[0][0]).toUpperCase() === normHeader(override[0]).toUpperCase()) {
      rows = rows.slice(1);
    }
    cols = cols.map((c, i) => (override[i] ? normHeader(override[i]) : ''));
  } else if (rows.length > 0 && allGeneric && nonEmpty.length > 0) {
    cols = rows[0].map(v => normHeader(v));
    rows = rows.slice(1);
  }

  if (cols.length === 0 || rows.length === 0) return { headers: cols, rows: [] };

  const objects = rows.map(r => {
    const obj = {};
    cols.forEach((h, i) => { if (h) obj[h] = r[i] || ''; });
    return obj;
  });

  return { headers: cols, rows: objects };
}

// ── Carga completa ──────────────────────────────────────────────────────────

export async function loadAllData() {
  if (cache) return cache;

  const results = await Promise.allSettled(
    SHEET_NAMES.map(name => fetchSheet(name).then(data => ({ name, data })))
  );

  const sheets = {};
  const warnings = [];

  results.forEach((r, i) => {
    const name = SHEET_NAMES[i];
    if (r.status === 'fulfilled') {
      sheets[name] = r.value.data;
    } else {
      sheets[name] = { headers: [], rows: [] };
      if (!OPTIONAL_SHEETS.has(name)) {
        warnings.push(`Hoja "${name}" no se pudo cargar: ${r.reason?.message || r.reason}`);
      }
    }
  });

  // gviz devuelve la PRIMERA hoja (PARAMETROS) si se pide una inexistente:
  // detectar ese fallback comparando headers.
  const paramHeaders = JSON.stringify(sheets['PARAMETROS']?.headers || []);
  for (const name of SHEET_NAMES) {
    if (name === 'PARAMETROS') continue;
    if (JSON.stringify(sheets[name].headers) === paramHeaders) {
      sheets[name] = { headers: [], rows: [] };
      if (!OPTIONAL_SHEETS.has(name)) {
        warnings.push(`La hoja "${name}" no existe en el Sheet.`);
      }
    }
  }

  if (!sheets['PERSONAS'].rows.length || !sheets['OBRAS'].rows.length) {
    throw new Error('No se pudieron cargar las hojas esenciales (PERSONAS / OBRAS). Revisa la conexión y vuelve a intentar.');
  }

  // Parámetros globales con fallbacks
  const params = { ...CONFIG_FALLBACKS };
  for (const row of sheets['PARAMETROS'].rows) {
    const clave = (row['CLAVE'] || '').trim();
    if (!clave) continue;
    const n = parseNum(row['VALOR']);
    if (n !== null) params[clave] = n;
  }

  // Perseverancia POR PROVINCIA (hoja dedicada PERSEVERANCIA_PROVINCIA).
  // Tolerante: si la hoja falta o una celda viene vacía / no numérica / fuera de
  // 1–10, esa provincia NO entra al mapa y caerá al fallback global en el motor.
  // Las claves se normalizan con normProv (unifica PERÚ/PERU, tildes, mayúsculas)
  // para que el cruce con PERSONAS/OBRAS no falle por una tilde.
  const persevPorProvincia = {};
  const hojaPersev = sheets['PERSEVERANCIA_PROVINCIA'];
  if (hojaPersev && hojaPersev.rows) {
    for (const row of hojaPersev.rows) {
      const prov = normProv(row['PROVINCIA']);
      if (!prov) continue;
      const n = parseNum(row['PERSEVERANCIA_DE_CADA_10']);
      if (n !== null && n >= 1 && n <= 10) persevPorProvincia[prov] = n;
    }
  }
  params.persevPorProvincia = persevPorProvincia;

  cache = { sheets, params, persevPorProvincia, warnings, cargadoEn: new Date() };
  return cache;
}
