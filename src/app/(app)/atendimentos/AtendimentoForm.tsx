"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Ban, FileText, History, Loader2, MoveRight, Pencil, RefreshCcw, Search, Shuffle, Trash2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { MultiSelect } from "@/components/ui/MultiSelect";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { StatusBadge } from "@/components/StatusBadge";
import { UfMunicipioFields } from "@/components/UfMunicipioFields";
import { createClient } from "@/lib/supabase/client";
import { cnpjValido } from "@/lib/cnpj";
import { fetchMunicipios } from "@/lib/ibge";
import { consultarCnpj } from "./actions";
import {
  CANAIS,
  ETAPA_AGENDADO,
  GIRO_INTERVALO_DIAS,
  MOTIVOS_DECLINIO,
  NAO_INFORMADO,
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
  maskCnpj,
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
  cnpj: string;
  contato_nome: string;
  porte: string;
  regime: string;
  canal: string;
  indicado_por: string;
  uf: string;
  municipio: string;
  municipio_ibge: number | null;
  /** Meio do PRIMEIRO contato — informado apenas no registro do lead. */
  meio_contato_inicial: MeioContato | "";
  /** Etapa escolhida no registro do lead (depois, a etapa só muda pelas ações da esteira). */
  status: StatusAtendimento;
  responsavel_id: string;
  campanha_id: string;
  /** Texto do novo registro (observação) desta atualização. */
  observacao_etapa: string;
  data_visita: string;
  tipo_visita: TipoVisita | "";
  proposta_produtos: string[];
  proposta_valor: string;
  data_proposta: string;
  conforme_proposta: "" | "sim" | "nao";
  produtos_fechados: string[];
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
    cnpj: a?.cnpj ?? "",
    contato_nome: a?.contato_nome ?? "",
    // "Não informado" (leads importados) é tratado como pendente: a tela exige escolher um valor real
    porte: a?.porte && a.porte !== NAO_INFORMADO ? a.porte : "",
    regime: a?.regime && a.regime !== NAO_INFORMADO ? a.regime : "",
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
    proposta_produtos: a?.proposta_produtos ?? [],
    proposta_valor: moneyToInput(a?.proposta_valor),
    data_proposta: a?.data_proposta ?? "",
    conforme_proposta: a?.conforme_proposta === true ? "sim" : a?.conforme_proposta === false ? "nao" : "",
    produtos_fechados: a?.produtos_fechados ?? [],
    valor_fechado: moneyToInput(a?.valor_fechado),
    data_fechamento: a?.data_fechamento ?? "",
    motivos_declinio: a?.motivos_declinio ?? [],
    motivo_declinio_outro: a?.motivo_declinio_outro ?? "",
  };
}

const CAMPOS_LEAD = [
  "cnpj",
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

type Erros = Partial<Record<keyof FormState, string>>;

/** O checklist de qualificação é obrigatório para entrar em Agendado Visita ou etapas seguintes. */
const exigeChecklist = (s: StatusAtendimento) => STATUS_MAP[s].etapa >= ETAPA_AGENDADO;

/** Campos do lead preenchidos pela consulta do CNPJ (para não sobrescrever o que a pessoa digitou). */
type AutoPreenchido = Partial<Record<"lead" | "porte" | "regime" | "telefone" | "email" | "municipio", string>>;
type StatusCnpj = { estado: "idle" | "carregando" | "ok" | "aviso" | "erro"; msg: string };

const PALAVRAS_MINUSCULAS = new Set(["de", "da", "do", "das", "dos", "e"]);
/** "SAO JOSE DOS CAMPOS" → "São José dos Campos" só até o ponto de manter legível (usado se o IBGE falhar). */
const capitalizar = (s: string) =>
  s
    .toLowerCase()
    .split(" ")
    .map((p, i) => (i > 0 && PALAVRAS_MINUSCULAS.has(p) ? p : p.charAt(0).toUpperCase() + p.slice(1)))
    .join(" ");

/** Movimento de etapa em andamento (janela de confirmação). */
type Movimento = { modo: "avancar" | "declinar" | "mover"; alvo: StatusAtendimento | "" };

function AtendimentoFormInner({
  atendimento: atendimentoInicial,
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
  const editing = atendimentoInicial !== null;

  // Cópia local do atendimento: após cada gravação é relida, para a tela já mostrar a nova etapa
  const [atendimento, setAtendimento] = useState<Atendimento | null>(atendimentoInicial);
  const [f, setF] = useState<FormState>(() => initialState(atendimentoInicial, meuVendedorId));
  const [chk, setChk] = useState<ChecklistValores>(() => checklistDe(atendimentoInicial));
  const [chkErros, setChkErros] = useState<ChecklistErros>({});
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [editarDados, setEditarDados] = useState(!editing);
  /** Etapa anterior em consulta (somente leitura). null = painel de atualização. */
  const [verEtapa, setVerEtapa] = useState<StatusAtendimento | null>(null);
  const [mover, setMover] = useState<Movimento | null>(null);
  const [obsDestino, setObsDestino] = useState("");
  const [erroAlvo, setErroAlvo] = useState("");
  const [errors, setErrors] = useState<Erros>({});
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
  const [cnpjStatus, setCnpjStatus] = useState<StatusCnpj>({ estado: "idle", msg: "" });
  /** CNPJ (só dígitos) cuja consulta está valendo; respostas de CNPJs antigos são descartadas. */
  const cnpjConsultado = useRef("");
  const autoPreenchido = useRef<AutoPreenchido>({});

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
  /** Etapa gravada do atendimento (no registro do lead, a escolhida no formulário). */
  const statusOriginal = atendimento?.status ?? null;
  const statusPainel: StatusAtendimento = statusOriginal ?? f.status;
  const etapaOriginal = statusOriginal ? STATUS_MAP[statusOriginal].etapa : 0;
  const temProposta = parseMoney(f.proposta_valor) > 0;
  const checklistCompleto = checklistPendencias(chk).length === 0;

  // Próxima etapa do funil (a seguinte à etapa atual do atendimento)
  const proxima = statusOriginal && etapaOriginal > 0 && etapaOriginal < 6 ? STATUS.find((s) => s.etapa === etapaOriginal + 1) : null;
  const podeDeclinar = statusOriginal !== null && statusOriginal !== "negocio_declinado" && statusOriginal !== "negocio_efetivado";

  const temRegistro = Boolean(f.observacao_etapa.trim() || arquivos.length);
  const podeExcluirNota = (n: NotaRow) => podeExcluir || n.usuario_id === meuUsuarioId;

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

  const produtoOptions = (selecionados: string[]) =>
    produtos
      .filter((p) => p.ativo || selecionados.includes(p.id))
      .map((p) => ({ value: p.id, label: `${p.nome} (${RECORRENCIA_LABEL[p.recorrencia]})` }));
  const nomesProdutos = (ids: string[]) => ids.map((id) => produtos.find((p) => p.id === id)?.nome ?? "Serviço removido").join(", ");
  const vendedoresAtivos = useMemo(
    () => vendedores.filter((v) => v.ativo || v.id === f.responsavel_id),
    [vendedores, f.responsavel_id],
  );
  const vendedorNome = (id: string) => vendedores.find((v) => v.id === id)?.nome ?? "—";
  const campanhaNome = (id: string) => campanhas.find((c) => c.id === id)?.nome ?? "—";

  /* ------------------------------------------------------------------ */
  /* Validação                                                           */
  /* ------------------------------------------------------------------ */
  function errosLead(): Erros {
    const e: Erros = {};
    if (!f.data) e.data = "Informe a data.";
    if (!f.lead.trim()) e.lead = "Informe o nome do cliente.";
    const cnpjDigitos = f.cnpj.replace(/\D/g, "");
    if (f.cnpj && cnpjDigitos.length !== 14) e.cnpj = "O CNPJ deve ter 14 dígitos.";
    else if (cnpjDigitos && cnpjDigitos !== (atendimento?.cnpj ?? "").replace(/\D/g, "") && !cnpjValido(cnpjDigitos))
      e.cnpj = "CNPJ inválido. Confira os números digitados.";
    if (!f.porte) e.porte = "Selecione o porte.";
    if (!f.regime) e.regime = "Selecione o regime.";
    if (!f.canal) e.canal = "Selecione o canal.";
    if (f.canal === "Indicação" && !f.indicado_por.trim()) e.indicado_por = "Informe quem indicou.";
    if (!f.uf) e.uf = "Selecione a UF.";
    if (!f.municipio) e.municipio = "Selecione o município.";
    if (!f.responsavel_id) e.responsavel_id = "Selecione o responsável.";
    if (!editing && !f.meio_contato_inicial) e.meio_contato_inicial = "Informe o meio do primeiro contato.";
    return e;
  }

  /** O que a etapa `s` exige. */
  function errosEtapa(s: StatusAtendimento): Erros {
    const e: Erros = {};
    if (s === "agendado_visita" && !f.data_visita) e.data_visita = "Informe a data da visita agendada.";
    if (s === "visita_realizada" && !f.tipo_visita) e.tipo_visita = "Informe se foi visita ou reunião no escritório.";
    if (s === "proposta_enviada") {
      if (f.proposta_produtos.length === 0) e.proposta_produtos = "Selecione ao menos um serviço/pacote.";
      if (parseMoney(f.proposta_valor) <= 0) e.proposta_valor = "Informe o valor total da proposta.";
    }
    if (s === "negocio_efetivado") {
      const conforme = temProposta && f.conforme_proposta === "sim";
      if (temProposta && !f.conforme_proposta) e.conforme_proposta = "Confirme se o fechamento foi conforme a proposta.";
      if (!conforme) {
        if (f.produtos_fechados.length === 0) e.produtos_fechados = "Selecione ao menos um serviço/pacote fechado.";
        if (parseMoney(f.valor_fechado) <= 0) e.valor_fechado = "Informe o valor fechado.";
      }
    }
    if (s === "negocio_declinado") {
      if (f.motivos_declinio.length === 0) e.motivos_declinio = "Selecione ao menos um motivo.";
      if (f.motivos_declinio.includes("Outro") && !f.motivo_declinio_outro.trim()) e.motivo_declinio_outro = "Descreva o motivo.";
    }
    return e;
  }

  /** Lead importado gravando sem mudar de etapa: os dados da etapa atual só são cobrados ao avançar. */
  const soManterImportado = (alvo: StatusAtendimento) => Boolean(atendimento?.importado) && editing && alvo === atendimento?.status;

  /** Valida o dado do lead + as exigências da etapa de destino e mostra os erros. */
  function validarTudo(alvo: StatusAtendimento) {
    // Lead importado, sem mudar de etapa: os dados da etapa atual (proposta, checklist…) só são cobrados ao avançar
    const soManter = soManterImportado(alvo);
    const e = { ...errosLead(), ...(soManter ? {} : errosEtapa(alvo)) };
    const ce = !soManter && exigeChecklist(alvo) ? checklistErros(chk) : {};
    setErrors(e);
    setChkErros(ce);
    if (CAMPOS_LEAD.some((k) => e[k])) setEditarDados(true);
    return Object.keys(e).length === 0 && Object.keys(ce).length === 0;
  }

  /* ------------------------------------------------------------------ */
  /* Gravação                                                            */
  /* ------------------------------------------------------------------ */
  async function etapaMaisRecente(atendimentoId: string) {
    const { data } = await supabase
      .from("atendimento_historico")
      .select("id")
      .eq("atendimento_id", atendimentoId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return (data as { id: string } | null)?.id ?? null;
  }

  async function criarNota(
    atendimentoId: string,
    historicoId: string | null,
    status: StatusAtendimento,
    texto: string,
    files: File[],
    meio: MeioContato | "",
  ) {
    const { data: nota, error } = await supabase
      .from("atendimento_notas")
      .insert({
        atendimento_id: atendimentoId,
        historico_id: historicoId,
        status,
        meio_contato: meio || null,
        texto: texto.trim() || null,
      })
      .select("id")
      .single();
    if (error || !nota) return { ok: false as const, erro: error, falhas: [] as string[] };
    const { falhas } = files.length
      ? await enviarAnexos(supabase, atendimentoId, (nota as { id: string }).id, files)
      : { falhas: [] as string[] };
    return { ok: true as const, erro: null, falhas };
  }

  /**
   * Grava o atendimento. `destino` = nova etapa (avançar/declinar/mover); sem ele, a etapa
   * não muda (apenas dados e registros). Retorna true se gravou.
   */
  async function salvar(destino?: StatusAtendimento, observacaoDestino = ""): Promise<boolean> {
    const alvo: StatusAtendimento = editing ? (destino ?? statusOriginal!) : f.status;
    const mudou = editing && alvo !== statusOriginal;

    if (!validarTudo(alvo)) {
      toast.error(
        "Não foi possível salvar o atendimento.",
        exigeChecklist(alvo) && !checklistCompleto && !soManterImportado(alvo)
          ? "Complete o checklist de qualificação para avançar de etapa."
          : "Verifique os campos destacados e tente novamente.",
      );
      return false;
    }
    setSaving(true);

    const fechouConforme = alvo === "negocio_efetivado" && temProposta && f.conforme_proposta === "sim";
    const proposta = {
      proposta_produtos: f.proposta_produtos,
      proposta_valor: temProposta ? parseMoney(f.proposta_valor) : null,
      data_proposta: temProposta ? f.data_proposta || null : null,
    };
    const fechamento =
      alvo === "negocio_efetivado"
        ? {
            produtos_fechados: fechouConforme ? f.proposta_produtos : f.produtos_fechados,
            valor_fechado: fechouConforme ? proposta.proposta_valor : parseMoney(f.valor_fechado),
            data_fechamento: f.data_fechamento || todayISO(),
            conforme_proposta: temProposta ? f.conforme_proposta === "sim" : null,
          }
        : {
            produtos_fechados: atendimento?.produtos_fechados ?? [],
            valor_fechado: atendimento?.valor_fechado ?? null,
            data_fechamento: null,
            conforme_proposta: null,
          };

    const payload = {
      data: f.data,
      lead: f.lead.trim(),
      telefone: f.telefone || null,
      email: f.email.trim() || null,
      cnpj: f.cnpj ? maskCnpj(f.cnpj) : null,
      contato_nome: f.contato_nome.trim() || null,
      porte: f.porte,
      regime: f.regime,
      canal: f.canal,
      indicado_por: f.canal === "Indicação" ? f.indicado_por.trim() : null,
      uf: f.uf || null,
      municipio: f.municipio || null,
      municipio_ibge: f.municipio_ibge,
      meio_contato_inicial: f.meio_contato_inicial || null,
      status: alvo,
      responsavel_id: f.responsavel_id || null,
      campanha_id: f.campanha_id || null,
      data_visita: f.data_visita || null,
      tipo_visita: f.tipo_visita || null,
      ...checklistParaBanco(chk),
      ...proposta,
      ...fechamento,
      motivos_declinio: alvo === "negocio_declinado" ? f.motivos_declinio : [],
      motivo_declinio_outro:
        alvo === "negocio_declinado" && f.motivos_declinio.includes("Outro") ? f.motivo_declinio_outro.trim() : null,
    };

    // Ao mudar de etapa, o texto/anexos já digitados no painel pertencem à etapa que está sendo concluída
    const etapaAntiga = editing && mudou && temRegistro ? await etapaMaisRecente(atendimento!.id) : null;

    // 1) Atendimento (a mudança de etapa cria a nova linha na linha do tempo)
    let atendimentoId = atendimento?.id ?? "";
    if (editing) {
      // .select("id") confirma que o banco realmente alterou a linha (sem isso, uma gravação bloqueada
      // por permissão ou por sessão expirada passaria como sucesso)
      const { data: alterados, error } = await supabase.from("atendimentos").update(payload).eq("id", atendimento!.id).select("id");
      if (error || !alterados?.length) {
        setSaving(false);
        toast.error(
          "Não foi possível salvar o atendimento.",
          error
            ? supabaseErrorMessage(error, "Tente novamente em instantes.")
            : "A alteração não foi gravada. Sua sessão pode ter expirado: recarregue a página e entre novamente.",
        );
        return false;
      }
    } else {
      const { data, error } = await supabase.from("atendimentos").insert(payload).select("id").single();
      if (error || !data) {
        setSaving(false);
        toast.error("Não foi possível salvar o atendimento.", supabaseErrorMessage(error, "Tente novamente em instantes."));
        return false;
      }
      atendimentoId = (data as { id: string }).id;
    }

    // 2) Registros (observações + anexos)
    const falhasAnexo: string[] = [];
    let erroNota: unknown = null;
    const registrar = async (r: Awaited<ReturnType<typeof criarNota>>) => {
      if (!r.ok) erroNota = r.erro ?? true;
      falhasAnexo.push(...r.falhas);
    };
    if (!editing) {
      // registro do lead: o 1º registro leva o meio do primeiro contato
      await registrar(await criarNota(atendimentoId, await etapaMaisRecente(atendimentoId), f.status, f.observacao_etapa, arquivos, f.meio_contato_inicial));
    } else if (mudou) {
      if (temRegistro) await registrar(await criarNota(atendimentoId, etapaAntiga, statusOriginal!, f.observacao_etapa, arquivos, ""));
      if (observacaoDestino.trim())
        await registrar(await criarNota(atendimentoId, await etapaMaisRecente(atendimentoId), alvo, observacaoDestino, [], ""));
    } else if (temRegistro) {
      await registrar(await criarNota(atendimentoId, await etapaMaisRecente(atendimentoId), statusOriginal!, f.observacao_etapa, arquivos, ""));
    }

    // 3) Feedback
    const virouDeclinado = alvo === "negocio_declinado" && statusOriginal !== "negocio_declinado";
    const avancou = mudou && STATUS_MAP[alvo].etapa > etapaOriginal;
    toast.success(
      !editing
        ? "Atendimento registrado com sucesso."
        : mudou
          ? alvo === "negocio_declinado"
            ? "Negócio declinado."
            : avancou
              ? `Etapa concluída. O lead agora está em ${STATUS_MAP[alvo].label}.`
              : `Lead movido para ${STATUS_MAP[alvo].label}.`
          : temRegistro
            ? "Registro adicionado à linha do tempo."
            : "Atendimento atualizado com sucesso.",
      virouDeclinado ? `O lead foi enviado para o Giro de Carteira (1º giro em ${GIRO_INTERVALO_DIAS} dias).` : undefined,
    );
    if (erroNota) toast.error("O atendimento foi salvo, mas o registro da etapa não.", supabaseErrorMessage(erroNota as { code?: string }, "Tente novamente."));
    if (falhasAnexo.length) toast.error("Alguns anexos não foram enviados.", falhasAnexo.join(", "));

    if (!editing) {
      setSaving(false);
      router.refresh();
      onClose();
      return true;
    }

    // Edição: relê o atendimento e permanece na tela, já mostrando a etapa gravada
    const { data: novo } = await supabase.from("atendimentos").select("*").eq("id", atendimentoId).single();
    if (novo) {
      const a = novo as Atendimento;
      setAtendimento(a);
      setF(initialState(a, meuVendedorId));
      setChk(checklistDe(a));
      setArquivos([]);
      setEditarDados(false);
      setVerEtapa(null);
    }
    setErrors({});
    setChkErros({});
    setSaving(false);
    router.refresh();
    return true;
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

  /* ------------------------------------------------------------------ */
  /* Ações da esteira                                                    */
  /* ------------------------------------------------------------------ */
  /** O que falta preencher para ENTRAR na etapa `s` (vazio = pode gravar direto). */
  function faltaParaEntrar(s: StatusAtendimento) {
    return Object.keys(errosEtapa(s)).length > 0 || (exigeChecklist(s) && !checklistCompleto);
  }

  /** Clique em "Concluir etapa e avançar", "Declinar" ou "Mover": valida o painel e grava ou pede o que falta. */
  async function iniciarMovimento(modo: Movimento["modo"], alvo: StatusAtendimento | "") {
    const lead = errosLead();
    const ce = alvo && exigeChecklist(alvo) ? checklistErros(chk) : {};
    if (Object.keys(lead).length || Object.keys(ce).length) {
      setErrors(lead);
      setChkErros(ce);
      if (CAMPOS_LEAD.some((k) => lead[k])) setEditarDados(true);
      toast.error(
        "Ainda não é possível mudar de etapa.",
        Object.keys(ce).length ? "Complete o checklist de qualificação." : "Verifique os campos destacados.",
      );
      return;
    }
    setErrors({});
    setChkErros({});
    // Etapa que não pede nenhum dado novo: grava com um clique
    if (alvo && !faltaParaEntrar(alvo)) {
      await salvar(alvo);
      return;
    }
    setObsDestino("");
    setErroAlvo("");
    setMover({ modo, alvo });
  }

  async function confirmarMovimento() {
    if (!mover) return;
    if (!mover.alvo) {
      setErroAlvo("Selecione a etapa de destino.");
      return;
    }
    const ok = await salvar(mover.alvo, obsDestino);
    if (ok) setMover(null);
  }

  const cancelarMovimento = () => {
    setMover(null);
    setErrors({});
    setChkErros({});
  };

  const onPorte = (v: string) => {
    set("porte", v);
    if (v === "MEI") set("regime", "MEI");
    else if (f.regime === "MEI") set("regime", "");
  };

  /** Consulta o CNPJ na Receita Federal e preenche o que ainda estiver vazio (ou foi preenchido pela consulta anterior). */
  async function buscarCnpj(digitos: string) {
    cnpjConsultado.current = digitos;
    setCnpjStatus({ estado: "carregando", msg: "Consultando a Receita Federal..." });
    const r = await consultarCnpj(digitos);
    if (cnpjConsultado.current !== digitos) return;
    if (!r.ok) {
      setCnpjStatus({ estado: "erro", msg: r.error });
      return;
    }
    const d = r.dados;

    // nome do município exatamente como na lista do IBGE (é o que o seletor reconhece)
    let municipio = d.municipio ? capitalizar(d.municipio) : "";
    if (d.uf && d.municipioIbge) {
      try {
        const lista = await fetchMunicipios(d.uf);
        municipio = lista.find((m) => m.id === d.municipioIbge)?.nome ?? municipio;
      } catch {
        /* mantém o nome da Receita */
      }
      if (cnpjConsultado.current !== digitos) return;
    }

    const nome = d.nomeFantasia || d.razaoSocial;
    const anterior = autoPreenchido.current;
    const livre = (campo: keyof AutoPreenchido, atual: string) => !atual || anterior[campo] === atual;
    const novo: AutoPreenchido = { ...anterior };

    setF((s) => {
      const n = { ...s };
      if (nome && livre("lead", s.lead)) n.lead = novo.lead = nome;
      if (d.porte && livre("porte", s.porte)) n.porte = novo.porte = d.porte;
      if (d.regime && livre("regime", s.regime)) n.regime = novo.regime = d.regime;
      if (d.telefone && livre("telefone", s.telefone)) n.telefone = novo.telefone = maskPhone(d.telefone);
      if (d.email && livre("email", s.email)) n.email = novo.email = d.email;
      if (d.uf && municipio && livre("municipio", s.municipio)) {
        n.uf = d.uf;
        n.municipio = novo.municipio = municipio;
        n.municipio_ibge = d.municipioIbge;
      }
      return n;
    });
    autoPreenchido.current = novo;
    setErrors((e) => ({ ...e, cnpj: undefined, lead: undefined, porte: undefined, regime: undefined, uf: undefined, municipio: undefined }));

    const pendentes = [!d.porte && "porte", !d.regime && "regime"].filter(Boolean).join(" e ");
    const inativa = d.situacao && d.situacao.toUpperCase() !== "ATIVA";
    setCnpjStatus({
      estado: inativa || pendentes ? "aviso" : "ok",
      msg:
        `Receita Federal: ${d.razaoSocial || nome}` +
        (d.situacao ? ` · situação ${d.situacao.toLowerCase()}` : "") +
        (inativa ? ". Atenção: o CNPJ não está ativo." : ".") +
        (pendentes ? ` Não foi possível identificar ${pendentes}: selecione manualmente.` : " Confira os campos preenchidos."),
    });
  }

  const onCnpj = (valor: string) => {
    const mascarado = maskCnpj(valor);
    set("cnpj", mascarado);
    const digitos = mascarado.replace(/\D/g, "");
    if (digitos.length < 14) {
      cnpjConsultado.current = "";
      setCnpjStatus({ estado: "idle", msg: "" });
    } else if (!cnpjValido(digitos)) {
      cnpjConsultado.current = "";
      setCnpjStatus({ estado: "erro", msg: "CNPJ inválido. Confira os números digitados." });
    } else {
      void buscarCnpj(digitos);
    }
  };
  const cnpjDigitos = f.cnpj.replace(/\D/g, "");

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
      <Field
        label="CNPJ"
        error={errors.cnpj}
        hint={cnpjStatus.estado === "idle" ? "Digite o CNPJ: os dados da Receita Federal são preenchidos automaticamente." : undefined}
        htmlFor="campo-cnpj"
        className="sm:col-span-4"
      >
        <div className="relative">
          <input
            id="campo-cnpj"
            inputMode="numeric"
            autoComplete="off"
            value={f.cnpj}
            onChange={(e) => onCnpj(e.target.value)}
            placeholder="00.000.000/0000-00"
            aria-invalid={errors.cnpj ? true : undefined}
            className="form-control pr-10 tabular-nums"
          />
          <button
            type="button"
            onClick={() => cnpjValido(cnpjDigitos) && void buscarCnpj(cnpjDigitos)}
            disabled={!cnpjValido(cnpjDigitos) || cnpjStatus.estado === "carregando"}
            aria-label="Consultar CNPJ na Receita Federal"
            title="Consultar CNPJ na Receita Federal"
            className="absolute top-1/2 right-1 flex size-8 -translate-y-1/2 items-center justify-center rounded text-fg-3 enabled:hover:bg-gray-100 enabled:hover:text-fg disabled:cursor-default"
          >
            {cnpjStatus.estado === "carregando" ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
          </button>
        </div>
        {!errors.cnpj && cnpjStatus.estado !== "idle" && (
          <p
            role="status"
            className={`mt-1 text-xs ${cnpjStatus.estado === "erro" ? "text-danger" : cnpjStatus.estado === "aviso" ? "text-warning" : cnpjStatus.estado === "ok" ? "text-success" : "text-fg-2"}`}
          >
            {cnpjStatus.msg}
          </p>
        )}
      </Field>
      <Input
        label="Lead (nome do cliente)"
        required
        value={f.lead}
        onChange={(e) => set("lead", e.target.value)}
        error={errors.lead}
        wrapperClassName="sm:col-span-6"
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
      <Input
        label="Nome do contato"
        value={f.contato_nome}
        onChange={(e) => set("contato_nome", e.target.value)}
        placeholder="Pessoa com quem falamos"
        maxLength={150}
        wrapperClassName="sm:col-span-6"
      />
      <Select
        label="Porte"
        required
        value={f.porte}
        onChange={(e) => onPorte(e.target.value)}
        placeholder="Selecione"
        options={PORTES.map((p) => ({ value: p, label: p }))}
        error={errors.porte}
        hint={atendimento?.porte === NAO_INFORMADO && !f.porte ? "Não informado no CRM anterior: selecione o porte." : undefined}
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
        hint={atendimento?.regime === NAO_INFORMADO && !f.regime ? "Não informado no CRM anterior: selecione o regime." : undefined}
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
      <Field label="Meio do primeiro contato" required={!editing} error={errors.meio_contato_inicial} className="sm:col-span-6">
        <MeioContatoPicker
          value={f.meio_contato_inicial}
          onChange={(v) => set("meio_contato_inicial", v)}
          invalid={Boolean(errors.meio_contato_inicial)}
        />
      </Field>
    </div>
  );

  /** Campos que pertencem à etapa `s` (painel da etapa atual ou janela da etapa de destino). */
  const camposEtapa = (s: StatusAtendimento) => {
    const agendado = s === "agendado_visita";
    const visita = s === "visita_realizada";
    const proposta = s === "proposta_enviada";
    const efetivado = s === "negocio_efetivado";
    const declinado = s === "negocio_declinado";
    const conforme = efetivado && temProposta && f.conforme_proposta === "sim";
    const mostraChecklist = s === "qualificacao" || (exigeChecklist(s) && !checklistCompleto);

    return (
      <>
        {(agendado || visita) && (
          <Input
            label={agendado ? "Data da visita/reunião agendada" : "Data da visita/reunião"}
            type="date"
            required={agendado}
            value={f.data_visita}
            onChange={(e) => set("data_visita", e.target.value)}
            error={errors.data_visita}
            wrapperClassName="max-w-xs"
          />
        )}

        {visita && (
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
          <Checklist
            valores={chk}
            onChange={mudarChecklist}
            erros={chkErros}
            produtos={produtos.filter((p) => p.ativo || chk.q_produtos.includes(p.id))}
            obrigatorio={exigeChecklist(s)}
          />
        )}

        {proposta && (
          <div className="grid grid-cols-1 gap-4 rounded-[10px] border border-[#fde68a] bg-warning-soft/60 p-4 sm:grid-cols-3">
            <p className="flex items-center gap-2 text-sm font-medium text-fg sm:col-span-3">
              <FileText className="size-4 text-warning" aria-hidden /> Dados da proposta
            </p>
            <Field
              label="Serviços / pacotes propostos"
              required
              error={errors.proposta_produtos}
              hint="Pode selecionar mais de um serviço."
              className="sm:col-span-3"
              htmlFor="proposta-produtos"
            >
              <MultiSelect
                id="proposta-produtos"
                options={produtoOptions(f.proposta_produtos)}
                value={f.proposta_produtos}
                onChange={(v) => set("proposta_produtos", v)}
                placeholder={produtos.length ? "Selecione um ou mais" : "Nenhum serviço cadastrado"}
                pluralLabel="serviços"
                invalid={Boolean(errors.proposta_produtos)}
              />
            </Field>
            {moneyField("proposta_valor", "Valor total proposto (R$)", "Entra na projeção de faturamento do dashboard.", "sm:col-span-2")}
            <Input
              label="Data da proposta"
              type="date"
              value={f.data_proposta || todayISO()}
              onChange={(e) => set("data_proposta", e.target.value)}
            />
          </div>
        )}

        {efetivado && (
          <div className="grid grid-cols-1 gap-4 rounded-[10px] border border-[#bbf7d0] bg-success-soft/60 p-4 sm:grid-cols-3">
            {temProposta ? (
              <>
                <div className="rounded-md border border-line bg-surface p-3 text-sm sm:col-span-3">
                  <p className="text-xs text-fg-2">Proposta enviada{f.data_proposta ? ` em ${formatDate(f.data_proposta)}` : ""}</p>
                  <p className="mt-0.5 font-medium text-fg">
                    {nomesProdutos(f.proposta_produtos) || "Serviço não informado"} — {formatBRL(parseMoney(f.proposta_valor))}
                  </p>
                </div>
                <fieldset className="sm:col-span-3">
                  <legend className="field-label">
                    Os serviços e o valor foram fechados conforme a proposta?<span className="ml-0.5 text-danger">*</span>
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
                            setF((x) => ({
                              ...x,
                              conforme_proposta: o.v,
                              // alteração: parte dos dados da proposta para ajustar
                              produtos_fechados: o.v === "nao" && x.produtos_fechados.length === 0 ? x.proposta_produtos : x.produtos_fechados,
                              valor_fechado: o.v === "nao" && !x.valor_fechado ? x.proposta_valor : x.valor_fechado,
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
                Este atendimento não passou pela etapa de proposta. Informe os serviços e o valor fechados.
              </p>
            )}

            {!conforme && (!temProposta || f.conforme_proposta === "nao") && (
              <>
                <Field
                  label="Serviços / pacotes fechados"
                  required
                  error={errors.produtos_fechados}
                  hint="Pode selecionar mais de um serviço."
                  className="sm:col-span-3"
                  htmlFor="fechados-produtos"
                >
                  <MultiSelect
                    id="fechados-produtos"
                    options={produtoOptions(f.produtos_fechados)}
                    value={f.produtos_fechados}
                    onChange={(v) => set("produtos_fechados", v)}
                    placeholder="Selecione um ou mais"
                    pluralLabel="serviços"
                    invalid={Boolean(errors.produtos_fechados)}
                  />
                </Field>
                {moneyField("valor_fechado", "Valor total fechado (R$)", "Alimenta o faturamento do dashboard.", "sm:col-span-2")}
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

        {declinado && (
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
  };

  const observacaoEAnexos = (
    <>
      <Textarea
        label={`Nova observação — ${STATUS_MAP[statusPainel].label}`}
        value={f.observacao_etapa}
        onChange={(e) => set("observacao_etapa", e.target.value)}
        rows={4}
        placeholder="O que aconteceu neste contato? Necessidades do cliente, combinados, próximos passos..."
        hint={editing ? "Adiciona um novo registro à etapa atual, sem apagar os anteriores." : "O registro fica na linha do tempo do atendimento."}
      />
      <Field label="Anexos">
        <AnexosPicker files={arquivos} onChange={setArquivos} onError={(m) => toast.error("Arquivo não adicionado.", m)} />
      </Field>
    </>
  );

  const alvoDialogo = mover?.alvo || null;
  const tituloDialogo =
    mover?.modo === "declinar"
      ? "Declinar negócio"
      : mover?.modo === "avancar" && alvoDialogo
        ? `Avançar para ${STATUS_MAP[alvoDialogo].label}`
        : statusOriginal === "negocio_declinado"
          ? "Reabrir atendimento"
          : "Mover para outra etapa";
  const rotuloDialogo =
    mover?.modo === "declinar" ? "Confirmar declínio" : mover?.modo === "avancar" ? "Confirmar e avançar" : "Mover para a etapa";

  return (
    <>
      <Modal
        open
        variant="side"
        size="lg"
        onClose={onClose}
        title={editing ? atendimento!.lead : "Novo atendimento"}
        description={
          editing
            ? `Registrado em ${formatDate(atendimento!.data)} · ${vendedorNome(atendimento!.responsavel_id ?? "")}${atendimento!.importado ? " · Importado do CRM anterior" : ""}`
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
              {editing ? "Fechar" : "Cancelar"}
            </Button>
            {!verEtapa && (
              <Button onClick={() => salvar()} loading={saving && !mover}>
                {!editing ? "Registrar atendimento" : temRegistro ? "Adicionar registro" : "Salvar"}
              </Button>
            )}
          </>
        }
      >
        <form
          className="space-y-6"
          onSubmit={(e) => {
            e.preventDefault();
            if (!verEtapa) salvar();
          }}
        >
          {/* ESTEIRA: etapas alcançadas são clicáveis para consulta */}
          {editing && atendimento && (
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
                <Info label="CNPJ" value={f.cnpj || "—"} />
                <Info label="Contato" value={f.contato_nome || "—"} />
                <Info label="Porte / Regime" value={`${f.porte || NAO_INFORMADO} · ${f.regime || NAO_INFORMADO}`} />
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
          {editing && atendimento && verEtapa ? (
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
          ) : editing && atendimento ? (
            <section className="rounded-[12px] border border-line p-4 shadow-soft">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-fg">Etapa atual</h3>
                <StatusBadge status={atendimento.status} />
              </div>

              <div className="space-y-4">
                {camposEtapa(atendimento.status)}
                {observacaoEAnexos}
                <p className="text-xs text-fg-3">
                  <strong className="font-medium text-fg-2">Salvar</strong> registra dados e observações sem mudar a etapa.
                </p>
              </div>

              {/* Mudança de etapa: cada botão grava na hora (após pedir o que a etapa exige) */}
              <div className="mt-5 border-t border-line pt-4">
                <p className="mb-2.5 text-xs font-semibold tracking-wide text-fg-2 uppercase">Mudar de etapa</p>
                <div className="flex flex-wrap gap-2">
                  {proxima && (
                    <Button icon={<MoveRight className="size-4" />} onClick={() => iniciarMovimento("avancar", proxima.value)} loading={saving && !mover}>
                      Concluir etapa e avançar para {proxima.label}
                    </Button>
                  )}
                  {podeDeclinar && (
                    <Button
                      variant="secondary"
                      className="border-[#fecaca] text-danger hover:bg-danger-soft"
                      icon={<Ban className="size-4" />}
                      onClick={() => iniciarMovimento("declinar", "negocio_declinado")}
                    >
                      Declinar negócio
                    </Button>
                  )}
                  <Button variant="ghost" icon={<Shuffle className="size-4" />} onClick={() => iniciarMovimento("mover", "")}>
                    {atendimento.status === "negocio_declinado" ? "Reabrir em outra etapa" : "Mover para outra etapa"}
                  </Button>
                </div>
              </div>
            </section>
          ) : (
            <section className="border-t border-line pt-5">
              <h3 className="mb-3 text-sm font-semibold text-fg">Status inicial</h3>
              <div className="space-y-4">
                <Select
                  label="Status"
                  required
                  value={f.status}
                  onChange={(e) => {
                    set("status", e.target.value as StatusAtendimento);
                    setChkErros({});
                  }}
                  options={STATUS.map((s) => ({ value: s.value, label: s.label }))}
                  wrapperClassName="max-w-xs"
                />
                {camposEtapa(f.status)}
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

      {/* Janela da mudança de etapa: pede só o que a etapa de destino exige e grava */}
      <Modal
        open={mover !== null}
        onClose={cancelarMovimento}
        title={tituloDialogo}
        description={
          atendimento && alvoDialogo
            ? `${STATUS_MAP[atendimento.status].label} → ${STATUS_MAP[alvoDialogo].label}`
            : "Escolha a etapa de destino do lead."
        }
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={cancelarMovimento} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={confirmarMovimento} loading={saving} variant={mover?.modo === "declinar" ? "danger" : "primary"}>
              {rotuloDialogo}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {mover?.modo === "mover" && (
            <Select
              label="Etapa de destino"
              required
              value={mover.alvo}
              onChange={(e) => {
                setErroAlvo("");
                setErrors({});
                setChkErros({});
                setMover({ modo: "mover", alvo: e.target.value as StatusAtendimento | "" });
              }}
              placeholder="Selecione a etapa"
              options={STATUS.filter((s) => s.value !== statusOriginal).map((s) => ({ value: s.value, label: s.label }))}
              error={erroAlvo}
            />
          )}
          {alvoDialogo && camposEtapa(alvoDialogo)}
          {alvoDialogo && (
            <Textarea
              label="Observação (opcional)"
              value={obsDestino}
              onChange={(e) => setObsDestino(e.target.value)}
              rows={3}
              placeholder={`Registro inicial da etapa ${STATUS_MAP[alvoDialogo].label}`}
            />
          )}
        </div>
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
