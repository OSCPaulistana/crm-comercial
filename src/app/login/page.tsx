import type { Metadata } from "next";
import { OSCLogo } from "@/components/ui/Logo";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Entrar" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const { erro } = await searchParams;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-bg px-4 py-10">
      <div className="w-full max-w-[400px]">
        <div className="mb-8 flex justify-center">
          <OSCLogo height={44} priority />
        </div>
        <div className="card p-7 shadow-soft">
          <h1 className="text-lg font-semibold text-fg">Acessar o CRM Comercial</h1>
          <p className="mt-1 mb-6 text-[13px] text-fg-2">Entre com seu e-mail e senha corporativos.</p>
          <LoginForm inativo={erro === "inativo"} />
        </div>
        <p className="mt-6 text-center text-xs text-fg-3">© {new Date().getFullYear()} OSC Paulistana</p>
      </div>
    </div>
  );
}
