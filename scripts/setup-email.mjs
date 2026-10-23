import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
const rl = createInterface({ input: stdin, output: stdout });
try {
  console.log(
    "Verify your sending domain in Resend first. API key will be entered directly into Wrangler, never saved in this project.",
  );
  const entered =
    (
      await rl.question(
        "Site URL [https://dong-fa.yedone-yashar.workers.dev]: ",
      )
    ).trim() || "https://dong-fa.yedone-yashar.workers.dev";
  const url = new URL(entered);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.hash ||
    url.search ||
    url.pathname !== "/"
  )
    throw Error("Use an HTTPS origin without a path.");
  const from = (
    await rl.question("Verified sender email (e.g. accounts@your-domain.com): ")
  ).trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(from))
    throw Error("Invalid sender email.");
  rl.close();
  const file = new URL("../wrangler.jsonc", import.meta.url),
    config = JSON.parse(await readFile(file, "utf8"));
  config.vars = {
    ...config.vars,
    APP_URL: url.origin,
    EMAIL_FROM: "Dongshar <" + from + ">",
  };
  await writeFile(file, JSON.stringify(config, null, 2) + "\n");
  const cli = new URL(
    "../node_modules/wrangler/bin/wrangler.js",
    import.meta.url,
  );
  const result = spawnSync(
    process.execPath,
    [fileURLToPath(cli), "secret", "put", "RESEND_API_KEY"],
    { stdio: "inherit", cwd: new URL("../", import.meta.url) },
  );
  if (result.status !== 0)
    throw Error(
      "Secret was not configured. Run npx wrangler secret put RESEND_API_KEY manually.",
    );
  console.log(
    "Configuration saved. Run npm run deploy to publish, then test email delivery with your own account.",
  );
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  rl.close();
}
