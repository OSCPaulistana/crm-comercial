"use client";

import { CheckCircle2, ClipboardList } from "lucide-react";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { MultiSelect } from "@/components/ui/MultiSelect";
import { maskMoney, parseMoney } from "@/lib/format";
import type { Atendimento, Produto } from "@/types/database";

/** Valores do checklist de Qualificação como o formulário os guarda (texto). */
export interface ChecklistValores {
  q_atividade: string;
  q_outras: "" | "sim" | "nao";
  /** Informações adicionais (opcional) — só quando possui outras empresas. */
  q_outras_obs: string;
  q_funcionarios: string;
  q_faturamento: string;
  q_contabilidade: string;
  q_dor: string;
  q_produtos: string[];
  /** Redes sociais (opcionais). */
  q_linkedin: string;
  q_instagram: string;
  q_facebook: string;
  /** Restaurante: abre as perguntas sobre o sistema de frente de caixa e o ERP financeiro. */
  q_restaurante: "" | "sim" | "nao";
  q_pdv: string;
  q_erp: string;
}

export type ChecklistErros = Partial<Record<keyof ChecklistValores, string>>;

export const CHECKLIST_VAZIO: ChecklistValores = {
  q_atividade: "",
  q_outras: "",
  q_outras_obs: "",
  q_funcionarios: "",
  q_faturamento: "",
  q_contabilidade: "",
  q_dor: "",
  q_produtos: [],
  q_linkedin: "",
  q_instagram: "",
  q_facebook: "",
  q_restaurante: "",
  q_pdv: "",
  q_erp: "",
};

/** A atividade descrita lembra um restaurante? (usado só para sugerir a resposta). */
export const pareceRestaurante = (atividade: string) => /restaurante/i.test(atividade);

/** CNAE de restaurantes e similares (5611-2/01, 5611-2/03, 5611-2/04, 5611-2/05). */
export const cnaeRestaurante = (cnae: string) => cnae.startsWith("5611");

export function checklistDe(a: Atendimento | null): ChecklistValores {
  if (!a) return CHECKLIST_VAZIO;
  return {
    q_atividade: a.qualif_atividade ?? "",
    q_outras: a.qualif_outras_empresas === true ? "sim" : a.qualif_outras_empresas === false ? "nao" : "",
    q_outras_obs: a.qualif_outras_empresas_obs ?? "",
    q_funcionarios: a.qualif_funcionarios === null ? "" : String(a.qualif_funcionarios),
    q_faturamento:
      a.qualif_faturamento_mensal === null
        ? ""
        : Number(a.qualif_faturamento_mensal).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    q_contabilidade: a.qualif_contabilidade_anterior ?? "",
    q_dor: a.qualif_principal_dor ?? "",
    q_produtos: a.qualif_produtos ?? [],
    q_linkedin: a.qualif_linkedin ?? "",
    q_instagram: a.qualif_instagram ?? "",
    q_facebook: a.qualif_facebook ?? "",
    q_restaurante: a.qualif_restaurante === true ? "sim" : a.qualif_restaurante === false ? "nao" : "",
    q_pdv: a.qualif_pdv_sistema ?? "",
    q_erp: a.qualif_erp_financeiro ?? "",
  };
}

/** Itens que ainda faltam (a ordem segue a do checklist). */
export function checklistPendencias(v: ChecklistValores): (keyof ChecklistValores)[] {
  const out: (keyof ChecklistValores)[] = [];
  if (!v.q_atividade.trim()) out.push("q_atividade");
  if (!v.q_outras) out.push("q_outras");
  if (v.q_funcionarios === "") out.push("q_funcionarios");
  if (v.q_faturamento === "") out.push("q_faturamento");
  if (!v.q_contabilidade.trim()) out.push("q_contabilidade");
  if (!v.q_dor.trim()) out.push("q_dor");
  if (v.q_produtos.length === 0) out.push("q_produtos");
  // restaurante: sistema da frente de caixa e ERP financeiro também são obrigatórios
  if (v.q_restaurante === "sim") {
    if (!v.q_pdv.trim()) out.push("q_pdv");
    if (!v.q_erp.trim()) out.push("q_erp");
  }
  return out;
}

/** Quantidade de itens obrigatórios (7, mais 2 quando é restaurante). */
export const checklistTotal = (v: ChecklistValores) => 7 + (v.q_restaurante === "sim" ? 2 : 0);

const MSG: Record<keyof ChecklistValores, string> = {
  q_atividade: "Informe a atividade.",
  q_outras: "Informe se possui outras empresas.",
  q_outras_obs: "", // opcional: nunca é pendência
  q_funcionarios: "Informe o número de funcionários.",
  q_faturamento: "Informe o faturamento mensal.",
  q_contabilidade: "Informe a contabilidade anterior.",
  q_dor: "Descreva a principal dor hoje.",
  q_produtos: "Selecione ao menos um produto/serviço.",
  q_linkedin: "", // opcionais: nunca são pendência
  q_instagram: "",
  q_facebook: "",
  q_restaurante: "",
  q_pdv: "Informe o sistema da frente de caixa (PDV).",
  q_erp: "Informe o ERP financeiro.",
};

export function checklistErros(v: ChecklistValores): ChecklistErros {
  const e: ChecklistErros = {};
  for (const k of checklistPendencias(v)) e[k] = MSG[k];
  return e;
}

export function checklistParaBanco(v: ChecklistValores) {
  return {
    qualif_atividade: v.q_atividade.trim() || null,
    qualif_outras_empresas: v.q_outras === "" ? null : v.q_outras === "sim",
    // a observação só vale quando possui outras empresas
    qualif_outras_empresas_obs: v.q_outras === "sim" ? v.q_outras_obs.trim() || null : null,
    qualif_funcionarios: v.q_funcionarios === "" ? null : Number(v.q_funcionarios),
    qualif_faturamento_mensal: v.q_faturamento === "" ? null : parseMoney(v.q_faturamento),
    qualif_contabilidade_anterior: v.q_contabilidade.trim() || null,
    qualif_principal_dor: v.q_dor.trim() || null,
    qualif_produtos: v.q_produtos,
    qualif_linkedin: v.q_linkedin.trim() || null,
    qualif_instagram: v.q_instagram.trim() || null,
    qualif_facebook: v.q_facebook.trim() || null,
    qualif_restaurante: v.q_restaurante === "" ? null : v.q_restaurante === "sim",
    // sistemas só valem para restaurante
    qualif_pdv_sistema: v.q_restaurante === "sim" ? v.q_pdv.trim() || null : null,
    qualif_erp_financeiro: v.q_restaurante === "sim" ? v.q_erp.trim() || null : null,
  };
}

/** Checklist de Qualificação — todos os itens são obrigatórios para avançar da etapa. */
export function Checklist({
  valores,
  onChange,
  erros,
  produtos,
  obrigatorio,
}: {
  valores: ChecklistValores;
  onChange: (patch: Partial<ChecklistValores>) => void;
  erros: ChecklistErros;
  produtos: Pick<Produto, "id" | "nome" | "ativo">[];
  /** true = o avanço de etapa depende do checklist completo (destaca o que falta). */
  obrigatorio: boolean;
}) {
  const faltam = checklistPendencias(valores).length;
  const total = checklistTotal(valores);
  const completo = faltam === 0;

  return (
    <div
      className={`rounded-[10px] border p-4 ${
        completo ? "border-[#bbf7d0] bg-success-soft/40" : obrigatorio ? "border-[#fde68a] bg-warning-soft/50" : "border-line bg-gray-50/60"
      }`}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-semibold text-fg">
          <ClipboardList className="size-4 text-fg-2" aria-hidden /> Checklist de qualificação
        </p>
        {completo ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-[#15803d]">
            <CheckCircle2 className="size-3.5" aria-hidden /> Completo
          </span>
        ) : (
          <span className="text-xs font-medium text-fg-2">
            {total - faltam} de {total} itens · todos obrigatórios para avançar
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-6">
        <Input
          label="Atividade"
          required
          value={valores.q_atividade}
          onChange={(e) => onChange({ q_atividade: e.target.value })}
          error={erros.q_atividade}
          maxLength={200}
          placeholder="Ex.: padaria, clínica odontológica, e-commerce"
          wrapperClassName="sm:col-span-4"
        />
        <Select
          label="Possui outras empresas"
          required
          value={valores.q_outras}
          onChange={(e) => onChange({ q_outras: e.target.value as ChecklistValores["q_outras"] })}
          placeholder="Selecione"
          options={[
            { value: "sim", label: "Sim" },
            { value: "nao", label: "Não" },
          ]}
          error={erros.q_outras}
          wrapperClassName="sm:col-span-2"
        />
        {valores.q_outras === "sim" && (
          <Textarea
            label="Informações sobre as outras empresas"
            value={valores.q_outras_obs}
            onChange={(e) => onChange({ q_outras_obs: e.target.value })}
            rows={3}
            placeholder="Quais empresas, regime tributário, se pretende atendê-las também..."
            wrapperClassName="sm:col-span-6"
            maxLength={1000}
          />
        )}
        <Input
          label="Nº de funcionários"
          required
          inputMode="numeric"
          value={valores.q_funcionarios}
          onChange={(e) => onChange({ q_funcionarios: e.target.value.replace(/\D/g, "").slice(0, 6) })}
          error={erros.q_funcionarios}
          placeholder="0"
          className="tabular-nums"
          wrapperClassName="sm:col-span-2"
        />
        <Field label="Faturamento mensal (R$)" required error={erros.q_faturamento} className="sm:col-span-2">
          <input
            inputMode="decimal"
            className="form-control tabular-nums"
            value={valores.q_faturamento}
            aria-invalid={erros.q_faturamento ? true : undefined}
            onChange={(e) => onChange({ q_faturamento: maskMoney(e.target.value) })}
            placeholder="0,00"
          />
        </Field>
        <Input
          label="Contabilidade anterior"
          required
          value={valores.q_contabilidade}
          onChange={(e) => onChange({ q_contabilidade: e.target.value })}
          error={erros.q_contabilidade}
          maxLength={200}
          placeholder="Nome do escritório atual ou anterior"
          wrapperClassName="sm:col-span-2"
        />
        <Select
          label="É um restaurante?"
          value={valores.q_restaurante}
          onChange={(e) => onChange({ q_restaurante: e.target.value as ChecklistValores["q_restaurante"] })}
          placeholder="Não informado"
          options={[
            { value: "sim", label: "Sim" },
            { value: "nao", label: "Não" },
          ]}
          hint={valores.q_restaurante === "sim" ? undefined : "Se for, pergunte o sistema do caixa e o ERP financeiro."}
          wrapperClassName="sm:col-span-6"
        />
        {valores.q_restaurante === "sim" && (
          <>
            <Input
              label="Sistema da frente de caixa (PDV)"
              required
              value={valores.q_pdv}
              onChange={(e) => onChange({ q_pdv: e.target.value })}
              error={erros.q_pdv}
              maxLength={150}
              placeholder="Ex.: Saipos, Consumer, Linx, Goomer"
              wrapperClassName="sm:col-span-3"
            />
            <Input
              label="ERP financeiro"
              required
              value={valores.q_erp}
              onChange={(e) => onChange({ q_erp: e.target.value })}
              error={erros.q_erp}
              maxLength={150}
              placeholder="Ex.: Omie, Conta Azul, Bling, nenhum"
              wrapperClassName="sm:col-span-3"
            />
          </>
        )}
        <Textarea
          label="Principal dor hoje"
          required
          value={valores.q_dor}
          onChange={(e) => onChange({ q_dor: e.target.value })}
          rows={4}
          placeholder="Qual o principal problema que o cliente quer resolver com a contabilidade?"
          wrapperClassName="sm:col-span-6"
          aria-invalid={erros.q_dor ? true : undefined}
        />
        {erros.q_dor && <p className="field-error -mt-3 sm:col-span-6">{erros.q_dor}</p>}
        <Field label="Produtos/Serviços negociados" required error={erros.q_produtos} className="sm:col-span-6" htmlFor="q-produtos">
          <MultiSelect
            id="q-produtos"
            options={produtos.map((p) => ({ value: p.id, label: p.nome }))}
            value={valores.q_produtos}
            onChange={(v) => onChange({ q_produtos: v })}
            placeholder={produtos.length ? "Selecione um ou mais" : "Nenhum produto cadastrado"}
            pluralLabel="produtos"
            invalid={Boolean(erros.q_produtos)}
          />
        </Field>
        <fieldset className="grid grid-cols-1 gap-4 border-t border-line pt-4 sm:col-span-6 sm:grid-cols-3">
          <legend className="mb-2 text-xs font-semibold tracking-wide text-fg-2 uppercase">Redes sociais (opcional)</legend>
          <Input
            label="LinkedIn"
            value={valores.q_linkedin}
            onChange={(e) => onChange({ q_linkedin: e.target.value })}
            maxLength={200}
            placeholder="linkedin.com/company/..."
            autoComplete="off"
          />
          <Input
            label="Instagram"
            value={valores.q_instagram}
            onChange={(e) => onChange({ q_instagram: e.target.value })}
            maxLength={200}
            placeholder="@usuario ou link do perfil"
            autoComplete="off"
          />
          <Input
            label="Facebook"
            value={valores.q_facebook}
            onChange={(e) => onChange({ q_facebook: e.target.value })}
            maxLength={200}
            placeholder="facebook.com/..."
            autoComplete="off"
          />
        </fieldset>
      </div>
    </div>
  );
}
