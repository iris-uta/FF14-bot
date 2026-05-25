# Deployment (Fly.io)

公開Bot として Fly.io にデプロイする手順。

## 前提
- [flyctl](https://fly.io/docs/flyctl/install/) インストール済み
- Fly.io アカウント (signup: https://fly.io/app/sign-up)
- Discord bot トークン (詳細は [apps/bot/README.md](../apps/bot/README.md))

## 初回セットアップ (一度だけ)

```bash
# 1. Fly.io ログイン
fly auth login

# 2. app 名は fly.toml に書いてある (ff14-kotei-bot)
#    既に取られていたら fly.toml で別名に変更してから:
fly launch --no-deploy --copy-config

# 3. secrets を設定 (.env の中身)
fly secrets set DISCORD_TOKEN="..."
fly secrets set DISCORD_CLIENT_ID="..."
# DISCORD_GUILD_ID は省略 (global command registration)

# 4. 確認
fly secrets list

# 5. 初回デプロイ
fly deploy
```

## 通常のデプロイ

```bash
fly deploy
```

毎回:
1. `Dockerfile` でビルド
2. `release_command` (slash command登録) 実行
3. 旧 VM 停止、新 VM 起動 (zero-downtime)
4. ヘルスチェック後 traffic 切替

## 監視

```bash
fly logs              # リアルタイムログ
fly status            # VM状態
fly machine list      # マシン一覧
fly secrets list      # secret 一覧 (値は見えない)
```

## トラブルシューティング

### bot がオフライン
- `fly logs` でエラー確認
- DISCORD_TOKEN が間違っている可能性 → `fly secrets set DISCORD_TOKEN=...` で更新

### SQLite データが消えた
- volume mount が正しく動いてるか: `fly volumes list`
- volume が無いなら: `fly volumes create ff14_kotei_data --size 1 --region nrt`

### スラッシュコマンドが反映されない
- `release_command` のログ確認: `fly logs --instance <id>`
- 手動再登録: `fly ssh console -C "pnpm --filter @ff14kotei/bot register-commands"`

### メモリ不足
- shared-cpu-1x 256MB は初期サイズ。`fly.toml` の `memory_mb` を増やして再 deploy
- 512MB で $4/月、1GB で $8/月程度

## コスト目安 (Phase A — 〜50 server)
- shared-cpu-1x 256MB: 月 $0-2 (free tier credit内)
- volume 1GB: $0.15/月
- bandwidth: 初期は無料tier内

詳細: [tech-stack.md](./tech-stack.md) の "コスト試算" セクション

## CI/CD 自動デプロイ (将来)

GitHub Actions で main マージ時に自動 deploy したい場合:

1. Fly.io で deploy token 生成: `fly tokens create deploy -x 8760h`
2. GitHub repo の Settings → Secrets and variables → Actions
   → `FLY_API_TOKEN` 追加
3. `.github/workflows/fly-deploy.yml` 作成:

```yaml
name: Fly Deploy
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: superfly/flyctl-actions/setup-flyctl@master
      - run: flyctl deploy --remote-only
        env:
          FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}
```

現状は手動 deploy 推奨 (毎回確認できるため)。本番運用に慣れたら自動化する。
