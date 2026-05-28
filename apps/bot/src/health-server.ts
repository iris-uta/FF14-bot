/**
 * Tiny HTTP health endpoint for Fly.io / k8s liveness checks.
 *
 * Why it exists:
 *  - Discord bots don't expose HTTP normally, so the hosting platform has no
 *    way to tell if the process is healthy vs zombied. Without it, Fly will
 *    happily keep a hung gateway connection alive forever.
 *
 * Endpoints:
 *   GET /health  → 200 {status, uptime_seconds, ready, guilds, version}
 *
 * Bound to 0.0.0.0:${PORT || 8080}. No deps beyond Node built-in `http`.
 */
import { createServer, type Server } from "node:http";
import type { Client } from "discord.js";

let server: Server | null = null;
let startedAt = Date.now();

export interface HealthState {
  /** Discord ready (= Events.ClientReady fired) */
  ready: boolean;
}

export function startHealthServer(
  client: Client,
  state: HealthState,
  port: number = Number(process.env.HEALTH_PORT) || 8080
): void {
  if (server) return;
  startedAt = Date.now();

  server = createServer((req, res) => {
    // Only respond to GET /health — everything else is 404.
    if (req.method !== "GET" || req.url !== "/health") {
      res.statusCode = 404;
      res.end();
      return;
    }
    const body = {
      status: state.ready ? "ok" : "starting",
      uptime_seconds: Math.floor((Date.now() - startedAt) / 1000),
      ready: state.ready,
      guilds: state.ready ? client.guilds.cache.size : 0,
      version: process.env.GIT_SHA ?? "dev",
    };
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.statusCode = state.ready ? 200 : 503; // 503 during startup
    res.end(JSON.stringify(body));
  });

  server.listen(port, "0.0.0.0", () => {
    console.log(`Health endpoint listening on 0.0.0.0:${port}/health`);
  });
}

export function stopHealthServer(): Promise<void> {
  return new Promise((resolve) => {
    if (!server) return resolve();
    server.close(() => {
      server = null;
      resolve();
    });
  });
}
