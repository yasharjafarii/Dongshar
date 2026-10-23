import { readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
for (const dir of ["src", "public"])
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".js")))
    execFileSync(process.execPath, ["--check", dir + "/" + file], {
      stdio: "inherit",
    });
