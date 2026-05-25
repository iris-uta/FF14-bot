import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "FF14 固定支援 Bot",
  description:
    "Final Fantasy XIV の固定パーティ活動を Discord 上で支援する Bot。コンテンツ別 Phase チャネル自動作成、攻略マクロ・軽減表配信、開始通知。",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body className="min-h-screen flex flex-col">
        <header className="border-b border-black/10 dark:border-white/10">
          <nav className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
            <Link href="/" className="font-semibold text-lg">
              FF14 固定支援 Bot
            </Link>
            <ul className="flex gap-6 text-sm">
              <li>
                <Link href="/" className="hover:underline">
                  ホーム
                </Link>
              </li>
              <li>
                <Link href="/privacy" className="hover:underline">
                  プライバシー
                </Link>
              </li>
              <li>
                <Link href="/terms" className="hover:underline">
                  利用規約
                </Link>
              </li>
            </ul>
          </nav>
        </header>
        <main className="flex-1 max-w-5xl mx-auto px-6 py-10 w-full">{children}</main>
        <footer className="border-t border-black/10 dark:border-white/10 mt-8">
          <div className="max-w-5xl mx-auto px-6 py-6 text-sm text-black/60 dark:text-white/60 flex flex-col sm:flex-row gap-2 sm:justify-between">
            <span>© 2026 FF14 固定支援 Bot</span>
            <span>
              FINAL FANTASY XIV ©2010 - SQUARE ENIX CO., LTD. このサイトは公式コンテンツとは無関係です。
            </span>
          </div>
        </footer>
      </body>
    </html>
  );
}
