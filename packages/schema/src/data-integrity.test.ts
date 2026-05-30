import { describe, it, expect } from "vitest";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadAllContents } from "./loader";

// data/contents/*.yaml をリポジトリ位置から解決（process.cwd() 非依存）。
// この test ファイルは packages/schema/src にあるので 3 階層上がリポジトリroot。
const CONTENTS_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../data/contents"
);

/**
 * invariant: 「loadAllContents で読み込まれる全 content の全 macro は非空の phases[] を持つ」
 *
 * MacroRefSchema.phases は .optional()（content.ts）なので schema 単体では強制されない。
 * phases[] が欠落 / 空のとき getMacrosForPhase (apps/bot/src/services/phase-content.ts) は
 * source 文字列中の `\bP<n>\b` トークン推定にフォールバックするが、これは
 *   - 層/版命名（"4層前半"・"Ver.2.1"）
 *   - "全Phase"・"全フェーズ共通"
 *   - "P1-P3 共通"（word boundary により P2 が漏れる）
 * を取りこぼし、該当 macro が /macro・/setup の phase channel・/share embed から
 * 無言で消える（error も 0 件 match の log も出ない）。
 *
 * 現状すべての macro は phases[] で backfill 済みなのでこの test は即 green になる。
 * 目的は backfill 済み状態を invariant として固定し、phases[] 無し / 空の macro が
 * 将来追加されたら CI で落とすこと。regex フォールバックは後方互換のため
 * phase-content.ts にそのまま残す（このテストはそれが発火する状況を未然に防ぐ番人）。
 */
describe("loaded contents: macro phases invariant", () => {
  const contents = loadAllContents(CONTENTS_DIR);

  it("loads at least one content (path sanity — guards against a vacuous pass)", () => {
    expect(contents.length).toBeGreaterThan(0);
  });

  it("every macro in every loaded content has a non-empty phases[]", () => {
    const offenders: string[] = [];
    for (const content of contents) {
      content.macros.forEach((m, i) => {
        if (!m.phases || m.phases.length === 0) {
          offenders.push(`${content.id}.macros[${i}] (source: ${m.source})`);
        }
      });
    }
    expect(
      offenders,
      "次の macro は phases[] が無く / 空のため /macro・/setup・/share から無言で脱落します。" +
        "対応する phase id 配列を data/contents の各 macro に追加してください:\n  " +
        offenders.join("\n  ")
    ).toEqual([]);
  });
});
