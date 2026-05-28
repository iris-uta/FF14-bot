# FF14 固定支援 Bot

> FF14 (Final Fantasy XIV) の固定パーティ活動を Discord で支援する **オープンソース Bot + Web app**

[![CI](https://github.com/mitchkunn/FF14-bot/actions/workflows/ci.yml/badge.svg)](https://github.com/mitchkunn/FF14-bot/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js: 22+](https://img.shields.io/badge/Node.js-22%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![pnpm](https://img.shields.io/badge/pnpm-11-F69220?logo=pnpm&logoColor=white)](https://pnpm.io/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

---

## ✨ できること

絶 (Ultimate) / 零式 (Savage) の固定パーティを **立ち上げから運用まで Discord で完結**。

| | 機能 | コマンド |
|---|---|---|
| 📅 | **予定登録 + 自動通知** | `/book` `/upcoming` `/cancel` `/recurring` |
| 🗳️ | **日程投票** (調整さん代替) | `/vote new` `/vote close` `/vote book` |
| 🧩 | **調整さん URL から日程取込** | `/from-chouseisan` |
| 📊 | **固定状態の可視化** | `/setup` `/static-info` `/progress` |
| 📜 | **マクロ・攻略 Tips 共有** | `/macro` `/tips` `/share` |
| 📣 | **募集テンプレ生成** | `/recruit` |
| 🎯 | **新規サーバー自動歓迎** | (auto on guildCreate) + `/quickstart` |
| 🌐 | **Web app** (Discord 不要) | `/recruit-tool` (募集ジェネレータ) ほか |

### 対応コンテンツ (31)

- **絶 (7)**: UCoB / UWU / TEA / DSR / TOP / FRU / DMU
- **零式 (24)**:
  - Pandæmonium 4.x: P1S-P12S
  - Arcadion 7.x: M1S-M12S

YAML データ駆動なので、 **コード変更なしでコンテンツを増やせる**。

---

## 🚀 すぐ使う (Discord に追加)

招待リンク (準備中) → 追加すると system channel に自動ウェルカム + 3 ステップガイドが投稿されます。

```
1️⃣ /setup type:絶 content:FRU name:週末FRU
   → 固定 channel + role が自動生成
2️⃣ /book when:2026-06-01 21:00
   → 開始 10 分前に自動通知
3️⃣ /macro /tips /progress /static-info
   → 練習中も Discord 内で完結
```

調整さん URL があれば `/from-chouseisan url:...` で候補日インポート可。

---

## 🏗 自分でホストする (Self-host)

完全 OSS なので、 自分の Discord bot として動かせます。 月 ~$3 で 24/7 稼働可能 (Fly.io + Vercel)。

詳細は **[docs/deploy.md](docs/deploy.md)** 参照。

```bash
# 1. clone + install
git clone https://github.com/mitchkunn/FF14-bot.git
cd FF14-bot
pnpm install

# 2. dev mode (bot)
cp apps/bot/.env.example apps/bot/.env
# .env に DISCORD_TOKEN 等を入れる
pnpm --filter @ff14kotei/bot dev

# 3. dev mode (web、 認証不要・env なし)
pnpm --filter @ff14kotei/web dev
# → localhost:3000

# 4. tests
pnpm -r typecheck
pnpm --filter @ff14kotei/bot test
pnpm --filter @ff14kotei/db test
```

---

## 📐 アーキテクチャ

```
apps/
  bot/        Discord bot (TypeScript + discord.js v14)
  web/        Next.js 15 (App Router、静的 9 routes)
packages/
  schema/     Zod でコンテンツ・固定状態を型定義 (single source of truth)
  db/         Drizzle ORM + better-sqlite3
data/
  contents/   YAML 形式のコンテンツデータ (31 ファイル)
docs/         設計・運用・デプロイ ドキュメント
```

### 🛠 技術スタック

- **言語**: TypeScript 5 (strict)
- **Bot**: discord.js 14, better-sqlite3, drizzle-orm
- **Web**: Next.js 15, React 19, Tailwind v3 (完全静的)
- **データ**: YAML + Zod 検証
- **テスト**: Vitest (375 件)
- **CI**: GitHub Actions
- **デプロイ**: Fly.io (Tokyo) + Vercel
- **モノレポ**: pnpm workspaces

### ⚙️ 4 つの background worker

| Worker | 周期 | 役割 |
|---|---|---|
| `alert-worker` | 30s | schedule 開始 N 分前に通知 |
| `vote-closer` | 30s | `/vote` 締切到達で自動 close + DM 結果送信 |
| `vote-reminder` | 30s | `/vote` 締切前 N 時間 リマインダー |
| `recurring-scheduler` | 1h | 毎週 cron 式の recurring rule を schedule 化 |

各 worker は overlap guard 付き、 SIGTERM で graceful drain (10s timeout)。

---

## 🧑‍💻 コントリビュート

[CONTRIBUTING.md](CONTRIBUTING.md) と [AGENTS.md](AGENTS.md) を読んでください。

- **issue**: 大歓迎
- **PR**: 1 PR = 100〜500 行が目安、 ブランチ名は `<track>/<feature>` (例: `bot/availability-command`)
- **content data**: `data/contents/*.yaml` の追加・更新は code 変更不要
- 並列作業対応 (`AGENTS.md` のトラック分担 参照)

---

## 📜 ライセンスと帰属

### ライセンス

このリポジトリのコードは **[MIT License](LICENSE)** で公開されています。

### Square Enix

「ファイナルファンタジー」 シリーズおよび 「FINAL FANTASY XIV」 は **株式会社スクウェア・エニックスの登録商標です**。

このプロジェクトは **Square Enix 公式のものではなく、 公認も承認もされていません**。 ファンによる非営利のサポートツールです。 SE のすべての知的財産権を尊重します。

```
FINAL FANTASY XIV ©2010 - SQUARE ENIX CO., LTD.
```

### 攻略マクロ・軽減表 のソース

YAML データに記載されている macros / mitigation table の URL は **各作者の著作物** です。
本プロジェクトは作者のクレジット (`source` field) を必ず保持し、 リンクのみを保存しています。 削除要請は [docs/legal/takedown.md](docs/legal/takedown.md) より。

### 法的文書

- [プライバシーポリシー](docs/legal/privacy-policy.md)
- [利用規約](docs/legal/terms-of-service.md)
- [免責事項](docs/legal/disclaimer.md)
- [削除要請窓口](docs/legal/takedown.md)

---

## 🙏 謝辞

- **Discord.js** — bot framework
- **drizzle-orm** — 型安全な DB クライアント
- **Next.js / Vercel** — Web ホスティング
- **Fly.io** — Bot ホスティング
- **chouseisan.com の CSV export** — `/from-chouseisan` のインポート基盤 (調整さん側の標準機能を利用)
- FF14 コミュニティの **攻略マクロ作者各位** — リンクのみで参照させていただいています

---

<sub>made with ❤️ for the FF14 固定 community by [@mitchkunn](https://github.com/mitchkunn)</sub>
