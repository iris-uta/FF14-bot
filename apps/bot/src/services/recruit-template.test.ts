import { describe, it, expect } from "vitest";
import { renderTemplate, extractPlaceholders, findTemplate } from "./recruit-template";
import type { Content } from "@ff14kotei/schema";

describe("renderTemplate", () => {
  it("substitutes single variable", () => {
    const result = renderTemplate(
      { template: "日程: {{date}}", variables: ["date"] },
      { date: "2025-06-01" }
    );
    expect(result.text).toBe("日程: 2025-06-01");
    expect(result.unfilledVariables).toEqual([]);
  });

  it("substitutes multiple variables", () => {
    const result = renderTemplate(
      { template: "{{name}} - {{progress}} - {{date}}", variables: [] },
      { name: "週末固定", progress: "P3", date: "2025-06-01" }
    );
    expect(result.text).toBe("週末固定 - P3 - 2025-06-01");
  });

  it("leaves unfilled placeholders and reports them", () => {
    const result = renderTemplate(
      { template: "日程: {{date}} / 進行度: {{progress}}", variables: ["date", "progress"] },
      { date: "2025-06-01" }
    );
    expect(result.text).toBe("日程: 2025-06-01 / 進行度: {{progress}}");
    expect(result.unfilledVariables).toEqual(["progress"]);
  });

  it("treats empty string as unfilled", () => {
    const result = renderTemplate(
      { template: "{{x}}", variables: ["x"] },
      { x: "" }
    );
    expect(result.unfilledVariables).toEqual(["x"]);
  });

  it("dedupes unfilled variables across multiple references", () => {
    const result = renderTemplate(
      { template: "{{x}} ... {{x}}", variables: ["x"] },
      {}
    );
    expect(result.unfilledVariables).toEqual(["x"]);
  });

  it("supports whitespace inside braces", () => {
    const result = renderTemplate(
      { template: "{{ name }}", variables: ["name"] },
      { name: "Alice" }
    );
    expect(result.text).toBe("Alice");
  });

  it("ignores non-variable patterns like {{1invalid}}", () => {
    const result = renderTemplate(
      { template: "{{1invalid}} {{ok}}", variables: ["ok"] },
      { ok: "yes" }
    );
    expect(result.text).toBe("{{1invalid}} yes");
  });
});

describe("extractPlaceholders", () => {
  it("returns all unique placeholder names in order", () => {
    expect(extractPlaceholders("A {{x}} B {{y}} {{x}}")).toEqual(["x", "y"]);
  });

  it("returns empty array for no placeholders", () => {
    expect(extractPlaceholders("plain text")).toEqual([]);
  });
});

describe("findTemplate", () => {
  const content: Content = {
    id: "test",
    displayName: "T",
    shortName: "T",
    type: "ultimate",
    phases: [{ id: "p1", name: "P1", order: 1, videos: [], strategies: [], tips: [] }],
    macros: [],
    recruitmentTemplates: [
      { template: "first", variables: [] },
      { template: "second", variables: [] },
    ],
    references: { urls: [] },
  };

  it("returns first template by default", () => {
    expect(findTemplate(content)?.template).toBe("first");
  });

  it("returns indexed template", () => {
    expect(findTemplate(content, 1)?.template).toBe("second");
  });

  it("returns null for out-of-range index", () => {
    expect(findTemplate(content, 5)).toBeNull();
  });
});
