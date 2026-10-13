import "server-only";
import { geoCentroid } from "d3-geo";

/** [longitude, latitude] */
export type Coordenada = [number, number];

const MALHA = (codigo: number) =>
  `https://servicodados.ibge.gov.br/api/v3/malhas/municipios/${codigo}?formato=application/vnd.geo+json&qualidade=minima`;

type Anel = number[][];
type Geometria = { type: string; coordinates: Anel[] | Anel[][] };

/** O IBGE entrega os anéis no sentido oposto ao que o d3 espera (o polígono viraria "o resto da esfera"): inverte. */
function inverterAneis(geo: { features?: { geometry: Geometria }[] }) {
  for (const f of geo.features ?? []) {
    const g = f.geometry;
    const inv = (aneis: Anel[]) => aneis.map((r) => [...r].reverse());
    g.coordinates = g.type === "Polygon" ? inv(g.coordinates as Anel[]) : (g.coordinates as Anel[][]).map(inv);
  }
  return geo;
}

async function centroide(codigo: number): Promise<Coordenada | null> {
  try {
    // o contorno de um município não muda: guardado em cache por 30 dias
    const r = await fetch(MALHA(codigo), { next: { revalidate: 60 * 60 * 24 * 30 }, signal: AbortSignal.timeout(10000) });
    if (!r.ok) return null;
    const geo = await r.json();
    const [lng, lat] = geoCentroid(inverterAneis(geo) as never);
    return Number.isFinite(lng) && Number.isFinite(lat) ? [lng, lat] : null;
  } catch {
    return null;
  }
}

/** Ponto central (IBGE) de cada município informado. Municípios que falharem simplesmente ficam de fora. */
export async function centroidesMunicipios(codigos: number[]): Promise<Record<number, Coordenada>> {
  const unicos = [...new Set(codigos.filter((c) => Number.isInteger(c) && c > 0))];
  const out: Record<number, Coordenada> = {};
  for (let i = 0; i < unicos.length; i += 8) {
    const lote = unicos.slice(i, i + 8);
    const res = await Promise.all(lote.map(centroide));
    lote.forEach((c, j) => {
      const p = res[j];
      if (p) out[c] = p;
    });
  }
  return out;
}
