# @ff14kotei/bot

FF14固定支援 Discord Bot 本体。

## セットアップ

```bash
pnpm install
cp apps/bot/.env.example apps/bot/.env
# .env を編集してDiscord botトークンを設定
pnpm --filter @ff14kotei/bot dev
```

## ディレクトリ規約
- `src/commands/` — slash command 実装
- `src/events/` — Discord event handler
- `src/services/` — ビジネスロジック（チャネル作成、テンプレ生成等）

## 触ってよい範囲
このディレクトリ内のみ。`packages/schema` から型を import するのはOK、編集はNG。
詳細: [../../AGENTS.md](../../AGENTS.md)
