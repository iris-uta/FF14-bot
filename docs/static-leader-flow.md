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

### 2.1 ハイブリッド固定 (40-50% — 最頻パターン)
- 知人/コミュニティ内で 3-6 人集まる
- **足りない 2-5 枠は外部募集** (Lodestone/Twitter)
- 既存の Discord サーバー or 新規サーバーを使う
- 「H2 と D2 だけ募集」のような **スロット単位の募集**
- **欲しいもの**:
  - 既知メンバー指定で /static-init (Phase A 拡張)
  - 空き枠のみ募集する Lodestone テンプレ生成 (Phase B)
  - 応募者 confirmed したら Discord 招待 → role 付与 (Phase C+D)

→ **Phase A + B + C + D 全部使う (順次)**

### 2.2 完全身内固定 (30%)
- 友人/コミュニティ内で 8 人集めて固定
- 既存の Discord サーバーで運営
- 募集ゼロ (全員確定済み)
- **欲しいもの**: Phase channels の自動セットアップ + 通知 + マクロ参照

→ **Phase A** で完結

### 2.3 完全野良募集固定 (20-30%)
- Lodestone / Twitter で **全枠** 募集
- 知らない人と固定組む
- 応募者から選考
- 募集要項を毎回イチから考えるのが大変
- **欲しいもの**: 計画書作成 + 募集テンプレ生成 + 応募管理 + セットアップ

→ **Phase A + B + C + D**

### 2.4 まとめ
最頻は **ハイブリッド** なので、設計は **「スロット単位で確定/募集を独立管理」** を中心に。
完全身内・完全募集は「全スロットが filled / 全スロットが open」の特殊ケースとして自然に表現できる。

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

### 4.1 ハイブリッド固定 (最頻パターン)

```
[ハイブリッドの理想体験]

1. Web app で「固定計画書」を作成 (ログイン後)
   ├─ コンテンツ選択       ← bot data から FRU/TOP/...
   ├─ 進行スタイル選択     ← bot data の strategies[] から
   ├─ 進行ペース           ← 週N回、X時間/セッション
   ├─ スロット 8 個を埋める ← 各スロット ごとに状態指定:
   │   ├─ MT: 自分      (filled)
   │   ├─ ST: @友人1    (filled)
   │   ├─ H1: @友人2    (filled)
   │   ├─ H2: 募集中    (open, jobs=[WHM,AST])
   │   ├─ D1: @友人3    (filled)
   │   ├─ D2: 募集中    (open, jobs=[SAM,RPR])
   │   ├─ D3: 募集中    (open, jobs=[BRD,DNC])
   │   └─ D4: 募集中    (open, jobs=[SMN,RDM])
   ├─ 応募要件             ← 経験/ボイチャ/最低出席率
   └─ 説明文 (Markdown)
2. 募集テンプレを自動生成 (open スロットのみ列挙、媒体別)
   ├─ Lodestone BBCode
   ├─ Twitter 280字版
   └─ Discord Markdown
3. 募集投稿 (固定主が各媒体に手動コピペ)
4. 応募管理 (Web app)
   ├─ 応募者を手入力 or Discord reaction で集める
   └─ ステータス: 応募/選考中/確定/落選 (open スロットごとに)
5. (任意の早期セットアップ)
   Discord で /static-init plan:<id>
   ├─ Phase channels 自動作成
   ├─ Discord role 作成 + 既知 4 人に付与
   ├─ 各 Phase channel に動画/マクロ/軽減 投稿
   └─ #ロビーに「現在 4/8 確定、残り 4 枠募集中」アナウンス
   → 既知メンバーは早めに練習開始も可能 (人数足りる phase だけ)
6. 募集スロット埋まる
   ├─ Web app で leader が承認 → status = confirmed
   ├─ 確定者を Discord 招待 → 入ってきたら
   └─ /static-fill slot:h2 user:@hanako (or Web app から「Discord に追加」ボタン)
7. 全枠 filled になったら #ロビーに「⭐ 全枠確定！」アナウンス
8. /schedule で初回日程 → 通知開始
```

**bot は「決まったことを Discord に反映」、Web app は「考える/募集する/応募管理する」役割**。
スロット単位でステータス管理 → 既知/募集 が混在しても自然に扱える。

### 4.2 完全身内固定 (Phase A のみで完結)

```
1. 8 人決まってる
2. /static-init content:fru name:"週末絶エデン" members:"<@taro> MT PLD, <@hanako> ST GNB, <@me> H1 SCH, <@a> H2 WHM, <@b> D1 MNK, <@c> D2 SAM, <@d> D3 BRD, <@e> D4 SMN"
   → 全員 role 付与済、Phase channels 完成、すぐ /schedule
```

### 4.3 完全野良固定 (Web app から始まる)

```
1. Web app で計画書作成、全スロット open
2. 募集テンプレ生成 → 投稿
3. 全枠埋まるまで応募管理
4. 全部 confirmed → /static-init plan:<id> で一気に Discord セットアップ
```

---

## 5. Phase A: bot 拡張

既存 `/setup-static` を発展させた **`/static-init`** を中心に、固定運用の基本コマンドを揃える。

### 5.1 新コマンド

#### `/static-init`
固定の Discord 環境を一括セットアップ。3 つの起動モードに対応。

**入力**:
- `content:fru` (必須、autocomplete)
- `name:"週末絶エデン"` (必須、Discord role 名)
- `plan_id:<uuid>` (任意、Phase B+ の計画書 ID、指定時はメンバー情報を計画書から取得)
- `members:"<@taro> MT PLD, <@hanako> ST GNB, ..."` (任意、計画書なしで直接指定)

**3 つの起動モード**:

| モード | 入力例 | 動作 |
|---|---|---|
| 完全身内 | `members` 指定 | 指定メンバー全員 role 付与、全枠 filled |
| ハイブリッド | `members` で既知のみ指定 | 既知に role 付与、残り枠は open (募集枠と認識) |
| 野良 | `plan_id` 指定 | 計画書から status=filled/confirmed のみに role 付与 |
| 空 | どちらも未指定 | role と channels だけ作る、メンバー後追加 |

**動作**:
1. Discord role 作成 (`@<name>`、color = content の type 別)
2. Category 作成 (`<name> 固定`)
3. その配下に channels:
   - `#ロビー` (テキスト)
   - `#日程` (テキスト)
   - `#p1-<boss>` 〜 `#p<N>-<boss>` (Phase毎)
4. 各 Phase channel に自動投稿: 動画リンク・マクロリンク・軽減URL・Tips embed
5. `statics` + 8 つの **slot** (`static_slots`) を作成
6. 指定メンバー (`members` or `plan_id`) を該当 slot に登録 + role 付与
7. 実行者に ephemeral で「次の手順」案内
   - 残り枠あれば「残り N 枠は /static-fill で埋めるか、Web app で募集してください」

**権限**: ManageChannels

#### `/static-fill slot:h2 user:@xxx [job:WHM]`
スロット 1 つを埋める (新規メンバー追加 + role 付与)。

- `slot` autocomplete: 現在 channel が属する static の open スロットだけ表示
- `user` を `static_members` + slot の assignee に登録
- Discord role 付与
- #ロビーに「H2 (WHM) @user 確定！」自動通知
- 全スロット filled になったら「⭐ 全枠確定！」追加通知

**権限**: ManageEvents (leader相当)

#### `/static-add user:@xxx [game_role:MT] [job:PLD]`
(`/static-fill` の簡略版、slot 指定なし) 任意ロールでメンバー追加。
- スロットには紐付けないので、計画書の進捗 (8/8 達成等) には反映されない
- 緊急メンバー差し替えや、副メンバー登録に使う

#### `/static-remove user:@xxx`
- role 剥奪、DB から削除 (slot は open に戻る)
- 確認 ephemeral

#### `/static-slot slot:h2 status:open|closed`
スロット状態を手動編集 (例: 「H2 はもう募集しない」)。
- closed = 募集テンプレ生成時に「7 人固定 (1 枠欠員)」として出力

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
- `src/commands/static-fill.ts`
- `src/commands/static-slot.ts`
- `src/commands/static-add.ts`
- `src/commands/static-remove.ts`
- `src/commands/static-info.ts`
- `src/commands/static-mention.ts`
- `src/commands/static-pause.ts` `static-resume.ts`
- `src/services/static-manager.ts` (DB CRUD + Discord role ops)

DB:
- `statics` テーブル
- `static_slots` テーブル
- `static_members` テーブル

---

## 5+. Phase A+: bot 内 募集文ビルダー (Web app 不要派向け)

「web を使うほどでもないが、毎回イチからテンプレ書くのは嫌」という需要に Discord 内完結で応える。

### A+.1 `/recruit-builder content:fru`

Modal + ボタン UI による カスタム募集文作成。**「鯖立て → /static-init → /recruit-builder → コピー or 投稿」で完結**。

**起動フロー**:
```
/recruit-builder content:fru
  ↓
Bot が Modal (5 input) を開く:
  - 目標 (Short, 例: "クリア", "P3 練習")
  - 活動ペース (Short, 例: "週2回 土日21時")
  - 募集枠 (Short, 例: "H2 WHM/AST, D2 SAM")
  - 応募条件 (Paragraph, 例: "ボイチャ必須\n絶経験者歓迎")
  - 自由メッセージ (Paragraph, 任意)
  ↓
Modal submit → DB に下書き保存 (recruit_drafts table)
  ↓
Bot が ephemeral でプレビュー Embed + ボタン 5 個:
  [📋 BBCode コピー] [🐦 Twitter版]
  [📤 この channel に投稿] [✏️ 編集] [🗑 キャンセル]
  ↓
ユーザー操作:
  - 編集 → 同 Modal 再表示 (前回値プリフィル)
  - コピー → ephemeral で text 出力 (Discord 仕様上「コピー」ボタン
    そのものは bot 経由不可、テキストブロックで表示し手動コピー)
  - 投稿 → 通常メッセージとして channel に送信、下書き削除
  - キャンセル → 下書き削除
```

### A+.2 既存 `/recruit-template` との関係

| | /recruit-template | /recruit-builder (A+) |
|---|---|---|
| 入力 | slash command の option (8個まで) | Modal (5 input、Paragraph 可) |
| 編集 | コマンド再実行 (オプション全入力やり直し) | ボタン [編集] で前回値プリフィル |
| プレビュー | reply に code block で出力 | ephemeral embed |
| 投稿 | ユーザーが手動コピペ | ボタン1つで現 channel 投稿可 |
| 下書き保存 | なし | DB に保持 (1 user × 1 guild = 1 下書き) |

→ `/recruit-template` は「コマンド一発生成」向き、`/recruit-builder` は「ちゃんと作り込む」向き。**両方残す**。

### A+.3 DB 追加

```ts
recruitDrafts = sqliteTable("recruit_drafts", {
  guildId: text().notNull(),
  userId: text().notNull(),
  contentId: text(),
  goal: text(),
  pace: text(),
  recruitingRoles: text(),
  requirements: text(),
  freeMessage: text(),
  updatedAt: integer().notNull(),
}, (t) => ({ pk: primaryKey({ columns: [t.guildId, t.userId] }) }));
```

1 ユーザー × 1 guild = 1 下書き (シンプル、複数下書き欲しいなら Web app へ誘導)。

### A+.4 Discord の機能制限と対処

| 制限 | 対処 |
|---|---|
| Modal は 1 ダイアログ = 最大 5 input | 必須項目を 5 つに絞る、他は自由メッセージ欄に |
| Modal Text Input = 最大 4000 chars | 募集文には十分 |
| Slash command の reply は通常メッセージ or ephemeral | プレビューは ephemeral、投稿時は通常メッセージ |
| ボタンの interaction.update() | プレビュー → 編集 → 再プレビューの遷移可 |

### A+.5 実装範囲

新規ファイル:
- `apps/bot/src/commands/recruit-builder.ts`
- `apps/bot/src/services/recruit-builder.ts` (下書き CRUD、テンプレ生成 — Phase B のテンプレ生成ロジックを共通化)
- `apps/bot/src/events/modal-submit.ts` (Modal handler)
- `apps/bot/src/events/button-interaction.ts` (Button handler)
- DB: `recruit_drafts` table

工数概算: **1-2 PR / 4-6 時間** (Modal/Button UI が初導入なら少し増)

### A+.6 Phase B との連携

A+ で作った下書きは Web app の計画書 (Phase B) に **エクスポート可能** にする:
- ephemeral embed に「💾 Web app に保存」ボタン追加
- クリック → Web app 計画書として新規作成 (Discord OAuth 必須)
- そのまま Phase B/C/D のフルフローに繋がる

これで「最初は bot で軽く → 本格運用したくなったら Web app」のスムーズな移行が可能。
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

### 6.2 計画書スキーマ (slot 分離版)

スロットを別テーブルに切り出し、各スロット独立に確定/募集/応募状態を持たせる。

```ts
plans = pgTable("plans", {
  id: uuid().primaryKey(),
  leaderId: text("leader_id").notNull(),
  status: text("status").notNull(),          // draft/recruiting/running/closed/archived
  contentId: text("content_id").notNull(),
  strategyId: text("strategy_id"),
  name: text("name").notNull(),
  description: text("description"),
  pace: text("pace"),
  startDate: date("start_date"),
  endDate: date("end_date"),
  requirements: jsonb("requirements"),       // { voiceChat, experience, attendance }
  contactMethod: text("contact_method"),
  contactUrl: text("contact_url"),
  createdAt, updatedAt,
});

planSlots = pgTable("plan_slots", {
  id: uuid().primaryKey(),
  planId: uuid().notNull().references(() => plans.id),
  role: text("role").notNull(),              // MT/ST/H1/H2/D1/D2/D3/D4
  jobs: jsonb("jobs").notNull(),             // ["PLD","WAR"]
  assigneeUserId: text("assignee_user_id"),  // Discord user ID (filled/confirmed時)
  status: text("status").notNull(),          // open/applied/confirmed/filled/closed
  note: text("note"),                        // (任意) この枠への注釈
  filledAt: timestamp("filled_at"),
});
```

**status 遷移**:
```
open ──応募来た──> applied ──leader 承認──> confirmed ──Discord招待+role付与──> filled
  ↑                  │                          │
  └──leader 拒否─────┘                          └──取消───> open
```

- `open` = 募集中、誰でも応募可能
- `applied` = 応募者がいる、leader 選考中
- `confirmed` = leader 承認済み、Discord 招待待ち
- `filled` = Discord にも追加完了、role 付与済 (bot 側にも反映)
- `closed` = 募集しない (7人固定など)

### 6.3 テンプレ生成 (open スロットだけ列挙)

入力フォームから 3 形式を自動生成。**status=open/applied のスロットだけ募集枠として記載**:

**Lodestone BBCode**:
```
[h]【絶エデン】{{name}}固定 募集[/h]
■目標: {{goal}}
■活動: {{pace}}
■現在の構成: {{filledCount}}/{{totalSlots}}人 (確定: {{filledRolesShort}})
■募集枠: {{openSlotsList}}    ← H2 (WHM/AST), D2 (SAM/RPR), D4 (SMN/RDM)
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
1. 訪問者が「応募」ボタンクリック (open スロットだけクリック可能、filled スロットは「埋まりました」グレーアウト)
2. Discord OAuth (まだログインしてなければ)
3. 応募フォーム:
   - 応募スロット (open のものから選択)
   - 希望ジョブ (そのスロットの jobs[] から)
   - 経験 (テキスト)
   - 自己 PR
   - ボイチャ可否
4. submit → 該当スロットの status が `open` → `applied` に
   - 1 スロットに複数応募が来ることも (leader が選考)
5. leader に Discord DM 通知 (bot 経由) — 「H2 スロットに新規応募」

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

// 8 つのスロット (MT/ST/H1/H2/D1-D4) を per-static で持つ
// 計画書とは別管理 — 計画書なしの hybrid 固定でも slot 概念を使う
staticSlots = sqliteTable("static_slots", {
  staticId: text().notNull(),
  role: text().notNull(),             // MT/ST/H1/H2/D1/D2/D3/D4
  jobs: text(),                       // JSON: ["PLD","WAR"] (募集時のみ)
  assigneeUserId: text(),             // Discord user ID (filled の時)
  status: text().notNull(),           // open / applied / confirmed / filled / closed
  job: text(),                        // 確定時のジョブ
  filledAt: integer(),
}, (t) => ({ pk: primaryKey({ columns: [t.staticId, t.role] }) }));

// 過去メンバー履歴用 (一般メンバー追跡)
staticMembers = sqliteTable("static_members", {
  staticId: text().notNull(),
  userId: text().notNull(),
  gameRole: text(),
  job: text(),
  joinedAt: integer().notNull(),
  leftAt: integer(),                  // 退会時刻 (nullなら現役)
}, (t) => ({ pk: primaryKey({ columns: [t.staticId, t.userId] }) }));

// Phase B (Web app, Postgres 想定)
plans = sqliteTable("plans", {
  id: text().primaryKey(),
  leaderId: text().notNull(),
  status: text().notNull(),           // draft/recruiting/running/closed/archived
  contentId: text().notNull(),
  strategyId: text(),
  name: text().notNull(),
  description: text(),
  pace: text(),
  startDate: text(),
  endDate: text(),
  requirements: text(),               // JSON
  contactMethod: text(),
  contactUrl: text(),
  createdAt: integer().notNull(),
  updatedAt: integer().notNull(),
});

// Phase A+ — bot 内 募集文ビルダーの下書き保持 (1 user × 1 guild = 1)
recruitDrafts = sqliteTable("recruit_drafts", {
  guildId: text().notNull(),
  userId: text().notNull(),
  contentId: text(),
  goal: text(),
  pace: text(),
  recruitingRoles: text(),
  requirements: text(),
  freeMessage: text(),
  updatedAt: integer().notNull(),
}, (t) => ({ pk: primaryKey({ columns: [t.guildId, t.userId] }) }));

// Phase B (plan_slots) — staticSlots と構造同じだが「計画段階」のスロット
// /static-init で plan_id 指定すると plan_slots を static_slots にコピー
planSlots = sqliteTable("plan_slots", {
  planId: text().notNull(),
  role: text().notNull(),
  jobs: text(),                       // JSON
  assigneeUserId: text(),
  status: text().notNull(),
  note: text(),
}, (t) => ({ pk: primaryKey({ columns: [t.planId, t.role] }) }));

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

### Phase A 単独で「最小プロダクト (鯖立て + 運用)」: 1-2 週間
- 既存サーバー固定の体験を改善
- /static-init (3 モード), /static-fill, /static-slot, /static-add, /static-remove,
  /static-info, /static-mention, /static-pause, /static-resume
- DB: statics + static_slots + static_members
- これだけでも「身内 + 数枠募集する人」は十分

### Phase A+ 追加で「鯖内 募集文ビルダー」: +0.5 週間
- /recruit-builder (Modal + Button UI、ephemeral プレビュー + 投稿/コピー)
- DB: recruit_drafts
- これで Discord 内完結派 (Web app 不要派) を取り込む

### Phase B 追加で「Web 計画書 (詳細編集 + 履歴)」: +1 週間
- 計画書フォーム + テンプレ生成
- DB: plans + plan_slots
- Lodestone 募集が劇的に楽、複数固定持つ人にも対応

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
