# @ff14kotei/web

FF14 固定支援 Bot の Web app (Next.js 15 + Tailwind)。

## 構成

| ルート | 内容 | 種別 |
|---|---|---|
| `/` | ランディング (機能紹介 + 対応コンテンツ一覧) | static |
| `/privacy` | プライバシーポリシー (`docs/legal/privacy-policy.md` を render) | static |
| `/terms` | 利用規約 (`docs/legal/terms-of-service.md` を render) | static |
| `/dashboard` | ログイン後の固定主向けダッシュボード (準備中) | dynamic |
| `/api/auth/*` | NextAuth (Auth.js v5) Discord OAuth ハンドラ | dynamic |

static は Vercel free tier cap 内、dynamic は最小限。

## 開発

```bash
pnpm --filter @ff14kotei/web dev
# → http://localhost:3000
```

### 認証 (Discord OAuth) を有効化したい場合

1. `cp apps/web/.env.example apps/web/.env.local`
2. Discord Developer Portal → アプリ → OAuth2 → "Reset Secret" でシークレット取得
3. `.env.local` に以下を設定:
   - `AUTH_SECRET` (`openssl rand -base64 32` で生成)
   - `AUTH_DISCORD_ID` (Bot と同じ Application ID)
   - `AUTH_DISCORD_SECRET` (上記で取得した secret)
4. Discord OAuth2 → "Redirects" に追加:
   - `http://localhost:3000/api/auth/callback/discord`
5. `pnpm --filter @ff14kotei/web dev` 再起動

未設定でも他ページは動作 (ログインボタンが「未設定」表示になる)。

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

- ✅ NextAuth (Auth.js v5) Discord OAuth ログイン (基盤)
- ✅ /dashboard ページ (placeholder)
- [ ] /dashboard で 自分の guild の固定スケジュール一覧
- [ ] /dashboard で /schedule 編集 UI
- [ ] 軽減回しエディタ (plan.md W-1)
- [ ] 募集テンプレジェネレーター UI (plan.md W-2)
- [ ] FFLogs / Vigil 連携

## 触ってよい範囲
このディレクトリ内のみ。詳細: [../../AGENTS.md](../../AGENTS.md)
