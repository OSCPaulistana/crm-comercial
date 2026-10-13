// Servidor MCP SOMENTE LEITURA do CRM Comercial OSC Paulistana.
// Conecta com a role `claude_leitura` (só enxerga as views do schema "leitura") e roda cada consulta
// dentro de uma transação READ ONLY, com limite de linhas e de tempo. Fala por stdio.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import pg from "pg";
import { z } from "zod";

const PROJECT_REF = "efcnghhjblvzddhzupga";
const MAX_LINHAS = 500;

const senha = process.env.CRM_LEITURA_SENHA;
if (!senha) {
  console.error("CRM_LEITURA_SENHA não definida (veja tools/mcp-leitura/.env).");
  process.exit(1);
}

const pool = new pg.Pool({
  host: process.env.CRM_LEITURA_HOST ?? "aws-0-sa-east-1.pooler.supabase.com",
  port: Number(process.env.CRM_LEITURA_PORT ?? 5432),
  user: `claude_leitura.${PROJECT_REF}`,
  password: senha,
  database: "postgres",
  ssl: { rejectUnauthorized: false },
  max: 2,
  statement_timeout: 15000,
});

async function consultar(sql, params = []) {
  const client = await pool.connect();
  try {
    await client.query("begin read only");
    const r = await client.query(sql, params);
    await client.query("rollback");
    return r;
  } catch (e) {
    await client.query("rollback").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

const texto = (obj) => ({ content: [{ type: "text", text: typeof obj === "string" ? obj : JSON.stringify(obj, null, 2) }] });
const erro = (msg) => ({ isError: true, content: [{ type: "text", text: msg }] });

const server = new McpServer({ name: "crm-comercial-leitura", version: "1.0.0" });

server.registerTool(
  "listar_tabelas",
  {
    title: "Listar tabelas e colunas",
    description:
      "Lista as views disponíveis do CRM (schema leitura) com suas colunas. Use antes de consultar. " +
      "Telefone, e-mail e nome de contato dos leads não são expostos.",
    inputSchema: {},
  },
  async () => {
    const r = await consultar(
      `select table_name, string_agg(column_name || ' (' || data_type || ')', ', ' order by ordinal_position) as colunas
         from information_schema.columns where table_schema = 'leitura' group by table_name order by table_name`,
    );
    return texto(r.rows);
  },
);

server.registerTool(
  "consultar",
  {
    title: "Consultar dados (somente leitura)",
    description:
      `Executa UM comando SELECT (ou WITH ... SELECT) nas views do schema leitura. Retorna no máximo ${MAX_LINHAS} linhas. ` +
      "Qualquer comando que altere dados é recusado. Ex.: select status, count(*) from atendimentos group by 1",
    inputSchema: { sql: z.string().min(6).max(5000).describe("Comando SELECT em PostgreSQL") },
  },
  async ({ sql }) => {
    const limpo = sql.trim().replace(/;+\s*$/, "");
    if (limpo.includes(";")) return erro("Envie apenas um comando por vez.");
    if (!/^(select|with)\b/i.test(limpo)) return erro("Só são aceitos comandos SELECT / WITH.");
    try {
      const r = await consultar(`select * from (${limpo}) as _q limit ${MAX_LINHAS + 1}`);
      const truncado = r.rows.length > MAX_LINHAS;
      return texto({ linhas: truncado ? r.rows.slice(0, MAX_LINHAS) : r.rows, total_retornado: Math.min(r.rows.length, MAX_LINHAS), truncado });
    } catch (e) {
      return erro(`Erro na consulta: ${e.message}`);
    }
  },
);

await server.connect(new StdioServerTransport());
