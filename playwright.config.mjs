import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser",
  timeout: 45000,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:8787",
    browserName: "chromium",
    channel: "msedge",
    screenshot: "only-on-failure",
  },
  reporter: "list",
});
