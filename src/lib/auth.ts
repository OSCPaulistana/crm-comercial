import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Perfil } from "@/lib/constants";
import type { Profile } from "@/types/database";

export const getSessionProfile = cache(async (): Promise<Profile | null> => {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return null;

  const { data } = await supabase
    .from("profiles")
    .select("id, nome, email, perfil, ativo, created_at")
    .eq("id", userId)
    .maybeSingle();
  return (data as Profile | null) ?? null;
});

/** Garante sessão + perfil ativo e (opcionalmente) um dos perfis permitidos. */
export async function requirePerfil(permitidos?: Perfil[]) {
  const profile = await getSessionProfile();
  if (!profile || !profile.ativo) redirect("/auth/signout?erro=inativo");
  if (permitidos && !permitidos.includes(profile.perfil)) redirect("/dashboard");
  return profile;
}
