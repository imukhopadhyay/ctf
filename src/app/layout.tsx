import type { Metadata, Viewport } from "next";
import "./globals.css";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

export const metadata: Metadata = {
  title: { default: "CyberQuest CTF", template: "%s · CyberQuest CTF" },
  description: "Gamified cybersecurity Capture-the-Flag competitions for universities, clubs and security teams.",
  robots: { index: true, follow: true },
};

export const viewport: Viewport = { themeColor: "#060a13", colorScheme: "dark" };

// Every page depends on the session and a per-request CSP nonce.
export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen antialiased">
        <SiteHeader />
        <main id="main" className="mx-auto w-full max-w-7xl px-4 py-8">
          {children}
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}
