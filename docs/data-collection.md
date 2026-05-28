# コンテンツデータ収集ワークフロー

## 目的
FF14コンテンツのドメイン知識（処理法、マクロ、軽減、動画）を `data/contents/*.yaml` に蓄積する。

**この作業はコード開発と完全に並列で進められる**（スキーマが固まった後）。

## 編集者向け手順

### 1. リポジトリを clone
```bash
git clone https://github.com/mitchkunn/FF14-bot.git
cd FF14-bot
pnpm install
```

### 2. ブランチを切る
```bash
git switch -c data/<content-id>-<section>
# 例: git switch -c data/fru-p1-mechanics
```

### 3. YAML を編集
- `data/contents/<id>.yaml` を開く（なければ `_template.yaml` をコピー）
- スキーマ参照: [../packages/schema/src/content.ts](../packages/schema/src/content.ts)

### 4. validate
```bash
pnpm --filter @ff14kotei/schema validate-data
```

通れば OK。エラーが出たらメッセージに従って修正。

### 5. PR を出す
タイトル: `data(<content-id>): <変更内容>`
例: `data(fru): add P1 mechanics and standard strategy`

## レビューの観点
- スキーマ通り（validateが通る）
- 出典が明示されている（URL or 名前）
- 既存データを壊していない（追加 or 訂正のみ）

## よくある質問

### Q. 同じコンテンツの別Phaseを別agentが同時に編集できる？
A. **基本NG**（同じYAMLファイルでconflictするため）。
   ファイル単位で claim する。タスクボード（GitHub Issues or plan.md）で調整。

### Q. 新フィールドが欲しい
A. schema変更が必要。data PRに含めず、まず `schema/` track にIssue/PR出す → mergeされたら data 追従。
   詳細: [AGENTS.md](../AGENTS.md) の「契約変更プロトコル」

### Q. 出典が複数ある場合
A. `references.urls[]` に全部書く。マクロは `macros[]` に複数登録可能。

### Q. 処理法バリアントの粒度
A. **明確に呼び分けられる名前があるもの**だけバリアント化（例: アスト式 / 十字式）。
   流派が混在しているだけの細部はTips扱い。
