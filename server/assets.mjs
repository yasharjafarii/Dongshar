// Static asset serving for the self-hosted build: the same `public/` directory
// Workers Static Assets serves, including the single-page-application fallback.
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../public", import.meta.url));

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".txt": "text/plain; charset=utf-8",
  ".map": "application/json; charset=utf-8",
};

const cacheControl = (rel) => {
  if (rel === "index.html" || rel === "sw.js") return "no-cache";
  if (rel.startsWith("fonts/")) return "public, max-age=86400";
  return "public, max-age=3600";
};

function read(target) {
  try {
    const stat = statSync(target);
    if (!stat.isFile()) return null;
    return { body: readFileSync(target), stat };
  } catch {
    return null;
  }
}

function response(file, rel, status = 200) {
  const ext = path.extname(rel).toLowerCase();
  return new Response(file.body, {
    status,
    headers: {
      "Content-Type": types[ext] || "application/octet-stream",
      "Content-Length": String(file.body.length),
      "Cache-Control": cacheControl(rel),
      "Last-Modified": file.stat.mtime.toUTCString(),
    },
  });
}

export function assetHandler(request) {
  const method = request.method;
  if (method !== "GET" && method !== "HEAD")
    return new Response("Method Not Allowed", { status: 405 });
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url).pathname);
  } catch {
    return new Response("Bad Request", { status: 400 });
  }
  const rel = path.posix.normalize(pathname).replace(/^\/+/, "");
  const target = path.resolve(root, rel);
  if (target !== root && !target.startsWith(root + path.sep))
    return new Response("Forbidden", { status: 403 });
  let found = read(target),
    served = rel || "index.html";
  if (!found) {
    const index = read(path.join(target, "index.html"));
    if (index) {
      found = index;
      served = path.posix.join(rel, "index.html");
    }
  }
  if (!found) {
    // Workers Static Assets `not_found_handling: single-page-application`.
    if (path.extname(rel)) return new Response("Not Found", { status: 404 });
    found = read(path.join(root, "index.html"));
    served = "index.html";
    if (!found) return new Response("Not Found", { status: 404 });
  }
  const res = response(found, served);
  return method === "HEAD" ? new Response(null, res) : res;
}
