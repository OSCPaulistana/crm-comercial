import { Badge } from "@/components/ui/Badge";
import { STATUS_MAP, type StatusAtendimento } from "@/lib/constants";

export function StatusBadge({ status }: { status: StatusAtendimento }) {
  const s = STATUS_MAP[status];
  return <Badge tone={s?.tone ?? "neutral"}>{s?.label ?? status}</Badge>;
}
