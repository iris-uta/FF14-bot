# Bot コマンド権限ガイド

各 slash command にはデフォルトで Discord 権限要件が設定されています。サーバー管理者は **Server Settings → Integrations → ボット名 → Configure** から各コマンドのアクセス権を細かく上書きできます。

## デフォルト権限マトリクス

| コマンド | デフォルト権限 | 想定ユーザー | 影響範囲 |
|---|---|---|---|
| `/help` | なし | 誰でも | なし (read-only) |
| `/content` | なし | 誰でも | なし (read-only) |
| `/schedules` | なし | 誰でも | なし (read-only) |
| `/post-phase` | なし | 誰でも | 現在のチャネルに投稿 |
| `/recruit-template` | なし | 誰でも | 現在のチャネルにテキスト生成 |
| **`/setup-static`** | **Manage Channels** | 固定主 | カテゴリ + チャネル一括作成 |
| **`/schedule`** | **Manage Events** | 固定主 | DB に予定登録 + アラート設定 |
| **`/unschedule`** | **Manage Events** | 固定主 | DB の予定削除 |

## 設定方法 (Discord 側)

### 1. 役職 (Role) ベースで運用する場合（推奨）

1. サーバーで「固定主」役職を作成 (例: `@静止リーダー`)
2. **Server Settings → Roles → @静止リーダー → Permissions** で:
   - **Manage Channels** ON (チャネル作成のため)
   - **Manage Events** ON (スケジュール管理のため)
3. 固定主に役職付与

これで `/setup-static` `/schedule` `/unschedule` を使えるようになる。

### 2. コマンド単位で細かく設定する場合

1. **Server Settings → Integrations → FF14固定支援bot → Configure**
2. コマンドごとに:
   - 「Roles & Members」で許可する役職/ユーザーを追加
   - 「Channels」で使用可能なチャネルを制限
3. これで Discord 権限と独立に Bot コマンドだけ許可可能

> 💡 デフォルト権限を Bot 側で **より厳しく** することはできるが、**より緩く** することは Discord 側の override が必要 (Discord の仕様)。

## なぜこの権限設計？

### `Manage Channels` (チャネル管理)
- `/setup-static` は実際に **チャネルを作成** するため、対応する Discord 権限
- この権限を持つ人は元々チャネル作成できるので、コマンドが追加する権限と一致

### `Manage Events` (イベント管理)
- `/schedule` `/unschedule` は **スケジュール (予定)** を管理する
- Discord の Scheduled Events 機能の管理者が同じ業務を担うのが自然
- 「モデレーター」相当の中程度の権限で、固定主に与えやすい

### 制限なし (read-only / 投稿系)
- `/post-phase` は **現在のチャネル** にしか投稿しない → そのチャネルで発言できる人なら誰でも OK
- `/recruit-template` は **テキスト生成のみ** → 害なし
- `/content` `/schedules` `/help` は **読むだけ** → 制限不要

## 固定メンバーが使えるコマンド (制限なし)

固定メンバーは以下を自由に使える:
- `/content fru` — コンテンツ情報を見る
- `/post-phase content:fru phase:p3` — 担当 Phase の情報を呼び出す
- `/schedules` — 今後の予定を確認
- `/help` — コマンド一覧
- `/recruit-template content:fru ...` — 募集を出す手伝い

## bot に必要な権限 (招待時)

Bot を guild に招待する OAuth URL 生成時は以下を最低限要求:
- **Send Messages** (応答全般)
- **Embed Links** (リッチ Embed)
- **Use Slash Commands** (実装上必須)
- **Read Message History** (オプション、フォローアップ用)
- **Manage Channels** (`/setup-static` 用) ← 招待時にユーザーが許可

> Administrator 権限は **絶対要求しない**。「Administrator が必要な bot」は怖がられて招待されない。
