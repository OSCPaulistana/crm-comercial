import Image from "next/image";

/**
 * Logos oficiais. Arquivos originais preservados (apenas o espaço em branco
 * do canvas foi removido; o fundo é transparente).
 * Nunca recolorir, distorcer ou aplicar filtros.
 */
const LOGOS = {
  osc: { src: "/branding/osc-paulistana-logo.png", w: 1517, h: 273, alt: "Paulistana Contabilidade Empresarial" },
  souza: { src: "/branding/souza-cardoso-logo.png", w: 1575, h: 325, alt: "Souza Cardoso Contabilidade e Consultoria Empresarial" },
} as const;

function BrandImage({
  logo,
  height,
  className = "",
  priority,
}: {
  logo: keyof typeof LOGOS;
  height: number;
  className?: string;
  priority?: boolean;
}) {
  const l = LOGOS[logo];
  return (
    <Image
      src={l.src}
      alt={l.alt}
      width={Math.round((height * l.w) / l.h)}
      height={height}
      priority={priority}
      className={`shrink-0 self-start object-contain ${className}`}
      // Altura fixa + largura automática: preserva sempre a proporção original da marca
      style={{ height: `${height}px`, width: "auto" }}
    />
  );
}

export function OSCLogo(props: { height?: number; className?: string; priority?: boolean }) {
  return <BrandImage logo="osc" height={props.height ?? 32} className={props.className} priority={props.priority} />;
}

export function SouzaCardosoLogo(props: { height?: number; className?: string; priority?: boolean }) {
  return <BrandImage logo="souza" height={props.height ?? 32} className={props.className} priority={props.priority} />;
}
