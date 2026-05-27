import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: "node",
    globals: true,
    include: ["tests/unit/**/*.test.{ts,tsx}"],
    // Loads .env so DB-backed tests find DATABASE_URL (does not override CI env).
    setupFiles: ["dotenv/config"],
  },
});
