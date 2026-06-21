import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts", "lib/**/*.test.tsx"],
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "."),
    },
  },
});
