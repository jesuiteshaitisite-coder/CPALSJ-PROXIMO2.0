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

export function esRegistroValido(p) {
  const v = (p['REGISTRO_VALIDO'] || '').trim().toUpperCase();
  return v !== 'NO';
}

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
    p => esRegistroValido(p) && set.has(provinciaDePersona(p))
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
  let total = 0, sumaEdad = 0, conEdad = 0, mayores70 = 0, enEdadActiva = 0;
  const porEstado = { P: 0, S: 0, F: 0, NS: 0, O: 0, otros: 0 };

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
  }

  return {
    total,
    edadMedia: conEdad ? sumaEdad / conEdad : null,
    pctMayores70: conEdad ? (mayores70 / conEdad) * 100 : null,
    enEdadActiva,
    porEstado,
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
