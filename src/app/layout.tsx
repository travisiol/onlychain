import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { Providers } from "@/components/Providers";
import { getSession, isOps } from "@/lib/server/auth";
import { getProfile, unreadMessages } from "@/lib/server/store";
import { seedIfEmpty } from "@/lib/server/seed";
import { site } from "@/lib/site";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: { default: `${site.name} — ${site.tagline}`, template: `%s · ${site.name}` },
  description: site.description,
  metadataBase: new URL(site.url),
  openGraph: { title: site.name, description: site.description, siteName: site.name, type: "website" },
  twitter: { card: "summary_large_image", title: site.name, description: site.description },
};

export const viewport: Viewport = { themeColor: "#01abfc", width: "device-width", initialScale: 1 };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  seedIfEmpty();
  const session = await getSession();
  const initial = session
    ? { session, profile: getProfile(session.address), unread: unreadMessages(session.address), ops: isOps(session.address) }
    : { session: null, profile: null, unread: 0, ops: false };
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-dvh">
        <Providers initial={initial}>{children}</Providers>
      </body>
    </html>
  );
}
