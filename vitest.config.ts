import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig(async () => {
  const d1Migrations = await readD1Migrations("./migrations");

  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: "./wrangler.jsonc" },
      }),
    ],
    test: {
      fileParallelism: false,
      include: ["tests/**/*.test.ts"],
      maxWorkers: 1,
      provide: { d1Migrations },
    },
  };
});
