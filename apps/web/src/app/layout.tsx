import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "固定支援Bot",
  description:
    "Final Fantasy XIV の固定パーティ活動を Discord 上で支援する Bot。コンテンツ別 Phase チャネル自動作成、攻略マクロ・軽減表配信、開始通知。",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body className="min-h-screen flex flex-col">
        <header className="border-b border-black/10 dark:border-white/10">
          <nav className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
            <Link href="/" className="font-semibold text-lg shrink-0">
              固定支援Bot
            </Link>
            <ul className="hidden sm:flex gap-5 text-sm">
              <li>
                <Link href="/" className="hover:underline">
                  ホーム
                </Link>
              </li>
              <li>
                <Link href="/guide" className="hover:underline">
                  使い方
                </Link>
              </li>
              <li>
                <Link href="/recruit-tool" className="hover:underline">
                  募集生成
                </Link>
              </li>
              <li>
                <Link href="/invite" className="hover:underline">
                  サーバーに追加
                </Link>
              </li>
            </ul>
          </nav>
        </header>
        <main className="flex-1 max-w-5xl mx-auto px-6 py-10 w-full">{children}</main>
        <footer className="border-t border-black/10 dark:border-white/10 mt-8">
          <div className="max-w-5xl mx-auto px-6 py-6 text-sm text-black/60 dark:text-white/60 flex flex-col gap-3">
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              <Link href="/privacy" className="hover:underline">
                プライバシー
              </Link>
              <span className="opacity-40">·</span>
              <Link href="/terms" className="hover:underline">
                利用規約
              </Link>
              <span className="opacity-40">·</span>
              <Link href="/disclaimer" className="hover:underline">
                免責事項
              </Link>
              <span className="opacity-40">·</span>
              <Link href="/takedown" className="hover:underline">
                削除要請
              </Link>
              <span className="opacity-40">·</span>
              <a
                href="https://github.com/mitchkunn/FF14-bot"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:underline"
              >
                GitHub
              </a>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 sm:justify-between">
              <span>© 2026 固定支援Bot</span>
              <span>
                FINAL FANTASY XIV ©2010 - SQUARE ENIX CO., LTD. このサイトは公式コンテンツとは無関係です。
              </span>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
