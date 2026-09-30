import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

async function signOut(request: NextRequest, status: number) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  const url = new URL("/login", request.url);
  const erro = request.nextUrl.searchParams.get("erro");
  if (erro === "inativo") url.searchParams.set("erro", "inativo");
  return NextResponse.redirect(url, { status });
}

export async function POST(request: NextRequest) {
  return signOut(request, 303);
}

/** Usado quando a sessão existe mas o usuário está inativo/sem perfil. */
export async function GET(request: NextRequest) {
  return signOut(request, 307);
}
