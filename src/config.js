// ─── Configuración global de CPALSJ PRÓXIMO ────────────────────────────────

export const SHEET_ID = '1uXVE25b8VDQIQ4HKCRpEC3kauwJElGvRWrrWm3fzoBs';

// Lectura vía endpoint público gviz/tq (la hoja es "cualquiera con el enlace
// puede ver"); no requiere API key. Si más adelante se prefiere la API v4,
// poner aquí la key y cambiar el fetcher en sheetsService.
export const API_KEY = null;

// SHA-256 de la clave de sesión compartida (provisional: "CPALSJ2026").
// Para cambiarla: ejecutar en la consola del navegador
//   crypto.subtle.digest('SHA-256', new TextEncoder().encode('NUEVA_CLAVE'))
//     .then(b => console.log([...new Uint8Array(b)].map(x => x.toString(16).padStart(2,'0')).join('')))
export const ACCESS_KEY_HASH =
  'eb6682433afd121660200086b5bc019e9e4a61deec98a83a910e0ef9d8c256dc';

// Hojas del Sheet real (la hoja de parámetros se llama PARAMETROS, la spec la llama CONFIG)
export const SHEET_NAMES = [
  'PARAMETROS',
  'PERSONAS',
  'OBRAS',
  'RESUMEN_PAIS',
  'TS_SIN_REP',
  'REPOSICIÓN',
  'ESCENARIOS',
  'VISTA_OBRAS_POR_TIPO',
  'OBRAS_IMPRESCINDIBLES_PROVINCIA',
  'SOLIDARIDAD',
  'MADUREZ_OBRAS',
];

export const OPTIONAL_SHEETS = new Set([
  'SOLIDARIDAD',
  'MADUREZ_OBRAS',
  'OBRAS_IMPRESCINDIBLES_PROVINCIA',
]);

// Hojas cuyos encabezados de fila 1 se pierden en gviz (columnas tipadas como
// número anulan el texto del header). Estructura confirmada por el usuario.
export const SHEET_HEADER_OVERRIDES = {
  ESCENARIOS: ['PROVINCIA', 'AÑO', 'TOTAL HOY < 85', 'TOTAL SIN REPOSICIÓN'],
};

// Las 12 provincias oficiales de la Conferencia
export const PROVINCIAS = [
  'CHILE', 'ARU', 'BRASIL', 'COLOMBIA', 'MEXICO', 'CAM',
  'CARIBE', 'PERU', 'VENEZUELA', 'ECUADOR', 'BOLIVIA', 'PARAGUAY',
];

// Haití: provincia latente, incluible solo mediante toggle
export const HAITI = 'HAITI';

// Horizonte temporal estándar de las proyecciones
export const HORIZONTES = [2030, 2035, 2040, 2045, 2050, 2055, 2060, 2070, 2080, 2090, 2100];

// Fallbacks de PARAMETROS si la hoja no trae el valor
export const CONFIG_FALLBACKS = {
  EDAD_SALIDA: 85,
  EDAD_FIN_DIRECCION_A: 70,
  PERSEVERANCIA_DE_CADA_10: 6,
  FAI: 2,
  INGRESOS_ANUALES_BASE: 0,
  ANIO_BASE: 2026,
  // Años que un jesuita pasa en formación antes de estar disponible para obras.
  // Se lee de PARAMETROS si existe; este es el fallback (decisión Alex 15-jun-2026).
  AÑOS_FORMACION: 10,
};
