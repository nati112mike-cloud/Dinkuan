import type { Metadata, Viewport } from "next";
import { Noto_Sans_Ethiopic } from "next/font/google";
import { isDemoMode } from "@dinkuan/core/server";
import { BottomNav } from "@/components/BottomNav";
import { Header } from "@/components/Header";
import { SwRegister } from "@/components/SwRegister";
import { unreadConversations } from "@dinkuan/marketplace";
import { unreadCount } from "@dinkuan/social";
import { getT } from "@/lib/session";
import { currentMember, toProfileDTO } from "@/lib/social";
import "./globals.css";

const ethiopic = Noto_Sans_Ethiopic({ subsets: ["ethiopic", "latin"], weight: ["400", "600", "700", "800"], display: "swap" });

export const metadata: Metadata = {
  title: { default: "ድንኳን · Dinkuan", template: "%s · ድንኳን" },
  description: "Find events in Addis Ababa, get in with one tap, and share the moments.",
  manifest: "/manifest.webmanifest",
  metadataBase: new URL(process.env.APP_URL ?? "http://localhost:3000"),
};

export const viewport: Viewport = { themeColor: "#a94a12", width: "device-width", initialScale: 1 };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { lang, t } = await getT();
  const me = await currentMember();
  const [unread, inbox] = me ? await Promise.all([unreadCount(me.user.id), unreadConversations(me.user.id)]) : [0, 0];
  return (
    <html lang={lang} className={ethiopic.className}>
      <body className="min-h-dvh">
        {isDemoMode() && (
          <div className="bg-ink px-4 py-1.5 text-center text-xs text-tent-100">{t("demo.banner")}</div>
        )}
        <Header lang={lang} me={me ? toProfileDTO(me.profile) : null} unread={unread} inbox={inbox} />
        <main className="mx-auto max-w-2xl px-4 pb-28 pt-4">{children}</main>
        <BottomNav lang={lang} />
        <SwRegister />
      </body>
    </html>
  );
}
