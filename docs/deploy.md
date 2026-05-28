# Deploy guide

本番デプロイ手順。**Bot は Fly.io (Tokyo), Web は Vercel** を想定。

すべてユーザー側で実行 (このリポジトリには Token を入れない)。

---

## 🤖 Bot: Fly.io (Tokyo)

### 0. 前提

- [Fly CLI](https://fly.io/docs/hands-on/install-flyctl/) インストール済み
- Fly アカウントとクレジットカード登録済み (無料枠あり、 月 ~$2-5 程度)
- Discord Bot Token (Discord Developer Portal)

### 1. アプリ作成

```bash
fly auth login
fly apps create ff14-kotei-bot     # ← 全世界でユニーク。他人が取ってたら別名に
```

別名にした場合は `fly.toml` の `app = "ff14-kotei-bot"` を編集。

### 2. SQLite 用ボリューム作成

```bash
fly volumes create ff14_kotei_data --size 1 --region nrt
```

`size` は GB。1GB で固定 100+ × 数年使えるはず。 後で `fly volumes extend` で拡張可。

### 3. Secrets 設定

```bash
fly secrets set \
  DISCORD_TOKEN=<bot-token> \
  DISCORD_CLIENT_ID=<app-id>
# 必要なら:
fly secrets set DISCORD_GUILD_ID=<test-guild-id>  # 開発用 guild 限定登録の場合
```

### 4. デプロイ (初回 manual)

```bash
fly deploy
```

ビルド ~3-5 分。完了したら:

```bash
fly logs                # リアルタイムログ
fly status              # マシン状態
curl https://ff14-kotei-bot.fly.dev/health   # health check
```

成功時 `/health` は:
```json
{ "status": "ok", "uptime_seconds": 60, "ready": true, "guilds": 1, "version": "abc1234" }
```

### 5. Slash コマンド登録

`fly.toml` の `release_command` で **deploy ごとに自動実行** されます (idempotent)。

手動で登録する場合:
```bash
fly ssh console -C "cd /app/apps/bot && node ../../node_modules/.bin/tsx src/register-commands.ts"
```

### 6. GitHub Actions 自動デプロイ

push to main で auto deploy するには:

1. Fly deploy token を作成: https://fly.io/user/personal_access_tokens
2. GitHub リポジトリ → **Settings → Secrets and variables → Actions → New secret**:
   - Name: `FLY_API_TOKEN`
   - Value: ↑ で作ったトークン
3. 完了。次回 `apps/bot/`, `packages/`, `data/`, `fly.toml` を編集して main に push すると自動 deploy。

### 7. 運用コマンド

```bash
fly logs                          # ログを tail
fly status                        # 稼働状況
fly machine restart <id>          # bot 再起動
fly ssh console                   # コンテナに入る
fly volumes list                  # ボリューム確認
fly secrets list                  # secrets 一覧 (値は見えない)
fly scale memory 1024             # 256MB → 1GB に増設
```

### コスト概算

shared-cpu-1x / 512MB / 1GB volume / Tokyo region = **約 $2-3/月** (執筆時点)。 1000+ guild まで余裕の構成。

---

## 🌐 Web: Vercel

### 0. 前提

- Vercel アカウント (GitHub login)
- (任意) カスタムドメイン

### 1. プロジェクトリンク

1. https://vercel.com/new で repo を選択 (private なら GitHub 認証経由)
2. **Root Directory**: `apps/web` を指定
3. **Build Command**: 自動検出 (`vercel.json` 内設定で上書き済み)
4. **Output Directory**: `.next`
5. **Install Command**: 自動 (monorepo の root から `pnpm install`)

### 2. 環境変数

Settings → Environment Variables で:

| Variable | Value | Required |
|---|---|---|
| `NEXT_PUBLIC_DISCORD_INVITE_URL` | `https://discord.com/oauth2/authorize?client_id=<実 client_id>&scope=bot+applications.commands&permissions=268921872` | ✅ (これ無いと /invite ページが placeholder) |

### 3. デプロイ

main に push すると Vercel が auto deploy (規約)。

初回 deploy 後の確認:
- https://your-project.vercel.app/ → ランディング
- https://your-project.vercel.app/guide → コマンド集
- https://your-project.vercel.app/invite → Discord 招待

### 4. (任意) カスタムドメイン

Settings → Domains で追加。 DNS provider 側で CNAME を設定。

---

## 🔄 デプロイ運用ルール

| 変更 | bot deploy | web deploy |
|---|---|---|
| `apps/bot/**` | ✅ | – |
| `packages/db/**` (migrations) | ✅ | – |
| `packages/schema/**` | ✅ | ✅ |
| `data/contents/*.yaml` | ✅ | – |
| `apps/web/**` | – | ✅ |
| `docs/**`, ルート `.md` | – | – |

GitHub Actions の `paths:` で自動振り分け。

---

## 🚨 障害時の対応

### bot が応答しない / health check fail

```bash
fly logs                  # エラーログ確認
fly machine list          # マシン状態
fly machine restart <id>  # 再起動
```

復旧しない場合:
```bash
fly deploy --no-cache     # キャッシュ無しで再ビルド
```

### Discord 側で slash コマンドが見えない

```bash
fly ssh console -C "cd /app/apps/bot && node ../../node_modules/.bin/tsx src/register-commands.ts"
```

または `fly.toml` の `release_command` が動いているか `fly logs` で確認。

### Volume データ喪失防止

- Fly volumes は snapshot を自動取得 (daily, 7日保持) — 復旧可能
- 手動 export: `fly ssh console -C "cat /data/ff14kotei.db" > backup.db`

### Web が真っ白 / build fail

- Vercel dashboard → Deployments → 最新の failed → Build logs を確認
- main を rollback (git revert) + push で前バージョンに戻る

---

## 📊 監視 (任意)

Sentry や Fly metrics の導入は audit BLOCKER の S3 (structured logging) と併せて検討。 現状は `fly logs` + `/health` で必要十分。
