import { defineConfig } from "@playwright/test";

const dbUrl = process.env.DATABASE_URL;
const storage = process.env.DOCUMENT_STORAGE_PATH;
if (!dbUrl || new URL(dbUrl).pathname.replace(/^\//, "") !== "juris_connect_test") {
  throw new Error("Browser tests require DATABASE_URL directed to juris_connect_test.");
}
if (!storage || !storage.toLowerCase().includes("test-documents")) {
  throw new Error("Browser tests require a dedicated test-documents storage path.");
}

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  reporter: "list",
  use: { baseURL: "http://127.0.0.1:5174", browserName: "chromium", trace: "retain-on-failure" },
  webServer: [
    { command: "pnpm exec tsx src/server.ts", cwd: "../api", url: "http://127.0.0.1:3334/health", reuseExistingServer: false, timeout: 30_000 },
    { command: "pnpm exec vite --host 127.0.0.1 --port 5174", cwd: ".", url: "http://127.0.0.1:5174", reuseExistingServer: false, timeout: 30_000 },
  ],
});
