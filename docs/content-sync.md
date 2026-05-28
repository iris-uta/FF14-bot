# Content Sync — Google Sheets を使ったコンテンツ編集

`data/contents/*.yaml` の編集を **Google Sheets** で行えるようにする仕組み。

**フロー**:
```
[Google Sheet]  ← devs が編集 (collab、 mobile、 履歴付き)
      ↓
   pnpm pull
      ↓
[YAML files]    ← bot がここから読む (今までどおり)
      ↓
   git commit
```

---

## 🚀 セットアップ (一度だけ)

### 1. Google Sheet を準備

[このテンプレート](https://docs.google.com/spreadsheets/) (← 後で正式 URL を貼る) をコピーしてください。 もしくは以下の 9 タブを持つ新規 sheet を作成:

| Tab | Columns |
|---|---|
| `contents` | `id`, `displayName`, `shortName`, `type`, `patch`, `references_primary` |
| `phases` | `content_id`, `phase_id`, `name`, `order`, `description` |
| `videos` | `content_id`, `phase_id`, `title`, `url`, `author` |
| `mitigations` | `content_id`, `phase_id`, `name`, `url`, `copyable` |
| `strategies` | `content_id`, `phase_id`, `id`, `name`, `description` |
| `tips` | `content_id`, `phase_id`, `tip` |
| `macros` | `content_id`, `source`, `url`, `text` |
| `templates` | `content_id`, `template`, `variables` (カンマ区切り) |
| `references` | `content_id`, `url` |

最初の行 = ヘッダ。 以降がデータ。

### 2. 共有設定

- Sheet 右上 「共有」
- 「リンクを知っている全員」 → **閲覧者** (Viewer)
- 編集権は実際の devs (mitchkunn / aoi410t など) に **個別招待** で付与

→ **誰も「編集ボタン」を見つけられないが、 URL を知っている人なら CSV export はできる** 状態。 これが安全。

### 3. 環境変数

`apps/bot/.env` (or 各 dev の shell profile) に:

```bash
CONTENT_SHEET_ID=<sheet ID from URL>
```

URL `https://docs.google.com/spreadsheets/d/<THIS_PART>/edit` の `<THIS_PART>` がそれ。

### 4. 初期データ投入 (1 回だけ)

現在の YAML を Sheet に流し込む (Phase 2、 別 PR で実装予定):

```bash
pnpm --filter @ff14kotei/content-sync push --initial
```

(現状は手動でコピペ。 30 contents × 数列 × 数行 = 数百行を入力する必要あり)

---

## 🔄 日常の編集フロー

### A. Sheet で編集 (devs)

- Google Sheet を開く
- 該当タブ (tips / videos / 等) で行を編集 / 追加 / 削除
- リアルタイム collab 可能
- 履歴は Sheet 側で自動保持 ("ファイル → 変更履歴")

### B. YAML への反映 (誰か一人がやる)

```bash
git checkout -b data/sync-<date>
pnpm --filter @ff14kotei/content-sync pull
git diff data/contents/    # 確認
git add data/contents/
git commit -m "data: sync from sheet"
git push
gh pr create
```

CI / typecheck で schema validation が走るので、 sheet 側で不正な値を入れていても気付ける。

### C. dry-run (差分確認のみ)

```bash
pnpm --filter @ff14kotei/content-sync pull -- --dry-run
```

ファイル書かずに 「何が変わるか」 だけ表示。

---

## 📋 Sheet 編集の tips

### 複数行テキスト (macro.text 等)

セル内で改行する場合は **Cmd+Enter** (Mac) / **Alt+Enter** (Win)。
CSV export 時に quote されて保持される (parser は double-quote escape を理解する)。

### copyable (boolean)

`true`, `1`, `yes` のいずれかなら true、 それ以外は false。

### 空セル

空セルは 「未指定」 として扱われる:
- 文字列 → `""` (空文字)
- 配列 → 空配列
- optional field → undefined (= YAML から省略)

### コンテンツの新規追加

1. `contents` タブに行を追加 (id 必須)
2. `phases` タブに phase を 1 つ以上追加 (content_id を一致させる)
3. 他タブの該当行を追加
4. `pnpm pull` で YAML 生成

### コンテンツの削除

1. `contents` タブから行を削除
2. 関連する他タブの行も削除 (推奨。 残ってても無害だが clutter)
3. `pnpm pull` で sync — **既存 YAML は削除されない** (現在の pull は upsert のみ)
   → 削除したい場合は `data/contents/<id>.yaml` を手動 git rm

---

## 🐛 トラブルシュート

### `Sheet returned HTML for tab "..."` エラー

→ Sheet の共有設定が 「リンクを知っている全員」 になっていない可能性。 もしくはタブ名 typo。

### `Zod validation failed: ...` エラー

→ Sheet のセル値が schema を満たしていない。 例:
- `type` が `ultimate` / `savage` / `extreme` / 等以外
- `order` が数値でない
- `url` が `https://` で始まっていない

エラーメッセージの path (e.g. `phases.0.videos.1.url`) で場所が分かる。 そのコンテンツだけスキップして他は処理される。

### YAML diff が大きすぎる

→ Sheet 側のフォーマット (空白 / 改行) と既存 YAML がズレている可能性。 一度 `git diff data/contents/` で確認し、 期待した変更のみなら commit OK。

### ローカルで `pnpm pull` が走らない

```bash
echo $CONTENT_SHEET_ID   # 環境変数セットされているか
pnpm --filter @ff14kotei/content-sync install
```

---

## 🔒 セキュリティ

- Sheet ID は半秘匿 (URL 知らないと読めない、 検索エンジンに index されない)
- 編集者は招待制 (誰でも編集はできない)
- Pull は read-only でなにも破壊しない
- YAML 化された段階で git review が入る (人間レビュー)

---

## 📦 Push back (Sheet ← YAML、 Phase 2 で実装予定)

現状は **pull only** (Sheet → YAML)。 逆方向 (例: 「YAML を直接編集して Sheet に反映」) は未実装。

push が必要になるケース:
- 初期 seed (現在の 30 YAML を Sheet に流す)
- YAML 側で直接編集が入ったとき (PR で誰かが Sheet をバイパスして edit した場合)

実装計画 (別 PR):
- service account 経由で Sheets API 認証
- `pnpm push` で全 YAML → Sheet (差分のみ更新)
- `secrets/google-sa.json` (gitignored) に credential 配置

---

## 🤔 なぜ Google Sheets?

| 候補 | Pros | Cons |
|---|---|---|
| **Google Sheets** ✅ | familiar UI, mobile OK, collab, free | 1-way sync 必要 |
| YAML 直編集 | 直接、 git friendly | 改行・indent でミス、 非エンジニアにキツい |
| カスタム Web UI | 完全制御 | 開発 cost 高、 メンテ大 |
| GitHub 編集 | git native | Sheets ほど直感的じゃない |
| Notion DB | 良い UI | API レート制限、 高頻度 sync 苦手 |
