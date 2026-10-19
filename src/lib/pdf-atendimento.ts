import { jsPDF } from "jspdf";
import { ETAPA_FECHADO, RECORRENCIA_LABEL, STATUS, STATUS_MAP, type StatusAtendimento } from "@/lib/constants";
import { formatBRL, formatDate, formatDateTime } from "@/lib/format";
import type { Atendimento, Produto } from "@/types/database";

export interface PdfHistorico {
  status_anterior: StatusAtendimento | null;
  status_novo: StatusAtendimento;
  created_at: string;
  usuario: string;
}

export interface PdfNota {
  id: string;
  status: StatusAtendimento;
  meio_contato: string | null;
  texto: string | null;
  created_at: string;
  usuario: string;
  anexos: string[];
}

export interface DadosPdfAtendimento {
  atendimento: Atendimento;
  produtos: Pick<Produto, "id" | "nome">[];
  vendedor: string;
  campanha: string;
  aprovadoPor: string;
  historico: PdfHistorico[];
  notas: PdfNota[];
}

type RGB = readonly [number, number, number];
const COR = {
  accent: [37, 99, 235],
  texto: [17, 24, 39],
  suave: [107, 114, 128],
  linha: [229, 231, 235],
  fundo: [249, 250, 251],
  ok: [22, 163, 74],
  aviso: [217, 119, 6],
  erro: [220, 38, 38],
} as const satisfies Record<string, RGB>;

// A4 em milímetros
const PAG_W = 210;
const PAG_H = 297;
const M = 15;
const W = PAG_W - 2 * M;
/** Altura reservada ao rodapé (linha + logos + numeração). */
const RODAPE_TOPO = 272;
const LIMITE = RODAPE_TOPO - 6;

const LOGOS = [
  { src: "/branding/osc-paulistana-logo.png", w: 1517, h: 273, alias: "logo-osc" },
  { src: "/branding/souza-cardoso-logo.png", w: 1575, h: 325, alias: "logo-souza" },
] as const;

/** Fontes padrão do PDF só têm Latin-1: troca símbolos fora dele para não aparecerem quebrados. */
const t = (v: unknown) =>
  String(v ?? "")
    .replace(/[–—]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, "...")
    .replace(/[•·]/g, "-")
    .replace(/→/g, ">")
    .replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, "");

async function carregarImagem(src: string): Promise<string> {
  const r = await fetch(src);
  if (!r.ok) throw new Error(`Não foi possível carregar ${src}`);
  const blob = await r.blob();
  return await new Promise<string>((ok, erro) => {
    const fr = new FileReader();
    fr.onload = () => ok(String(fr.result));
    fr.onerror = () => erro(fr.error);
    fr.readAsDataURL(blob);
  });
}

const sim = (v: boolean | null) => (v === null ? "" : v ? "Sim" : "Não");

export async function gerarPdfAtendimento(d: DadosPdfAtendimento) {
  const a = d.atendimento;
  // as duas logos do escritório são obrigatórias no rodapé: sem elas, o PDF não é gerado
  const logos = await Promise.all(LOGOS.map(async (l) => ({ ...l, dados: await carregarImagem(l.src) })));

  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
  let y = M;

  const nomeProduto = (id: string) => d.produtos.find((p) => p.id === id)?.nome ?? "Serviço removido";
  const nomesProdutos = (ids: string[] | null | undefined) => (ids?.length ? ids.map(nomeProduto).join(", ") : "");

  /* ---------------- primitivas ---------------- */
  const cor = (c: RGB) => doc.setTextColor(c[0], c[1], c[2]);
  const preenche = (c: RGB) => doc.setFillColor(c[0], c[1], c[2]);
  const traco = (c: RGB) => doc.setDrawColor(c[0], c[1], c[2]);
  const fonte = (tamanho: number, negrito = false, c: RGB = COR.texto) => {
    doc.setFont("helvetica", negrito ? "bold" : "normal");
    doc.setFontSize(tamanho);
    cor(c);
  };
  const altLinha = (tamanho: number) => tamanho * 0.3528 * 1.38;
  const quebra = (texto: string, largura: number, tamanho: number, negrito = false): string[] => {
    doc.setFont("helvetica", negrito ? "bold" : "normal");
    doc.setFontSize(tamanho);
    return doc.splitTextToSize(t(texto), largura) as string[];
  };
  const garante = (h: number) => {
    if (y + h > LIMITE) {
      doc.addPage();
      y = M;
    }
  };

  /** Título de seção com barra de destaque. */
  const secao = (titulo: string, destaque?: string) => {
    // reserva espaço para o título e as primeiras linhas (evita título sozinho no fim da página)
    garante(34);
    y += 4;
    preenche(COR.accent);
    doc.rect(M, y, 1.2, 5.2, "F");
    fonte(11.5, true);
    doc.text(t(titulo), M + 3.2, y + 4.2);
    if (destaque) {
      fonte(8.5, false, COR.suave);
      doc.text(t(destaque), PAG_W - M, y + 4.2, { align: "right" });
    }
    y += 8;
    traco(COR.linha);
    doc.setLineWidth(0.2);
    doc.line(M, y, PAG_W - M, y);
    y += 3;
  };

  /** Grade de campos (rótulo pequeno + valor). `span` = quantas colunas o campo ocupa. */
  const campos = (itens: { rotulo: string; valor: string; span?: number }[], colunas = 3) => {
    const gap = 4;
    const colW = (W - gap * (colunas - 1)) / colunas;
    let i = 0;
    while (i < itens.length) {
      const linha: { rotulo: string; linhas: string[]; x: number; w: number }[] = [];
      let usado = 0;
      while (i < itens.length && usado < colunas) {
        const it = itens[i];
        const span = Math.min(it.span ?? 1, colunas - usado);
        const w = colW * span + gap * (span - 1);
        linha.push({ rotulo: it.rotulo, linhas: quebra(it.valor || "-", w, 9.5, true), x: M + usado * (colW + gap), w });
        usado += span;
        i += 1;
      }
      const alt = 3.6 + Math.max(...linha.map((c) => c.linhas.length)) * altLinha(9.5) + 2.2;
      garante(alt);
      for (const c of linha) {
        fonte(7.5, false, COR.suave);
        doc.text(t(c.rotulo), c.x, y + 2.6);
        fonte(9.5, true);
        c.linhas.forEach((ln, k) => doc.text(ln, c.x, y + 3.6 + altLinha(9.5) * (k + 0.8)));
      }
      y += alt;
    }
  };

  /** Parágrafo de texto corrido (pode atravessar páginas). */
  const paragrafo = (texto: string, x: number, largura: number, tamanho = 9.5, c: RGB = COR.texto, negrito = false) => {
    fonte(tamanho, negrito, c);
    for (const ln of quebra(texto, largura, tamanho, negrito)) {
      garante(altLinha(tamanho));
      doc.text(ln, x, y + altLinha(tamanho) * 0.8);
      y += altLinha(tamanho);
    }
  };

  /* ---------------- dados de apoio ---------------- */
  const etapas = STATUS.filter((s) => s.etapa > 0);
  const declinado = a.status === "negocio_declinado";
  const efetivado = a.status === "negocio_efetivado";
  const etapaAtual = STATUS_MAP[a.status].etapa;
  const alcancou = (etapa: number) => a.etapa_maxima >= etapa || (!declinado && etapaAtual >= etapa);

  // primeira data em que cada etapa foi alcançada (o antigo "Primeiro contato" conta como Qualificação)
  const dataDe = new Map<string, string>();
  for (const h of [...d.historico].sort((x, y2) => x.created_at.localeCompare(y2.created_at)))
    if (!dataDe.has(h.status_novo)) dataDe.set(h.status_novo, h.created_at);
  if (!dataDe.has("qualificacao") && dataDe.has("primeiro_contato")) dataDe.set("qualificacao", dataDe.get("primeiro_contato")!);

  const situacao = (etapa: number): "concluida" | "atual" | "pendente" | "declinada" => {
    if (declinado) return etapa === ETAPA_FECHADO ? "declinada" : etapa <= a.etapa_maxima ? "concluida" : "pendente";
    if (efetivado) return "concluida";
    return etapa < etapaAtual ? "concluida" : etapa === etapaAtual ? "atual" : "pendente";
  };
  const rotuloEtapa = (s: (typeof etapas)[number]) =>
    s.etapa === ETAPA_FECHADO ? (efetivado ? "Negócio efetivado" : declinado ? "Declinado" : "Fechamento do negócio") : s.label;

  /* ---------------- cabeçalho ---------------- */
  fonte(8, true, COR.accent);
  doc.text("FICHA DO ATENDIMENTO", M, y + 2.5);
  fonte(8, false, COR.suave);
  doc.text(t(`Emitida em ${formatDateTime(new Date().toISOString())}`), PAG_W - M, y + 2.5, { align: "right" });
  y += 6;
  fonte(18, true);
  const nomeLinhas = quebra(a.lead, W, 18, true);
  nomeLinhas.forEach((ln, k) => doc.text(ln, M, y + 6 + k * altLinha(18)));
  y += 6 + (nomeLinhas.length - 1) * altLinha(18) + 3;
  fonte(9.5, false, COR.suave);
  doc.text(t([a.cnpj ? `CNPJ ${a.cnpj}` : "", a.municipio ? `${a.municipio}/${a.uf}` : "", `Registrado em ${formatDate(a.data)}`].filter(Boolean).join("   |   ")), M, y + 2);
  y += 7;

  /* ---------------- resumo + esteira ---------------- */
  const concluidas = etapas.filter((s) => situacao(s.etapa) === "concluida").length;
  const faltam = etapas.filter((s) => situacao(s.etapa) === "pendente");
  const corStatus: RGB = declinado ? COR.erro : efetivado ? COR.ok : COR.accent;

  preenche(COR.fundo);
  traco(COR.linha);
  doc.setLineWidth(0.2);
  doc.roundedRect(M, y, W, 44, 2, 2, "FD");
  fonte(8, false, COR.suave);
  doc.text("ETAPA ATUAL", M + 4, y + 5.5);
  fonte(12.5, true, corStatus);
  doc.text(t(STATUS_MAP[a.status].label), M + 4, y + 11.5);
  fonte(8.5, false, COR.suave);
  doc.text(t(`${concluidas} de ${etapas.length} etapas concluídas`), PAG_W - M - 4, y + 11.5, { align: "right" });

  // esteira
  const topoEsteira = y + 22;
  const passo = (W - 14) / (etapas.length - 1);
  const x0 = M + 7;
  etapas.forEach((s, i) => {
    const cx = x0 + i * passo;
    const sit = situacao(s.etapa);
    if (i > 0) {
      const anterior = situacao(etapas[i - 1].etapa);
      traco(anterior === "concluida" && sit !== "pendente" ? (sit === "declinada" ? COR.erro : COR.accent) : COR.linha);
      doc.setLineWidth(0.7);
      doc.line(cx - passo + 3.4, topoEsteira, cx - 3.4, topoEsteira);
    }
    doc.setLineWidth(0.5);
    if (sit === "concluida") {
      preenche(COR.accent);
      traco(COR.accent);
      doc.circle(cx, topoEsteira, 3.1, "FD");
      traco([255, 255, 255]);
      doc.setLineWidth(0.6);
      doc.line(cx - 1.4, topoEsteira + 0.1, cx - 0.35, topoEsteira + 1.2);
      doc.line(cx - 0.35, topoEsteira + 1.2, cx + 1.5, topoEsteira - 1.1);
    } else if (sit === "declinada") {
      preenche(COR.erro);
      traco(COR.erro);
      doc.circle(cx, topoEsteira, 3.1, "FD");
      traco([255, 255, 255]);
      doc.setLineWidth(0.6);
      doc.line(cx - 1.2, topoEsteira - 1.2, cx + 1.2, topoEsteira + 1.2);
      doc.line(cx - 1.2, topoEsteira + 1.2, cx + 1.2, topoEsteira - 1.2);
    } else {
      preenche([255, 255, 255]);
      traco(sit === "atual" ? COR.accent : COR.linha);
      doc.setLineWidth(sit === "atual" ? 0.9 : 0.5);
      doc.circle(cx, topoEsteira, 3.1, "FD");
      fonte(8, true, sit === "atual" ? COR.accent : COR.suave);
      doc.text(String(s.etapa), cx, topoEsteira + 1, { align: "center" });
    }
    fonte(7, sit === "atual", sit === "pendente" ? COR.suave : sit === "declinada" ? COR.erro : COR.texto);
    const rot = doc.splitTextToSize(t(rotuloEtapa(s)), passo - 1.5) as string[];
    rot.forEach((ln, k) => doc.text(ln, cx, topoEsteira + 6.2 + k * 3, { align: "center" }));
    const dt = dataDe.get(s.value) ?? (sit === "declinada" ? dataDe.get("negocio_declinado") : undefined);
    if (dt && sit !== "pendente") {
      fonte(6.5, false, COR.suave);
      doc.text(formatDate(dt), cx, topoEsteira + 6.2 + rot.length * 3 + 0.4, { align: "center" });
    }
  });
  y += 44 + 3;

  // o que falta
  const faltantes = faltam.map((s) => rotuloEtapa(s));
  if (declinado) {
    paragrafo(`Negócio declinado${a.data_declinio ? ` em ${formatDate(a.data_declinio)}` : ""}. Etapas não alcançadas: ${faltantes.join(", ") || "nenhuma"}.`, M, W, 9, COR.erro, true);
  } else if (efetivado) {
    paragrafo("Todas as etapas do funil foram concluídas: negócio efetivado.", M, W, 9, COR.ok, true);
  } else {
    paragrafo(`Etapas que faltam: ${faltantes.join(", ") || "nenhuma"}.`, M, W, 9, COR.aviso, true);
  }
  y += 1;

  /* ---------------- dados do lead ---------------- */
  secao("Dados do lead");
  campos([
    { rotulo: "CNPJ", valor: a.cnpj ?? "" },
    { rotulo: "Responsável da empresa", valor: a.responsavel_empresa ?? "", span: 2 },
    { rotulo: "Nome do contato", valor: a.contato_nome ?? "" },
    { rotulo: "Telefone", valor: a.telefone ?? "" },
    { rotulo: "E-mail", valor: a.email ?? "" },
    { rotulo: "Porte", valor: a.porte },
    { rotulo: "Regime de faturamento", valor: a.regime },
    { rotulo: "Município", valor: a.municipio ? `${a.municipio}/${a.uf}` : "" },
    { rotulo: "Canal de prospecção", valor: a.canal === "Indicação" && a.indicado_por ? `Indicação - ${a.indicado_por}` : a.canal, span: 2 },
    { rotulo: "Meio do 1º contato", valor: a.meio_contato_inicial ?? "" },
    { rotulo: "Responsável comercial", valor: d.vendedor, span: 2 },
    { rotulo: "Campanha", valor: d.campanha || "Sem campanha" },
  ]);

  /* ---------------- 1. Qualificação ---------------- */
  secao("1. Qualificação", dataDe.get("qualificacao") ? `desde ${formatDate(dataDe.get("qualificacao"))}` : undefined);
  const pendencias: string[] = [];
  if (!a.qualif_atividade?.trim()) pendencias.push("atividade");
  if (a.qualif_outras_empresas === null) pendencias.push("possui outras empresas");
  if (a.qualif_funcionarios === null) pendencias.push("nº de funcionários");
  if (a.qualif_faturamento_mensal === null) pendencias.push("faturamento mensal");
  if (!a.qualif_contabilidade_anterior?.trim()) pendencias.push("contabilidade anterior");
  if (!a.qualif_principal_dor?.trim()) pendencias.push("principal dor");
  if (!a.qualif_produtos?.length) pendencias.push("produtos/serviços negociados");
  if (a.qualif_restaurante) {
    if (!a.qualif_pdv_sistema?.trim()) pendencias.push("sistema da frente de caixa");
    if (!a.qualif_erp_financeiro?.trim()) pendencias.push("ERP financeiro");
  }
  campos([
    { rotulo: "Atividade", valor: a.qualif_atividade ?? "", span: 2 },
    { rotulo: "Possui outras empresas", valor: sim(a.qualif_outras_empresas) },
    ...(a.qualif_outras_empresas && a.qualif_outras_empresas_obs ? [{ rotulo: "Sobre as outras empresas", valor: a.qualif_outras_empresas_obs, span: 3 }] : []),
    { rotulo: "Nº de funcionários", valor: a.qualif_funcionarios === null ? "" : String(a.qualif_funcionarios) },
    { rotulo: "Faturamento mensal", valor: a.qualif_faturamento_mensal === null ? "" : formatBRL(a.qualif_faturamento_mensal) },
    { rotulo: "Contabilidade anterior", valor: a.qualif_contabilidade_anterior ?? "" },
    { rotulo: "Principal dor hoje", valor: a.qualif_principal_dor ?? "", span: 3 },
    { rotulo: "Produtos/serviços negociados", valor: nomesProdutos(a.qualif_produtos), span: 3 },
    ...(a.qualif_restaurante
      ? [
          { rotulo: "Restaurante - sistema da frente de caixa (PDV)", valor: a.qualif_pdv_sistema ?? "", span: 2 },
          { rotulo: "ERP financeiro", valor: a.qualif_erp_financeiro ?? "" },
        ]
      : []),
    { rotulo: "LinkedIn", valor: a.qualif_linkedin ?? "" },
    { rotulo: "Instagram", valor: a.qualif_instagram ?? "" },
    { rotulo: "Site", valor: a.qualif_site ?? "" },
  ]);
  if (pendencias.length && !a.importado) paragrafo(`Checklist incompleto - falta informar: ${pendencias.join(", ")}.`, M, W, 8.5, COR.aviso, true);

  /* ---------------- 2. Agendamento de reunião ---------------- */
  if (alcancou(2)) {
    secao("2. Agendamento de Reunião", dataDe.get("agendado_visita") ? `desde ${formatDate(dataDe.get("agendado_visita"))}` : undefined);
    campos([{ rotulo: "Reunião agendada para", valor: a.data_visita ? formatDate(a.data_visita) : "" }]);
  }

  /* ---------------- 3. Reunião realizada ---------------- */
  if (alcancou(3)) {
    secao("3. Reunião Realizada", dataDe.get("visita_realizada") ? `desde ${formatDate(dataDe.get("visita_realizada"))}` : undefined);
    campos([
      { rotulo: "O que foi realizado", valor: a.tipo_visita ?? "" },
      { rotulo: "Data", valor: a.data_visita ? formatDate(a.data_visita) : "" },
    ]);
  }

  /* ---------------- 4. Elaboração da proposta ---------------- */
  if (alcancou(4)) {
    secao("4. Elaboração da Proposta", dataDe.get("elaboracao_proposta") ? `desde ${formatDate(dataDe.get("elaboracao_proposta"))}` : undefined);
    const itens = a.proposta_itens ?? [];
    if (itens.length) {
      const colTipo = M + 100;
      const colValor = PAG_W - M - 2;
      garante(8);
      preenche(COR.fundo);
      doc.rect(M, y, W, 6.2, "F");
      fonte(7.5, true, COR.suave);
      doc.text("SERVIÇO", M + 2, y + 4.2);
      doc.text("TIPO", colTipo, y + 4.2);
      doc.text("VALOR", colValor, y + 4.2, { align: "right" });
      y += 7.6;
      let recorrente = 0;
      let unico = 0;
      for (const i of itens) {
        const nome = quebra(nomeProduto(i.produto_id), 92, 9.5);
        const alt = nome.length * altLinha(9.5) + 3;
        garante(alt);
        fonte(9.5);
        nome.forEach((ln, k) => doc.text(ln, M + 2, y + 2.6 + k * altLinha(9.5)));
        fonte(9, false, COR.suave);
        doc.text(t(i.recorrencia === "unica" ? "Único" : `Recorrente - ${RECORRENCIA_LABEL[i.recorrencia]}`), colTipo, y + 2.6);
        fonte(9.5, true);
        doc.text(formatBRL(i.valor), colValor, y + 2.6, { align: "right" });
        traco(COR.linha);
        doc.setLineWidth(0.15);
        doc.line(M, y + alt, PAG_W - M, y + alt);
        y += alt;
        if (i.recorrencia === "unica") unico += Number(i.valor);
        else recorrente += Number(i.valor);
      }
      const totais: [string, number][] = [];
      if (itens.some((i) => i.recorrencia !== "unica")) totais.push(["Total recorrente", recorrente]);
      if (itens.some((i) => i.recorrencia === "unica")) totais.push(["Total único", unico]);
      totais.push(["Valor total proposto", Number(a.proposta_valor ?? recorrente + unico)]);
      y += 1.5;
      totais.forEach(([rot, val], k) => {
        garante(6);
        const ultimo = k === totais.length - 1;
        fonte(ultimo ? 10 : 9, ultimo, ultimo ? COR.texto : COR.suave);
        doc.text(t(rot), colTipo + 20, y + 3.6);
        doc.text(formatBRL(val), colValor, y + 3.6, { align: "right" });
        y += 5.2;
      });
    } else {
      campos([
        { rotulo: "Serviços da proposta", valor: nomesProdutos(a.proposta_produtos), span: 2 },
        { rotulo: "Valor total proposto", valor: a.proposta_valor === null ? "" : formatBRL(a.proposta_valor) },
      ]);
    }
  }

  /* ---------------- 5. Aprovação da Diretoria ---------------- */
  if (alcancou(5)) {
    secao("5. Aprovação da Diretoria", dataDe.get("aprovacao_diretoria") ? `desde ${formatDate(dataDe.get("aprovacao_diretoria"))}` : undefined);
    const aprovada = Boolean(a.aprovado_por || a.data_aprovacao);
    campos([
      {
        rotulo: "Situação",
        valor: aprovada ? "Aprovada" : a.status === "aprovacao_diretoria" ? "Aguardando aprovação" : "Sem registro de aprovação",
      },
      { rotulo: "Aprovada por", valor: d.aprovadoPor },
      { rotulo: "Data da aprovação", valor: a.data_aprovacao ? formatDate(a.data_aprovacao) : "" },
    ]);
  }

  /* ---------------- 6. Envio ao cliente ---------------- */
  if (alcancou(6)) {
    secao("6. Envio ao Cliente", dataDe.get("proposta_enviada") ? `desde ${formatDate(dataDe.get("proposta_enviada"))}` : undefined);
    campos([
      { rotulo: "Proposta enviada em", valor: a.data_proposta ? formatDate(a.data_proposta) : "" },
      { rotulo: "Valor total proposto", valor: a.proposta_valor === null ? "" : formatBRL(a.proposta_valor) },
    ]);
  }

  /* ---------------- 7. Fechamento ---------------- */
  if (efetivado) {
    secao("7. Fechamento do Negócio - Efetivado", a.data_fechamento ? formatDate(a.data_fechamento) : undefined);
    campos([
      { rotulo: "Serviços fechados", valor: nomesProdutos(a.produtos_fechados), span: 2 },
      { rotulo: "Valor fechado", valor: a.valor_fechado === null ? "" : formatBRL(a.valor_fechado) },
      { rotulo: "Conforme a proposta?", valor: a.conforme_proposta === null ? "Sem proposta registrada" : a.conforme_proposta ? "Sim" : "Não, houve alteração", span: 3 },
    ]);
  } else if (declinado) {
    secao("7. Fechamento do Negócio - Declinado", a.data_declinio ? formatDate(a.data_declinio) : undefined);
    campos([
      { rotulo: "Motivos do declínio", valor: `${a.motivos_declinio.join(", ")}${a.motivo_declinio_outro ? ` - ${a.motivo_declinio_outro}` : ""}`, span: 3 },
    ]);
  }

  /* ---------------- histórico e observações ---------------- */
  type Evento =
    | { tipo: "etapa"; quando: string; de: StatusAtendimento | null; para: StatusAtendimento; usuario: string }
    | { tipo: "nota"; quando: string; nota: PdfNota };
  const eventos: Evento[] = [
    ...d.historico.map((h): Evento => ({ tipo: "etapa", quando: h.created_at, de: h.status_anterior, para: h.status_novo, usuario: h.usuario })),
    ...d.notas.map((n): Evento => ({ tipo: "nota", quando: n.created_at, nota: n })),
  ].sort((x, z) => x.quando.localeCompare(z.quando));

  if (eventos.length) {
    secao("Histórico e observações", `${eventos.length} registro${eventos.length === 1 ? "" : "s"}`);
    for (const ev of eventos) {
      if (ev.tipo === "etapa") {
        garante(7);
        const c: RGB = ev.para === "negocio_declinado" ? COR.erro : ev.para === "negocio_efetivado" ? COR.ok : COR.accent;
        preenche(c);
        doc.circle(M + 1.2, y + 2.2, 1.2, "F");
        fonte(8, true, COR.suave);
        doc.text(formatDateTime(ev.quando), M + 5, y + 3);
        fonte(9, true, c);
        const txt = ev.de ? `${STATUS_MAP[ev.de].label} > ${STATUS_MAP[ev.para].label}` : `Registrado em ${STATUS_MAP[ev.para].label}`;
        doc.text(t(txt), M + 36, y + 3);
        if (ev.usuario) {
          fonte(8, false, COR.suave);
          doc.text(t(`por ${ev.usuario}`), PAG_W - M, y + 3, { align: "right" });
        }
        y += 6.5;
      } else {
        const n = ev.nota;
        const cabecalho = [STATUS_MAP[n.status].label, n.meio_contato ?? "", n.usuario].filter(Boolean).join("  |  ");
        const corpo = n.texto?.trim() ? quebra(n.texto, W - 10, 9) : [];
        const anexos = n.anexos.length ? quebra(`Anexos: ${n.anexos.join(", ")}`, W - 10, 8) : [];
        garante(6 + Math.min(corpo.length, 3) * altLinha(9));
        preenche(COR.linha);
        doc.rect(M + 0.9, y, 0.5, 5.5 + corpo.length * altLinha(9) + anexos.length * altLinha(8), "F");
        fonte(8, true, COR.suave);
        doc.text(formatDateTime(n.created_at), M + 5, y + 3);
        fonte(8, false, COR.suave);
        doc.text(t(cabecalho), M + 36, y + 3);
        y += 5.5;
        if (corpo.length) paragrafo(n.texto!.trim(), M + 5, W - 10, 9);
        if (anexos.length) paragrafo(`Anexos: ${n.anexos.join(", ")}`, M + 5, W - 10, 8, COR.suave);
        y += 2;
      }
    }
  }

  /* ---------------- rodapé (todas as páginas): as duas logos do escritório ---------------- */
  const total = doc.getNumberOfPages();
  const altLogo = 9;
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    traco(COR.linha);
    doc.setLineWidth(0.3);
    doc.line(M, RODAPE_TOPO, PAG_W - M, RODAPE_TOPO);
    const [osc, souza] = logos;
    const wOsc = (altLogo * osc.w) / osc.h;
    const wSouza = (altLogo * souza.w) / souza.h;
    doc.addImage(osc.dados, "PNG", M, RODAPE_TOPO + 3.5, wOsc, altLogo, osc.alias, "FAST");
    doc.addImage(souza.dados, "PNG", PAG_W - M - wSouza, RODAPE_TOPO + 3.5, wSouza, altLogo, souza.alias, "FAST");
    fonte(7.5, false, COR.suave);
    doc.text(t(`CRM Comercial  |  Página ${p} de ${total}`), PAG_W / 2, PAG_H - 6.5, { align: "center" });
  }

  const nomeArquivo = t(a.lead)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  doc.setProperties({ title: `Atendimento - ${a.lead}`, subject: "Ficha do atendimento", creator: "CRM Comercial - OSC Paulistana" });
  doc.save(`atendimento-${nomeArquivo || "lead"}-${new Date().toISOString().slice(0, 10)}.pdf`);
}
