# Sheet export — Google Sheets seed

このディレクトリは **生成ファイル** (`packages/content-sync` の export-csv が出力)。

YAML データ (`data/contents/*.yaml`) → 9 タブ構成の Google Sheets 用ファイル。

## 📄 ファイル

| ファイル | 内容 |
|---|---|
| `ff14-contents-template.xlsx` | **9 タブ multi-sheet Excel** (Google Sheets 一発 import 用、 推奨) |
| `contents.csv` | id, displayName, shortName, type, patch, references_primary (31 行) |
| `phases.csv` | content_id, phase_id, name, order, description (70 行) |
| `videos.csv` | content_id, phase_id, title, url, author (122 行) |
| `mitigations.csv` | content_id, phase_id, name, url, copyable (28 行) |
| `strategies.csv` | content_id, phase_id, id, name, description (89 行) |
| `tips.csv` | content_id, phase_id, tip (205 行) |
| `macros.csv` | content_id, source, url, text (91 行) |
| `templates.csv` | content_id, template, variables (31 行) |
| `references.csv` | content_id, url (338 行) |

合計 **1005 行 × 9 タブ**。

## 🚀 Google Sheets への import (1 回だけ)

### 方法 A: XLSX 一発 (推奨)

1. https://sheets.google.com で新規 Sheet 作成
2. 「ファイル → インポート → アップロード」
3. `ff14-contents-template.xlsx` を選択
4. 「**スプレッドシートを置き換える**」 を選択 → インポート
5. 9 タブが一度に作成される ✨
6. 共有: 「リンクを知っている全員 = **閲覧者**」
7. 編集権は dev に個別招待

### 方法 B: CSV を 1 タブずつ

1. 新規 Sheet 作成
2. シート名を `contents` に変更
3. 「ファイル → インポート → アップロード → contents.csv」
4. 「現在のシートを置き換える」 → インポート
5. 「+ ボタン」 で新タブ追加、 `phases` と命名
6. 同様に phases.csv をインポート
7. 残り 7 つも同様 (videos / mitigations / strategies / tips / macros / templates / references)

## 🔄 再生成

YAML が更新されたら CSV/XLSX も再生成:

```bash
pnpm --filter @ff14kotei/content-sync export-csv
```

## ⚠️ 注意

- このディレクトリのファイルは **生成物** — 直接編集しないでください
- 編集は Google Sheets で → `pnpm pull` で YAML へ反映 → git commit
- `.gitignore` 対象になっていない (= git で tracked)、 ただし PR で初期 seed 後は更新不要

## 📚 詳細

[docs/content-sync.md](../../docs/content-sync.md) — 完全ワークフロー / トラブルシュート
