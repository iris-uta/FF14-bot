# Legal documents

公開Bot として運用する前に必要な法的ドキュメントのテンプレート。

## ファイル

| ファイル | 用途 | 必須？ |
|---|---|---|
| [privacy-policy.md](./privacy-policy.md) | プライバシーポリシー | **必須** (ユーザーデータ収集する以上) |
| [terms-of-service.md](./terms-of-service.md) | 利用規約 | 推奨 (Discord bot verification でも要求される) |

## 公開前にやること

各ファイル冒頭の ⚠️ コメント参照。要更新箇所:

- `[運営者名]` — 実名 or サークル名 or 法人名
- `[連絡先]` — メールアドレス
- `[your-domain]` — Web app のドメイン (例: `ff14kotei.app`)
- `[your-email]` — 連絡用メールアドレス
- `[invite-url]` — Discord support server の招待リンク
- 業務委託先テーブル — 実際に利用するサービスのみ残す
- リージョン情報

## ホスティング

Web app の以下のルートに静的ページとして公開:
- `/privacy` → privacy-policy.md
- `/terms` → terms-of-service.md

Next.js なら `app/privacy/page.tsx` で `import md from "@/docs/legal/privacy-policy.md"` 風に読み込み可能 (要 markdown loader)。

## Bot verification 申請時の参照URL

Discord bot verification を申請する際に以下が必要:
- Privacy Policy URL: `https://[your-domain]/privacy`
- Terms of Service URL: `https://[your-domain]/terms`
- Support email: `[your-email]`
- Support server invite: `[invite-url]`

> verification は 100 servers に到達した時点で必須 (それまでは推奨)。
> 詳細: https://support.discord.com/hc/en-us/articles/360040720412
