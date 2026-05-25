# @ff14kotei/web

FF14 固定支援 Bot の Web app (Next.js 15 + Tailwind)。

## 構成

| ルート | 内容 |
|---|---|
| `/` | ランディング (機能紹介 + 対応コンテンツ一覧) |
| `/privacy` | プライバシーポリシー (`docs/legal/privacy-policy.md` を render) |
| `/terms` | 利用規約 (`docs/legal/terms-of-service.md` を render) |

全ルートが **static prerender** されるので Vercel free tier の cap 内に収まる。

## 開発

```bash
pnpm --filter @ff14kotei/web dev
# → http://localhost:3000
```

## Build

```bash
pnpm --filter @ff14kotei/web build
pnpm --filter @ff14kotei/web start
```

## Vercel デプロイ (将来)

1. Vercel アカウント作成 (https://vercel.com、CC 不要、GitHub 連携)
2. Import Git Repository → mitchkunn/FF14-bot を選択
3. **Root Directory**: `apps/web`
4. **Build Command**: `cd ../.. && pnpm install && pnpm --filter @ff14kotei/web build`
5. **Install Command**: 空 (上記でやる)
6. **Output Directory**: `.next`
7. デプロイ → `https://<project>.vercel.app` で公開

PR 毎に自動 preview deploy も無料。

## 今後の追加 (Phase 2/3)

- NextAuth (Auth.js v5) で Discord OAuth ログイン
- 固定主向け管理ダッシュボード (固定情報・スケジュール一覧編集)
- 軽減回しエディタ (plan.md W-1)
- 募集テンプレジェネレーター UI (plan.md W-2)

## 触ってよい範囲
このディレクトリ内のみ。詳細: [../../AGENTS.md](../../AGENTS.md)
