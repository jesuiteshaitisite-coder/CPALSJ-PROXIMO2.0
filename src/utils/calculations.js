// ─── Funciones demográficas (Vista Presente y siguientes) ───────────────────

import { normProv, parseNum } from '../services/sheetsService.js';
import { PROVINCIAS, HAITI } from '../config.js';

// ── Alcance ────────────────────────────────────────────────────────────────

// Provincias que entran en los cálculos según alcance y toggle Haití.
// Haití aplica al alcance CPALSJ completo y también a la provincia CARIBE.
export function provinciasDelAlcance({ alcance, provincia, haitiActivo }) {
  if (alcance === 'cpalsj') {
    return haitiActivo ? [...PROVINCIAS, HAITI] : [...PROVINCIAS];
  }
  if (provincia === 'CARIBE' && haitiActivo) return ['CARIBE', HAITI];
  return [provincia];
}

// ── Filtros base ───────────────────────────────────────────────────────────

// NOTA: la spec original excluía filas con REGISTRO_VALIDO=No, pero el
// usuario decidió (12-jun-2026) que TODA fila presente en el Sheet se cuenta.
export function provinciaDePersona(p) {
  return normProv(p['PROVINCIA NORM'] || p['PROVINCIA']);
}

export function provinciaDeObra(o) {
  return normProv(o['PROVINCIA_NORM'] || o['PROVINCIA']);
}

export function esResidencia(o) {
  const tipo = (o['TIPO_OBRA'] || '').trim().toUpperCase();
  const ambito = (o['AMBITO'] || '').trim().toUpperCase();
  return tipo === 'RESIDENCIA' || ambito === 'COMUNIDAD';
}

export function filtrarPersonas(sheets, provs) {
  const set = new Set(provs);
  return sheets['PERSONAS'].rows.filter(
    p => set.has(provinciaDePersona(p))
  );
}

// Obras apostólicas que computan (residencias SIEMPRE excluidas)
export function filtrarObras(sheets, provs) {
  const set = new Set(provs);
  return sheets['OBRAS'].rows.filter(
    o => !esResidencia(o) && set.has(provinciaDeObra(o))
  );
}

export function filtrarResidencias(sheets, provs) {
  const set = new Set(provs);
  return sheets['OBRAS'].rows.filter(
    o => esResidencia(o) && set.has(provinciaDeObra(o))
  );
}

// ── Demografía ─────────────────────────────────────────────────────────────

export function edadDePersona(p) {
  return parseNum(p['EDAD ACTUAL']);
}

export function estadoNorm(p) {
  return (p['ESTADO NORMALIZADO'] || '').trim().toUpperCase();
}

export const ESTADOS_CANONICOS = ['P', 'S', 'F', 'NS', 'O'];

export function statsDemograficas(personas) {
  let total = 0, sumaEdad = 0, conEdad = 0, mayores70 = 0, enEdadActiva = 0, conVotos = 0;
  const porEstado = { P: 0, S: 0, F: 0, NS: 0, O: 0, otros: 0 };
  // Jesuitas SIN últimos votos por estado canónico. Escolares (S) y novicios
  // (NS) aún no hacen los últimos votos, por eso el desglose relevante es P/F/O.
  const sinVotosPorEstado = { P: 0, S: 0, F: 0, NS: 0, O: 0 };

  for (const p of personas) {
    total++;
    const e = edadDePersona(p);
    if (e !== null && e > 0) {
      sumaEdad += e;
      conEdad++;
      if (e >= 70) mayores70++;
      if (e >= 30 && e < 85) enEdadActiva++;
    }
    const est = estadoNorm(p);
    if (ESTADOS_CANONICOS.includes(est)) porEstado[est]++;
    else porEstado.otros++;
    const tieneVotos = !!(p['ULTIMOS VOTOS'] || '').trim();
    if (tieneVotos) conVotos++;
    else if (ESTADOS_CANONICOS.includes(est)) sinVotosPorEstado[est]++;
  }

  return {
    total,
    edadMedia: conEdad ? sumaEdad / conEdad : null,
    pctMayores70: conEdad ? (mayores70 / conEdad) * 100 : null,
    enEdadActiva,
    conVotos,
    porEstado,
    sinVotosPorEstado,
  };
}

// Pirámide calculada desde EDAD ACTUAL (la hoja agrupa todo 60+ en un solo
// tramo, demasiado grueso para gobernanza: aquí se abre en 60-69 / 70-79 / 80+)
export const TRAMOS_EDAD = ['<30', '30-39', '40-49', '50-59', '60-69', '70-79', '80+'];

export function piramideEdad(personas) {
  const buckets = Object.fromEntries(TRAMOS_EDAD.map(t => [t, 0]));
  let sinEdad = 0;
  for (const p of personas) {
    const e = edadDePersona(p);
    if (e === null || e <= 0) { sinEdad++; continue; }
    if (e < 30) buckets['<30']++;
    else if (e < 40) buckets['30-39']++;
    else if (e < 50) buckets['40-49']++;
    else if (e < 60) buckets['50-59']++;
    else if (e < 70) buckets['60-69']++;
    else if (e < 80) buckets['70-79']++;
    else buckets['80+']++;
  }
  return { tramos: TRAMOS_EDAD.map(t => ({ tramo: t, n: buckets[t] })), sinEdad };
}

// ── Comparativa por provincia ──────────────────────────────────────────────

export function comparativaProvincias(sheets, provs) {
  const personas = filtrarPersonas(sheets, provs);
  const porProv = {};
  for (const prov of provs) {
    porProv[prov] = { provincia: prov, personas: [] };
  }
  for (const p of personas) {
    const prov = provinciaDePersona(p);
    if (porProv[prov]) porProv[prov].personas.push(p);
  }
  return provs.map(prov => {
    const s = statsDemograficas(porProv[prov].personas);
    return { provincia: prov, ...s };
  }).sort((a, b) => b.total - a.total);
}

// ── Fuerza apostólica (campo FUERZA APOSTOLICA, bien poblado) ───────────────
// Capacidad apostólica real, distinta de la demografía: Plena → Retiro.

export const FUERZA_ORDEN = ['Plena', 'Formación', 'Acompañamiento', 'Retiro'];

export function distribucionFuerza(personas) {
  const conteo = Object.fromEntries(FUERZA_ORDEN.map(f => [f, 0]));
  let sinDato = 0;
  for (const p of personas) {
    const v = (p['FUERZA APOSTOLICA'] || '').trim();
    if (conteo[v] !== undefined) conteo[v]++;
    else sinDato++;
  }
  const total = FUERZA_ORDEN.reduce((s, f) => s + conteo[f], 0);
  return { conteo, total, sinDato };
}

// ── Ingreso y antigüedad ────────────────────────────────────────────────────
// Edad de ingreso = año de entrada − año de nacimiento (no depende del año
// actual). Antigüedad = año de referencia del Sheet − año de entrada.
// Las fechas llegan de gviz como "Date(AAAA,M,D)"; se extrae el año.

export const ANIO_REF = 2026;

function añoDe(v) {
  if (!v) return null;
  const s = String(v).trim();
  const m = s.match(/Date\((\d{4})/);
  if (m) return Number(m[1]);
  const n = parseInt(s, 10);
  return n > 1800 && n < 2100 ? n : null;
}

export function statsIngreso(personas) {
  let sumaIngreso = 0, sumaAntig = 0, n = 0, sinDato = 0;
  const porDecada = {};
  for (const p of personas) {
    const nac = añoDe(p['FECHA_NACIMIENTO']);
    const ent = añoDe(p['AÑO_ENTRADA']);
    const ei = nac && ent ? ent - nac : null;
    if (ei !== null && ei >= 10 && ei <= 60) {
      sumaIngreso += ei;
      sumaAntig += ANIO_REF - ent;
      n++;
      const d = Math.floor(ent / 10) * 10;
      if (!porDecada[d]) porDecada[d] = { suma: 0, n: 0 };
      porDecada[d].suma += ei;
      porDecada[d].n++;
    } else {
      sinDato++;
    }
  }
  const decadas = Object.keys(porDecada).map(Number).sort((a, b) => a - b)
    .map(d => ({ decada: `${d}s`, edadIngreso: porDecada[d].suma / porDecada[d].n, n: porDecada[d].n }));
  return {
    edadIngresoMedia: n ? sumaIngreso / n : null,
    antiguedadMedia: n ? sumaAntig / n : null,
    decadas,
    n,
    sinDato,
  };
}

// ── Presencia apostólica (OBRAS) ────────────────────────────────────────────
// TIPO_OBRA: códigos A/B/C (las residencias se excluyen vía filtrarObras).
// AMBITO: tipo descriptivo (PARROQUIA, COLEGIO, OBRA SOCIAL…).

export const TIPOS_OBRA = ['A', 'B', 'C'];

export function tipoDeObra(o) {
  return (o['TIPO_OBRA'] || '').trim().toUpperCase();
}

export function ambitoDeObra(o) {
  return (o['AMBITO'] || '').trim();
}

export function distribObrasPorTipo(obras) {
  const c = { A: 0, B: 0, C: 0 };
  for (const o of obras) {
    const tipo = tipoDeObra(o);
    if (c[tipo] !== undefined) c[tipo]++;
  }
  return c;
}

export function distribObrasPorAmbito(obras) {
  const m = {};
  for (const o of obras) {
    const a = ambitoDeObra(o) || '(sin ámbito)';
    m[a] = (m[a] || 0) + 1;
  }
  return Object.entries(m)
    .map(([ambito, n]) => ({ ambito, n }))
    .sort((a, b) => b.n - a.n);
}

// Obras computables por provincia, desglosadas por tipo A/B/C.
export function comparativaObrasProvincias(sheets, provs) {
  const obras = filtrarObras(sheets, provs);
  const porProv = {};
  for (const prov of provs) porProv[prov] = { provincia: prov, total: 0, A: 0, B: 0, C: 0 };
  for (const o of obras) {
    const prov = provinciaDeObra(o);
    if (!porProv[prov]) continue;
    porProv[prov].total++;
    const tipo = tipoDeObra(o);
    if (porProv[prov][tipo] !== undefined) porProv[prov][tipo]++;
  }
  return provs.map(p => porProv[p]).sort((a, b) => b.total - a.total);
}

// ── IIA: Índice de Impacto Apostólico ──────────────────────────────────────
// IIA = beneficiarios de obras activas / jesuitas asignados a obras activas.
// El campo OBRA ASIGNADA de PERSONAS está vacío en los datos actuales, por lo
// que el denominador usa PRESENCIA ACTUAL DE SJS de la hoja OBRAS.

export function calcularIIA(obras) {
  let benef = 0, obrasConBenef = 0, asignados = 0, obrasConPresencia = 0;
  for (const o of obras) {
    const b = parseNum(o['BENEF.']);
    if (b !== null && b > 0) { benef += b; obrasConBenef++; }
    const s = parseNum(o['PRESENCIA ACTUAL DE SJS']);
    if (s !== null && s > 0) { asignados += s; obrasConPresencia++; }
  }
  return {
    benef,
    asignados,
    iia: asignados > 0 ? benef / asignados : null,
    obrasConBenef,
    obrasConPresencia,
    obrasTotal: obras.length,
  };
}
