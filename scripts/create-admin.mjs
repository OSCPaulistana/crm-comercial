// Cria (ou promove) o primeiro administrador do CRM.
// Uso: npm run create-admin -- email@empresa.com.br "Senha@Forte123" "Nome Completo"
import { createClient } from "@supabase/supabase-js";

const [email, senha, ...nomeParts] = process.argv.slice(2);
const nome = nomeParts.join(" ") || "Administrador";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("✖ Configure NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env.local");
  process.exit(1);
}
if (!email || !senha || senha.length < 8) {
  console.error('✖ Uso: npm run create-admin -- email@empresa.com.br "SenhaCom8+" "Nome Completo"');
  process.exit(1);
}

const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

let userId;
const { data, error } = await admin.auth.admin.createUser({
  email,
  password: senha,
  email_confirm: true,
  user_metadata: { nome },
});

if (error) {
  if (!/already|registered|exists/i.test(error.message)) {
    console.error("✖ Erro ao criar usuário:", error.message);
    process.exit(1);
  }
  // Usuário já existe: localiza e promove
  for (let page = 1; !userId; page++) {
    const { data: list, error: lErr } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (lErr || !list.users.length) break;
    userId = list.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())?.id;
  }
  if (!userId) {
    console.error("✖ Usuário já existe, mas não foi possível localizá-lo.");
    process.exit(1);
  }
  await admin.auth.admin.updateUserById(userId, { password: senha, ban_duration: "none" });
  console.log("• Usuário já existia — senha atualizada e perfil promovido.");
} else {
  userId = data.user.id;
}

const { error: pErr } = await admin
  .from("profiles")
  .upsert({ id: userId, nome, email: email.toLowerCase(), perfil: "administrador", ativo: true });

if (pErr) {
  console.error("✖ Erro ao gravar o perfil. As migrations foram aplicadas?", pErr.message);
  process.exit(1);
}

console.log(`✔ Administrador pronto: ${email}`);
