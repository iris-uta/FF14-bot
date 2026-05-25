# data/

FF14コンテンツのドメインデータ（人間が編集）。

## ディレクトリ
- `contents/` — コンテンツ別データ。1コンテンツ = 1 YAMLファイル

## 編集ルール
- 1ファイル1コンテンツ
- ファイル名 = コンテンツID（例: `fru.yaml`, `top.yaml`）
- `_` 始まりはテンプレ・例（loaderから無視される）
- スキーマ: [packages/schema/src/content.ts](../packages/schema/src/content.ts)
- 編集後は validate を実行: `pnpm --filter @ff14kotei/schema validate-data`

## 並列編集
ファイル単位で衝突しないので、コンテンツ別に複数人/agentが同時編集して問題ない。
schemaに新フィールド追加が必要な場合は別trackで対応してから data を書く（[AGENTS.md](../AGENTS.md) 参照）。

## 編集ガイド
詳細: [../docs/data-collection.md](../docs/data-collection.md)
