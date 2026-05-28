import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "使い方ガイド — FF14 固定支援 Bot",
  description:
    "FF14 固定支援 Bot の全コマンド (固定作成/予定/投票/進行記録/募集) の使い方ガイド。",
};

interface CommandDef {
  name: string;       // slash command name (English)
  ja: string;         // ja localization
  desc: string;
  examples: string[];
  permission?: string;
}

interface Category {
  title: string;
  emoji: string;
  intro: string;
  commands: CommandDef[];
}

const CATEGORIES: Category[] = [
  {
    title: "固定の設定",
    emoji: "🏰",
    intro: "固定を作る → 状態を確認する → メンバー入れ替えの基礎",
    commands: [
      {
        name: "/setup",
        ja: "固定作成",
        desc:
          "コンテンツを選ぶだけで、固定 role + カテゴリ + Phase 別チャネル一式を作成。各 Phase channel に攻略動画/マクロ/tips を自動投稿 + ピン留め。",
        examples: [
          "/setup type:絶 content:fru name:週末絶エデン",
          "/setup type:零式 content:m5s name:絶界練習 mode:minimal",
          "/setup ... members:<@111> MT PLD, <@222> H1 WHM (既知メンバーを slot に fill)",
        ],
        permission: "Manage Channels",
      },
      {
        name: "/static-info",
        ja: "固定情報",
        desc:
          "8 slot (MT/ST/H1/H2/D1-D4) の fill 状況、現在 Phase、active メンバー、直近予定をワンコマンドで表示。固定 channel から呼ぶと自動検出。",
        examples: ["/static-info", "/static-info name:週末絶エデン public:true"],
      },
    ],
  },
  {
    title: "予定管理",
    emoji: "📅",
    intro: "1回きりの予定、定期予定、予定一覧と削除",
    commands: [
      {
        name: "/book",
        ja: "予定登録",
        desc:
          "次回固定の開始時刻を登録。N 分前 (default 10) に自動通知。 固定 channel から呼ぶと content + 固定 role mention を自動補完。",
        examples: [
          "/book when:2026-06-01 21:00 phase:p3 note:P3練習",
          "/book when:... chouseisan_url:https://chouseisan.com/s?h=...",
        ],
        permission: "Manage Events",
      },
      {
        name: "/recurring set",
        ja: "定期予定",
        desc:
          "毎週決まった曜日 + 時刻に自動で /book と同じ schedule を作成。1h tick の worker が次の occurrence を automatically insert。",
        examples: [
          "/recurring set day:fri time:21:00",
          "/recurring set day:sat time:22:00 note:零式時間",
        ],
        permission: "Manage Events",
      },
      {
        name: "/upcoming",
        ja: "予定一覧",
        desc: "今後の予定一覧をチャネル/全体で表示。",
        examples: ["/upcoming", "/upcoming limit:10"],
      },
      {
        name: "/cancel",
        ja: "予定削除",
        desc: "予定をキャンセル。autocomplete で自分が作った予定から選択。",
        examples: ["/cancel id:<short-id>"],
        permission: "Manage Events",
      },
    ],
  },
  {
    title: "日程投票 (調整さん代替)",
    emoji: "🗳️",
    intro:
      "候補日を投票形式で募集 → 自動締切 → 最多 yes を /book に転送。 すべて Discord 内で完結 (外部サービス不要)。",
    commands: [
      {
        name: "/vote new",
        ja: "投票作成",
        desc:
          "title 入力後に modal で候補 2〜5 件を改行区切り入力。締切 + リマインダー (締切 N 時間前 ping) も指定可。",
        examples: [
          "/vote new title:次回固定日",
          "/vote new title:練習日 closes_at:2026-05-31 21:00 remind_hours_before:12",
        ],
      },
      {
        name: "/vote close / /vote info",
        ja: "締切 / 結果",
        desc:
          "/vote close は作成者のみ手動締切。/vote info は ephemeral で集計を表示 (誰でも可)。",
        examples: ["/vote close id:<short-id>", "/vote info id:<short-id>"],
      },
      {
        name: "/vote book",
        ja: "予定化",
        desc:
          "投票結果から rank N 番目 (default = 1 = 最多 yes) の候補を /book と同じ予定として登録。チェーン: /vote new → 投票 → /vote book → alert-worker。",
        examples: ["/vote book id:<short-id>", "/vote book id:<short-id> rank:2"],
      },
    ],
  },
  {
    title: "進行記録",
    emoji: "📈",
    intro: "「P3 到達」「初見クリア」 等のマイルストーンを時系列で記録。Twitter シェア用 plain text 出力対応。",
    commands: [
      {
        name: "/progress mark",
        ja: "記録",
        desc:
          "status (reached / cleared / first-clear / note) + phase + 任意の note + 任意の日付。phase は note 種別なら省略可。",
        examples: [
          "/progress mark status:reached phase:p3",
          "/progress mark status:cleared phase:p3 note:1%安定後撃破",
          "/progress mark status:first-clear note:4ヶ月!",
        ],
      },
      {
        name: "/progress show",
        ja: "表示",
        desc:
          "timeline を embed で表示 (月別グループ化)。twitter:true で plain text サマリも出力。",
        examples: ["/progress show", "/progress show twitter:true public:true"],
      },
    ],
  },
  {
    title: "募集",
    emoji: "📢",
    intro: "Lodestone / Twitter / Discord に貼れる募集テンプレを生成。",
    commands: [
      {
        name: "/recruit",
        ja: "募集テンプレ",
        desc:
          "コンテンツ別の募集テンプレを変数置換で生成。コピペで Lodestone BBCode / Twitter 280 文字 / Discord embed に。",
        examples: [
          "/recruit content:fru date:6/1(土) 21:00",
          "/recruit content:m5s recruitingroles:H1, D2 chouseisan_url:https://...",
        ],
      },
    ],
  },
  {
    title: "情報共有",
    emoji: "📖",
    intro: "コンテンツの攻略情報を Phase 単位で投稿。",
    commands: [
      {
        name: "/share",
        ja: "フェーズ投稿",
        desc:
          "指定 Phase の embed (攻略動画 + 軽減 + tips + 処理方) + マクロを現チャネルに投稿。固定 channel なら content 自動検出。",
        examples: ["/share phase:p3", "/share content:fru phase:p3"],
      },
      {
        name: "/macro / /tips",
        ja: "マクロ / Tips",
        desc: "個別取得 (ephemeral)。autocomplete で content + phase を選べる。",
        examples: ["/macro content:fru phase:p3", "/tips content:fru phase:p3"],
      },
    ],
  },
  {
    title: "ヘルプ",
    emoji: "❓",
    intro: "",
    commands: [
      {
        name: "/help",
        ja: "ヘルプ",
        desc: "全コマンド一覧 + 特定コマンドの詳細表示。",
        examples: ["/help", "/help command:vote"],
      },
    ],
  },
];

export default function GuidePage() {
  return (
    <div className="space-y-12 max-w-4xl mx-auto">
      <header>
        <h1 className="text-3xl sm:text-4xl font-bold mb-3">📖 使い方ガイド</h1>
        <p className="text-black/70 dark:text-white/70">
          全コマンドの使い方と例。Discord クライアント上で <code>/</code> を打つと autocomplete
          されるので、全部覚える必要はありません。
        </p>
      </header>

      {/* Quick start */}
      <section className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-6 space-y-3">
        <h2 className="text-xl font-bold">クイックスタート</h2>
        <ol className="text-sm space-y-2 list-decimal list-inside text-black/80 dark:text-white/80">
          <li>
            <Link href="/invite" className="text-blue-600 dark:text-blue-400 hover:underline">
              Bot をサーバーに追加
            </Link>
          </li>
          <li>
            <code>/setup</code> でコンテンツ + 固定名を入れる →
            自動で全 channel + 攻略情報投稿
          </li>
          <li>
            <code>/book</code> で予定登録 (or <code>/recurring set</code> で定期) →
            開始前に自動通知
          </li>
          <li>
            日程未定なら <code>/vote new</code> で投票 → <code>/vote book</code> で予定化
          </li>
        </ol>
      </section>

      {/* TOC */}
      <nav className="space-y-1">
        <h2 className="text-sm font-semibold text-black/60 dark:text-white/60 mb-2">
          コマンド一覧
        </h2>
        <ul className="grid sm:grid-cols-2 gap-2 text-sm">
          {CATEGORIES.map((cat) => (
            <li key={cat.title}>
              <a
                href={`#${slugify(cat.title)}`}
                className="block rounded p-2 hover:bg-black/5 dark:hover:bg-white/5"
              >
                <span>{cat.emoji}</span> {cat.title}
                <span className="text-xs text-black/40 dark:text-white/40 ml-2">
                  ({cat.commands.length})
                </span>
              </a>
            </li>
          ))}
        </ul>
      </nav>

      {/* Sections */}
      {CATEGORIES.map((cat) => (
        <section key={cat.title} id={slugify(cat.title)} className="space-y-4">
          <h2 className="text-2xl font-bold">
            {cat.emoji} {cat.title}
          </h2>
          {cat.intro && (
            <p className="text-sm text-black/60 dark:text-white/60">{cat.intro}</p>
          )}
          <div className="space-y-3">
            {cat.commands.map((cmd) => (
              <CommandCard key={cmd.name} cmd={cmd} />
            ))}
          </div>
        </section>
      ))}

      <footer className="text-xs text-black/50 dark:text-white/50 pt-8 border-t border-black/10 dark:border-white/10">
        4 つの worker (alert / vote-closer / vote-reminder / recurring-scheduler) が
        30秒〜1時間 tick で自動通知 + 自動締切 + 定期予定 insert を担当しています。
      </footer>
    </div>
  );
}

function CommandCard({ cmd }: { cmd: CommandDef }) {
  return (
    <div className="rounded-md border border-black/10 dark:border-white/10 p-4 space-y-2">
      <div className="flex flex-wrap items-baseline gap-2">
        <code className="font-mono text-sm font-bold text-blue-600 dark:text-blue-400">
          {cmd.name}
        </code>
        <span className="text-xs text-black/60 dark:text-white/60">— {cmd.ja}</span>
        {cmd.permission && (
          <span className="text-xs px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-700 dark:text-amber-300 ml-auto">
            {cmd.permission}
          </span>
        )}
      </div>
      <p className="text-sm text-black/70 dark:text-white/70 leading-relaxed">{cmd.desc}</p>
      <div className="space-y-1">
        {cmd.examples.map((ex, i) => (
          <pre
            key={i}
            className="text-xs bg-black/5 dark:bg-white/5 px-2 py-1 rounded font-mono overflow-x-auto"
          >
            {ex}
          </pre>
        ))}
      </div>
    </div>
  );
}

function slugify(s: string): string {
  return s.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase();
}
