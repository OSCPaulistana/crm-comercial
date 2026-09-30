"use client";

import { useEffect, useState } from "react";
import { Field, Select } from "@/components/ui/Field";
import { fetchMunicipios, type Municipio } from "@/lib/ibge";
import { UFS } from "@/lib/constants";

export interface UfMunicipioValue {
  uf: string;
  municipio: string;
  municipio_ibge: number | null;
}

/** UF + Município (lista do IBGE conforme a UF selecionada). */
export function UfMunicipioFields({
  value,
  onChange,
  required,
  errors = {},
  ufClassName = "",
  municipioClassName = "",
}: {
  value: UfMunicipioValue;
  onChange: (v: UfMunicipioValue) => void;
  required?: boolean;
  errors?: { uf?: string; municipio?: string };
  ufClassName?: string;
  municipioClassName?: string;
}) {
  const [municipios, setMunicipios] = useState<Municipio[]>([]);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState(false);

  useEffect(() => {
    if (!value.uf) {
      setMunicipios([]);
      return;
    }
    let alive = true;
    setLoading(true);
    setErro(false);
    fetchMunicipios(value.uf)
      .then((list) => alive && setMunicipios(list))
      .catch(() => alive && setErro(true))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [value.uf]);

  return (
    <>
      <Select
        label="UF"
        required={required}
        value={value.uf}
        onChange={(e) => onChange({ uf: e.target.value, municipio: "", municipio_ibge: null })}
        placeholder="Selecione"
        options={UFS.map((u) => ({ value: u.sigla, label: `${u.sigla} — ${u.nome}` }))}
        error={errors.uf}
        wrapperClassName={ufClassName}
      />
      <Field
        label="Município"
        required={required}
        error={errors.municipio}
        hint={erro ? "Não foi possível carregar os municípios do IBGE. Verifique sua conexão." : undefined}
        className={municipioClassName}
      >
        <select
          value={value.municipio}
          disabled={!value.uf || loading}
          onChange={(e) => {
            const m = municipios.find((x) => x.nome === e.target.value);
            onChange({ ...value, municipio: e.target.value, municipio_ibge: m?.id ?? null });
          }}
          className="form-control"
          aria-label="Município"
          aria-invalid={errors.municipio ? true : undefined}
        >
          <option value="">{loading ? "Carregando municípios..." : value.uf ? "Selecione" : "Selecione a UF"}</option>
          {value.municipio && !municipios.some((m) => m.nome === value.municipio) && (
            <option value={value.municipio}>{value.municipio}</option>
          )}
          {municipios.map((m) => (
            <option key={m.id} value={m.nome}>
              {m.nome}
            </option>
          ))}
        </select>
      </Field>
    </>
  );
}
