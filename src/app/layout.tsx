import type { Metadata } from "next";
import { Chakra_Petch, Space_Grotesk, JetBrains_Mono } from "next/font/google";
import { cookies } from "next/headers";
import "./globals.css";

const chakraPetch = Chakra_Petch({
  variable: "--font-chakra-petch",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "CrawlDirector",
  description:
    "Model, run, and curate a Dungeon Crawler Carl campaign — DM-controlled canon with AI as a subordinate contributor.",
};

// Broadcast-FX preference is persisted in the `cd-fx` cookie and applied
// server-side (no flash, no inline script). Defaults ON; the toggle sets it,
// and CSS disables the flickery layers under prefers-reduced-motion regardless.
export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const fxEnabled = (await cookies()).get("cd-fx")?.value !== "off";

  return (
    <html
      lang="en"
      className={`${chakraPetch.variable} ${spaceGrotesk.variable} ${jetbrainsMono.variable} h-full antialiased${fxEnabled ? " fx" : ""}`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <div className="fx-layer fx-grain" aria-hidden />
        <div className="fx-layer fx-scanlines" aria-hidden />
        <div className="fx-layer fx-vignette" aria-hidden />
      </body>
    </html>
  );
}
