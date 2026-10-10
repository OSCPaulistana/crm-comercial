"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Ban, CheckCircle2, FileText, History, MessageSquarePlus, MoveRight, Pencil, RefreshCcw, Trash2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { MultiSelect } from "@/components/ui/MultiSelect";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { StatusBadge } from "@/components/StatusBadge";
import { UfMunicipioFields } from "@/components/UfMunicipioFields";
import { createClient } from "@/lib/supabase/client";
import {
  CANAIS,
  ETAPA_AGENDADO,
  GIRO_INTERVALO_DIAS,
  MOTIVOS_DECLINIO,
  PORTES,
  RECORRENCIA_LABEL,
  REGIMES,
  STATUS,
  STATUS_MAP,
  TIPOS_VISITA,
  type MeioContato,
  type StatusAtendimento,
  type TipoVisita,
} from "@/lib/constants";
import {
  formatBRL,
  formatDate,
  maskMoney,
  maskPhone,
  moneyToInput,
  parseMoney,
  supabaseErrorMessage,
  todayISO,
} from "@/lib/format";
import type { Anexo, Atendimento, Campanha, GiroCarteira, Produto, Vendedor } from "@/types/database";
import { BUCKET_ANEXOS, enviarAnexos, linksAnexos } from "@/lib/anexos";
import {
  Checklist,
  checklistDe,
  checklistErros,
  checklistParaBanco,
  checklistPendencias,
  type ChecklistErros,
  type ChecklistValores,
} from "./Checklist";
import { EtapaDetalhe } from "./EtapaDetalhe";
import { AnexosPicker, EtapasStepper, MeioContatoPicker, TimelineList, type HistoricoRow, type NotaRow } from "./Timeline";

interface Props {
  open: boolean;
  atendimento: Atendimento | null;
  onClose: () => void;
  vendedores: Vendedor[];
  campanhas: Pick<Campanha, "id" | "nome" | "data_lancamento" | "data_conclusao">[];
  produtos: Produto[];
  podeExcluir: boolean;
  meuVendedorId: string | null;
  meuUsuarioId: string;
  indicadores: string[];
}

export function AtendimentoForm(props: Props) {
  if (!props.open) return null;
  return <AtendimentoFormInner key={props.atendimento?.id ?? "novo"} {...props} />;
}

type FormState = {
  data: string;
  lead: string;
  telefone: string;
  email: string;
  porte: string;
  regime: string;
  canal: string;
  indicado_por: string;
  uf: string;
  municipio: string;
  municipio_ibge: number | null;
  /** Meio do PRIMEIRO contato — informado apenas no registro do lead. */
  meio_contato_inicial: MeioContato | "";
  status: StatusAtendimento;
  responsavel_id: string;
  campanha_id: string;
  /** Texto do novo registro (observação) desta atualização. */
  observacao_etapa: string;
  data_visita: string;
  tipo_visita: TipoVisita | "";
  proposta_produto_id: string;
  proposta_valor: string;
  data_proposta: string;
  conforme_proposta: "" | "sim" | "nao";
  produto_id: string;
  valor_fechado: string;
  data_fechamento: string;
  motivos_declinio: string[];
  motivo_declinio_outro: string;
};

function initialState(a: Atendimento | null, meuVendedorId: string | null): FormState {
  return {
    data: a?.data ?? todayISO(),
    lead: a?.lead ?? "",
    telefone: a?.telefone ?? "",
    email: a?.email ?? "",
    porte: a?.porte ?? "",
    regime: a?.regime ?? "",
    canal: a?.canal ?? "",
    indicado_por: a?.indicado_por ?? "",
    uf: a?.uf ?? (a ? "" : "SP"),
    municipio: a?.municipio ?? "",
    municipio_ibge: a?.municipio_ibge ?? null,
    meio_contato_inicial: a?.meio_contato_inicial ?? "",
    status: a?.status ?? "primeiro_contato",
    responsavel_id: a?.responsavel_id ?? meuVendedorId ?? "",
    campanha_id: a?.campanha_id ?? "",
    // novo registro da linha do tempo: sempre começa em branco
    observacao_etapa: "",
    data_visita: a?.data_visita ?? "",
    tipo_visita: a?.tipo_visita ?? "",
    proposta_produto_id: a?.proposta_produto_id ?? "",
    proposta_valor: moneyToInput(a?.proposta_valor),
    data_proposta: a?.data_proposta ?? "",
    conforme_proposta: a?.conforme_proposta === true ? "sim" : a?.conforme_proposta === false ? "nao" : "",
    produto_id: a?.produto_id ?? "",
    valor_fechado: moneyToInput(a?.valor_fechado),
    data_fechamento: a?.data_fechamento ?? "",
    motivos_declinio: a?.motivos_declinio ?? [],
    motivo_declinio_outro: a?.motivo_declinio_outro ?? "",
  };
}

const CAMPOS_LEAD = [
  "data",
  "lead",
  "porte",
  "regime",
  "canal",
  "indicado_por",
  "uf",
  "municipio",
  "responsavel_id",
  "meio_contato_inicial",
] as const;

/** O que o usuário quer fazer nesta atualização. */
type Acao = "manter" | "avancar" | "declinar" | "outra";

function AtendimentoFormInner({
  atendimento,
  onClose,
  vendedores,
  campanhas,
  produtos,
  podeExcluir,
  meuVendedorId,
  meuUsuarioId,
  indicadores,
}: Props) {
  const router = useRouter();
  const toast = useToast();
  const supabase = createClient();
  const editing = atendimento !== null;

  const [f, setF] = useState<FormState>(() => initialState(atendimento, meuVendedorId));
  const [chk, setChk] = useState<ChecklistValores>(() => checklistDe(atendimento));
  const [chkErros, setChkErros] = useState<ChecklistErros>({});
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [editarDados, setEditarDados] = useState(!editing);
  const [acao, setAcao] = useState<Acao>("manter");
  const [outraStatus, setOutraStatus] = useState<StatusAtendimento | "">("");
  /** Etapa anterior em consulta (somente leitura). null = painel de atualização. */
  const [verEtapa, setVerEtapa] = useState<StatusAtendimento | null>(null);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [historico, setHistorico] = useState<HistoricoRow[]>([]);
  const [notas, setNotas] = useState<NotaRow[]>([]);
  const [anexos, setAnexos] = useState<Anexo[]>([]);
  const [links, setLinks] = useState<Record<string, string>>({});
  const [giro, setGiro] = useState<GiroCarteira | null>(null);
  const [notaExcluir, setNotaExcluir] = useState<NotaRow | null>(null);
  const [recarregar, setRecarregar] = useState(0);

  useEffect(() => {
    if (!atendimento) return;
    let alive = true;
    (async () => {
      const [h, n, a, g] = await Promise.all([
        supabase
          .from("atendimento_historico")
          .select("*, profiles(nome)")
          .eq("atendimento_id", atendimento.id)
          .order("created_at", { ascending: false }),
        supabase.from("atendimento_notas").select("*, profiles(nome)").eq("atendimento_id", atendimento.id),
        supabase.from("atendimento_anexos").select("*").eq("atendimento_id", atendimento.id).order("created_at"),
        supabase.from("giro_carteira").select("*").eq("atendimento_id", atendimento.id).maybeSingle(),
      ]);
      if (!alive) return;
      const listaAnexos = (a.data ?? []) as Anexo[];
      setHistorico((h.data ?? []) as HistoricoRow[]);
      setNotas((n.data ?? []) as NotaRow[]);
      setAnexos(listaAnexos);
      setGiro((g.data as GiroCarteira | null) ?? null);
      const l = await linksAnexos(supabase, listaAnexos);
      if (alive) setLinks(l);
    })();
    return () => {
      alive = false;
    };
  }, [atendimento, supabase, recarregar]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => {
    setF((s) => ({ ...s, [k]: v }));
    setErrors((e) => ({ ...e, [k]: undefined }));
  };

  const mudarChecklist = (patch: Partial<ChecklistValores>) => {
    setChk((s) => ({ ...s, ...patch }));
    setChkErros((e) => {
      const n = { ...e };
      for (const k of Object.keys(patch) as (keyof ChecklistValores)[]) delete n[k];
      return n;
    });
  };

  /* ------------------------------------------------------------------ */
  /* Estado derivado                                                     */
  /* ------------------------------------------------------------------ */
  const statusOriginal = atendimento?.status ?? null;
  const mudouEtapa = editing && f.status !== statusOriginal;
  const etapa = STATUS_MAP[f.status].etapa;
  const etapaOriginal = statusOriginal ? STATUS_MAP[statusOriginal].etapa : 0;
  const isAgendado = f.status === "agendado_visita";
  const isVisitaRealizada = f.status === "visita_realizada";
  const isProposta = f.status === "proposta_enviada";
  const isEfetivado = f.status === "negocio_efetivado";
  const isDeclinado = f.status === "negocio_declinado";
  const temProposta = parseMoney(f.proposta_valor) > 0;
  const fechouConforme = isEfetivado && temProposta && f.conforme_proposta === "sim";
  const avancou = mudouEtapa && etapa > etapaOriginal;

  // Checklist: obrigatório para sair da Qualificação (agendar visita em diante)
  const exigeChecklist = etapa >= ETAPA_AGENDADO && !isDeclinado;
  const checklistCompleto = checklistPendencias(chk).length === 0;
  const mostraChecklist = f.status === "qualificacao" || (exigeChecklist && !checklistCompleto);

  // Próxima etapa do funil (a seguinte à etapa atual do atendimento)
  const proxima = statusOriginal && etapaOriginal > 0 && etapaOriginal < 6 ? STATUS.find((s) => s.etapa === etapaOriginal + 1) : null;

  const temRegistro = Boolean(f.observacao_etapa.trim() || arquivos.length);
  const podeExcluirNota = (n: NotaRow) => podeExcluir || n.usuario_id === meuUsuarioId;

  const escolherAcao = (a: Acao) => {
    setAcao(a);
    setErrors({});
    setChkErros({});
    const alvo: StatusAtendimento | null =
      a === "manter" ? statusOriginal : a === "avancar" ? proxima?.value ?? statusOriginal : a === "declinar" ? "negocio_declinado" : outraStatus || statusOriginal;
    if (alvo) setF((prev) => ({ ...prev, status: alvo }));
  };

  const escolherOutra = (s: StatusAtendimento | "") => {
    setOutraStatus(s);
    setErrors({});
    setChkErros({});
    setF((prev) => ({ ...prev, status: s || (statusOriginal ?? prev.status) }));
  };

  const onStatusInicial = (s: StatusAtendimento) => {
    setF((prev) => ({ ...prev, status: s }));
    setErrors({});
    setChkErros({});
  };

  const selecionarEtapa = (s: StatusAtendimento) => {
    setVerEtapa((atual) => (s === atendimento?.status || atual === s ? null : s));
  };

  async function excluirNota() {
    const n = notaExcluir;
    if (!n) return;
    const paths = anexos.filter((a) => a.nota_id === n.id).map((a) => a.path);
    if (paths.length) await supabase.storage.from(BUCKET_ANEXOS).remove(paths);
    const { error } = await supabase.from("atendimento_notas").delete().eq("id", n.id);
    setNotaExcluir(null);
    if (error) {
      toast.error("Não foi possível excluir o registro.", supabaseErrorMessage(error, "Tente novamente."));
      return;
    }
    toast.success("Registro excluído.");
    setRecarregar((r) => r + 1);
    router.refresh();
  }

  const produtosAtivos = useMemo(
    () => produtos.filter((p) => p.ativo || p.id === f.produto_id || p.id === f.proposta_produto_id || chk.q_produtos.includes(p.id)),
    [produtos, f.produto_id, f.proposta_produto_id, chk.q_produtos],
  );
  const produtoOptions = produtosAtivos.map((p) => ({ value: p.id, label: `${p.nome} (${RECORRENCIA_LABEL[p.recorrencia]})` }));
  const produtoNome = (id: string | null | undefined) => produtos.find((p) => p.id === id)?.nome ?? "Serviço não informado";
  const vendedoresAtivos = useMemo(
    () => vendedores.filter((v) => v.ativo || v.id === f.responsavel_id),
    [vendedores, f.responsavel_id],
  );
  const vendedorNome = (id: string) => vendedores.find((v) => v.id === id)?.nome ?? "—";
  const campanhaNome = (id: string) => campanhas.find((c) => c.id === id)?.nome ?? "—";

  /* ------------------------------------------------------------------ */
  /* Validação e gravação                                                */
  /* ------------------------------------------------------------------ */
  function validate() {
    const e: typeof errors = {};
    if (!f.data) e.data = "Informe a data.";
    if (!f.lead.trim()) e.lead = "Informe o nome do cliente.";
    if (!f.porte) e.porte = "Selecione o porte.";
    if (!f.regime) e.regime = "Selecione o regime.";
    if (!f.canal) e.canal = "Selecione o canal.";
    if (f.canal === "Indicação" && !f.indicado_por.trim()) e.indicado_por = "Informe quem indicou.";
    if (!f.uf) e.uf = "Selecione a UF.";
    if (!f.municipio) e.municipio = "Selecione o município.";
    if (!f.responsavel_id) e.responsavel_id = "Selecione o responsável.";
    if (!editing && !f.meio_contato_inicial) e.meio_contato_inicial = "Informe o meio do primeiro contato.";
    if (acao === "outra" && !outraStatus) e.status = "Selecione a etapa de destino.";
    if (isAgendado && !f.data_visita) e.data_visita = "Informe a data da visita agendada.";
    if (isVisitaRealizada && !f.tipo_visita) e.tipo_visita = "Informe se foi visita ou reunião no escritório.";
    if (isProposta) {
      if (!f.proposta_produto_id) e.proposta_produto_id = "Selecione o serviço/pacote proposto.";
      if (parseMoney(f.proposta_valor) <= 0) e.proposta_valor = "Informe o valor da proposta.";
    }
    if (isEfetivado) {
      if (temProposta && !f.conforme_proposta) e.conforme_proposta = "Confirme se o fechamento foi conforme a proposta.";
      if (!fechouConforme) {
        if (!f.produto_id) e.produto_id = "Selecione o serviço/pacote fechado.";
        if (parseMoney(f.valor_fechado) <= 0) e.valor_fechado = "Informe o valor fechado.";
      }
    }
    if (isDeclinado && f.motivos_declinio.length === 0) e.motivos_declinio = "Selecione ao menos um motivo.";
    if (isDeclinado && f.motivos_declinio.includes("Outro") && !f.motivo_declinio_outro.trim())
      e.motivo_declinio_outro = "Descreva o motivo.";
    const ce = exigeChecklist ? checklistErros(chk) : {};
    setErrors(e);
    setChkErros(ce);
    if (CAMPOS_LEAD.some((k) => e[k])) setEditarDados(true);
    return Object.keys(e).length === 0 && Object.keys(ce).length === 0;
  }

  async function save() {
    if (!validate()) {
      toast.error(
        "Não foi possível salvar o atendimento.",
        exigeChecklist && !checklistCompleto
          ? "Complete o checklist de qualificação para avançar de etapa."
          : "Verifique os campos destacados e tente novamente.",
      );
      return;
    }
    setSaving(true);

    const proposta = {
      proposta_produto_id: f.proposta_produto_id || null,
      proposta_valor: temProposta ? parseMoney(f.proposta_valor) : null,
      data_proposta: temProposta ? f.data_proposta || null : null,
    };
    const fechamento = isEfetivado
      ? {
          produto_id: fechouConforme ? proposta.proposta_produto_id : f.produto_id || null,
          valor_fechado: fechouConforme ? proposta.proposta_valor : parseMoney(f.valor_fechado),
          data_fechamento: f.data_fechamento || todayISO(),
          conforme_proposta: temProposta ? f.conforme_proposta === "sim" : null,
        }
      : {
          produto_id: atendimento?.produto_id ?? null,
          valor_fechado: atendimento?.valor_fechado ?? null,
          data_fechamento: null,
          conforme_proposta: null,
        };

    const payload = {
      data: f.data,
      lead: f.lead.trim(),
      telefone: f.telefone || null,
      email: f.email.trim() || null,
      porte: f.porte,
      regime: f.regime,
      canal: f.canal,
      indicado_por: f.canal === "Indicação" ? f.indicado_por.trim() : null,
      uf: f.uf || null,
      municipio: f.municipio || null,
      municipio_ibge: f.municipio_ibge,
      meio_contato_inicial: f.meio_contato_inicial || null,
      status: f.status,
      responsavel_id: f.responsavel_id || null,
      campanha_id: f.campanha_id || null,
      data_visita: f.data_visita || null,
      tipo_visita: f.tipo_visita || null,
      ...checklistParaBanco(chk),
      ...proposta,
      ...fechamento,
      motivos_declinio: isDeclinado ? f.motivos_declinio : [],
      motivo_declinio_outro: isDeclinado && f.motivos_declinio.includes("Outro") ? f.motivo_declinio_outro.trim() : null,
    };

    // 1) Atendimento (a mudança de status cria a etapa na linha do tempo)
    let atendimentoId = atendimento?.id ?? "";
    if (editing) {
      const { error } = await supabase.from("atendimentos").update(payload).eq("id", atendimento.id);
      if (error) {
        setSaving(false);
        toast.error("Não foi possível salvar o atendimento.", supabaseErrorMessage(error, "Tente novamente em instantes."));
        return;
      }
    } else {
      const { data, error } = await supabase.from("atendimentos").insert(payload).select("id").single();
      if (error || !data) {
        setSaving(false);
        toast.error("Não foi possível salvar o atendimento.", supabaseErrorMessage(error, "Tente novamente em instantes."));
        return;
      }
      atendimentoId = (data as { id: string }).id;
    }

    // 2) Registro (observação) na etapa e 3) anexos.
    //    No registro do lead, o 1º registro leva o meio do primeiro contato.
    let falhasAnexo: string[] = [];
    if (!editing || temRegistro) {
      const { data: etapaAtual } = await supabase
        .from("atendimento_historico")
        .select("id")
        .eq("atendimento_id", atendimentoId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const { data: nota, error: notaErr } = await supabase
        .from("atendimento_notas")
        .insert({
          atendimento_id: atendimentoId,
          historico_id: (etapaAtual as { id: string } | null)?.id ?? null,
          status: f.status,
          meio_contato: !editing ? f.meio_contato_inicial || null : null,
          texto: f.observacao_etapa.trim() || null,
        })
        .select("id")
        .single();
      if (notaErr || !nota) {
        setSaving(false);
        toast.error("O atendimento foi salvo, mas não o registro da etapa.", supabaseErrorMessage(notaErr, "Tente novamente."));
        router.refresh();
        return;
      }
      if (arquivos.length) {
        ({ falhas: falhasAnexo } = await enviarAnexos(supabase, atendimentoId, (nota as { id: string }).id, arquivos));
      }
    }

    setSaving(false);
    const virouDeclinado = isDeclinado && statusOriginal !== "negocio_declinado";
    toast.success(
      !editing
        ? "Atendimento registrado com sucesso."
        : mudouEtapa
          ? avancou
            ? `Etapa concluída. O lead agora está em ${STATUS_MAP[f.status].label}.`
            : `Etapa alterada para ${STATUS_MAP[f.status].label}.`
          : temRegistro
            ? "Registro adicionado à linha do tempo."
            : "Atendimento atualizado com sucesso.",
      virouDeclinado ? `O lead foi enviado para o Giro de Carteira (1º giro em ${GIRO_INTERVALO_DIAS} dias).` : undefined,
    );
    if (falhasAnexo.length) {
      toast.error("Alguns anexos não foram enviados.", falhasAnexo.join(", "));
    }
    router.refresh();
    onClose();
  }

  async function remove() {
    if (!atendimento) return;
    setDeleting(true);
    // Remove os arquivos do Storage (os registros do banco saem em cascata)
    if (anexos.length) await supabase.storage.from(BUCKET_ANEXOS).remove(anexos.map((a) => a.path));
    const { error } = await supabase.from("atendimentos").delete().eq("id", atendimento.id);
    setDeleting(false);
    if (error) {
      toast.error("Não foi possível excluir o atendimento.", supabaseErrorMessage(error, "Tente novamente."));
      return;
    }
    toast.success("Atendimento excluído.");
    setConfirmDelete(false);
    router.refresh();
    onClose();
  }

  const onPorte = (v: string) => {
    set("porte", v);
    if (v === "MEI") set("regime", "MEI");
    else if (f.regime === "MEI") set("regime", "");
  };

  /* ------------------------------------------------------------------ */
  /* Blocos de interface                                                 */
  /* ------------------------------------------------------------------ */
  const moneyField = (k: "proposta_valor" | "valor_fechado", label: string, hint?: string, className = "") => (
    <Field label={label} required error={errors[k]} hint={hint} className={className}>
      <input
        inputMode="decimal"
        className="form-control tabular-nums"
        value={f[k]}
        aria-invalid={errors[k] ? true : undefined}
        onChange={(e) => set(k, maskMoney(e.target.value))}
        placeholder="0,00"
      />
    </Field>
  );

  const dadosLead = (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-6">
      <Input
        label="Data"
        type="date"
        required
        value={f.data}
        onChange={(e) => set("data", e.target.value)}
        error={errors.data}
        wrapperClassName="sm:col-span-2"
      />
      <Input
        label="Lead (nome do cliente)"
        required
        value={f.lead}
        onChange={(e) => set("lead", e.target.value)}
        error={errors.lead}
        wrapperClassName="sm:col-span-4"
        maxLength={200}
      />
      <Input
        label="Telefone"
        inputMode="tel"
        value={f.telefone}
        onChange={(e) => set("telefone", maskPhone(e.target.value))}
        placeholder="(11) 99999-9999"
        wrapperClassName="sm:col-span-2"
      />
      <Input
        label="E-mail"
        type="email"
        value={f.email}
        onChange={(e) => set("email", e.target.value)}
        wrapperClassName="sm:col-span-4"
      />
      <Select
        label="Porte"
        required
        value={f.porte}
        onChange={(e) => onPorte(e.target.value)}
        placeholder="Selecione"
        options={PORTES.map((p) => ({ value: p, label: p }))}
        error={errors.porte}
        wrapperClassName="sm:col-span-2"
      />
      <Select
        label="Regime de faturamento"
        required
        value={f.regime}
        onChange={(e) => set("regime", e.target.value)}
        placeholder="Selecione"
        options={REGIMES.map((p) => ({ value: p, label: p }))}
        error={errors.regime}
        wrapperClassName="sm:col-span-2"
      />
      <Select
        label="Canal de prospecção"
        required
        value={f.canal}
        onChange={(e) => set("canal", e.target.value)}
        placeholder="Selecione"
        options={CANAIS.map((p) => ({ value: p, label: p }))}
        error={errors.canal}
        wrapperClassName="sm:col-span-2"
      />
      {f.canal === "Indicação" && (
        <div className="sm:col-span-6">
          <Input
            label="Quem indicou"
            required
            list="indicadores-list"
            value={f.indicado_por}
            onChange={(e) => set("indicado_por", e.target.value)}
            error={errors.indicado_por}
            hint="Digite o nome de quem indicou. Nomes já usados aparecem como sugestão."
            maxLength={150}
            autoComplete="off"
          />
          <datalist id="indicadores-list">
            {indicadores.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
        </div>
      )}
      <UfMunicipioFields
        required
        value={{ uf: f.uf, municipio: f.municipio, municipio_ibge: f.municipio_ibge }}
        onChange={(v) => {
          setF((s) => ({ ...s, ...v }));
          setErrors((er) => ({ ...er, uf: undefined, municipio: undefined }));
        }}
        errors={{ uf: errors.uf, municipio: errors.municipio }}
        ufClassName="sm:col-span-2"
        municipioClassName="sm:col-span-4"
      />
      <Select
        label="Responsável"
        required
        value={f.responsavel_id}
        onChange={(e) => set("responsavel_id", e.target.value)}
        placeholder={vendedoresAtivos.length ? "Selecione" : "Nenhum vendedor cadastrado"}
        options={vendedoresAtivos.map((v) => ({ value: v.id, label: v.nome }))}
        error={errors.responsavel_id}
        hint={vendedoresAtivos.length ? undefined : "Cadastre vendedores no módulo Metas."}
        wrapperClassName="sm:col-span-3"
      />
      <Select
        label="Campanha"
        value={f.campanha_id}
        onChange={(e) => set("campanha_id", e.target.value)}
        placeholder="Sem campanha"
        options={campanhas.map((c) => ({ value: c.id, label: c.nome }))}
        wrapperClassName="sm:col-span-3"
      />
      {/* O meio de contato é perguntado apenas aqui, no registro do lead (1º contato) */}
      <Field
        label="Meio do primeiro contato"
        required={!editing}
        error={errors.meio_contato_inicial}
        className="sm:col-span-6"
      >
        <MeioContatoPicker
          value={f.meio_contato_inicial}
          onChange={(v) => set("meio_contato_inicial", v)}
          invalid={Boolean(errors.meio_contato_inicial)}
        />
      </Field>
    </div>
  );

  /** Campos específicos da etapa de destino. */
  const camposEtapa = (
    <>
      {(isAgendado || isVisitaRealizada) && (
        <Input
          label={isAgendado ? "Data da visita/reunião agendada" : "Data da visita/reunião"}
          type="date"
          required={isAgendado}
          value={f.data_visita}
          onChange={(e) => set("data_visita", e.target.value)}
          error={errors.data_visita}
          wrapperClassName="max-w-xs"
        />
      )}

      {isVisitaRealizada && (
        <Field label="O que foi realizado" required error={errors.tipo_visita}>
          <div role="radiogroup" aria-label="Tipo" className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {TIPOS_VISITA.map((t) => {
              const sel = f.tipo_visita === t;
              return (
                <button
                  key={t}
                  type="button"
                  role="radio"
                  aria-checked={sel}
                  onClick={() => set("tipo_visita", t)}
                  className={`flex h-10 items-center justify-center rounded-md border text-sm transition-colors ${
                    sel
                      ? "border-accent bg-accent-soft font-medium text-[#1d4ed8]"
                      : errors.tipo_visita
                        ? "border-danger/60 bg-surface text-fg hover:bg-gray-50"
                        : "border-line-strong bg-surface text-fg hover:bg-gray-50"
                  }`}
                >
                  {t}
                </button>
              );
            })}
          </div>
        </Field>
      )}

      {mostraChecklist && (
        <Checklist valores={chk} onChange={mudarChecklist} erros={chkErros} produtos={produtos.filter((p) => p.ativo || chk.q_produtos.includes(p.id))} obrigatorio={exigeChecklist} />
      )}

      {isProposta && (
        <div className="grid grid-cols-1 gap-4 rounded-[10px] border border-[#fde68a] bg-warning-soft/60 p-4 sm:grid-cols-3">
          <p className="flex items-center gap-2 text-sm font-medium text-fg sm:col-span-3">
            <FileText className="size-4 text-warning" aria-hidden /> Dados da proposta
          </p>
          <Select
            label="Serviço / pacote proposto"
            required
            value={f.proposta_produto_id}
            onChange={(e) => set("proposta_produto_id", e.target.value)}
            placeholder={produtoOptions.length ? "Selecione" : "Nenhum serviço cadastrado"}
            options={produtoOptions}
            error={errors.proposta_produto_id}
            wrapperClassName="sm:col-span-3"
          />
          {moneyField("proposta_valor", "Valor proposto (R$)", "Entra na projeção de faturamento do dashboard.", "sm:col-span-2")}
          <Input
            label="Data da proposta"
            type="date"
            value={f.data_proposta || todayISO()}
            onChange={(e) => set("data_proposta", e.target.value)}
          />
        </div>
      )}

      {isEfetivado && (
        <div className="grid grid-cols-1 gap-4 rounded-[10px] border border-[#bbf7d0] bg-success-soft/60 p-4 sm:grid-cols-3">
          {temProposta ? (
            <>
              <div className="rounded-md border border-line bg-surface p-3 text-sm sm:col-span-3">
                <p className="text-xs text-fg-2">Proposta enviada{f.data_proposta ? ` em ${formatDate(f.data_proposta)}` : ""}</p>
                <p className="mt-0.5 font-medium text-fg">
                  {produtoNome(f.proposta_produto_id)} — {formatBRL(parseMoney(f.proposta_valor))}
                </p>
              </div>
              <fieldset className="sm:col-span-3">
                <legend className="field-label">
                  O pacote e o valor foram fechados conforme a proposta?<span className="ml-0.5 text-danger">*</span>
                </legend>
                <div className="flex flex-wrap gap-2">
                  {[
                    { v: "sim" as const, l: "Sim, conforme a proposta" },
                    { v: "nao" as const, l: "Não, houve alteração" },
                  ].map((o) => (
                    <label
                      key={o.v}
                      className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors ${
                        f.conforme_proposta === o.v ? "border-accent bg-accent-soft/60" : "border-line bg-surface hover:bg-gray-50"
                      }`}
                    >
                      <input
                        type="radio"
                        name="conforme"
                        checked={f.conforme_proposta === o.v}
                        onChange={() => {
                          setF((s) => ({
                            ...s,
                            conforme_proposta: o.v,
                            produto_id: o.v === "nao" && !s.produto_id ? s.proposta_produto_id : s.produto_id,
                            valor_fechado: o.v === "nao" && !s.valor_fechado ? s.proposta_valor : s.valor_fechado,
                          }));
                          setErrors((e) => ({ ...e, conforme_proposta: undefined }));
                        }}
                        className="size-4 accent-[#2563eb]"
                      />
                      {o.l}
                    </label>
                  ))}
                </div>
                {errors.conforme_proposta && <p className="field-error">{errors.conforme_proposta}</p>}
              </fieldset>
            </>
          ) : (
            <p className="text-[13px] text-fg-2 sm:col-span-3">
              Este atendimento não passou pela etapa de proposta. Informe o serviço e o valor fechados.
            </p>
          )}

          {(!temProposta || f.conforme_proposta === "nao") && (
            <>
              <Select
                label="Serviço / pacote fechado"
                required
                value={f.produto_id}
                onChange={(e) => set("produto_id", e.target.value)}
                placeholder="Selecione"
                options={produtoOptions}
                error={errors.produto_id}
                wrapperClassName="sm:col-span-3"
              />
              {moneyField("valor_fechado", "Valor fechado (R$)", "Alimenta o faturamento do dashboard.", "sm:col-span-2")}
            </>
          )}
          <Input
            label="Data de fechamento"
            type="date"
            value={f.data_fechamento || todayISO()}
            onChange={(e) => set("data_fechamento", e.target.value)}
          />
        </div>
      )}

      {isDeclinado && (
        <div className="grid grid-cols-1 gap-4 rounded-[10px] border border-[#fecaca] bg-danger-soft/60 p-4">
          <Field label="Motivos do declínio" required error={errors.motivos_declinio} htmlFor="motivos">
            <MultiSelect
              id="motivos"
              options={MOTIVOS_DECLINIO}
              value={f.motivos_declinio}
              onChange={(v) => set("motivos_declinio", v)}
              placeholder="Selecione um ou mais motivos"
              invalid={Boolean(errors.motivos_declinio)}
            />
          </Field>
          {f.motivos_declinio.includes("Outro") && (
            <Input
              label="Descreva o motivo"
              required
              value={f.motivo_declinio_outro}
              onChange={(e) => set("motivo_declinio_outro", e.target.value)}
              error={errors.motivo_declinio_outro}
            />
          )}
          <p className="flex items-center gap-2 text-xs text-fg-2">
            <RefreshCcw className="size-3.5" aria-hidden />
            {giro && giro.status === "ativo"
              ? `No Giro de Carteira — ${giro.etapa}º giro previsto para ${formatDate(giro.proxima_data)}.`
              : `Ao salvar, o lead entra no Giro de Carteira com o 1º giro agendado para ${GIRO_INTERVALO_DIAS} dias.`}
          </p>
        </div>
      )}
    </>
  );

  const observacaoEAnexos = (
    <>
      <Textarea
        label={`Nova observação — ${STATUS_MAP[f.status].label}`}
        value={f.observacao_etapa}
        onChange={(e) => set("observacao_etapa", e.target.value)}
        rows={4}
        placeholder="O que aconteceu neste contato? Necessidades do cliente, combinados, próximos passos..."
        hint={
          editing && !mudouEtapa
            ? "Adiciona um novo registro à etapa atual, sem apagar os anteriores."
            : "O registro fica na etapa correspondente da linha do tempo."
        }
      />
      <Field label="Anexos">
        <AnexosPicker files={arquivos} onChange={setArquivos} onError={(m) => toast.error("Arquivo não adicionado.", m)} />
      </Field>
    </>
  );

  const rotuloPrincipal = !editing
    ? "Registrar atendimento"
    : acao === "declinar" && mudouEtapa
      ? "Confirmar declínio"
      : avancou
        ? "Concluir e avançar"
        : mudouEtapa
          ? "Alterar etapa"
          : temRegistro
            ? "Adicionar registro"
            : "Salvar alterações";

  return (
    <>
      <Modal
        open
        variant="side"
        size="lg"
        onClose={onClose}
        title={editing ? atendimento.lead : "Novo atendimento"}
        description={
          editing
            ? `Registrado em ${formatDate(atendimento.data)} · ${vendedorNome(atendimento.responsavel_id ?? "")}`
            : "Preencha os dados do lead atendido."
        }
        footer={
          <>
            {editing && podeExcluir && (
              <Button
                variant="ghost"
                className="mr-auto text-danger hover:bg-danger-soft hover:text-danger"
                icon={<Trash2 className="size-4" />}
                onClick={() => setConfirmDelete(true)}
              >
                Excluir
              </Button>
            )}
            <Button variant="secondary" onClick={onClose}>
              {verEtapa ? "Fechar" : "Cancelar"}
            </Button>
            {!verEtapa && (
              <Button onClick={save} loading={saving} variant={acao === "declinar" && mudouEtapa ? "danger" : "primary"}>
                {rotuloPrincipal}
              </Button>
            )}
          </>
        }
      >
        <form
          className="space-y-6"
          onSubmit={(e) => {
            e.preventDefault();
            if (!verEtapa) save();
          }}
        >
          {/* ESTEIRA: etapas alcançadas são clicáveis para consulta */}
          {editing && (
            <section className="rounded-[10px] border border-line bg-gray-50/60 px-3 pt-3 pb-2">
              <EtapasStepper
                status={atendimento.status}
                etapaMaxima={atendimento.etapa_maxima}
                historico={historico}
                selecionada={verEtapa}
                onSelecionar={selecionarEtapa}
              />
              <p className="px-1 pb-1 text-[11px] text-fg-3">Clique em uma etapa já alcançada para ver o que foi preenchido nela.</p>
            </section>
          )}

          {/* DADOS DO LEAD */}
          <section>
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-fg">Dados do lead</h3>
              {editing && !editarDados && (
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<Pencil className="size-3.5" />}
                  onClick={() => {
                    setVerEtapa(null);
                    setEditarDados(true);
                  }}
                >
                  Editar dados
                </Button>
              )}
            </div>
            {editarDados ? (
              dadosLead
            ) : (
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-[10px] bg-gray-50 p-4 text-sm sm:grid-cols-3">
                <Info label="Porte / Regime" value={`${f.porte} · ${f.regime}`} />
                <Info label="Canal" value={f.canal === "Indicação" && f.indicado_por ? `Indicação — ${f.indicado_por}` : f.canal} />
                <Info label="Município" value={f.municipio ? `${f.municipio}/${f.uf}` : "—"} />
                <Info label="Telefone" value={f.telefone || "—"} />
                <Info label="E-mail" value={f.email || "—"} />
                <Info label="Meio do 1º contato" value={f.meio_contato_inicial || "—"} />
                <Info label="Campanha" value={f.campanha_id ? campanhaNome(f.campanha_id) : "Sem campanha"} className="col-span-2 sm:col-span-3" />
              </dl>
            )}
          </section>

          {/* CONSULTA DE ETAPA ANTERIOR  ×  ATUALIZAÇÃO */}
          {editing && verEtapa ? (
            <EtapaDetalhe
              status={verEtapa}
              atendimento={atendimento}
              produtos={produtos}
              historico={historico}
              notas={notas}
              anexos={anexos}
              links={links}
              emAndamento={verEtapa === atendimento.status}
              onVoltar={() => setVerEtapa(null)}
            />
          ) : editing ? (
            <section className="rounded-[12px] border border-line p-4 shadow-soft">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-fg">Registrar atualização</h3>
                <span className="flex items-center gap-1.5 text-xs text-fg-2">
                  Etapa atual: <StatusBadge status={atendimento.status} />
                </span>
              </div>

              <div role="radiogroup" aria-label="O que deseja fazer" className="mb-5 space-y-2">
                <Opcao
                  sel={acao === "manter"}
                  onSelect={() => escolherAcao("manter")}
                  titulo="Continuar nesta etapa"
                  descricao="Adiciona um registro à etapa atual (ex.: mais uma ligação) ou atualiza informações."
                  icone={<MessageSquarePlus className="size-4" />}
                />
                {proxima && (
                  <Opcao
                    sel={acao === "avancar"}
                    onSelect={() => escolherAcao("avancar")}
                    titulo={`Concluir etapa e avançar para ${proxima.label}`}
                    descricao={
                      atendimento.status === "qualificacao"
                        ? "O checklist de qualificação precisa estar completo."
                        : "Move o lead para a próxima etapa da esteira."
                    }
                    icone={<MoveRight className="size-4" />}
                  />
                )}
                {statusOriginal !== "negocio_declinado" && statusOriginal !== "negocio_efetivado" && (
                  <Opcao
                    sel={acao === "declinar"}
                    onSelect={() => escolherAcao("declinar")}
                    titulo="Declinar negócio"
                    descricao={`Encerra a negociação e envia o lead ao Giro de Carteira (retorno em ${GIRO_INTERVALO_DIAS} dias).`}
                    icone={<Ban className="size-4" />}
                    tom="danger"
                  />
                )}
                <Opcao
                  sel={acao === "outra"}
                  onSelect={() => escolherAcao("outra")}
                  titulo={statusOriginal === "negocio_declinado" ? "Reabrir em outra etapa" : "Mover para outra etapa"}
                  descricao="Corrige a etapa do lead (voltar ou pular etapas)."
                  icone={<History className="size-4" />}
                >
                  <Select
                    aria-label="Etapa de destino"
                    value={outraStatus}
                    onChange={(e) => escolherOutra(e.target.value as StatusAtendimento | "")}
                    placeholder="Selecione a etapa"
                    options={STATUS.filter((s) => s.value !== statusOriginal).map((s) => ({ value: s.value, label: s.label }))}
                    error={errors.status}
                  />
                </Opcao>
              </div>

              {mudouEtapa && statusOriginal && (
                <p className="mb-4 flex flex-wrap items-center gap-2 rounded-md bg-accent-soft px-3 py-2 text-[13px] text-[#1d4ed8]">
                  <StatusBadge status={statusOriginal} />
                  <MoveRight className="size-3.5" aria-hidden />
                  <StatusBadge status={f.status} />
                  <span>Preencha o que a nova etapa pede e confirme no botão abaixo.</span>
                </p>
              )}

              <div className="space-y-4">
                {camposEtapa}
                {observacaoEAnexos}
              </div>

              {!mudouEtapa && statusOriginal === "qualificacao" && checklistCompleto && (
                <p className="mt-4 flex items-center gap-1.5 text-xs text-[#15803d]">
                  <CheckCircle2 className="size-3.5" aria-hidden /> Checklist completo: o lead já pode avançar para a próxima etapa.
                </p>
              )}
            </section>
          ) : (
            <section className="border-t border-line pt-5">
              <h3 className="mb-3 text-sm font-semibold text-fg">Status inicial</h3>
              <div className="space-y-4">
                <Select
                  label="Status"
                  required
                  value={f.status}
                  onChange={(e) => onStatusInicial(e.target.value as StatusAtendimento)}
                  options={STATUS.map((s) => ({ value: s.value, label: s.label }))}
                  wrapperClassName="max-w-xs"
                />
                {camposEtapa}
                {observacaoEAnexos}
              </div>
            </section>
          )}

          {/* LINHA DO TEMPO */}
          {editing && (
            <section>
              <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-fg">
                <History className="size-4 text-fg-2" aria-hidden /> Linha do tempo
              </h3>
              <TimelineList
                historico={historico}
                notas={notas}
                anexos={anexos}
                links={links}
                podeExcluirNota={podeExcluirNota}
                onExcluirNota={setNotaExcluir}
              />
            </section>
          )}
          <button type="submit" hidden />
        </form>
      </Modal>

      <ConfirmDialog
        open={notaExcluir !== null}
        title="Excluir registro?"
        description="O registro e os anexos dele serão removidos da linha do tempo. Esta ação não pode ser desfeita."
        onConfirm={excluirNota}
        onClose={() => setNotaExcluir(null)}
      />
      <ConfirmDialog
        open={confirmDelete}
        title="Excluir atendimento?"
        description={`O atendimento de "${atendimento?.lead}" será removido da listagem, junto com a linha do tempo, os anexos e o Giro de Carteira vinculados. Esta ação não pode ser desfeita.`}
        loading={deleting}
        onConfirm={remove}
        onClose={() => setConfirmDelete(false)}
      />
    </>
  );
}

/** Opção do seletor "o que deseja fazer" (uma única ação de salvar no rodapé). */
function Opcao({
  sel,
  onSelect,
  titulo,
  descricao,
  icone,
  tom = "default",
  children,
}: {
  sel: boolean;
  onSelect: () => void;
  titulo: string;
  descricao: string;
  icone: React.ReactNode;
  tom?: "default" | "danger";
  children?: React.ReactNode;
}) {
  return (
    <div
      className={`rounded-md border p-3 transition-colors ${
        sel
          ? tom === "danger"
            ? "border-danger bg-danger-soft/60"
            : "border-accent bg-accent-soft/50"
          : "border-line bg-surface hover:bg-gray-50"
      }`}
    >
      <button type="button" role="radio" aria-checked={sel} onClick={onSelect} className="flex w-full items-start gap-3 text-left">
        <span
          className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md ${
            sel ? (tom === "danger" ? "bg-danger text-white" : "bg-accent text-white") : "bg-gray-100 text-fg-2"
          }`}
        >
          {icone}
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-medium text-fg">{titulo}</span>
          <span className="block text-xs text-fg-2">{descricao}</span>
        </span>
      </button>
      {sel && children && <div className="mt-3 pl-11">{children}</div>}
    </div>
  );
}

function Info({ label, value, className = "" }: { label: string; value: string; className?: string }) {
  return (
    <div className={`min-w-0 ${className}`}>
      <dt className="text-xs text-fg-2">{label}</dt>
      <dd className="mt-0.5 truncate font-medium text-fg" title={value}>
        {value}
      </dd>
    </div>
  );
}
