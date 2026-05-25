# 固定主立ち上げフロー — 設計ドキュメント

> 本ドキュメントの目的: 「固定を新規に立ち上げる固定主の体験」を最適化するために bot と Web app をどう協調させるかの設計を整理し、Phase A〜D の実装順と仕様を確定する。

最終更新: 2026-05-25

---

## 1. 目的

FF14 で固定パーティを **立ち上げて運用する固定主** が最大の摩擦に直面しているのは「立ち上げ前の意思決定」と「初期セットアップ」。本サービスは:

1. 募集前の **計画書づくり** を Web app でガイド
2. **募集テンプレ** を媒体別 (Lodestone / Twitter / Discord) に自動生成
3. **応募管理** を Web app で一元化
4. **Discord セットアップ** を bot がワンクリックで実行
5. **運用** を bot コマンドで継続支援

この一連の流れをシームレスにする。

---

## 2. ペルソナ

### 2.1 既存サーバー固定 (50%)
- 友人/コミュニティ内で 7 人集めて固定
- 既存の Discord サーバーで運営
- 募集は不要 (既に決まったメンバー)
- **欲しいもの**: Phase channels の自動セットアップ + 通知 + マクロ参照

→ **Phase A** で完結

### 2.2 野良募集固定 (45%)
- Lodestone / Twitter で募集
- 知らない人と固定組む
- 応募者から選考
- 募集要項を毎回イチから考えるのが大変
- **欲しいもの**: 計画書作成 + 募集テンプレ生成 + 応募管理 + セットアップ

→ **Phase A + B + C + D**

### 2.3 ハイブリッド (5%)
- 知人 3-4 人 + 募集で残り
- 部分的に上記両方の機能を使う

→ **Phase A + B (応募管理は任意)**

---

## 3. 現状フロー (problem)

```
[現状の固定主体験]

1. ぼんやり「絶エデンやりたい」と思う
2. 頭の中で募集要項を組み立てる
   - ジョブ枠? 進行ペース? 経験? ボイチャ?
   - → 漏れる項目多数、後で再投稿することも
3. 募集テンプレを毎回イチから書く
   - 過去固定の自分のテンプレをコピペで使い回す人が多い
4. Lodestone / Twitter に投稿
5. DM や Lodestone コメントで応募 → スプレッドシート手動管理
6. メンバー確定 → 個別に Discord 招待
7. Discord でサーバー作成 or 既存に迎え入れ
8. (bot 利用) /setup-static でカテゴリ + channels 作成
9. (bot 利用) 各 Phase channel で /post-phase 実行 (N 回)
10. /schedule で初回日程登録
11. 個別に role 付与 (手動)、メンバーリスト管理 (手動)
```

**摩擦ポイント**: 1-7 が全て手作業。bot 利用は 8 から。

---

## 4. 理想フロー (proposal)

```
[理想の固定主体験]

1. Web app で「固定計画書」を作成 (ログイン後)
   ├─ コンテンツ選択      ← bot data から FRU/TOP/...
   ├─ 進行スタイル選択    ← bot data の strategies[] から
   ├─ 進行ペース          ← 週N回、X時間/セッション
   ├─ 募集ロール          ← MT/H1/D2 等を MultiSelect
   ├─ 募集ジョブ希望      ← (任意) D2 = MNK/SAM/RPR/VPR/NIN
   ├─ 応募要件            ← 経験/ボイチャ/最低出席率
   └─ 説明文 (Markdown)
2. 募集テンプレを自動生成 (媒体別)
   ├─ Lodestone BBCode
   ├─ Twitter 280字版
   └─ Discord Markdown
3. 募集投稿 (固定主が各媒体に手動コピペ)
4. 応募管理 (Web app)
   ├─ 応募者を手入力 or Discord reaction で集める
   └─ ステータス: 応募/選考中/確定/落選
5. メンバー確定 → bot 招待 + 固定主が Discord 操作
6. Discord で /static-init plan:<id>
   ├─ Phase channels 自動作成
   ├─ Discord role 作成
   ├─ メンバーに role 付与 (Web app の確定リストから)
   ├─ 各 Phase channel に動画/マクロ/軽減 投稿
   └─ #ロビーに「固定スタート」アナウンス
7. /schedule で初回日程 → 通知開始
```

**bot は「決まったことをセットアップする」役割**、Web app は「考える/募集する/管理する」役割。

---

## 5. Phase A: bot 拡張

既存 `/setup-static` を発展させた **`/static-init`** を中心に、固定運用の基本コマンドを揃える。

### 5.1 新コマンド

#### `/static-init`
固定の Discord 環境を一括セットアップ。

**入力**:
- `content:fru` (必須、autocomplete)
- `name:"週末絶エデン"` (必須、Discord role 名)
- `plan_id:<uuid>` (任意、Phase B+ で Web app の計画書 ID)

**動作**:
1. Discord role 作成 (`@<name>`、color = content の type 別)
2. Category 作成 (`<name> 固定`)
3. その配下に channels:
   - `#ロビー` (テキスト)
   - `#日程` (テキスト)
   - `#p1-<boss>` 〜 `#p<N>-<boss>` (Phase毎)
4. 各 Phase channel に自動投稿: 動画リンク・マクロリンク・軽減URL・Tips embed
5. `statics` テーブルに record 作成 (leader = 実行者)
6. `plan_id` 指定時: 計画書から確定メンバーを引き、role 付与 + `static_members` 追加
7. 実行者に ephemeral で「次の手順」案内

**権限**: ManageChannels (既存 /setup-static と同等)

#### `/static-add user:@xxx [game_role:MT] [job:PLD]`
- Discord role 付与
- `static_members` に追加
- #ロビーに「@user さんが加入」自動通知

#### `/static-remove user:@xxx`
- role 剥奪、DB から削除
- 確認 ephemeral

#### `/static-info`
- 現在 channel が属する static の情報を embed で表示
- メンバー一覧 (role/job)
- 直近 schedule
- 現在進行 phase

#### `/static-mention [text:?]`
- static role を mention して任意メッセージ送信
- leader 限定 (ManageEvents)

#### `/static-pause until:YYYY-MM-DD`
- alert worker がこの static の schedule を skip
- 旅行・他コンテンツ並走時に使う

#### `/static-resume`
- pause 解除

### 5.2 既存コマンドの拡張

#### `/schedule`
- 現在 channel が属する static があれば、`mention` を **自動で static role に**
- DB に `staticId` FK で関連付け

#### `/recruit-template`
- 既存テンプレ生成は維持
- 新規: `/recruit-post channel:#募集 ...` で **指定 channel に直接投稿**

### 5.3 Phase A 実装範囲

新規ファイル想定 (apps/bot):
- `src/commands/static-init.ts` (+ test)
- `src/commands/static-add.ts`
- `src/commands/static-remove.ts`
- `src/commands/static-info.ts`
- `src/commands/static-mention.ts`
- `src/commands/static-pause.ts` `static-resume.ts`
- `src/services/static-manager.ts` (DB CRUD + Discord role ops)

DB:
- `statics` テーブル
- `static_members` テーブル
- `schedules.staticId` カラム追加

工数概算: **2-3 PR / 4-6 時間**

---

## 6. Phase B: Web app 計画書 + テンプレ生成

固定の計画を Web フォームで構築。媒体別の募集テンプレを自動生成。

### 6.1 ルート構成

| Route | 内容 | 認証 |
|---|---|---|
| `/dashboard/plans` | 自分の計画書一覧 | 必須 |
| `/dashboard/plans/new` | 新規作成 (フォーム) | 必須 |
| `/dashboard/plans/[id]` | 計画書詳細 + テンプレプレビュー | leader のみ |
| `/dashboard/plans/[id]/edit` | 編集 | leader のみ |
| `/p/[id]` | 公開ページ (応募用、認証なしで閲覧可) | なし |

### 6.2 計画書スキーマ

```ts
plans = pgTable("plans", {
  id: uuid().primaryKey(),
  leaderId: text("leader_id").notNull(),     // Discord user ID
  status: text("status").notNull(),          // draft/recruiting/closed/archived
  contentId: text("content_id").notNull(),   // fru/top/...
  strategyId: text("strategy_id"),           // 進行スタイル (bot data から)
  name: text("name").notNull(),
  description: text("description"),          // Markdown
  pace: text("pace"),                        // 週N回 X時間
  startDate: date("start_date"),
  endDate: date("end_date"),                 // 目標完走日
  requirements: jsonb("requirements"),       // { voiceChat, experience, attendance }
  recruitingRoles: jsonb("recruiting_roles"),// [{ role: "MT", jobs: ["PLD","WAR"], filled: 0/1 }]
  contactMethod: text("contact_method"),     // Lodestone/Twitter/Discord
  contactUrl: text("contact_url"),
  createdAt, updatedAt,
});
```

### 6.3 テンプレ生成

入力フォームから 3 形式を自動生成:

**Lodestone BBCode**:
```
[h]【絶エデン】{{name}}固定 募集[/h]
■目標: {{goal}}
■活動: {{pace}}
■募集枠: {{recruitingRoles}}
■応募条件: {{requirements}}
■連絡: {{contactUrl}}
```

**Twitter (280字)**:
```
【絶エデン {{shortName}}固定募集】
{{pace}} / 募集: {{recruitingRolesShort}}
{{requirements_short}}
DM/応募 → {{contactUrl}}
#FF14絶エデン #FF14固定募集
```

**Discord Markdown**:
```
**【絶エデン】{{name}}固定 募集 📅**

> 目標: {{goal}}
> 活動: {{pace}}
> 募集: {{recruitingRoles}}
> 条件: {{requirements}}

応募: {{contactUrl}}
```

### 6.4 Phase B 実装範囲

- DB schema: `plans` テーブル (Postgres へ移行 or SQLite 拡張)
- `apps/web/src/app/dashboard/plans/...` (一覧 + 作成 + 詳細)
- `apps/web/src/lib/template-generator.ts` (媒体別生成ロジック)
- shadcn/ui or 同等の Form コンポーネント導入

工数概算: **3-4 PR / 8-12 時間**

---

## 7. Phase C: 応募管理

### 7.1 機能

公開ページ `/p/[id]` から応募:

```
[Public page: /p/abc123]

  【絶エデン】週末絶エデン固定 募集 📅

  目標: クリア
  活動: 週2回 (土日 21:00-24:00)
  募集枠: D2 (SAM/RPR), H1 (WHM/AST), MT (PLD/WAR)
  応募条件: ボイチャ必須、絶経験者歓迎、欠席率10%以内

  [Discordでログインして応募]  ← button
  [この募集を共有: Twitter / Lodestone link]
```

**応募 flow**:
1. 訪問者が「応募」ボタンクリック
2. Discord OAuth (まだログインしてなければ)
3. 応募フォーム:
   - 希望ジョブ
   - 経験 (テキスト)
   - 自己 PR
   - ボイチャ可否
4. submit → 応募データを `applications` テーブルに保存
5. leader に Discord DM 通知 (bot 経由)

### 7.2 leader 側管理

`/dashboard/plans/[id]/applications`:

| 応募者 | 希望ジョブ | 経験 | 状態 | 操作 |
|---|---|---|---|---|
| @taro | SAM | 絶3つ完走 | 応募 | [選考中] [確定] [落選] |
| @hanako | PLD | 絶バハ進行中 | 選考中 | [確定] [落選] |
| @ichiro | WHM | 絶6個完走 | 確定 | [取消] |

確定すると `confirmedMembers` に追加され、Phase D で /static-init plan:<id> 実行時に Discord role を自動で付与。

### 7.3 Phase C 実装範囲

- `applications` テーブル
- 公開ページ `/p/[id]`
- 応募フォーム + Discord OAuth
- `/dashboard/plans/[id]/applications` 管理ページ
- bot ↔ web の通知 (応募→leader にDM)

工数概算: **3 PR / 8-10 時間**

---

## 8. Phase D: bot ↔ Web 連携

### 8.1 統合のキモ

`/static-init plan:<id>` で:
1. bot が Web app の DB から計画書を読む
2. confirmedMembers (= application status="confirmed") を取得
3. それらの Discord User ID にロール付与
4. Phase channels の topic に計画書の情報を反映 (進行ペース・目標等)
5. Web app の plan.status を `running` に更新

### 8.2 必要なもの

- **共有 DB**: bot (Fly.io) と Web app (Vercel) が同じ DB を見る
  - 最も自然: Postgres (Neon) を採用、SQLite は dev のみ
  - 移行コスト: Drizzle のおかげで driver 置換のみ
- **権限**: bot が Web app の DB を読み書きできる (同 connection string)
- **bot ↔ web イベント通知** (任意): 
  - 例: 応募が来たら bot から leader に Discord DM
  - Web app から Discord API 直叩きでも可

### 8.3 Phase D 実装範囲

- DB: SQLite → Postgres 移行 (drizzle schema は共通)
- `apps/bot/src/services/plan-fetcher.ts` (web の plans を読む)
- `/static-init` に `plan_id` 対応追加
- Web app: 応募時に bot にイベント通知する (HTTP webhook or queue)

工数概算: **2-3 PR / 6-8 時間 + DB 移行作業**

---

## 9. DB schema 追加 (累積)

Phase A〜D で必要な全テーブル:

```ts
// Phase A
statics = sqliteTable("statics", {
  id: text().primaryKey(),
  guildId: text().notNull(),
  leaderId: text().notNull(),
  name: text().notNull(),
  contentId: text().notNull(),
  strategyId: text(),
  roleId: text().notNull(),
  categoryId: text().notNull(),
  lobbyChannelId: text(),
  recruitmentChannelId: text(),
  currentPhaseId: text(),
  pausedUntil: integer(),
  planId: text(),                     // Phase B 計画書 FK
  createdAt: integer().notNull(),
});

staticMembers = sqliteTable("static_members", {
  staticId: text().notNull(),
  userId: text().notNull(),
  gameRole: text(),                   // MT/ST/H1/H2/D1-D4
  job: text(),                        // PLD/WAR/...
  joinedAt: integer().notNull(),
}, (t) => ({ pk: primaryKey({ columns: [t.staticId, t.userId] }) }));

// Phase B (Web app)
plans = sqliteTable("plans", {
  id: text().primaryKey(),
  leaderId: text().notNull(),
  status: text().notNull(),           // draft/recruiting/closed/running/archived
  contentId: text().notNull(),
  strategyId: text(),
  name: text().notNull(),
  description: text(),
  pace: text(),
  startDate: text(),                  // ISO date
  endDate: text(),
  requirements: text(),               // JSON string
  recruitingRoles: text().notNull(),  // JSON: [{role, jobs[], filled}]
  contactMethod: text(),
  contactUrl: text(),
  createdAt: integer().notNull(),
  updatedAt: integer().notNull(),
});

// Phase C
applications = sqliteTable("applications", {
  id: text().primaryKey(),
  planId: text().notNull(),
  applicantId: text().notNull(),      // Discord user ID
  desiredJob: text().notNull(),
  experience: text(),
  selfPr: text(),
  voiceChatOk: integer(),
  status: text().notNull(),           // applied/considering/confirmed/rejected
  appliedAt: integer().notNull(),
  reviewedAt: integer(),
});

// schedules に staticId 追加 (Phase A)
ALTER TABLE schedules ADD COLUMN static_id TEXT;
```

---

## 10. 想定リスク

### 10.1 既存サーバーが既に複雑な場合
- `/static-init` が既存 channel と名前衝突
- 対策: 衝突検知 → ephemeral で「別名指定してね」案内 (既存 /setup-static と同じ)

### 10.2 Web app と bot の DB 分離
- 開発初期: SQLite 共有不可 (Vercel と Fly.io は別マシン)
- 対策: Phase D 前に Postgres 移行。Phase A/B は SQLite で別 DB 運用も可 (一時的)

### 10.3 募集ページの SEO / 公開リスク
- `/p/[id]` が Google にインデックスされる
- 対策: `noindex` meta or robots.txt で配信制限。リーダーが「公開/限定」選択

### 10.4 応募スパム
- bot 応募スパム
- 対策: Discord OAuth 必須、レート制限 (1 ユーザー / 計画書 = 1 応募)

### 10.5 個人情報
- 応募者の Discord User ID + 自己PR が DB に保存される
- Privacy Policy 改定が必要 (応募者データの保存・削除権利)

---

## 11. 実装順 (推奨)

### Phase A 単独で「最小プロダクト」: 1-2 週間
- 既存サーバー固定の体験を改善
- /static-init, /static-add, /static-info, /static-mention, /static-pause, /static-resume
- DB: statics + static_members
- これだけでも「友人で固定する人」は十分

### Phase B 追加で「野良募集対応」: +1 週間
- 計画書フォーム + テンプレ生成
- DB: plans
- ここまでで Lodestone 募集が劇的に楽になる

### Phase C 追加で「応募管理対応」: +1 週間
- 公開ページ + 応募フォーム + 管理 UI
- DB: applications
- ここまでで「Web で完結」できる

### Phase D 追加で「完全統合」: +1 週間 + Postgres 移行
- bot ↔ web の連携
- /static-init plan:<id> でメンバー確定リストが Discord に反映

**目標**: Phase A+B+C+D で **1 ヶ月**、固定主の立ち上げ体験を完全に変える。

---

## 12. 開いた問い

- [ ] Phase A だけで「公開β」可能か (Phase B/C は β2 で追加)?
- [ ] Phase B の計画書フォームは shadcn/ui や Conform 等のスタックを採用するか?
- [ ] Phase C の公開ページのレイアウトは Lodestone 風にする? モダン風にする?
- [ ] Phase D の Postgres 移行タイミング (Phase D 着手前 or 同時)
- [ ] 応募スパム対策の閾値設定
- [ ] 計画書テンプレを定型化するか、固定主が好きに編集できるか
- [ ] 応募者の Discord アカウントが新規 (Discord での実績ゼロ) の場合フラグ立てるか

---

## 13. 関連ドキュメント

- [REQUIREMENTS.md](../REQUIREMENTS.md) — プロダクト全体要件
- [tech-stack.md](./tech-stack.md) — 技術スタック決定
- [permissions.md](./permissions.md) — bot コマンド権限ポリシー
- [data-collection.md](./data-collection.md) — コンテンツデータ収集
- [deployment.md](./deployment.md) — Fly.io / Vercel デプロイ
