import { describe, it, expect, vi } from "vitest";
import { buildGvizUrl, fetchSheetTabAsCsv, SheetFetchError } from "./sheet-fetcher";

describe("buildGvizUrl", () => {
  it("constructs the canonical gviz CSV URL", () => {
    expect(buildGvizUrl("abc123", "phases")).toBe(
      "https://docs.google.com/spreadsheets/d/abc123/gviz/tq?tqx=out:csv&sheet=phases"
    );
  });

  it("URL-encodes the tab name", () => {
    expect(buildGvizUrl("abc", "tab with space")).toContain("sheet=tab%20with%20space");
  });

  it("URL-encodes the sheet ID", () => {
    expect(buildGvizUrl("a/b", "x")).toContain("/d/a%2Fb/");
  });
});

describe("fetchSheetTabAsCsv", () => {
  function mockFetch(opts: {
    status?: number;
    contentType?: string;
    body?: string;
    throwError?: Error;
  }): typeof fetch {
    return vi.fn(async () => {
      if (opts.throwError) throw opts.throwError;
      return {
        ok: (opts.status ?? 200) < 400,
        status: opts.status ?? 200,
        headers: {
          get: (k: string) => k.toLowerCase() === "content-type" ? (opts.contentType ?? "text/csv") : null,
        },
        text: async () => opts.body ?? "",
      } as unknown as Response;
    }) as unknown as typeof fetch;
  }

  it("returns CSV body on successful fetch", async () => {
    const body = "id,name\nfru,FRU";
    const csv = await fetchSheetTabAsCsv("abc", "contents", mockFetch({ body }));
    expect(csv).toBe(body);
  });

  it("throws SheetFetchError on non-OK status", async () => {
    await expect(
      fetchSheetTabAsCsv("abc", "contents", mockFetch({ status: 404 }))
    ).rejects.toThrow(SheetFetchError);
  });

  it("throws SheetFetchError when response is HTML (= sharing misconfigured)", async () => {
    await expect(
      fetchSheetTabAsCsv("abc", "contents", mockFetch({
        contentType: "text/html",
        body: "<html>login page</html>",
      }))
    ).rejects.toThrow(/sharing is probably not/);
  });

  it("throws SheetFetchError on network error", async () => {
    await expect(
      fetchSheetTabAsCsv("abc", "contents", mockFetch({ throwError: new Error("ECONNREFUSED") }))
    ).rejects.toThrow(/network error/);
  });
});
