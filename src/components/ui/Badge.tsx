import type { Tone } from "@/lib/constants";

const tones: Record<Tone, string> = {
  neutral: "bg-gray-100 text-gray-700 ring-gray-200",
  info: "bg-info-soft text-[#1d4ed8] ring-[#bfdbfe]",
  success: "bg-success-soft text-[#15803d] ring-[#bbf7d0]",
  warning: "bg-warning-soft text-[#b45309] ring-[#fde68a]",
  danger: "bg-danger-soft text-[#b91c1c] ring-[#fecaca]",
};

const dots: Record<Tone, string> = {
  neutral: "bg-gray-400",
  info: "bg-info",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
};

export function Badge({
  tone = "neutral",
  children,
  dot = true,
  className = "",
}: {
  tone?: Tone;
  children: React.ReactNode;
  dot?: boolean;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset ${tones[tone]} ${className}`}
    >
      {dot && <span className={`size-1.5 rounded-full ${dots[tone]}`} aria-hidden />}
      {children}
    </span>
  );
}
