import { describe, it, expect } from "vitest";
import { PermissionFlagsBits } from "discord.js";
import { data } from "./vote";

describe("/vote command — shape", () => {
  it("has correct name", () => {
    expect(data.name).toBe("vote");
  });

  it("requires only Send Messages (everyone can vote)", () => {
    const json = data.toJSON();
    expect(json.default_member_permissions).toBe(String(PermissionFlagsBits.SendMessages));
  });

  it("has 'new', 'close', 'info', 'book' subcommands", () => {
    const json = data.toJSON();
    const names = json.options?.map((o: { name: string }) => o.name);
    expect(names).toEqual(expect.arrayContaining(["new", "close", "info", "book"]));
  });

  it("'new' has optional remind_hours_before integer (1-168h)", () => {
    const json = data.toJSON();
    const newSub = json.options?.find((o: { name: string }) => o.name === "new") as
      | { options?: { name: string; required?: boolean; min_value?: number; max_value?: number }[] }
      | undefined;
    const remind = newSub?.options?.find((o) => o.name === "remind_hours_before");
    expect(remind).toMatchObject({ required: false, min_value: 1, max_value: 168 });
  });

  it("'book' requires id with autocomplete, optional rank + notify_minutes_before", () => {
    const json = data.toJSON();
    const sub = json.options?.find((o: { name: string }) => o.name === "book") as
      | { options?: { name: string; required?: boolean; autocomplete?: boolean }[] }
      | undefined;
    const id = sub?.options?.find((o) => o.name === "id");
    const rank = sub?.options?.find((o) => o.name === "rank");
    const notify = sub?.options?.find((o) => o.name === "notify_minutes_before");
    expect(id).toMatchObject({ required: true, autocomplete: true });
    expect(rank?.required).toBeFalsy();
    expect(notify?.required).toBeFalsy();
  });

  it("'new' requires title only — candidates come from a modal", () => {
    const json = data.toJSON();
    const newSub = json.options?.find((o: { name: string }) => o.name === "new") as
      | { options?: { name: string; required?: boolean }[] }
      | undefined;
    const titleOpt = newSub?.options?.find((o) => o.name === "title");
    expect(titleOpt?.required).toBe(true);
    // candidate1-5 should no longer exist (replaced by modal input)
    expect(newSub?.options?.find((o) => o.name === "candidate1")).toBeUndefined();
    expect(newSub?.options?.find((o) => o.name === "candidate5")).toBeUndefined();
    // closes_at / mention / remind_hours_before remain optional slash options
    expect(newSub?.options?.find((o) => o.name === "closes_at")?.required).toBeFalsy();
  });

  it("'close' requires id with autocomplete", () => {
    const json = data.toJSON();
    const sub = json.options?.find((o: { name: string }) => o.name === "close") as
      | { options?: { name: string; required?: boolean; autocomplete?: boolean }[] }
      | undefined;
    const idOpt = sub?.options?.find((o) => o.name === "id");
    expect(idOpt).toMatchObject({ required: true, autocomplete: true });
  });

  it("'info' requires id with autocomplete", () => {
    const json = data.toJSON();
    const sub = json.options?.find((o: { name: string }) => o.name === "info") as
      | { options?: { name: string; required?: boolean; autocomplete?: boolean }[] }
      | undefined;
    const idOpt = sub?.options?.find((o) => o.name === "id");
    expect(idOpt).toMatchObject({ required: true, autocomplete: true });
  });

  it("has ja localizations on the command name", () => {
    const json = data.toJSON();
    expect(json.name_localizations?.ja).toBe("投票");
  });
});
