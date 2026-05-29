import Link from "next/link";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <Link
          href="/"
          className="mb-8 flex items-center justify-center gap-[10px]"
        >
          <span className="brand-glyph size-[28px] text-[16px]">
            C
          </span>
          <span className="font-display text-xl font-bold tracking-[.06em]">
            CrawlDirector
          </span>
        </Link>
        {children}
      </div>
    </main>
  );
}
