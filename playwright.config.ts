import { defineConfig } from "@playwright/test";

const PORT = 4173;
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./test/e2e",
  timeout: 45_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    video: "off",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        browserName: "chromium",
      },
    },
  ],
  webServer: {
    command: `bun run dev -- --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      NEXT_TELEMETRY_DISABLED: "1",
      NEXT_PUBLIC_APP_URL: BASE_URL,
      NEXT_PUBLIC_ENABLE_UPSTASH_STREAM: "false",
      ENABLE_UPSTASH_STREAM: "false",
      NEXT_PUBLIC_DISABLE_TRPC_BATCH: "true",
      NEXT_PUBLIC_SUPABASE_URL: "",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
      NEXT_PUBLIC_PRIVY_APP_ID: "",
      NEXT_PUBLIC_PRIVY_CLIENT_ID: "",
    },
  },
});
