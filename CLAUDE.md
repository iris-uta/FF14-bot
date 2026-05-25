# CLAUDE.md — プロジェクト全体ガイド

このリポジトリで作業するすべてのagent（Claude / 他LLM / 人間）が最初に読むファイル。

## プロジェクト概要
FF14（Final Fantasy XIV）の固定パーティ活動をDiscord上で支援するBot + Web app。
詳細仕様: [REQUIREMENTS.md](REQUIREMENTS.md)

## リポジトリ構造（monorepo / pnpm workspaces）

```
apps/
  bot/        Discord bot (TypeScript + discord.js)
  web/        管理用 Web app (Next.js)  — 後続着手
packages/
  schema/     コンテンツ・固定状態のスキーマと型 (Zod) ★契約★
data/
  contents/   コンテンツ別データ (YAML, 人間が編集)
docs/
  各種設計ドキュメント
```

## 重要な原則

### 1. 「スキーマが契約」
`packages/schema` はBot・Web app・dataの**唯一の真実の源（single source of truth）**。
- 型・データ構造の変更はここで行う
- Bot/Web/data は schema から import する／schema に validate される
- **schema の破壊的変更は調整が必要**（[AGENTS.md](AGENTS.md) の「契約変更プロトコル」参照）

### 2. コードとコンテンツデータの分離
- コード = `apps/` + `packages/`
- データ = `data/contents/*.yaml`（FF14のドメイン知識）
- 新コンテンツの追加に**コード変更は不要**（YAMLを足すだけで対応する設計）

### 3. 並列作業前提
詳細: [AGENTS.md](AGENTS.md)
- 各トラックは独立したディレクトリに閉じる
- 複数agentが同時作業する場合は git worktree + 別ブランチで作業
- スキーマ変更はトラック横断の調整が必要

## トラック一覧

| Track | Path | 担当領域 | 依存 |
|---|---|---|---|
| **A. Schema** | `packages/schema/` | 型・スキーマ定義 | なし（最上流） |
| **B. Bot** | `apps/bot/` | Discord bot 本体 | Schema |
| **C. Web** | `apps/web/` | 管理 Web app | Schema |
| **D. Data** | `data/contents/` | コンテンツデータ収集 | Schema |
| **E. Infra** | `infra/`（未作成） | デプロイ・CI | Bot/Web完成後 |
| **F. Docs** | `docs/` | 設計・運用ドキュメント | 任意 |

## 開発方針

- **MVP優先**: まず1コンテンツ（**絶エデン / FRU**）で全フロー完成 → 横展開
- **小さくリリース**: 1〜2週間サイクルで自分の固定にdogfood
- **静的データ駆動**: bot は YAML を読むだけ。コンテンツ追加でコード触らない

## 技術スタック
- TypeScript 5.x
- Bot: discord.js v14
- Web: Next.js 15 (App Router)
- Schema validation: Zod
- データ形式: YAML
- パッケージ管理: pnpm workspaces

## コミット規約
- Conventional Commits: `feat(bot): ...`, `fix(schema): ...`, `data(fru): add P3 details`
- スコープには track 名（bot/web/schema/data/docs/infra）を入れる
- 1コミット = 1論理変更（schema変更とbot変更は分ける）

## ブランチ規約
[AGENTS.md](AGENTS.md) の「ブランチ運用」参照。

## 関連ドキュメント
- [REQUIREMENTS.md](REQUIREMENTS.md) — 要件定義
- [AGENTS.md](AGENTS.md) — 並列作業プロトコル
- [plan.md](plan.md) — タスク一覧
- [docs/architecture.md](docs/architecture.md) — アーキテクチャ
- [docs/data-collection.md](docs/data-collection.md) — コンテンツデータ収集ワークフロー
