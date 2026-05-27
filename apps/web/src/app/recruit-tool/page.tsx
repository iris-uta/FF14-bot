import type { Metadata } from "next";
import { resolve } from "node:path";
import { loadAllContents, type Content } from "@ff14kotei/schema";
import { RecruitToolForm, type ContentSummary } from "./RecruitToolForm";

export const metadata: Metadata = {
  title: "募集テンプレジェネレーター — FF14 固定支援 Bot",
  description:
    "Lodestone / Twitter / Discord 用の募集テンプレを変数置換で生成。Discord 不要、ブラウザだけで完結。",
};

// Build-time-static (no SSR per request). Contents are loaded once at build.
export default function RecruitToolPage() {
  const contents = safeLoadContents();
  // Only pass templates that actually have a body — strip extra serialization
  const summaries: ContentSummary[] = contents
    .filter((c) => c.recruitmentTemplates.length > 0)
    .map((c) => ({
      id: c.id,
      displayName: c.displayName,
      shortName: c.shortName,
      type: c.type,
      templates: c.recruitmentTemplates.map((t) => ({
        source: t.source,
        body: t.template,
        variables: t.variables,
      })),
    }));

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      <header>
        <h1 className="text-3xl sm:text-4xl font-bold mb-3">
          ✍️ 募集テンプレジェネレーター
        </h1>
        <p className="text-black/70 dark:text-white/70 leading-relaxed">
          コンテンツとテンプレを選び、変数を入力するだけ。Lodestone / Twitter / Discord に貼れる
          募集文を生成します。Discord bot を入れていなくても使えます。
        </p>
      </header>

      {summaries.length === 0 ? (
        <p className="text-sm text-black/60 dark:text-white/60">
          現在ロード可能なテンプレがありません。
        </p>
      ) : (
        <RecruitToolForm contents={summaries} />
      )}

      <section className="rounded-lg border border-black/10 dark:border-white/10 p-5 text-sm text-black/70 dark:text-white/70 space-y-2">
        <p>
          🤖 同じ機能を Discord で使う場合は <code>/recruit</code> コマンドが便利
          (固定 channel から呼ぶと content 自動検出)。
        </p>
        <p>
          📚 テンプレは <code>data/contents/*.yaml</code> に出典付きで集めています。
          追加・修正は PR で受け付けています。
        </p>
      </section>
    </div>
  );
}

function safeLoadContents(): Content[] {
  try {
    return loadAllContents(resolve(process.cwd(), "../../data/contents")).sort(
      (a, b) => (a.patch ?? "").localeCompare(b.patch ?? "")
    );
  } catch (err) {
    console.warn("Failed to load contents for /recruit-tool:", err);
    return [];
  }
}
