import { cn } from "@/lib/utils";

/**
 * Standard scroll + width frame for "document" DM pages (dashboard, campaign,
 * review queue). The console shell's <main> is full-bleed and non-scrolling so
 * full-bleed screens (the entity detail's two-column workspace) can own their
 * own layout; contained pages opt back into the centered, padded column here.
 */
export function PageContainer({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="h-full overflow-y-auto">
      <div className={cn("mx-auto w-full max-w-6xl px-6 py-8", className)}>
        {children}
      </div>
    </div>
  );
}
