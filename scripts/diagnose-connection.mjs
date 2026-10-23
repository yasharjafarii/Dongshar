import { resolve4, resolve6 } from "node:dns/promises";
const target = new URL(
  process.argv[2] || "https://dong-fa.yedone-yashar.workers.dev/",
);
console.log("Dongshar connection check:", target.origin);
console.log(
  "Run once with VPN OFF, once with VPN ON. No settings are changed.",
);
for (const [name, fn] of [
  ["IPv4", resolve4],
  ["IPv6", resolve6],
])
  try {
    console.log(name, await fn(target.hostname));
  } catch (e) {
    console.log(name, e.code);
  }
for (const path of ["/", "/theme.js", "/api/auth/email-config"]) {
  const start = performance.now();
  try {
    const r = await fetch(new URL(path, target.origin), {
      signal: AbortSignal.timeout(12000),
      redirect: "follow",
    });
    console.log(
      path,
      "HTTP",
      r.status,
      Math.round(performance.now() - start) + " ms",
    );
    await r.body?.cancel();
  } catch (e) {
    console.log(
      path,
      e.cause?.code || e.name,
      Math.round(performance.now() - start) + " ms",
    );
  }
}
