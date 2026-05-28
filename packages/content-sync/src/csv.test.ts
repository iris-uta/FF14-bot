import { describe, it, expect } from "vitest";
import { parseCsvRows, parseCsvWithHeader } from "./csv";

describe("parseCsvRows", () => {
  it("parses simple CSV", () => {
    expect(parseCsvRows("a,b,c\n1,2,3")).toEqual([["a", "b", "c"], ["1", "2", "3"]]);
  });

  it("handles CRLF", () => {
    expect(parseCsvRows("a,b\r\n1,2\r\n")).toEqual([["a", "b"], ["1", "2"]]);
  });

  it("handles quoted fields with embedded commas", () => {
    expect(parseCsvRows('a,"b,c",d')).toEqual([["a", "b,c", "d"]]);
  });

  it("handles escaped double quotes", () => {
    expect(parseCsvRows('a,"b""c",d')).toEqual([["a", 'b"c', "d"]]);
  });

  it("handles embedded newlines in quoted fields", () => {
    expect(parseCsvRows('a,"line 1\nline 2",c')).toEqual([["a", "line 1\nline 2", "c"]]);
  });

  it("returns [] for empty input", () => {
    expect(parseCsvRows("")).toEqual([]);
  });
});

describe("parseCsvWithHeader", () => {
  it("builds objects keyed by header columns", () => {
    const text = "id,name,patch\nfru,絶もうひとつの未来,7.11\ntop,絶オメガ検証戦,6.31";
    expect(parseCsvWithHeader(text)).toEqual([
      { id: "fru", name: "絶もうひとつの未来", patch: "7.11" },
      { id: "top", name: "絶オメガ検証戦", patch: "6.31" },
    ]);
  });

  it("trims whitespace from cells", () => {
    const text = "id,name\n fru ,  FRU  ";
    expect(parseCsvWithHeader(text)).toEqual([{ id: "fru", name: "FRU" }]);
  });

  it("skips empty rows", () => {
    const text = "id,name\nfru,FRU\n,\ntop,TOP";
    expect(parseCsvWithHeader(text)).toEqual([
      { id: "fru", name: "FRU" },
      { id: "top", name: "TOP" },
    ]);
  });

  it("handles missing cells by using empty string", () => {
    const text = "id,name,patch\nfru,FRU";  // patch column missing
    expect(parseCsvWithHeader(text)).toEqual([
      { id: "fru", name: "FRU", patch: "" },
    ]);
  });

  it("returns [] for empty input", () => {
    expect(parseCsvWithHeader("")).toEqual([]);
  });
});
