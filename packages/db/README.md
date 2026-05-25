# @ff14kotei/db

Bot + Web app の永続化層。Drizzle ORM + SQLite。

## 設計
- ローカル開発: SQLite (`./data/ff14kotei.db`, `better-sqlite3`)
- production: 切替予定（Postgres / Neon または Fly Postgres）。同じスキーマを Drizzle で扱う

## 使い方

```ts
import { createDb, schedules } from "@ff14kotei/db";

const db = createDb(); // 自動マイグレーション込み

// Insert
await db.insert(schedules).values({
  id: crypto.randomUUID(),
  guildId: "123",
  channelId: "456",
  startsAt: Date.now() + 60_000,
  createdAt: Date.now(),
  createdBy: "user-id",
});

// Query
const upcoming = await db
  .select()
  .from(schedules)
  .where(/* ... */);
```

## マイグレーション運用

スキーマ変更時:
```bash
# 1. src/schema.ts を編集
# 2. マイグレーションファイル生成
pnpm --filter @ff14kotei/db generate

# 3. 確認・コミット (drizzle/ に SQL 生成)
git add packages/db/drizzle/
```

実行はアプリ起動時に自動 (`createDb()` 内で `migrate()` 呼び出し)。

## スキーマ

### `schedules`
固定活動の予定。B-5 alert worker が監視。

| カラム | 型 | 用途 |
|---|---|---|
| id | text PK | UUID |
| guild_id | text | Discord guild |
| channel_id | text | 通知先チャネル |
| content_id | text? | コンテンツID (例: "fru") |
| phase_id | text? | Phase ID (任意) |
| starts_at | int (unix ms) | 開始時刻 |
| notify_minutes_before | int default 10 | 何分前通知 |
| notified_at | int (unix ms)? | 通知済みなら時刻、未通知なら null |
| mention | text? | 通知時メンション (`<@id> <@&role>` 形式) |
| note | text? | 自由文 |
| created_at | int (unix ms) | 作成時刻 |
| created_by | text | 作成者 user id |
