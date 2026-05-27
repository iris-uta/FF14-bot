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

  it("'new' requires title + candidate1 + candidate2 (min 2 candidates)", () => {
    const json = data.toJSON();
    const newSub = json.options?.find((o: { name: string }) => o.name === "new") as
      | { options?: { name: string; required?: boolean }[] }
      | undefined;
    const titleOpt = newSub?.options?.find((o) => o.name === "title");
    const c1 = newSub?.options?.find((o) => o.name === "candidate1");
    const c2 = newSub?.options?.find((o) => o.name === "candidate2");
    const c3 = newSub?.options?.find((o) => o.name === "candidate3");
    expect(titleOpt?.required).toBe(true);
    expect(c1?.required).toBe(true);
    expect(c2?.required).toBe(true);
    expect(c3?.required).toBeFalsy();
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
