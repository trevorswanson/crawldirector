import Link from "next/link";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <Link href="/" className="mb-8 block text-center">
          <span className="text-xl font-semibold tracking-tight">
            DCC Campaign Builder
          </span>
        </Link>
        {children}
      </div>
    </main>
  );
}
