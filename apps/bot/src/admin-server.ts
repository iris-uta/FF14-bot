/**
 * Admin dashboard — a tiny self-contained HTTP surface served by the bot process.
 *
 * Why it's separate from health-server.ts: this surface is auth-gated and
 * write-capable, while /health must stay a trivial public 200/503 for Fly's
 * checks. Different concerns → different file → different port (ADMIN_PORT, default
 * 8081). No new dependencies beyond Node's `http`.
 *
 * Exposure: the port is NOT meant for the public internet. Reach it with
 *   `fly proxy 8081:8081 -a ff14-kotei-bot`  → open http://localhost:8081
 * Basic-auth (ADMIN_PASSWORD) is defense-in-depth. If ADMIN_PASSWORD is unset the
 * whole surface returns 503 (disabled) — a missing secret can never mean "open".
 *
 * Routes:
 *   GET  /                              → HTML dashboard (metrics + lifecycle table)
 *   POST /admin/contents/:id/status     → form { status } → set lifecycle override → 302 /
 *   POST /admin/contents/:id/reset      → clear override (revert to YAML) → 302 /
 *   *                                   → 404
 */
import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import { timingSafeEqual } from "node:crypto";
import type { Client } from "discord.js";
import { CONTENT_STATUSES, type ContentStatus } from "@ff14kotei/schema";
import { getAllContentsIncludingTesting } from "./lib/contents";
import {
  getLifecycleOverrideMap,
  setLifecycleOverride,
  clearLifecycleOverride,
} from "./services/content-lifecycle";
import { collectMetrics } from "./services/admin-metrics";

let server: Server | null = null;

export function startAdminServer(
  client: Client,
  port: number = Number(process.env.ADMIN_PORT) || 8081
): void {
  if (server) return;
  server = createServer((req, res) => {
    handle(req, res, client).catch((err) => {
      console.error("[admin] request error:", err);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.end("internal error");
      }
    });
  });
  server.listen(port, "0.0.0.0", () => {
    console.log(
      `Admin dashboard on 0.0.0.0:${port} (basic-auth; reach via \`fly proxy ${port}:${port}\`)` +
        (process.env.ADMIN_PASSWORD ? "" : " — DISABLED until ADMIN_PASSWORD is set")
    );
  });
}

export function stopAdminServer(): Promise<void> {
  return new Promise((resolve) => {
    if (!server) return resolve();
    server.close(() => {
      server = null;
      resolve();
    });
  });
}

async function handle(req: IncomingMessage, res: ServerResponse, client: Client): Promise<void> {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) {
    res.statusCode = 503;
    res.end("admin dashboard disabled (set ADMIN_PASSWORD)");
    return;
  }
  if (!checkBasicAuth(req, password)) {
    res.statusCode = 401;
    res.setHeader("WWW-Authenticate", 'Basic realm="ff14-admin", charset="UTF-8"');
    res.end("認証が必要です");
    return;
  }

  const url = new URL(req.url ?? "/", "http://localhost");

  if (req.method === "GET" && url.pathname === "/") {
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(renderDashboard(client));
    return;
  }

  const m = url.pathname.match(/^\/admin\/contents\/([^/]+)\/(status|reset)$/);
  if (req.method === "POST" && m) {
    const id = decodeURIComponent(m[1]);
    const action = m[2];
    if (!contentExists(id)) {
      res.statusCode = 404;
      res.end("unknown content id");
      return;
    }
    if (action === "reset") {
      clearLifecycleOverride(id);
    } else {
      const body = await readBody(req);
      const status = new URLSearchParams(body).get("status");
      if (!status || !(CONTENT_STATUSES as readonly string[]).includes(status)) {
        res.statusCode = 400;
        res.end("invalid status (expected testing|active|inactive)");
        return;
      }
      setLifecycleOverride(id, status as ContentStatus, "admin");
    }
    // Post/Redirect/Get so a refresh doesn't resubmit.
    res.statusCode = 302;
    res.setHeader("Location", "/");
    res.end();
    return;
  }

  res.statusCode = 404;
  res.end();
}

// ── auth ─────────────────────────────────────────────────────────────────────
function checkBasicAuth(req: IncomingMessage, password: string): boolean {
  const header = req.headers["authorization"];
  if (!header || !header.startsWith("Basic ")) return false;
  let decoded: string;
  try {
    decoded = Buffer.from(header.slice(6), "base64").toString("utf8"); // "user:pass"
  } catch {
    return false;
  }
  const sep = decoded.indexOf(":");
  const supplied = sep >= 0 ? decoded.slice(sep + 1) : decoded; // username ignored
  const a = Buffer.from(supplied);
  const b = Buffer.from(password);
  // timingSafeEqual requires equal-length buffers; a length mismatch is a miss.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// ── request body (form-urlencoded, capped) ────────────────────────────────────
function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > 1_000_000) {
        reject(new Error("request body too large"));
        req.destroy();
        return;
      }
      data += chunk.toString("utf8");
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

function contentExists(id: string): boolean {
  return getAllContentsIncludingTesting().some((c) => c.id === id);
}

// ── HTML rendering (no framework, no client JS) ───────────────────────────────
const STATUS_LABEL: Record<ContentStatus, string> = {
  testing: "🧪 testing",
  active: "✅ active",
  inactive: "📦 inactive",
};

function renderDashboard(client: Client): string {
  const guildCount = client.isReady() ? client.guilds.cache.size : 0;
  const metrics = collectMetrics(guildCount);
  const overrides = getLifecycleOverrideMap();
  const contents = [...getAllContentsIncludingTesting()].sort((a, b) => a.id.localeCompare(b.id));

  const rows = contents
    .map((c) => {
      const status = (c.status ?? "active") as ContentStatus;
      const overridden = overrides.has(c.id);
      const staticCount = metrics.staticsByContent.get(c.id) ?? 0;
      const buttons = CONTENT_STATUSES.map((s) => statusButton(c.id, s, status)).join("");
      const reset = overridden
        ? `<form method="post" action="/admin/contents/${encodeURIComponent(
            c.id
          )}/reset"><button class="reset" title="YAML の値に戻す">↺</button></form>`
        : "";
      return `<tr class="s-${status}">
        <td><code>${escapeHtml(c.id)}</code></td>
        <td>${escapeHtml(c.displayName)}</td>
        <td class="muted">${escapeHtml(c.type)}</td>
        <td><span class="badge ${status}">${STATUS_LABEL[status]}</span>${
        overridden ? ' <span class="ovr" title="DB override 適用中">●</span>' : ""
      }</td>
        <td class="num">${staticCount}</td>
        <td class="actions">${buttons}${reset}</td>
      </tr>`;
    })
    .join("");

  return `<!doctype html><html lang="ja"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>固定支援Bot 管理</title><style>${CSS}</style></head><body>
<h1>固定支援Bot 管理ダッシュボード</h1>
<section class="metrics">
  ${metricCard("サーバー数", metrics.guildCount)}
  ${metricCard("固定 (total)", metrics.staticsTotal)}
  ${metricCard("現役メンバー", metrics.activeMembers)}
  ${metricCard("今後の予定", metrics.upcomingSchedules)}
  ${metricCard("公開中の投票", metrics.openVotes)}
  ${metricCard("定期予定(有効)", metrics.activeRecurring)}
</section>
<h2>コンテンツ ライフサイクル</h2>
<p class="hint">testing=検証中(非公開・/setup不可) / active=運用中(公開) / inactive=アーカイブ(非公開・/setup不可)。
<span class="ovr">●</span> = YAML から DB で上書き中（↺ で戻す）。変更は即 bot に反映（公開サイトは次回デプロイ時）。</p>
<table><thead><tr><th>ID</th><th>名称</th><th>type</th><th>状態</th><th>固定数</th><th>操作</th></tr></thead>
<tbody>${rows}</tbody></table>
</body></html>`;
}

function statusButton(id: string, s: ContentStatus, current: ContentStatus): string {
  const isCurrent = s === current;
  return `<form method="post" action="/admin/contents/${encodeURIComponent(id)}/status">
    <input type="hidden" name="status" value="${s}">
    <button class="st ${s}${isCurrent ? " cur" : ""}"${isCurrent ? " disabled" : ""}>${
    STATUS_LABEL[s]
  }</button>
  </form>`;
}

function metricCard(label: string, value: number): string {
  return `<div class="card"><div class="v">${value}</div><div class="l">${escapeHtml(label)}</div></div>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const CSS = `
:root{--bg:#0f1115;--card:#1a1d24;--fg:#e6e8eb;--muted:#8b909a;--line:#2a2e37;--accent:#4f8cff}
*{box-sizing:border-box}body{margin:0;padding:24px;font:14px/1.5 system-ui,sans-serif;background:var(--bg);color:var(--fg)}
h1{font-size:20px;margin:0 0 16px}h2{font-size:16px;margin:28px 0 8px}
.hint{color:var(--muted);font-size:12px;margin:0 0 12px}
.metrics{display:flex;flex-wrap:wrap;gap:12px}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px 18px;min-width:120px}
.card .v{font-size:26px;font-weight:700}.card .l{color:var(--muted);font-size:12px}
table{width:100%;border-collapse:collapse;background:var(--card);border:1px solid var(--line);border-radius:10px;overflow:hidden}
th,td{padding:9px 12px;text-align:left;border-bottom:1px solid var(--line)}
th{font-size:12px;color:var(--muted);font-weight:600}tr:last-child td{border-bottom:0}
code{background:#0008;padding:1px 6px;border-radius:5px}.muted{color:var(--muted)}.num{text-align:right}
.actions{display:flex;gap:6px;align-items:center}.actions form{display:inline;margin:0}
button{cursor:pointer;border:1px solid var(--line);background:#222632;color:var(--fg);border-radius:7px;padding:5px 9px;font-size:12px}
button:hover{border-color:var(--accent)}button:disabled{cursor:default;opacity:1}
.st.cur{font-weight:700;outline:2px solid var(--accent)}
.badge{padding:2px 8px;border-radius:20px;font-size:12px;border:1px solid var(--line)}
.badge.active{background:#143d1e;color:#7ee29a}.badge.testing{background:#3d3414;color:#e2cf7e}.badge.inactive{background:#2a2e37;color:#9aa0ab}
.ovr{color:var(--accent)}.reset{padding:5px 8px}
tr.s-inactive td:nth-child(2){color:var(--muted)}
`;
