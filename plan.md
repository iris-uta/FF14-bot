# plan.md — タスク一覧

MVP（**絶エデン / FRU** で全フロー完成）までのタスク。

タスクIDの prefix:
- `S-` = Schema track
- `B-` = Bot track
- `W-` = Web track
- `D-` = Data track
- `I-` = Infra track
- `F-` = Docs track

依存関係列の意味: そのタスクを始めるまでに完了している必要があるタスク。

## Phase 0: 基盤（このPRで完成）

| ID | タスク | 依存 | 担当候補 | 状態 |
|---|---|---|---|---|
| F-0 | REQUIREMENTS.md / CLAUDE.md / AGENTS.md / plan.md 作成 | - | - | ✅ |
| S-0 | packages/schema 雛形 + Zod スキーマ | - | - | ✅ |
| B-0 | apps/bot 雛形 + discord.js install + dev script | - | - | ✅ |
| D-0 | data/contents/_template.yaml + fru.yaml骨格 | S-0 | - | ✅ |

## Phase 1: MVP（並列実行可能）

> S-1 完了後は B-1〜B-5 / D-1〜D-3 が並列実行可能。

### Schema (S)
| ID | タスク | 依存 | 担当 | 状態 |
|---|---|---|---|---|
| S-1 | コンテンツスキーマ完成（Phase, Strategy variant, Macro, Mitigation, Video, RecruitmentTemplate） | S-0 | | |
| S-2 | 固定（Static）スキーマ（メンバー, 進行度, スケジュール） | S-1 | | |
| S-3 | YAML → 型へのloader & validator | S-1 | | |

### Bot (B) — 全て Schema 完成待ち
| ID | タスク | 依存 | 担当 | 状態 |
|---|---|---|---|---|
| B-1 | /content slash command（コンテンツ選択UI） | S-1, S-3 | | |
| B-2 | Phaseチャネル自動作成 | B-1, S-1 | | |
| B-3 | 攻略動画・マクロ・軽減表テンプレ投稿 | B-2, S-1 | | |
| B-4 | /recruit-template コマンド（募集テンプレ生成） | S-1 | | |
| B-5 | 開始N分前アラート（cron + persistent store） | S-2 | | |

### Data (D) — Schemaの形さえ決まれば独立に進む
| ID | タスク | 依存 | 担当 | 状態 |
|---|---|---|---|---|
| D-1 | FRU P1 メカニクス・処理方・軽減 | S-1 | | |
| D-2 | FRU P2 メカニクス・処理方・軽減 | S-1 | | |
| D-3 | FRU 全Phase 動画リンク収集 | S-1 | | |
| D-4 | 募集テンプレ参照（既存テンプレ収集） | S-1 | | |

### Docs (F)
| ID | タスク | 依存 | 担当 | 状態 |
|---|---|---|---|---|
| F-1 | docs/architecture.md にmermaid構成図追加 | - | | |
| F-2 | docs/data-collection.md にYAML編集ガイド | S-1 | | |

## Phase 2: 拡張機能

| ID | タスク | 依存 | 担当 | 状態 |
|---|---|---|---|---|
| B-6 | 軽減回しエディタ呼び出しコマンド | W-1 | | |
| W-1 | Web: 軽減回しエディタ | S-1 | | |
| W-2 | Web: 募集テンプレジェネレーター | S-1 | | |
| B-7 | 日程調整（調整さん連携 or 自前） | S-2 | | |
| B-8 | 攻略Tips Q&A コマンド | S-1, D-* | | |
| B-9 | /macro コマンド（外部サイトリンク返却） | S-1 | | |

## Phase 3: 進行度・他コンテンツ対応

| ID | タスク | 依存 | 担当 | 状態 |
|---|---|---|---|---|
| B-10 | Vigil (FF14 Prog Tracker) 連携 | S-2 | | |
| B-11 | FFLogs API 連携 | S-2 | | |
| B-12 | 処理方バリアント切替（絶オメガP3 アスト式/十字式 等） | S-1 | | |
| D-5 | TOP（絶オメガ）データ追加 | S-1 | | |
| D-6 | DSR（絶竜詩）データ追加 | S-1 | | |
| D-7 | 零式コンテンツデータ追加 | S-1 | | |

## Infra (I) — リリース前後

| ID | タスク | 依存 | 担当 | 状態 |
|---|---|---|---|---|
| I-1 | GitHub Actions（lint/typecheck/test） | B-0, W bootstrap | | |
| I-2 | Bot デプロイ（Fly.io / Railway / 自前VPS） | MVP完成 | | |
| I-3 | Web デプロイ（Vercel） | W-1 | | |
| I-4 | DB セットアップ（PostgreSQL or SQLite + LiteFS） | S-2 | | |

## タスクの取り方（agent向け）

1. 「状態」が空欄のタスクから依存が解決されているものを選ぶ
2. 自分の名前を「担当」に書く（claim）
3. ブランチを切る: `<track>/<task-id>-short-desc`  例: `bot/B-1-content-command`
4. 完了したら PR を出す、「状態」を ✅ にする
