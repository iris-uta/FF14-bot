import Link from "next/link";
import { loadAllContents, type Content } from "@ff14kotei/schema";
import { resolve } from "node:path";

export default function Home() {
  const contents = safeLoadContents();
  const ultimates = contents.filter((c) => c.type === "ultimate");
  const savages = contents.filter((c) => c.type === "savage");

  return (
    <div className="space-y-12">
      <section className="text-center py-10">
        <h1 className="text-4xl sm:text-5xl font-bold mb-4">
          FF14 固定活動を、もっとスムーズに。
        </h1>
        <p className="text-lg text-black/70 dark:text-white/70 max-w-2xl mx-auto">
          Discord 上でコンテンツ別チャネルの一括作成・攻略マクロの配信・募集テンプレ生成・開始前自動通知。
          固定主の段取りを 1 つの Bot で支援します。
        </p>
        <div className="mt-8 flex flex-wrap gap-4 justify-center">
          <a
            href="#features"
            className="inline-flex items-center justify-center rounded-md bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 text-sm font-medium transition-colors"
          >
            機能を見る
          </a>
          <Link
            href="/privacy"
            className="inline-flex items-center justify-center rounded-md border border-black/15 dark:border-white/15 px-6 py-3 text-sm font-medium hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
          >
            プライバシー
          </Link>
        </div>
      </section>

      <section id="features" className="space-y-8">
        <h2 className="text-2xl font-bold">主な機能</h2>
        <div className="grid sm:grid-cols-2 gap-6">
          <Feature
            title="/setup-static"
            desc="コンテンツを選ぶだけで、固定用カテゴリと Phase 別チャネルを一括作成。"
          />
          <Feature
            title="/post-phase"
            desc="指定 Phase の攻略動画・マクロ・処理方を該当チャネルに自動投稿。"
          />
          <Feature
            title="/schedule"
            desc="次回固定の開始時刻を登録。10 分前 (時間設定可) に自動通知。"
          />
          <Feature
            title="/recruit-template"
            desc="募集テンプレを変数置換で即生成。Lodestone 投稿に貼り付けるだけ。"
          />
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-bold">対応コンテンツ ({contents.length})</h2>
        <p className="text-sm text-black/60 dark:text-white/60">
          りりーどーる・新みんとっと・ぬけまる・Game8 などの公開情報を出典付きで集めています。
        </p>
        <div className="grid sm:grid-cols-2 gap-8">
          <ContentList title={`絶 (${ultimates.length})`} items={ultimates} />
          <ContentList title={`零式 (${savages.length})`} items={savages} />
        </div>
      </section>
    </div>
  );
}

function Feature({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="rounded-lg border border-black/10 dark:border-white/10 p-5">
      <h3 className="font-mono text-sm font-semibold text-blue-600 dark:text-blue-400 mb-2">
        {title}
      </h3>
      <p className="text-sm text-black/70 dark:text-white/70">{desc}</p>
    </div>
  );
}

function ContentList({ title, items }: { title: string; items: Content[] }) {
  return (
    <div>
      <h3 className="font-semibold mb-3">{title}</h3>
      <ul className="space-y-1 text-sm">
        {items.length === 0 ? (
          <li className="text-black/50 dark:text-white/50">なし</li>
        ) : (
          items.map((c) => (
            <li key={c.id} className="flex items-baseline gap-2">
              <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-black/5 dark:bg-white/10">
                {c.shortName}
              </span>
              <span>{c.displayName}</span>
              {c.patch && (
                <span className="text-xs text-black/50 dark:text-white/50">{c.patch}</span>
              )}
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

function safeLoadContents(): Content[] {
  try {
    return loadAllContents(resolve(process.cwd(), "../../data/contents")).sort((a, b) =>
      (a.patch ?? "").localeCompare(b.patch ?? "")
    );
  } catch (err) {
    console.warn("Failed to load contents for landing page:", err);
    return [];
  }
}
