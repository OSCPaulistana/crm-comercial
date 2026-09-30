import type { Metadata } from "next";
import { requirePerfil } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { GESTORES } from "@/lib/constants";
import type { Produto } from "@/types/database";
import { ProdutosView } from "./ProdutosView";

export const metadata: Metadata = { title: "Produtos e Serviços" };

export default async function ProdutosPage() {
  await requirePerfil(GESTORES);
  const supabase = await createClient();
  const { data } = await supabase.from("produtos").select("*").order("nome");
  return <ProdutosView produtos={(data ?? []) as Produto[]} />;
}
