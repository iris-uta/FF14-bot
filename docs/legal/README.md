# Legal documents

公開Bot として運用する前に必要な法的ドキュメント。日本ゲーム (FFXIV) 特有の慎重さを反映したテンプレート集。

## ファイル

| ファイル | 用途 | 必須？ |
|---|---|---|
| [privacy-policy.md](./privacy-policy.md) | プライバシーポリシー (APPI 準拠) | **必須** |
| [terms-of-service.md](./terms-of-service.md) | 利用規約 | **必須** (Bot verification 要件) |
| [disclaimer.md](./disclaimer.md) | 免責事項 (SE 非公式宣言、情報正確性、商用利用禁止 等) | **必須** |
| [takedown.md](./takedown.md) | 削除要請窓口・対応プロセス | **必須** (24時間対応コミット) |

## 公開前にやること

各ファイル冒頭の ⚠️ 記号箇所と placeholder 全て埋める:

- `[運営者名]` — 実名 / サークル名 / 法人名
- `[運営者役職]` — 個人運営者なら「運営責任者」等
- `[your-email]` — 連絡用メールアドレス
- `[your-domain]` — Web app のドメイン (例: `ff14kotei.app`)
- `[invite-url]` — Discord support server の招待リンク
- 業務委託先テーブル — 実際に利用するサービスのみ残す、リージョン記入
- 業務委託先の越境移転リージョン情報

## 日本ゲーム特有の考慮点

### Square Enix への配慮 (FFXIV)
- 公式提携を装わない
- ゲームクライアント不触
- 名称引用は コミュニティ支援目的に限定 (商用不可)
- BAN リスクをユーザーに明示

### 個人情報保護法 (APPI)
- Discord User ID = 個人情報 として扱う
- 越境移転の同意取得 (Fly.io/Vercel/Neon 等は米国)
- 開示・訂正・利用停止・削除権の明示
- 個人情報保護管理者の指定

### マクロ作者への配慮
- 出典明記 (作者名 + URL)
- 削除要請 24時間対応
- 引用範囲を最小限に

## ホスティング

Web app の以下のルートに静的ページとして公開:
- `/privacy` → privacy-policy.md
- `/terms` → terms-of-service.md
- `/disclaimer` → disclaimer.md (新規追加要)
- `/takedown` → takedown.md (新規追加要)

Next.js なら `app/disclaimer/page.tsx` を追加して上記と同じ markdown loader 利用。

## Bot verification 申請時の参照URL

Discord bot verification を申請する際に以下が必要:
- Privacy Policy URL: `https://[your-domain]/privacy`
- Terms of Service URL: `https://[your-domain]/terms`
- Support email: `[your-email]`
- Support server invite: `[invite-url]`

> verification は 100 servers 到達で必須 (それまでは推奨)。
> 詳細: https://support.discord.com/hc/en-us/articles/360040720412

## メンテナンス

### 定期レビュー
- **3ヶ月ごと**: リンク先 (SE 規約等) が変わってないか
- **半年ごと**: 委託先一覧の正確性確認
- **年1回**: 法令改正への追従 (APPI 改正等)

### 即時対応が必要なケース
- 委託先変更 → privacy-policy.md 更新 + ユーザー通知
- SE からの公式コミュニケーション (極稀) → 即座に全 docs review
- 法令改正 → 該当箇所を改訂、30 日猶予で適用
