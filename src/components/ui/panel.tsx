import { cn } from "@/lib/utils";
import { Kicker } from "@/components/ui/kicker";

/** HUD surface: hairline-bordered panel on the --bg-1 layer. */
export function Panel({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("panel", className)} {...props} />;
}

/** Panel header with optional kicker, subtitle, and right-aligned actions. */
export function PanelHeader({
  kicker,
  title,
  sub,
  right,
}: {
  kicker?: React.ReactNode;
  title: React.ReactNode;
  sub?: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-[var(--line)] px-[18px] py-[14px]">
      <div className="min-w-0">
        {kicker && <Kicker className="mb-[7px]">{kicker}</Kicker>}
        <div className="font-display text-[17px] font-semibold tracking-[.01em]">
          {title}
        </div>
        {sub && (
          <div className="mt-1 text-xs text-[var(--ink-faint)]">{sub}</div>
        )}
      </div>
      {right && (
        <div className="flex shrink-0 items-center gap-2">{right}</div>
      )}
    </div>
  );
}
