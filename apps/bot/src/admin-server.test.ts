import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { Client } from "discord.js";
import { createDb } from "@ff14kotei/db";
import { startAdminServer, stopAdminServer } from "./admin-server";
import { setDbForTesting, resetDb } from "./lib/db";
import { getLifecycleOverrideMap, setLifecycleOverride } from "./services/content-lifecycle";
import { reloadContents } from "./lib/contents";

const TEST_PORT = 18091;
const PASS = "s3cret-pw";
const BASE = `http://127.0.0.1:${TEST_PORT}`;

// discord.js mock — admin-server only reads isReady() + guilds.cache.size.
function mockClient(guildCount = 2): Client {
  return { isReady: () => true, guilds: { cache: { size: guildCount } } } as unknown as Client;
}

function authHeader(pw = PASS): string {
  return "Basic " + Buffer.from(`admin:${pw}`).toString("base64");
}

let prevPass: string | undefined;

beforeEach(() => {
  prevPass = process.env.ADMIN_PASSWORD;
  process.env.ADMIN_PASSWORD = PASS;
  setDbForTesting(createDb({ path: ":memory:" }));
  reloadContents();
  startAdminServer(mockClient(), TEST_PORT);
});

afterEach(async () => {
  await stopAdminServer();
  resetDb();
  if (prevPass === undefined) delete process.env.ADMIN_PASSWORD;
  else process.env.ADMIN_PASSWORD = prevPass;
});

describe("admin-server auth", () => {
  it("503 when ADMIN_PASSWORD is unset (disabled, never open)", async () => {
    delete process.env.ADMIN_PASSWORD; // handle() reads env per request
    const res = await fetch(`${BASE}/`);
    expect(res.status).toBe(503);
  });

  it("401 without an Authorization header", async () => {
    const res = await fetch(`${BASE}/`);
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toContain("Basic");
  });

  it("401 with the wrong password", async () => {
    const res = await fetch(`${BASE}/`, { headers: { authorization: authHeader("nope") } });
    expect(res.status).toBe(401);
  });

  it("200 + HTML dashboard with the right password", async () => {
    const res = await fetch(`${BASE}/`, { headers: { authorization: authHeader() } });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    const html = await res.text();
    expect(html).toContain("管理ダッシュボード");
    expect(html).toContain("fru"); // a real content id is listed
  });
});

describe("admin-server lifecycle toggle", () => {
  it("302 on a valid status POST and applies the override", async () => {
    const res = await fetch(`${BASE}/admin/contents/fru/status`, {
      method: "POST",
      headers: { authorization: authHeader(), "content-type": "application/x-www-form-urlencoded" },
      body: "status=inactive",
      redirect: "manual",
    });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/");
    expect(getLifecycleOverrideMap().get("fru")).toBe("inactive");
  });

  it("400 on an invalid status value (no override written)", async () => {
    const res = await fetch(`${BASE}/admin/contents/fru/status`, {
      method: "POST",
      headers: { authorization: authHeader(), "content-type": "application/x-www-form-urlencoded" },
      body: "status=draft",
      redirect: "manual",
    });
    expect(res.status).toBe(400);
    expect(getLifecycleOverrideMap().has("fru")).toBe(false);
  });

  it("404 on an unknown content id", async () => {
    const res = await fetch(`${BASE}/admin/contents/not-a-content/status`, {
      method: "POST",
      headers: { authorization: authHeader(), "content-type": "application/x-www-form-urlencoded" },
      body: "status=active",
      redirect: "manual",
    });
    expect(res.status).toBe(404);
  });

  it("302 on reset and clears the override", async () => {
    setLifecycleOverride("fru", "inactive", "admin");
    const res = await fetch(`${BASE}/admin/contents/fru/reset`, {
      method: "POST",
      headers: { authorization: authHeader() },
      redirect: "manual",
    });
    expect(res.status).toBe(302);
    expect(getLifecycleOverrideMap().has("fru")).toBe(false);
  });
});

describe("admin-server routing", () => {
  it("404 for an unknown path", async () => {
    const res = await fetch(`${BASE}/nope`, { headers: { authorization: authHeader() } });
    expect(res.status).toBe(404);
  });

  it("404 for GET on a POST-only route", async () => {
    const res = await fetch(`${BASE}/admin/contents/fru/status`, {
      headers: { authorization: authHeader() },
    });
    expect(res.status).toBe(404);
  });
});
