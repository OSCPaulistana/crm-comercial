"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  BarChart3,
  Box,
  Headset,
  LogOut,
  Megaphone,
  Menu,
  RefreshCcw,
  Target,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { OSCLogo, SouzaCardosoLogo } from "@/components/ui/Logo";
import { NAV_ITEMS, type NavIcon } from "@/lib/navigation";
import { PERFIL_LABEL, type Perfil } from "@/lib/constants";
import { iniciais } from "@/lib/format";

const ICONS: Record<NavIcon, LucideIcon> = {
  dashboard: BarChart3,
  atendimentos: Headset,
  giro: RefreshCcw,
  campanhas: Megaphone,
  produtos: Box,
  metas: Target,
  usuarios: Users,
};

export function Sidebar({ nome, email, perfil }: { nome: string; email: string; perfil: Perfil }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => setOpen(false), [pathname]);

  const items = NAV_ITEMS.filter((i) => i.perfis.includes(perfil));
  const grupos = [...new Set(items.map((i) => i.grupo))];

  return (
    <>
      {/* Barra superior (mobile/tablet) */}
      <div className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-ink-4 bg-ink px-4 lg:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Abrir menu"
          className="inline-flex size-9 items-center justify-center rounded-md text-gray-300 hover:bg-ink-4 hover:text-white"
        >
          <Menu className="size-5" />
        </button>
        <span className="text-sm font-medium text-white">CRM Comercial</span>
        <span className="size-9" />
      </div>

      {open && <div className="fixed inset-0 z-40 bg-ink/50 lg:hidden" onClick={() => setOpen(false)} aria-hidden />}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-60 flex-col bg-ink text-gray-300 transition-transform duration-200 lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-start justify-between gap-2 px-5 pt-6 pb-4">
          {/* Logos oficiais aplicadas diretamente sobre o menu (PNG com fundo transparente) */}
          <Link href="/dashboard" className="flex flex-1 flex-col gap-3.5" aria-label="Início">
            <OSCLogo height={27} priority />
            <span className="h-px w-full bg-ink-4" aria-hidden />
            <SouzaCardosoLogo height={30} priority />
          </Link>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Fechar menu"
            className="inline-flex size-8 items-center justify-center rounded-md text-gray-400 hover:bg-ink-4 hover:text-white lg:hidden"
          >
            <X className="size-4" />
          </button>
        </div>
        <p className="px-5 pb-2 text-[11px] font-medium tracking-[0.08em] text-gray-500 uppercase">CRM Comercial</p>

        <nav className="flex-1 overflow-y-auto px-3 pb-4" aria-label="Módulos">
          {grupos.map((g) => (
            <div key={g} className="mt-4 first:mt-2">
              <p className="px-2 pb-1.5 text-[11px] font-medium tracking-[0.08em] text-gray-500 uppercase">{g}</p>
              <ul className="space-y-0.5">
                {items
                  .filter((i) => i.grupo === g)
                  .map((item) => {
                    const Icon = ICONS[item.icon];
                    const active = pathname === item.href || pathname.startsWith(item.href + "/");
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          aria-current={active ? "page" : undefined}
                          className={`relative flex h-9 items-center gap-2.5 rounded-md px-2.5 text-[13.5px] transition-colors ${
                            active
                              ? "bg-ink-4 font-medium text-white"
                              : "text-gray-400 hover:bg-ink-3 hover:text-gray-100"
                          }`}
                        >
                          {active && <span className="absolute top-2 bottom-2 left-0 w-[3px] rounded-r bg-accent" aria-hidden />}
                          <Icon className={`size-4 ${active ? "text-[#60a5fa]" : ""}`} aria-hidden />
                          {item.label}
                        </Link>
                      </li>
                    );
                  })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="border-t border-ink-4 p-3">
          <div className="flex items-center gap-2.5 rounded-md px-2 py-2">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-ink-4 text-xs font-semibold text-white">
              {iniciais(nome)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium text-white" title={nome}>
                {nome}
              </p>
              <p className="truncate text-xs text-gray-500" title={email}>
                {PERFIL_LABEL[perfil]}
              </p>
            </div>
            <form action="/auth/signout" method="post">
              <button
                type="submit"
                aria-label="Sair"
                title="Sair"
                className="inline-flex size-8 items-center justify-center rounded-md text-gray-400 hover:bg-ink-4 hover:text-white"
              >
                <LogOut className="size-4" />
              </button>
            </form>
          </div>
        </div>
      </aside>
    </>
  );
}
