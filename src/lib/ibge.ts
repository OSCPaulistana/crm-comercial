"use client";

export interface Municipio {
  id: number;
  nome: string;
}

const cache = new Map<string, Promise<Municipio[]>>();

/** Municípios por UF — API pública de Localidades do IBGE. */
export function fetchMunicipios(uf: string): Promise<Municipio[]> {
  if (!uf) return Promise.resolve([]);
  const key = uf.toUpperCase();
  if (!cache.has(key)) {
    const p = fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${key}/municipios?orderBy=nome`)
      .then((r) => {
        if (!r.ok) throw new Error("IBGE indisponível");
        return r.json() as Promise<{ id: number; nome: string }[]>;
      })
      .then((list) => list.map(({ id, nome }) => ({ id, nome })))
      .catch((e) => {
        cache.delete(key);
        throw e;
      });
    cache.set(key, p);
  }
  return cache.get(key)!;
}
