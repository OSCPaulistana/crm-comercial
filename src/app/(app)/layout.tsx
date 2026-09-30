import { Sidebar } from "@/components/layout/Sidebar";
import { ToastProvider } from "@/components/ui/Toast";
import { requirePerfil } from "@/lib/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const profile = await requirePerfil();

  return (
    <ToastProvider>
      <Sidebar nome={profile.nome} email={profile.email} perfil={profile.perfil} />
      <main className="min-h-screen lg:pl-60">
        <div className="mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</div>
      </main>
    </ToastProvider>
  );
}
