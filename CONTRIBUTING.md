# Contributing to FF14 固定支援 Bot

PR / issue 大歓迎。 並列で複数 contributor が作業することを想定しています。 ルール詳細は [AGENTS.md](AGENTS.md) 参照。

---

## 🎯 何で貢献できるか

### 🟢 すぐ着手できる (独立性高い、 contributor 向き)

| 種類 | 場所 | 例 |
|---|---|---|
| コンテンツデータ追加 | `data/contents/*.yaml` | 新規零式の tips / macro を追加 |
| 既存 YAML 修正 | 同上 | 誤字、 URL 切れ、 新攻略 |
| 募集テンプレ追加 | 各 yaml の `recruitmentTemplates` | コンテンツごとに 1〜3 件 |
| Web デザイン改善 | `apps/web/src/app/**/*.tsx` | 色 / 余白 / dark mode |
| ドキュメント整備 | `docs/`, ルート `*.md` | scrennshot, 例文 |
| 翻訳 | (将来) | EN/FR/DE/CN |

### 🟡 調整必要 (前もって issue 起票推奨)

- Bot command 追加 / 大幅変更
- DB schema 変更 → linear migration
- Web app に新 route 追加

### 🔴 maintainer のみ

- migration (linear ordering 必須)
- deploy infra
- 法的文書の根本変更

---

## 🚀 セットアップ

```bash
# Prerequisites: Node 22+, pnpm 11+
git clone https://github.com/mitchkunn/FF14-bot.git
cd FF14-bot
pnpm install

# Bot を動かす (要 Discord bot token)
cp apps/bot/.env.example apps/bot/.env
# .env に DISCORD_TOKEN を設定
pnpm --filter @ff14kotei/bot dev

# Web app を動かす (env 不要)
pnpm --filter @ff14kotei/web dev
```

---

## 🌳 ブランチ・コミット規約

### ブランチ命名

```
<track>/<short-description>
```

- `bot/availability-command`
- `web/dark-mode-toggle`
- `data/m9s-tips`
- `docs/architecture-diagram`
- `chore/dependency-update`
- `fix/vote-double-submit`
- `infra/sentry-integration`

### コミットメッセージ

[Conventional Commits](https://www.conventionalcommits.org/) を使う:

```
feat(bot): /availability コマンド追加
fix(web): /recruit-tool でコピーボタンが動かない
docs: deploy.md に Sentry セクション追加
data(m9s): P3 の処理法を追加
chore(deps): drizzle-orm を 0.36.5 にアップデート
```

スコープには track 名を入れてください: `bot` / `web` / `schema` / `db` / `data` / `docs` / `infra` / `chore`

---

## 🧪 テスト

すべての変更について typecheck と test を通してから PR してください:

```bash
# 全部一度に
pnpm -r typecheck
pnpm --filter @ff14kotei/bot test
pnpm --filter @ff14kotei/db test
pnpm --filter @ff14kotei/web build
```

新規 logic を追加する場合は **テスト も書いてください**。 既存 pattern を参考に:
- bot service: `apps/bot/src/services/*.test.ts`
- bot command shape: `apps/bot/src/commands/*.test.ts`
- DB layer: `packages/db/src/*.test.ts`

---

## 🔀 PR ガイドライン

### サイズ

**1 PR = 1 機能 = 100〜500 行** が目安。 巨大 PR は review コスト高 + revert 困難。

### タイトル / 説明

タイトルは Conventional Commits 形式 (上記参照)。

説明 (body) にはこれらを含めてください:
1. **Summary**: 何を変えたか / なぜか
2. **Test plan**: どう動作確認したか (manual + 自動)
3. **(必要なら) Screenshot**: UI 変更がある場合

### Schema 変更

`packages/schema/` または `packages/db/src/schema.ts` を変更する場合、 **全 track に影響** するので:
1. 事前に issue で議論
2. 1 つの PR にまとめて bot/web/data の更新も含める
3. drizzle migration は linear order (`pnpm --filter @ff14kotei/db generate`)

---

## 🤝 並列作業 (複数 contributor が同時に作業する場合)

詳細は [AGENTS.md](AGENTS.md)。 概要:
- 1 contributor = 1 track が基本
- 同じファイルを触らない (= file 単位での分担)
- schema 変更は事前共有
- main に直 push 禁止、 PR 経由

git worktrees で複数ブランチを並列管理する例も AGENTS.md にあります。

---

## 📜 行動規範

- 建設的に。 攻撃的でない。
- FF14 コミュニティの **攻略マクロ作者・進行方解説者を尊重**。 リンクの追加は credit を必ず記載。
- Square Enix の知的財産を尊重 (詳細は [LICENSE](LICENSE) 参照)。

---

## 質問があるとき

GitHub Discussions または issue を起票してください。
