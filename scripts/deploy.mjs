import { readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root = fileURLToPath(new URL("../", import.meta.url));
const cli = path.join(root, "node_modules/wrangler/bin/wrangler.js");
function run(args, capture = false) {
  const r = spawnSync(process.execPath, [cli, ...args], {
    cwd: root,
    stdio: capture ? "pipe" : "inherit",
    encoding: "utf8",
    env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
  });
  if (r.status !== 0)
    throw Error(
      capture
        ? r.stderr || r.stdout || "Wrangler failed"
        : "Deployment command failed. See the message above.",
    );
  return r.stdout;
}
try {
  console.log("\nDong setup — ورود به کلادفلر و راه‌اندازی دنگ\n");
  // Login is idempotent. An API token can also be supplied through the environment.
  if (!process.env.CLOUDFLARE_API_TOKEN) run(["login"]);
  const configPath = path.join(root, "wrangler.jsonc"),
    config = JSON.parse(await readFile(configPath, "utf8"));
  if (
    config.d1_databases[0].database_id ===
    "00000000-0000-0000-0000-000000000000"
  ) {
    let databases = JSON.parse(run(["d1", "list", "--json"], true));
    let db = databases.find((d) => d.name === "dong-db");
    if (!db) {
      run(["d1", "create", "dong-db"]);
      databases = JSON.parse(run(["d1", "list", "--json"], true));
      db = databases.find((d) => d.name === "dong-db");
    }
    if (!db?.uuid)
      throw Error(
        "Database ID was not returned. Add the D1 ID from the Cloudflare dashboard to wrangler.jsonc.",
      );
    config.d1_databases[0].database_id = db.uuid;
    await writeFile(configPath, JSON.stringify(config, null, 2) + "\n");
  }
  run(["d1", "migrations", "apply", "dong-db", "--remote"]);
  run(["deploy"]);
  console.log(
    "\nتمام شد! نشانی workers.dev بالا را باز کنید، وارد حساب شوید و دوست یا گروه اضافه کنید.\n",
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
