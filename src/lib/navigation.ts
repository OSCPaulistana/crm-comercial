import { ADMIN, GESTORES, TODOS, type Perfil } from "@/lib/constants";

export type NavIcon = "dashboard" | "atendimentos" | "giro" | "campanhas" | "produtos" | "metas" | "usuarios";

export interface NavItem {
  href: string;
  label: string;
  icon: NavIcon;
  perfis: Perfil[];
  grupo: "Comercial" | "Cadastros" | "Administração";
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: "dashboard", perfis: TODOS, grupo: "Comercial" },
  { href: "/atendimentos", label: "Atendimentos", icon: "atendimentos", perfis: TODOS, grupo: "Comercial" },
  { href: "/giro-carteira", label: "Giro de Carteira", icon: "giro", perfis: TODOS, grupo: "Comercial" },
  { href: "/campanhas", label: "Campanhas", icon: "campanhas", perfis: GESTORES, grupo: "Cadastros" },
  { href: "/produtos", label: "Produtos e Serviços", icon: "produtos", perfis: GESTORES, grupo: "Cadastros" },
  { href: "/metas", label: "Metas", icon: "metas", perfis: GESTORES, grupo: "Cadastros" },
  { href: "/usuarios", label: "Gestão de Usuários", icon: "usuarios", perfis: ADMIN, grupo: "Administração" },
];
