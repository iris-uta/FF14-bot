# @ff14kotei/schema

**全トラックの契約となる型・スキーマ定義**

このパッケージは bot, web, data の依存元。変更は他トラックに波及するため [AGENTS.md](../../AGENTS.md) の「契約変更プロトコル」に従うこと。

## エクスポート

- `Content` / `ContentSchema` — コンテンツ（絶エデン等）の定義
- `Phase` / `PhaseSchema` — Phase（P1, P2 等）
- `StrategyVariant` — 処理法バリアント（アスト式 / 十字式 等）
- `StaticParty` / `StaticPartySchema` — 固定パーティ
- `Member`, `Schedule`, `Progress` — 固定の構成要素
- `loadContentFromFile`, `loadAllContents` — YAML → 型へのloader
- `ContentValidationError` — validation失敗時の例外

## 使い方

### Bot/Web から
```ts
import { loadAllContents, type Content } from "@ff14kotei/schema";

const contents = loadAllContents("./data/contents");
```

### Data 担当: YAML検証
```bash
pnpm --filter @ff14kotei/schema validate-data
```
