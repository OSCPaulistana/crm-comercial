import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-4 text-center">
      <p className="text-sm font-medium text-accent">404</p>
      <h1 className="text-xl font-semibold text-fg">Página não encontrada</h1>
      <p className="text-sm text-fg-2">O endereço acessado não existe ou foi movido.</p>
      <Link href="/dashboard" className="mt-2 text-sm font-medium text-accent hover:underline">
        Voltar ao dashboard
      </Link>
    </div>
  );
}
