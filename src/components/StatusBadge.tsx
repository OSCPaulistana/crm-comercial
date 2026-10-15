import { Badge } from "@/components/ui/Badge";
import { STATUS_MAP, type StatusAtendimento } from "@/lib/constants";

/** `wrap`: permite quebrar o nome em duas linhas (tabelas estreitas). */
export function StatusBadge({ status, wrap }: { status: StatusAtendimento; wrap?: boolean }) {
  const s = STATUS_MAP[status];
  return (
    <Badge tone={s?.tone ?? "neutral"} className={wrap ? "rounded-xl text-left leading-tight whitespace-normal!" : ""}>
      {s?.label ?? status}
    </Badge>
  );
}
