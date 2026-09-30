export function KpiCard({
  label,
  value,
  context,
  icon,
  tone = "neutral",
}: {
  label: string;
  value: string;
  context?: React.ReactNode;
  icon?: React.ReactNode;
  tone?: "neutral" | "accent" | "success" | "danger";
}) {
  const iconTone = {
    neutral: "bg-gray-100 text-fg-2",
    accent: "bg-accent-soft text-accent",
    success: "bg-success-soft text-success",
    danger: "bg-danger-soft text-danger",
  }[tone];
  return (
    <div className="card flex flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[13px] font-medium text-fg-2">{label}</p>
        {icon && <span className={`flex size-8 shrink-0 items-center justify-center rounded-md ${iconTone}`}>{icon}</span>}
      </div>
      <p className="text-[28px] leading-none font-semibold tracking-tight text-fg tabular-nums">{value}</p>
      {context && <div className="text-xs text-fg-2">{context}</div>}
    </div>
  );
}
