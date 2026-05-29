/**
 * Fetch a tab from a Google Sheet as CSV via the gviz endpoint.
 *
 *   https://docs.google.com/spreadsheets/d/<SHEET_ID>/gviz/tq?tqx=out:csv&sheet=<TAB_NAME>
 *
 * Requires the sheet to be shared as "Anyone with the link can view" — no
 * service account / OAuth needed. The sheet need not be publicly listed.
 *
 * For sheets that need write access (push back), see push.ts which uses the
 * Sheets API with service account auth.
 */
const FETCH_TIMEOUT_MS = 10_000;

export class SheetFetchError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "SheetFetchError";
  }
}

export function buildGvizUrl(sheetId: string, tabName: string): string {
  const id = encodeURIComponent(sheetId);
  const name = encodeURIComponent(tabName);
  // `range=A1:ZZ10000` forces gviz to return the FULL range, bypassing any
  // active filter on the sheet. Without this, gviz CSV export only returns
  // currently-visible rows (filtered ones are hidden) — which silently drops
  // data the user didn't intend to exclude from the pull.
  return `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv&sheet=${name}&range=A1:ZZ10000`;
}

/**
 * Fetch one tab as CSV text. Throws SheetFetchError on network / HTTP / HTML errors.
 *
 * gviz returns CSV with Content-Type `text/csv` on success. If the sheet
 * isn't shared or the tab name is wrong, it returns HTML (login page or 404).
 */
export async function fetchSheetTabAsCsv(
  sheetId: string,
  tabName: string,
  fetchFn: typeof fetch = fetch
): Promise<string> {
  const url = buildGvizUrl(sheetId, tabName);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetchFn(url, { signal: controller.signal });
  } catch (err) {
    throw new SheetFetchError(
      `Sheet fetch failed for tab "${tabName}" (network error)`,
      err
    );
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    throw new SheetFetchError(
      `Sheet fetch returned ${res.status} for tab "${tabName}" (URL: ${url})`
    );
  }
  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("text/html")) {
    throw new SheetFetchError(
      `Sheet returned HTML for tab "${tabName}" — sharing is probably not "Anyone with the link" or the tab name is wrong`
    );
  }
  return await res.text();
}
