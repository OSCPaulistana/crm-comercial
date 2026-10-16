// Importa a base de leads do CRM anterior (planilha "exportacao-completa") para o CRM OSC Paulistana.
//
//   Simulação (não grava nada; gera a planilha de conferência):
//     node --env-file=.env.local tools/importacao/importar.mjs "C:\caminho\exportacao.xlsx" --saida "C:\caminho\conferencia.xlsx"
//   Importar de verdade:
//     node --env-file=.env.local tools/importacao/importar.mjs "C:\caminho\exportacao.xlsx" --executar
//   Desfazer uma importação (apaga os leads do lote, com histórico, registros e giro):
//     node --env-file=.env.local tools/importacao/importar.mjs --desfazer crm-anterior-2026-09-24
//
// Regras acordadas com a OSC Paulistana:
//  • Canal: Indicação/Parceiro → Indicação · Evento → Captação Ativa · Google → Redes Sociais · demais → Outros
//  • Duplicados pelo CNPJ são consolidados em um único lead, trazendo todas as observações
//  • Perdidos e retornos negativos → Declinado + Giro de Carteira (datas dos follow-ups)
//  • Porte/Regime ausentes → "Não informado" (a tela do CRM continua exigindo o valor real ao salvar)
//  • Responsável de todos os leads: Leila · Etiqueta "Importado" · rastreável por lote (desfazer)

import fs from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";
import { createClient } from "@supabase/supabase-js";

/* ------------------------------------------------------------------ */
/* Argumentos                                                          */
/* ------------------------------------------------------------------ */
const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const valorDe = (n) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : undefined;
};
const arquivo = args.find((a) => !a.startsWith("--") && /\.xlsx$/i.test(a));
const executar = flag("--executar");
const desfazer = valorDe("--desfazer");

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) {
  console.error("✖ Configure NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env.local");
  process.exit(1);
}
const db = createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });

if (desfazer) {
  const { data, error } = await db.from("atendimentos").delete().eq("importacao_lote", desfazer).select("id");
  if (error) throw error;
  console.log(`✔ Importação "${desfazer}" desfeita: ${data.length} leads removidos.`);
  process.exit(0);
}
if (!arquivo) {
  console.error('✖ Informe o caminho da planilha .xlsx. Ex.: node ... importar.mjs "C:\\Downloads\\exportacao.xlsx"');
  process.exit(1);
}

/* ------------------------------------------------------------------ */
/* Utilitários                                                         */
/* ------------------------------------------------------------------ */
const norm = (s) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
const limpa = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
const vazio = (s) => {
  const v = limpa(s);
  return v === "" || v === "—" || v === "-";
};
const texto = (v) => {
  if (v === null || v === undefined) return "";
  if (typeof v === "object" && !(v instanceof Date)) {
    if (Array.isArray(v.richText)) return v.richText.map((r) => r.text).join("");
    if ("text" in v) return String(v.text ?? "");
    if ("result" in v) return String(v.result ?? "");
  }
  return String(v);
};
const pad = (n) => String(n).padStart(2, "0");

/** dd/mm/aaaa (ou Date) → "aaaa-mm-dd" */
function paraISO(v) {
  if (v instanceof Date) return `${v.getUTCFullYear()}-${pad(v.getUTCMonth() + 1)}-${pad(v.getUTCDate())}`;
  const m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(limpa(v));
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}
/** "dd/mm/aaaa, HH:MM:SS" (horário de Brasília) → ISO com fuso */
function timestamp(v, horaPadrao = "12:00:00") {
  if (v instanceof Date) {
    return `${v.getUTCFullYear()}-${pad(v.getUTCMonth() + 1)}-${pad(v.getUTCDate())}T${pad(v.getUTCHours())}:${pad(v.getUTCMinutes())}:${pad(v.getUTCSeconds())}-03:00`;
  }
  const m = /^(\d{2})\/(\d{2})\/(\d{4})(?:[, ]+(\d{2}:\d{2}(?::\d{2})?))?/.exec(limpa(v));
  if (!m) return null;
  const h = m[4] ? (m[4].length === 5 ? `${m[4]}:00` : m[4]) : horaPadrao;
  return `${m[3]}-${m[2]}-${m[1]}T${h}-03:00`;
}
const somaDias = (iso, dias) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + dias)).toISOString().slice(0, 10);
};
const numero = (v) => {
  const s = limpa(v).replace(/[^\d,.-]/g, "");
  if (!s) return null;
  const n = s.includes(",") ? Number(s.replace(/\./g, "").replace(",", ".")) : Number(s);
  return Number.isFinite(n) ? n : null;
};
const mascaraCnpj = (d) => `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
const fmtBR = (iso) => (iso ? iso.split("-").reverse().join("/") : "—");
const titulo = (s) => limpa(s);

/* ------------------------------------------------------------------ */
/* Leitura da planilha                                                 */
/* ------------------------------------------------------------------ */
const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(arquivo);

function lerAba(prefixo) {
  const ws = wb.worksheets.find((w) => norm(w.name).startsWith(norm(prefixo)));
  if (!ws) return [];
  const cab = [];
  ws.getRow(1).eachCell({ includeEmpty: true }, (c, i) => (cab[i] = limpa(texto(c.value))));
  const linhas = [];
  ws.eachRow((row, n) => {
    if (n === 1) return;
    const o = { _linha: n };
    cab.forEach((h, i) => {
      if (h) o[h] = row.getCell(i).value;
    });
    if (Object.keys(o).length > 1) linhas.push(o);
  });
  return linhas;
}
const LEADS = lerAba("Leads");
const FOLLOWUPS = lerAba("Follow");
const HISTORICO = lerAba("Hist");
if (!LEADS.length) {
  console.error('✖ Aba "Leads" não encontrada ou vazia.');
  process.exit(1);
}

const dataExport = (/(\d{4}-\d{2}-\d{2})/.exec(path.basename(arquivo)) ?? [])[1] ?? new Date().toISOString().slice(0, 10);
const LOTE = `crm-anterior-${dataExport}`;

/* ------------------------------------------------------------------ */
/* Regras de conversão                                                 */
/* ------------------------------------------------------------------ */
const CANAL = { indicacao: "Indicação", parceiro: "Indicação", evento: "Captação Ativa", google: "Redes Sociais" };
const MEIO = { whatsapp: "WhatsApp", telefone: "Ligação", presencial: "Presencial", visita: "Presencial", email: "E-mail" };
const REGIMES_OK = new Set(["Simples Nacional", "Lucro Presumido", "Lucro Real"]);
const ORDEM = { primeiro_contato: 0, qualificacao: 1, visita_realizada: 2, proposta_enviada: 3, negocio_efetivado: 4, negocio_declinado: 5 };

function converterEtapa(r) {
  const etapa = norm(r.StatusNegociacao);
  const retorno = norm(r.StatusRetorno);
  const contrato = norm(r.ContratoFechado) === "sim";
  if (etapa === "perdido" || retorno === "negativo") return { status: "negocio_declinado", aviso: null };
  if (etapa === "ganho") {
    return contrato
      ? { status: "negocio_efetivado", aviso: null }
      : { status: "proposta_enviada", aviso: 'Marcado como "ganho" no CRM anterior, mas sem contrato, valor ou data de fechamento: importado como Proposta Enviada.' };
  }
  if (etapa === "proposta_enviada" || etapa === "aguardando decisao" || etapa === "aguardando_decisao") return { status: "proposta_enviada", aviso: null };
  if (etapa === "negociacao") return { status: "visita_realizada", aviso: null };
  if (etapa === "qualificacao") return { status: "qualificacao", aviso: null };
  return { status: "qualificacao", aviso: null };
}

/* ------------------------------------------------------------------ */
/* Municípios (IBGE)                                                   */
/* ------------------------------------------------------------------ */
const ALIAS_CIDADE = { "paraguacu pta": "paraguacu paulista", parapanema: "paranapanema", "ribeirao pires": "ribeirao pires" };
const municipiosIBGE = {};
async function municipios(uf) {
  if (!municipiosIBGE[uf]) {
    try {
      const r = await fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${uf}/municipios`);
      municipiosIBGE[uf] = (await r.json()).map((m) => ({ id: m.id, nome: m.nome, chave: norm(m.nome) }));
    } catch {
      municipiosIBGE[uf] = [];
    }
  }
  return municipiosIBGE[uf];
}
async function resolverLocal(cidadeBruta, ufBruta) {
  const cidade = limpa(cidadeBruta);
  if (!cidade) return { uf: limpa(ufBruta).toUpperCase() || null, municipio: null, ibge: null, aviso: null };
  const chave = ALIAS_CIDADE[norm(cidade)] ?? norm(cidade);
  const ufDada = limpa(ufBruta).toUpperCase();
  const candidatos = ufDada ? [ufDada] : ["SP", "PR", "RJ", "MG", "MS"];
  for (const uf of candidatos) {
    const achou = (await municipios(uf)).find((m) => m.chave === chave);
    if (achou) return { uf, municipio: achou.nome, ibge: achou.id, aviso: ufDada ? null : `UF ${uf} deduzida pela cidade.` };
  }
  return { uf: ufDada || null, municipio: titulo(cidade), ibge: null, aviso: `Cidade "${cidade}" não localizada na lista do IBGE.` };
}

/* ------------------------------------------------------------------ */
/* Consolida duplicados pelo CNPJ                                      */
/* ------------------------------------------------------------------ */
/** CNPJs válidos (14 dígitos) encontrados no campo; o campo pode trazer mais de um. */
const cnpjsDe = (r) => {
  const bruto = limpa(texto(r.CNPJ));
  const sozinho = bruto.replace(/\D/g, "");
  if (sozinho.length === 14) return [sozinho];
  const achados = bruto.match(/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}(?!\d)/g) ?? [];
  return [...new Set(achados.map((a) => a.replace(/\D/g, "")).filter((d) => d.length === 14))];
};
const cnpjDe = (r) => cnpjsDe(r)[0] ?? "";
const grupos = new Map(); // chave → linhas
for (const r of LEADS) {
  const c = cnpjDe(r);
  const chave = c ? `cnpj:${c}` : `linha:${r._linha}`;
  if (!grupos.has(chave)) grupos.set(chave, []);
  grupos.get(chave).push(r);
}
const consolidados = [];

/* ------------------------------------------------------------------ */
/* Follow-ups e histórico por empresa                                  */
/* ------------------------------------------------------------------ */
const followDe = (empresa) => FOLLOWUPS.filter((f) => norm(texto(f.Empresa)) === norm(empresa));
const histDe = (empresa) => HISTORICO.filter((h) => norm(texto(h.Empresa)) === norm(empresa));

/* ------------------------------------------------------------------ */
/* Vendedora e leads já existentes no CRM                              */
/* ------------------------------------------------------------------ */
const { data: vendedoras, error: eVend } = await db.from("vendedores").select("id, nome").ilike("nome", "leila%");
if (eVend) console.error("Erro ao buscar vendedores:", eVend.message);
if (!vendedoras?.length) {
  console.error("✖ Vendedora Leila não encontrada no cadastro de vendedores.");
  process.exit(1);
}
const LEILA = vendedoras[0];
const { data: existentes } = await db.from("atendimentos").select("id, lead, cnpj, importacao_chave");
const nomesExistentes = new Map((existentes ?? []).map((e) => [norm(e.lead), e]));
const cnpjsExistentes = new Map((existentes ?? []).filter((e) => e.cnpj).map((e) => [e.cnpj.replace(/\D/g, ""), e]));
const chavesExistentes = new Set((existentes ?? []).map((e) => e.importacao_chave).filter(Boolean));

/* ------------------------------------------------------------------ */
/* Monta cada lead a importar                                          */
/* ------------------------------------------------------------------ */
const itens = [];
for (const [chaveGrupo, linhas] of grupos) {
  // principal = etapa mais avançada (empate: o mais antigo)
  const conv = linhas.map((r) => ({ r, ...converterEtapa(r) }));
  conv.sort((a, b) => ORDEM[b.status] - ORDEM[a.status] || (paraISO(a.r.DataPrimeiroContato) ?? "").localeCompare(paraISO(b.r.DataPrimeiroContato) ?? ""));
  const principal = conv[0];
  const r = principal.r;
  const avisos = [];
  if (principal.aviso) avisos.push(principal.aviso);
  if (linhas.length > 1) {
    consolidados.push({ cnpj: chaveGrupo.replace("cnpj:", ""), empresas: linhas.map((x) => limpa(texto(x.Empresa))), linhas: linhas.map((x) => x._linha) });
    avisos.push(`Consolidado: ${linhas.length} linhas da planilha com o mesmo CNPJ (linhas ${linhas.map((x) => x._linha).join(" e ")}).`);
  }
  const campo = (nome) => {
    for (const { r: x } of conv) if (!vazio(texto(x[nome]))) return x[nome];
    return null;
  };

  const empresa = limpa(texto(r.Empresa)) || "Lead sem nome";
  const cnpjDig = cnpjDe(r) || [...linhas].map(cnpjDe).find(Boolean) || "";
  const cnpjBruto = limpa(texto(campo("CNPJ")));
  const cnpj = cnpjDig ? mascaraCnpj(cnpjDig) : null;
  const cnpjsExtras = [...new Set(linhas.flatMap(cnpjsDe))].filter((d) => d !== cnpjDig);
  if (!cnpj && !vazio(cnpjBruto)) avisos.push(`CNPJ em formato inválido no CRM anterior ("${cnpjBruto}"): não importado como CNPJ, guardado na observação.`);
  if (cnpjsExtras.length) avisos.push(`Mais de um CNPJ informado: ${mascaraCnpj(cnpjDig)} importado; os demais ficam na observação.`);

  // canal / origem
  const origem = norm(texto(campo("OrigemLead")));
  const detalhe = limpa(texto(campo("DetalheOrigem")));
  const canal = CANAL[origem] ?? "Outros";
  let indicadoPor = null;
  if (canal === "Indicação") {
    indicadoPor = vazio(detalhe) ? "Não informado" : detalhe;
    if (vazio(detalhe)) avisos.push("Indicação sem informar quem indicou.");
  }
  const meioBruto = norm(texto(campo("CanalAquisicao")));
  const meio = MEIO[meioBruto] ?? null;

  // local
  const local = await resolverLocal(texto(campo("Cidade")), texto(campo("Estado")));
  if (local.aviso) avisos.push(local.aviso);
  if (!local.municipio) avisos.push("Sem cidade/UF (será exigido ao editar o lead).");

  // regime
  const regimeBruto = limpa(texto(campo("Regime")));
  const regime = REGIMES_OK.has(regimeBruto) ? regimeBruto : "Não informado";
  const regimeNota = regime === "Não informado" && !vazio(regimeBruto) ? regimeBruto : null;

  // qualificação (o que o CRM anterior tinha)
  const func = numero(texto(campo("Funcionarios")));
  const grupoQtd = numero(texto(campo("EmpresasGrupo")));
  const fechQtd = numero(texto(campo("EmpresasFechadas")));
  const outrasEmpresas = grupoQtd === null || grupoQtd === 0 ? null : grupoQtd > 1;

  // fechamento
  const status = principal.status;
  let valorFechado = null;
  let dataFechamento = null;
  if (status === "negocio_efetivado") {
    valorFechado = numero(texto(campo("ValorMensal"))) ?? numero(texto(campo("ValorContrato")));
    dataFechamento = paraISO(campo("DataFechamento"));
    if (valorFechado === null) avisos.push("Negócio efetivado sem valor informado.");
  }
  const vm = numero(texto(campo("ValorMensal")));
  const vc = numero(texto(campo("ValorContrato")));

  // datas
  const iso1 = paraISO(campo("DataPrimeiroContato"));
  const criado = [...linhas].map((x) => timestamp(x.CriadoEm)).filter(Boolean).sort()[0] ?? null;
  const dataLead = [...linhas].map((x) => paraISO(x.DataPrimeiroContato)).filter(Boolean).sort()[0] ?? criado?.slice(0, 10) ?? dataExport;

  // declínio + giro
  const follows = [...linhas.flatMap((x) => followDe(texto(x.Empresa)))].sort((a, b) => (paraISO(b.ProximoContato) ?? "").localeCompare(paraISO(a.ProximoContato) ?? ""));
  const follow = follows[0] ?? null;
  let declinio = null;
  if (status === "negocio_declinado") {
    const motivoTxt = limpa(texto(campo("DescricaoPerda"))) || limpa(texto(campo("MotivoNegativo"))) || "Motivo não detalhado no CRM anterior.";
    const proximo = follow ? paraISO(follow.ProximoContato) : null;
    declinio = {
      motivo: motivoTxt.slice(0, 500),
      dataDeclinio: proximo ? somaDias(proximo, -60) : dataLead,
      proximoContato: proximo,
      resolvido: follow ? norm(texto(follow.Resolvido)) === "sim" : false,
    };
  }

  // etiqueta de dados que não têm campo próprio → primeira observação
  const dadosAntigos = [];
  dadosAntigos.push(`Registro importado do CRM anterior (exportação de ${fmtBR(dataExport)}).`);
  const etapaAnt = limpa(texto(campo("StatusNegociacao")));
  if (etapaAnt) dadosAntigos.push(`Etapa no CRM anterior: ${etapaAnt}.`);
  if (!vazio(detalhe) && canal !== "Indicação") dadosAntigos.push(`Origem do lead: ${limpa(texto(campo("OrigemLead"))) || "—"} — ${detalhe}.`);
  else if (origem && canal !== "Indicação") dadosAntigos.push(`Origem do lead: ${origem}.`);
  if (canal === "Indicação" && origem === "parceiro") dadosAntigos.push("Origem original: parceiro.");
  if (meioBruto && !meio) dadosAntigos.push(`Canal de aquisição: ${meioBruto}.`);
  if (regimeNota) dadosAntigos.push(`Regime informado no CRM anterior: ${regimeNota}.`);
  const faixa = limpa(texto(campo("FaixaFaturamento")));
  if (faixa) dadosAntigos.push(`Faixa de faturamento: ${faixa}.`);
  if (grupoQtd !== null || fechQtd !== null) dadosAntigos.push(`Empresas do grupo: ${grupoQtd ?? "—"} · empresas fechadas: ${fechQtd ?? "—"}.`);
  const dEnt = paraISO(campo("DataEntrada"));
  const dImp = paraISO(campo("DataImplantacao"));
  if (dEnt || dImp) dadosAntigos.push(`Data de entrada: ${fmtBR(dEnt)} · data de implantação: ${fmtBR(dImp)}.`);
  if (vm !== null && vc !== null && vm !== vc) dadosAntigos.push(`Valor mensal: R$ ${vm} · valor do contrato: R$ ${vc}.`);
  if (norm(texto(campo("SemDor"))) === "sim") dadosAntigos.push("Marcado como “sem dor” no CRM anterior.");
  if (!cnpj && !vazio(cnpjBruto)) dadosAntigos.push(`CNPJ informado no CRM anterior: ${cnpjBruto}.`);
  if (cnpjsExtras.length) dadosAntigos.push(`Outros CNPJs informados no CRM anterior: ${cnpjsExtras.map(mascaraCnpj).join(", ")}.`);

  // registros da linha do tempo
  const notas = [{ texto: dadosAntigos.join("\n"), criado, meio, ordem: 0 }];
  let ord = 1;
  for (const { r: x } of conv.slice().sort((a, b) => (timestamp(a.r.CriadoEm) ?? "").localeCompare(timestamp(b.r.CriadoEm) ?? ""))) {
    const prefixo = linhas.length > 1 ? `[Consolidado do registro de ${fmtBR(paraISO(x.DataPrimeiroContato))}] ` : "";
    const t = timestamp(x.CriadoEm) ?? criado;
    const add = (rotulo, v) => {
      const s = limpa(texto(v)) ? texto(v).replace(/\r/g, "").trim() : "";
      if (s && !vazio(s)) notas.push({ texto: `${prefixo}${rotulo}${s}`, criado: t, meio: null, ordem: ord++ });
    };
    add("Observações: ", x.Observacoes);
    const ret = limpa(texto(x.StatusRetorno));
    add(`Retorno (${ret || "—"}): `, x.InfoRetorno);
    add("Motivo do retorno negativo: ", x.MotivoNegativo);
    add("Próximas ações: ", x.ProximasAcoes);
    add("Descrição da perda: ", x.DescricaoPerda);
  }
  for (const f of follows) {
    const dsc = norm(texto(f.Motivo));
    const jaTem = notas.some((n) => norm(n.texto).includes(dsc.slice(0, 60)));
    notas.push({
      texto: `Follow-up (CRM anterior) previsto para ${fmtBR(paraISO(f.ProximoContato))} — ${norm(texto(f.Resolvido)) === "sim" ? "resolvido" : "pendente"}.${jaTem ? "" : `\n${texto(f.Motivo).trim()}`}`,
      criado: timestamp(f.CriadoEm) ?? criado,
      meio: null,
      ordem: ord++,
    });
  }
  for (const x of linhas.flatMap((l) => histDe(texto(l.Empresa))).filter((h, i, a) => a.indexOf(h) === i)) {
    const d = paraISO(x.Data);
    const hh = x.Hora instanceof Date ? `${pad(x.Hora.getUTCHours())}:${pad(x.Hora.getUTCMinutes())}:${pad(x.Hora.getUTCSeconds())}` : limpa(texto(x.Hora)) || "12:00:00";
    const prox = limpa(texto(x.ProximaAcao));
    const dProx = paraISO(x.DataProximoContato);
    notas.push({
      texto: `${texto(x.Feedback).trim()}${prox ? `\n\nPróxima ação: ${prox}` : ""}${dProx ? `\nPróximo contato: ${fmtBR(dProx)}` : ""}`,
      criado: d ? `${d}T${hh.length === 5 ? `${hh}:00` : hh}-03:00` : criado,
      meio: MEIO[norm(texto(x.Tipo))] ?? null,
      ordem: ord++,
    });
  }

  const contato = limpa(texto(campo("Cliente")));
  const chaveImport = `${LOTE}:${cnpjDig || norm(empresa) + "|" + (criado ?? dataLead)}`;

  // já existe no CRM?
  let ignorar = null;
  const porCnpj = cnpjDig && cnpjsExistentes.get(cnpjDig);
  const porNome = nomesExistentes.get(norm(empresa));
  if (chavesExistentes.has(chaveImport)) ignorar = "Já importado anteriormente.";
  else if (porCnpj) ignorar = `Já existe no CRM (mesmo CNPJ): "${porCnpj.lead}".`;
  else if (porNome) ignorar = `Já existe no CRM (mesmo nome): "${porNome.lead}".`;

  itens.push({
    chaveImport,
    linhas: linhas.map((x) => x._linha),
    etapaAntiga: etapaAnt || "(vazia)",
    ignorar,
    avisos,
    declinio,
    notas,
    atendimento: {
      data: dataLead,
      lead: empresa,
      telefone: null,
      email: null,
      cnpj,
      contato_nome: !vazio(contato) && norm(contato) !== norm(empresa) ? contato : null,
      porte: "Não informado",
      regime,
      canal,
      indicado_por: indicadoPor,
      meio_contato_inicial: meio,
      uf: local.uf,
      municipio: local.municipio,
      municipio_ibge: local.ibge,
      status,
      responsavel_id: LEILA.id,
      qualif_funcionarios: func !== null && func >= 0 ? Math.round(func) : null,
      qualif_outras_empresas: outrasEmpresas,
      qualif_outras_empresas_obs: outrasEmpresas ? `Empresas do grupo: ${grupoQtd}${fechQtd !== null ? ` · fechadas: ${fechQtd}` : ""}.` : null,
      valor_fechado: valorFechado,
      data_fechamento: dataFechamento,
      motivos_declinio: declinio ? ["Outro"] : [],
      motivo_declinio_outro: declinio ? declinio.motivo : null,
      data_declinio: declinio ? declinio.dataDeclinio : null,
      importado: true,
      importacao_lote: LOTE,
      importacao_chave: chaveImport,
    },
    criadoEm: criado,
  });
}

/* ------------------------------------------------------------------ */
/* Resumo                                                              */
/* ------------------------------------------------------------------ */
const importar = itens.filter((i) => !i.ignorar);
const contar = (arr, f) => arr.reduce((m, x) => ((m[f(x)] = (m[f(x)] || 0) + 1), m), {});
const resumo = {
  linhasNaPlanilha: LEADS.length,
  gruposConsolidados: consolidados.length,
  leadsAposConsolidar: itens.length,
  jaExistentesIgnorados: itens.filter((i) => i.ignorar).length,
  aImportar: importar.length,
  porEtapa: contar(importar, (i) => i.atendimento.status),
  porCanal: contar(importar, (i) => i.atendimento.canal),
  comMeioPrimeiroContato: importar.filter((i) => i.atendimento.meio_contato_inicial).length,
  noGiro: importar.filter((i) => i.declinio).length,
  registrosNaLinhaDoTempo: importar.reduce((s, i) => s + i.notas.length, 0),
  semMunicipio: importar.filter((i) => !i.atendimento.municipio).length,
  comAvisos: importar.filter((i) => i.avisos.length).length,
};
console.log(`\nLote: ${LOTE}   (${executar ? "EXECUÇÃO" : "SIMULAÇÃO — nada será gravado"})`);
console.log(JSON.stringify(resumo, null, 2));

const amostra = valorDe("--amostra");
if (amostra) {
  for (const i of itens.filter((x) => norm(x.atendimento.lead).includes(norm(amostra)))) {
    console.log("\n=== " + i.atendimento.lead + " ===");
    console.log(JSON.stringify({ ...i.atendimento, notas: undefined }, null, 2));
    console.log("avisos:", i.avisos, "| declínio:", i.declinio);
    i.notas.forEach((n, k) => console.log(`--- registro ${k + 1} [${n.criado}] meio=${n.meio}\n${n.texto}`));
  }
  process.exit(0);
}

/* ------------------------------------------------------------------ */
/* Planilha de conferência                                             */
/* ------------------------------------------------------------------ */
async function gerarRelatorio(destino) {
  const out = new ExcelJS.Workbook();
  const cab = (ws, colunas) => {
    ws.columns = colunas.map(([header, key, width]) => ({ header, key, width }));
    ws.getRow(1).font = { bold: true, name: "Arial", color: { argb: "FFFFFFFF" } };
    ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF111827" } };
    ws.views = [{ state: "frozen", ySplit: 1 }];
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: colunas.length } };
  };
  const ws0 = out.addWorksheet("Resumo");
  ws0.columns = [{ width: 46 }, { width: 22 }];
  const linhasResumo = [
    ["Lote", LOTE],
    ["Modo", executar ? "Importação executada" : "SIMULAÇÃO (nada foi gravado)"],
    ["Linhas na planilha de leads", resumo.linhasNaPlanilha],
    ["Grupos consolidados pelo CNPJ", resumo.gruposConsolidados],
    ["Leads após consolidar", resumo.leadsAposConsolidar],
    ["Já existentes no CRM (ignorados)", resumo.jaExistentesIgnorados],
    ["LEADS A IMPORTAR", resumo.aImportar],
    ["No Giro de Carteira", resumo.noGiro],
    ["Com meio do 1º contato", resumo.comMeioPrimeiroContato],
    ["Sem cidade/UF", resumo.semMunicipio],
    ["Registros na linha do tempo", resumo.registrosNaLinhaDoTempo],
    ["Leads com avisos", resumo.comAvisos],
    [],
    ["Por etapa", ""],
    ...Object.entries(resumo.porEtapa),
    [],
    ["Por canal", ""],
    ...Object.entries(resumo.porCanal),
  ];
  linhasResumo.forEach((l) => ws0.addRow(l));
  ws0.eachRow((r) => (r.font = { name: "Arial" }));
  [1, 7, 14, 14 + Object.keys(resumo.porEtapa).length + 2].forEach((n) => (ws0.getRow(n).font = { name: "Arial", bold: true }));

  const ws1 = out.addWorksheet("Leads");
  cab(ws1, [
    ["Linhas (planilha)", "linhas", 14], ["Situação", "situacao", 24], ["Empresa", "lead", 36], ["CNPJ", "cnpj", 20], ["Contato", "contato", 22],
    ["Etapa no CRM anterior", "antiga", 20], ["Etapa no novo CRM", "nova", 20], ["Canal", "canal", 14], ["Indicado por", "ind", 22],
    ["Meio do 1º contato", "meio", 16], ["Município", "mun", 22], ["UF", "uf", 6], ["Regime", "regime", 16], ["Funcionários", "func", 12],
    ["Valor fechado (R$)", "valor", 16], ["Data do 1º contato", "data", 16], ["Registros na linha do tempo", "notas", 14], ["Avisos", "avisos", 70],
  ]);
  for (const i of itens) {
    const a = i.atendimento;
    ws1.addRow({
      linhas: i.linhas.join(", "), situacao: i.ignorar ? "IGNORADO" : "Importar", lead: a.lead, cnpj: a.cnpj ?? "", contato: a.contato_nome ?? "",
      antiga: i.etapaAntiga, nova: a.status, canal: a.canal, ind: a.indicado_por ?? "", meio: a.meio_contato_inicial ?? "", mun: a.municipio ?? "", uf: a.uf ?? "",
      regime: a.regime, func: a.qualif_funcionarios ?? "", valor: a.valor_fechado ?? "", data: fmtBR(a.data), notas: i.notas.length,
      avisos: [i.ignorar, ...i.avisos].filter(Boolean).join(" | "),
    });
  }
  ws1.getColumn("valor").numFmt = "#,##0.00";
  ws1.eachRow((r, n) => { if (n > 1) r.font = { name: "Arial" }; });

  const ws2 = out.addWorksheet("Consolidados");
  cab(ws2, [["CNPJ", "cnpj", 22], ["Nomes na planilha", "nomes", 60], ["Linhas", "linhas", 14]]);
  consolidados.forEach((c) => ws2.addRow({ cnpj: c.cnpj, nomes: c.empresas.join("  ·  "), linhas: c.linhas.join(" e ") }));

  const ws3 = out.addWorksheet("Giro de Carteira");
  cab(ws3, [["Empresa", "lead", 36], ["Declinado em (calculada)", "dd", 22], ["Próximo contato", "px", 18], ["Giro", "giro", 24], ["Motivo (resumo)", "motivo", 80]]);
  importar.filter((i) => i.declinio).forEach((i) => {
    const d = i.declinio;
    const proximo = d.proximoContato ? (d.resolvido ? somaDias(d.proximoContato, 60) : d.proximoContato) : somaDias(d.dataDeclinio, 60);
    ws3.addRow({ lead: i.atendimento.lead, dd: fmtBR(d.dataDeclinio), px: fmtBR(proximo), giro: d.resolvido ? "2º giro (follow-up já resolvido)" : "1º giro", motivo: d.motivo.slice(0, 160) });
  });
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  await out.xlsx.writeFile(destino);
}

const saida = valorDe("--saida") ?? path.join(path.dirname(arquivo), `conferencia-importacao-${LOTE}.xlsx`);
await gerarRelatorio(saida);
console.log(`\n✔ Planilha de conferência: ${saida}`);

if (!executar) {
  console.log("\nSimulação concluída. Nada foi gravado. Para importar, repita o comando com --executar.");
  process.exit(0);
}

/* ------------------------------------------------------------------ */
/* Gravação                                                            */
/* ------------------------------------------------------------------ */
const log = { lote: LOTE, criados: [], falhas: [] };
let ok = 0;
for (const it of importar) {
  try {
    const { data: criado, error } = await db.from("atendimentos").insert(it.atendimento).select("id").single();
    if (error) throw error;
    const id = criado.id;

    // datas do CRM anterior (o gatilho cria a linha do tempo "agora")
    if (it.criadoEm) {
      await db.from("atendimentos").update({ created_at: it.criadoEm }).eq("id", id);
      await db.from("atendimento_historico").update({ created_at: it.criadoEm }).eq("atendimento_id", id);
    }
    const { data: hist } = await db.from("atendimento_historico").select("id").eq("atendimento_id", id).order("created_at").limit(1);
    const historicoId = hist?.[0]?.id ?? null;

    const linhasNotas = it.notas.map((n) => ({
      atendimento_id: id,
      historico_id: historicoId,
      status: it.atendimento.status,
      meio_contato: n.meio,
      texto: n.texto,
      usuario_id: null,
      created_at: n.criado ?? it.criadoEm ?? new Date().toISOString(),
    }));
    if (linhasNotas.length) {
      const { error: eN } = await db.from("atendimento_notas").insert(linhasNotas);
      if (eN) throw eN;
    }

    // follow-up já resolvido no CRM anterior → o lead entra no 2º giro
    if (it.declinio?.resolvido && it.declinio.proximoContato) {
      const { data: g } = await db.from("giro_carteira").select("id").eq("atendimento_id", id).single();
      if (g) {
        await db.from("giro_interacoes").insert({
          giro_id: g.id, etapa: 1, data: it.declinio.proximoContato, resultado: "retomar_contato",
          observacao: "Follow-up marcado como resolvido no CRM anterior (importado).", usuario_id: null,
        });
        await db.from("giro_carteira").update({ etapa: 2, proxima_data: somaDias(it.declinio.proximoContato, 60) }).eq("id", g.id);
      }
    }
    log.criados.push({ id, lead: it.atendimento.lead });
    ok++;
  } catch (e) {
    log.falhas.push({ lead: it.atendimento.lead, erro: e?.message ?? String(e) });
    console.error(`✖ ${it.atendimento.lead}: ${e?.message ?? e}`);
  }
}
const arqLog = path.join(path.dirname(saida), `importacao-${LOTE}.log.json`);
fs.writeFileSync(arqLog, JSON.stringify(log, null, 2));
console.log(`\n✔ Importados: ${ok} de ${importar.length}. Falhas: ${log.falhas.length}.`);
console.log(`Log: ${arqLog}`);
console.log(`Para desfazer: node --env-file=.env.local tools/importacao/importar.mjs --desfazer ${LOTE}`);
