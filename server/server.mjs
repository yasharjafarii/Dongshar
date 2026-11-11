// Self-hosted entry point: runs the real Worker (`src/worker.js`) behind a
// plain Node HTTP server, with SQLite replacing D1 and `public/` served
// in place of Workers Static Assets. Used by the Dockerfile for Coolify.
import http from "node:http";
import { openDatabase } from "./database.mjs";
import { assetHandler } from "./assets.mjs";
import worker, { scheduled } from "../src/worker.js";

const port = Number(process.env.PORT || 3000);
const dbFile = process.env.DB_PATH || "data/dong.db";
const { env, close } = openDatabase(dbFile);
Object.assign(env, {
  ASSETS: { fetch: assetHandler },
  APP_URL: process.env.APP_URL,
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  EMAIL_FROM: process.env.EMAIL_FROM,
});

const first = (v) => (Array.isArray(v) ? v[0] : v || "").split(",")[0].trim();
const skip = new Set([
  "host",
  "connection",
  "keep-alive",
  "content-length",
  "transfer-encoding",
  "upgrade",
]);

function scheme(req, host) {
  const forwarded = first(req.headers["x-forwarded-proto"]);
  if (forwarded) return forwarded;
  // The proxy normally supplies the scheme; fall back to APP_URL when the
  // request reaches this container on plain HTTP behind TLS termination.
  try {
    const publicUrl = new URL(process.env.APP_URL);
    if (publicUrl.host === host && publicUrl.protocol === "https:")
      return "https";
  } catch {
    /* APP_URL is optional and only used for email links */
  }
  return "http";
}

function clientIp(req) {
  return (
    first(req.headers["x-forwarded-for"]) ||
    req.socket.remoteAddress ||
    "0.0.0.0"
  );
}

function body(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function send(res, response, method) {
  res.statusCode = response.status;
  const cookies =
    typeof response.headers.getSetCookie === "function"
      ? response.headers.getSetCookie()
      : [];
  response.headers.forEach((value, key) => {
    if (key !== "set-cookie") res.setHeader(key, value);
  });
  for (const cookie of cookies) res.appendHeader("set-cookie", cookie);
  // HEAD must not send a body: the Content-Length header already describes
  // the file the equivalent GET would return.
  if (method === "HEAD" || [204, 304].includes(response.status))
    return res.end();
  res.end(Buffer.from(await response.arrayBuffer()));
}

const server = http.createServer(async (req, res) => {
  try {
    const host =
      first(req.headers["x-forwarded-host"]) || req.headers.host || "localhost";
    if (
      (req.url === "/api/health" || req.url === "/healthz") &&
      (req.method === "GET" || req.method === "HEAD")
    ) {
      res.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      });
      return res.end(JSON.stringify({ status: "ok" }));
    }
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (value === undefined || skip.has(key)) continue;
      headers.set(key, Array.isArray(value) ? value.join(", ") : value);
    }
    headers.set("CF-Connecting-IP", clientIp(req));
    const payload = ["GET", "HEAD"].includes(req.method)
      ? undefined
      : await body(req);
    const request = new Request(
      `${scheme(req, host)}://${host}${req.url || "/"}`,
      {
        method: req.method,
        headers,
        body: payload && payload.length ? payload : undefined,
      },
    );
    await send(res, await worker.fetch(request, env), req.method);
  } catch (error) {
    console.error(error);
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: "خطای سرور؛ دوباره تلاش کنید" }));
    } else res.end();
  }
});

function scheduleDaily() {
  const next = new Date();
  next.setUTCHours(3, 0, 0, 0);
  if (next <= new Date()) next.setUTCDate(next.getUTCDate() + 1);
  const run = async () => {
    try {
      await scheduled(env, new Date());
      console.log("[cron] recurring expenses and cleanup processed");
    } catch (error) {
      console.error("[cron] failed:", error);
    }
  };
  setTimeout(() => {
    run();
    setInterval(run, 24 * 60 * 60 * 1000);
  }, next - Date.now());
}

server.listen(port, process.env.HOST || "0.0.0.0", () => {
  console.log(`Dongshar listening on http://0.0.0.0:${port}`);
  console.log(`Database: ${dbFile}`);
  scheduleDaily();
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    server.close(() => {
      close();
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 5000).unref();
  });
}
