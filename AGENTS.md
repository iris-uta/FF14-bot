# AGENTS.md — 並列作業プロトコル

複数のagent（Claude等のLLM、人間の貢献者）が同時に作業するためのルール。

## 大原則

1. **トラックを跨がない** — 1 agent = 1 track が基本。schema以外は他トラックに触らない。
2. **スキーマが契約** — `packages/schema/` は全トラックの依存元。変更は破壊的にしない／するなら調整する。
3. **ブランチを分ける** — 同一ブランチに複数agentが同時pushしない。
4. **小さくマージする** — 1 PR = 1機能 = 100〜500行目安。

## トラックと担当領域

| Track | 所有ディレクトリ | 触ってよい範囲 | 触ってはいけない |
|---|---|---|---|
| **Schema** | `packages/schema/` | schema内・schema test | apps/, data/ の中身 |
| **Bot** | `apps/bot/` | bot内・bot test・bot用fixture | apps/web/, packages/schema/, data/*.yaml |
| **Web** | `apps/web/` | web内・web test | apps/bot/, packages/schema/, data/*.yaml |
| **Data** | `data/contents/` | yaml ファイル | コード全般 |
| **Infra** | `infra/`, `.github/` | CI設定、Dockerfile等 | アプリ実装ロジック |
| **Docs** | `docs/`, ルートの `.md` | ドキュメント | コード全般 |

> 例外: 自分のトラックでschema変更が必要になった場合 → 「契約変更プロトコル」（後述）に従う。

## ブランチ運用

### 命名規則
```
<track>/<short-description>
```
例:
- `bot/content-select-command`
- `web/landing-page`
- `schema/add-strategy-variant`
- `data/fru-p1-mechanics`
- `docs/architecture-diagram`

### main ブランチ
- 常にデプロイ可能な状態を保つ（基本）
- 直push禁止、PR経由でmerge

### 同時作業時のフロー
```
main
 ├── bot/feat-A         (agent 1)
 ├── web/feat-B         (agent 2)
 ├── data/fru-p2        (agent 3 = 人間)
 └── schema/add-field   (agent 4 — 他は完了待ち)
```

## git worktree で複数agentを並列実行

各agentが独立した作業ディレクトリを持つことで、ブランチ切り替えなしに並列作業できる。

### セットアップ（一度だけ）
```bash
# worktree置き場
mkdir -p .worktrees
```

### Agent起動時（毎回）
```bash
# trackごとにworktreeを作る
git worktree add .worktrees/bot         bot/<feature>
git worktree add .worktrees/web         web/<feature>
git worktree add .worktrees/data        data/<feature>
git worktree add .worktrees/schema      schema/<feature>
```

Claude Code の Agent tool で並列起動する場合は `isolation: "worktree"` オプションを使うと自動でworktreeが作成される。

### 完了時
```bash
git worktree remove .worktrees/bot
```

## 契約変更プロトコル（schema 変更時）

schema の変更は全トラックに波及するため、**勝手に変えない**。

### 非破壊変更（フィールド追加・新型追加）
- そのままPR出してOK
- レビュー観点: 既存YAMLが壊れないこと、optional で入れる

### 破壊変更（フィールド削除・rename・型変更）
1. **GitHub Issueで提案**: 変更理由・影響範囲・移行手順を書く
2. 他トラックの進行中ブランチがある場合は調整（マージタイミング合わせる）
3. schemaのPR → 全トラックの追従PR → まとめてmerge
4. `data/contents/*.yaml` の追従が必要なら data担当に依頼

> **絶対にやらない**: 他トラックのコードを断りなく書き換える、schemaを「ついでに」変更する

## PR ルール

- タイトル: `<track>: <変更内容>` 例: `bot: add /content command`
- 説明欄に書くこと:
  - **何を**変更したか（whatではなくwhy重視）
  - **影響範囲**: 自トラックのみか、他トラックに波及するか
  - **テスト**: どう動作確認したか
- セルフレビュー後にdraftを外す
- **schema変更を含むPRは別出し** にする（mixed PR禁止）

## コンフリクト回避テクニック

1. **小さいPRを素早くマージ** — long-lived branchを作らない
2. **schemaの安定** — schema変更は週1回のリリース日にまとめる（運用が落ち着いたら）
3. **YAMLは1ファイル1コンテンツ** — `data/contents/fru.yaml`, `data/contents/top.yaml` で衝突回避
4. **lock fileの扱い** — `pnpm-lock.yaml` は depend-bot 的に自動更新、手書きでは触らない

## Agent起動時のチェックリスト

新しいagent（Claude等）が作業を始める前に確認すること:

- [ ] `CLAUDE.md` を読んだ
- [ ] 自分が担当するtrackを認識した
- [ ] `plan.md` で自分のタスクを確認した（あれば claim する）
- [ ] git worktree が必要なら作った
- [ ] 触ってはいけない範囲を確認した（「トラックと担当領域」表）

## 並列起動の具体例（Claude Code Agent tool）

```typescript
// 同一メッセージで複数Agentを起動 → 並列実行
[
  Agent({
    description: "Bot: /content command implementation",
    subagent_type: "general-purpose",
    isolation: "worktree",
    prompt: "apps/bot/ で /content slash command を実装。packages/schema を読み込み、data/contents/*.yaml から候補を取得。詳細: plan.md task #B-1"
  }),
  Agent({
    description: "Data: FRU phase 1 details",
    subagent_type: "general-purpose",
    isolation: "worktree",
    prompt: "data/contents/fru.yaml の P1 セクションを埋める。詳細: plan.md task #D-1。コード変更は禁止。"
  }),
  Agent({
    description: "Docs: architecture diagram",
    subagent_type: "general-purpose",
    isolation: "worktree",
    prompt: "docs/architecture.md にmermaid図でシステム構成を追加。詳細: plan.md task #F-1"
  })
]
```
