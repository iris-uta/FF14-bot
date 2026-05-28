# Google Sheets 編集ガイド

`data/contents/*.yaml` を Google Sheets で編集する人向けの **完全リファレンス**。

> 💡 Sheet そのもののセットアップ手順は [`docs/content-sync.md`](content-sync.md) を見てください。 ここは **「何をどこに書けばよいか」** に特化。

---

## 📑 9 タブ早見表

| Tab | 役割 | キー列 | 1 行 = |
|---|---|---|---|
| `contents` | コンテンツ本体 | `id` | 1 コンテンツ (fru, m1s, etc.) |
| `phases` | 各 phase のメタ | `content_id` + `phase_id` | 1 phase (p1, p2, etc.) |
| `videos` | 攻略動画 link | `content_id` + `phase_id` | 1 動画 |
| `mitigations` | 軽減表 link | `content_id` + `phase_id` | 1 軽減表 (1 phase に 1 つ) |
| `strategies` | 処理法 variant | `content_id` + `phase_id` + `id` | 1 処理法 |
| `tips` | 攻略 tips | `content_id` + `phase_id` | 1 tip |
| `macros` | マクロ link | `content_id` | 1 マクロ |
| `templates` | 募集テンプレ | `content_id` | 1 テンプレ |

**重要**: `content_id` と `phase_id` で他タブの行と紐付くので、 **typo すると孤児行** になります。

---

## 📋 タブ別 詳細

### 1. `contents`

| 列 | 必須 | 値の例 | 説明 |
|---|---|---|---|
| `id` | ✅ | `fru` | 半角英数 + ハイフン。 URL safe、 短く。 全 sheet で一意 |
| `displayName` | ✅ | `絶もうひとつの未来` | 日本語フル名 |
| `shortName` | ✅ | `FRU` | 略称、 通称。 半角英数推奨 |
| `type` | ✅ | `ultimate` | **enum**: `ultimate` / `savage` / `extreme` / `unreal` / `variant` / `criterion` / `alliance` / `other` |
| `patch` | – | `7.11` | 実装パッチ。 数値文字列 (引用符不要) |
| `overview_main_strategy` | – | `優先 TDH / 検知式アスト` | コンテンツ全体主流処理法 1 行 |
| `overview_playlist_title` | – | `FRU 全 phase 解説` | 全体動画プレイリストの題名 |
| `overview_playlist_url` | – | `https://youtube.com/...` | プレイリスト URL |
| `overview_playlist_author` | – | `ぬけまる` | 作者 |
| `overview_macro_source` | – | `りりーどーる` | 編成全体マクロの出典名 |
| `overview_macro_url` | – | `https://...` | 全体マクロ URL |
| `overview_macro_text` | – | `/p ...` | 全体マクロ本文 (コピペ用) |
| `overview_guide_url` | – | `https://na.finalfantasyxiv.com/lodestone/character/.../blog/...` | **攻略ガイド元 URL** (リリーどーる Lodestone post 等)。 全体 channel に「📚 攻略ガイド」 として表示 |
| `overview_bis_url` | – | `https://etro.gg/gearset/abc` | **最適装備 (BiS) URL** (Etro、 The Balance 等)。 全体 channel に「⚔️ 最適装備」 として表示 |

**テンプレ行 (新規追加用)**:
```
new-content    新コンテンツ名    SHORT    savage    7.5    参照元名前
```

### 2. `phases`

| 列 | 必須 | 値の例 | 説明 |
|---|---|---|---|
| `content_id` | ✅ | `fru` | `contents.id` と一致 |
| `phase_id` | ✅ | `p1` | コンテンツ内で一意。 `p1` / `p2-intermission` 等 |
| `name` | ✅ | `Fatebreaker` | phase 表示名 |
| `order` | ✅ | `0` | 並び順 (数字、 小さい順) |
| `description` | – | `開幕 60s ...` | 自由文。 **複数行 OK** (`Cmd+Enter` / `Alt+Enter` で改行) |

**テンプレ行**:
```
fru    p6-extra    P6 特殊フェーズ    5    詳細メモ
```

### 3. `videos`

| 列 | 必須 | 値の例 | 説明 |
|---|---|---|---|
| `content_id` | ✅ | `fru` | – |
| `phase_id` | ✅ | `p1` | – |
| `title` | ✅ | `P1 解説 by Alice` | 表示名 |
| `url` | ✅ | `https://youtu.be/abc123` | **必ず `https://` から** |
| `author` | – | `@alice` | 作者表示 |

**テンプレ行**:
```
fru    p3    P3 解説 (Light Party視点)    https://youtu.be/xxxxxxxxxxx    @username
```

### 4. `mitigations`

| 列 | 必須 | 値の例 | 説明 |
|---|---|---|---|
| `content_id` | ✅ | `fru` | – |
| `phase_id` | ✅ | `p1` | – |
| `name` | ✅ | `FRU P1 軽減表` | 表示名 |
| `url` | ✅ | `https://docs.google.com/...` | 軽減表のリンク |
| `copyable` | – | `true` or `false` | コピー推奨マーク (default `false`) |

**1 phase に 1 mitigation のみ** (複数あると後勝ち)。

### 5. `strategies`

| 列 | 必須 | 値の例 | 説明 |
|---|---|---|---|
| `content_id` | ✅ | `fru` | – |
| `phase_id` | ✅ | `p2` | – |
| `id` | ✅ | `ast-shiki` | 処理法 ID、 phase 内で一意。 URL safe |
| `name` | ✅ | `アスト式` | 表示名 |
| `description` | – | `北優先 ...` | 1 行説明 |

**テンプレ行**:
```
fru    p4    juuji-shiki    十字式    対面散開、 8 方向定位置
```

### 6. `tips`

| 列 | 必須 | 値の例 | 説明 |
|---|---|---|---|
| `content_id` | ✅ | `fru` | – |
| `phase_id` | ✅ | `p1` | – |
| `tip` | ✅ | `開幕は ◯◯ に注意` | 1 行コメント。 **1 行 = 1 tip** (改行で複数 tip にはならない) |

**複数 tip を追加** = **行を増やす** (改行ではない)。

### 7. `macros`

| 列 | 必須 | 値の例 | 説明 |
|---|---|---|---|
| `content_id` | ✅ | `fru` | – |
| `phase_id` | – | `p1` | **どの phase 用か**。 空なら 全体 / 編成共通マクロ扱い。 全体 channel ではこの値で phase 別グルーピングされる |
| `source` | ✅ | `りりーどーる (FRU 全 phase)` | マクロ名 / 作者 |
| `url` | ✅ | `https://na.finalfantasyxiv.com/...` | 原文リンク |
| `text` | – | `# 抜粋のみ ...` | マクロ本文。 **著作権配慮** で短い抜粋のみ推奨。 multi-line OK |

**著作権**:
- マクロ本文は **作者の著作物**
- `text` は **数行の抜粋のみ** で、 全文転載は避ける
- 完全版は `url` で原典に誘導するスタンス

### 8. `templates`

| 列 | 必須 | 値の例 | 説明 |
|---|---|---|---|
| `content_id` | ✅ | `fru` | – |
| `template` | ✅ | `【FRU 募集】 {date} {time}~ 進行 {progress}` | テンプレ本文。 `{varname}` で変数挿入 |
| `variables` | – | `date, time, progress` | 変数名のカンマ区切りリスト |

**bot `/recruit` で使用される**。 変数は `/recruit` 実行時にユーザーが指定。

---

## 🎯 よくある編集シナリオ

### ケース A: 新しい tip を追加 (一番頻繁)

1. `tips` タブを開く
2. 最下行に新規行追加
3. `content_id` (例: `fru`) と `phase_id` (例: `p3`) を入力
4. `tip` 列に内容を書く (1 行 = 1 tip)
5. 保存 (Sheets は自動保存)

→ 次回 `pnpm pull` で `data/contents/fru.yaml` の `phases[].tips` に追加される。

### ケース B: 動画 URL を追加

1. `videos` タブ
2. 新規行 + content_id + phase_id + title + url + (任意) author

### ケース C: マクロを差し替え

1. `macros` タブで該当行を見つける (Ctrl+F で source 名検索)
2. `url` と `text` を更新
3. `source` も変更すれば 「最終更新者」 反映できる

### ケース D: 新コンテンツ追加 (例: 新零式 M13S 発表時)

**順番が重要**:

1. **`contents`** タブで 1 行追加
   ```
   m13s    至天の座アルカディア：●●級零式 1層 (...)    M13S    savage    8.05    （参照元名）
   ```
2. **`phases`** タブで 1 行以上追加
   ```
   m13s    p1    P1 (...)    0    開幕フェーズの説明
   m13s    p2    P2 (...)    1    （あれば）
   ```
3. **`tips`** タブで初期 tip を入れる (推奨)
4. **`contents` タブ** で `overview_guide_url` (リリーどーる等) + `overview_bis_url` (Etro 等) を埋める
5. `pnpm pull` で YAML 生成
6. git commit + PR

→ **bot は自動で `/setup type:零式 content:m13s` で認識** (再起動不要、 ただし bot 側 YAML を再 deploy が必要)。

### ケース E: コンテンツを削除

1. `contents` タブから該当行を削除
2. 関連 9 タブの該当行を全部削除 (推奨。 残っても無害だが clutter)
3. `pnpm pull` でも **YAML は自動削除されない** (現状の pull は upsert のみ)
4. `data/contents/<id>.yaml` を手動 `git rm`

### ケース F: 進行方 (strategies) の追加

例: `fru P4` に 「reach式」 を追加:

1. `strategies` タブで行追加
   ```
   fru    p4    reach-shiki    Reach式    遠隔リーチ視点での散開
   ```
2. 既存の `ast-shiki` 等の隣に並ぶ

→ `/share phase:p4` で 「処理法」 セクションに表示される。

---

## ⚠️ Dos と Don'ts

### ✅ Dos
- **`content_id` は引用なし、 小文字英数のみ**
- **複数行は `Cmd+Enter` (Mac) / `Alt+Enter` (Win)** でセル内改行
- **URL は必ず `https://` から**
- **空セルは空のまま** (`null` や `none` 等は書かない)
- **新規追加は最下行** (中間に挿入しない、 sort で並び順は自動)
- 編集前に **同期** (`pnpm pull -- --dry-run` で他人の編集が無いか確認)
- **大きい変更は dev 通知** (Slack/Discord で 「sheet これから触る」 と一言)

### ❌ Don'ts
- ❌ **同じ id で複数行** (contents タブで `fru` を 2 つ作る等)
- ❌ **`content_id` typo** (`fru` を `frue` 等) → 孤児行になる
- ❌ **header 行を編集** (1 行目は固定、 触らない)
- ❌ **タブ名を変更** (`contents` を `Contents` に等)
- ❌ **数値列に文字列** (`order` 列に `first` 等)
- ❌ **`type` に enum 外の値** (`raid` 等は無効、 `savage` を使う)
- ❌ **マクロ全文転載** (著作権 — `text` は抜粋のみ)

---

## 🔍 検証 (sheet 上では分からない fail を事前 catch)

devs は **編集後すぐ** に `dry-run` でチェックを推奨:

```bash
pnpm --filter @ff14kotei/content-sync pull -- --dry-run
```

すると:
- ✅ 全 31 contents が `unchanged` → 編集ない (or 整合 OK)
- 🆕 `would-create` → 新コンテンツ準備中
- 📝 `would-update` → 編集差分あり (期待通りなら commit へ)
- ❌ `Assembly errors` → Zod validation fail (型不一致、 enum 外値、 等)

エラーメッセージ例:
```
❌ m13s: Zod validation failed: type: Invalid enum value. Expected 'ultimate' | 'savage' | ...
   → contents タブの type 列が `raid` 等になっている
```

---

## 🔄 編集 → YAML 反映 ワークフロー

```bash
# 1. Sheet で編集 (devs)
#    https://docs.google.com/spreadsheets/d/<ID>/edit

# 2. dry-run で差分確認
pnpm --filter @ff14kotei/content-sync pull -- --dry-run

# 3. OK なら本実行
pnpm --filter @ff14kotei/content-sync pull

# 4. git diff で確認
git diff data/contents/

# 5. commit + PR
git checkout -b data/sheet-sync-<date>
git add data/contents/
git commit -m "data: sync from sheet (<日付>)"
git push -u origin data/sheet-sync-<date>
gh pr create
```

CI で typecheck + schema validation が再度走るので 安心。

---

## 🆘 困ったら

| 症状 | 対処 |
|---|---|
| Sheet 開けない | 共有設定確認 (「リンクを知っている全員」 = 閲覧者) |
| `pull` でエラー: `Sheet returned HTML` | 共有設定 OR タブ名 typo |
| `Zod validation failed: type` | `type` 列が enum 外 (`raid`, `savage_lv2` 等) |
| `Zod validation failed: url` | `url` 列が `https://` で始まっていない |
| `Zod validation failed: phases.0.order` | `order` 列が空 or 非数値 |
| 編集したのに YAML に出ない | `pull` 実行忘れ、 or content_id typo で孤児行 |
| 自分の編集が消えた | 他人が pull → push back していない時間に編集 (Phase 2 で対策予定) |

---

## 🎓 Tips

- **編集前に history 確認** (Sheets メニュー: ファイル → 変更履歴) — 誰が何を変えたか可視化
- **Filter/Sort 機能を使う** — `tips` タブで 「content_id=fru」 だけ表示等
- **Conditional formatting** で空セル可視化 — 必須列が空なら赤くする等 (Sheets 機能)
- **複数 dev 編集時は seat を取る**: Sheets 上のセル選択でリアルタイム可視化される
- **大量編集は CSV import で** — 既存 YAML を local で編集 → `export-csv` → Sheet に再 import (差分マージ)
