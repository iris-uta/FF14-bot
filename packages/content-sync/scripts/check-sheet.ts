import { fetchSheetTabAsCsv } from "../src/sheet-fetcher.js";
import { parseCsvWithHeader } from "../src/csv.js";

const id = "1vEVMAWs7VfPzs5sj9YpyzFlfEbbqu_WANjnqxS5-lwU";

async function main() {
  for (const tab of ["contents", "phases", "macros"]) {
    const csv = await fetchSheetTabAsCsv(id, tab);
    const rows = parseCsvWithHeader(csv);
    console.log(`\n=== ${tab} (${rows.length} rows) ===`);
    if (tab === "contents") {
      console.log("ids:", rows.map(r => r.id).filter(Boolean));
    } else if (tab === "phases") {
      const byContent: Record<string, string[]> = {};
      for (const r of rows) {
        if (!r.content_id) continue;
        (byContent[r.content_id] ??= []).push(r.phase_id);
      }
      console.log(byContent);
    } else if (tab === "macros") {
      for (const r of rows) console.log(`  ${r.content_id}/${r.phase_id || "?"}: ${(r.url || "").slice(0, 80)}`);
    }
  }
}
main();
