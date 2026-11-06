import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// Load local secrets the same way Next.js does. Existing environment
// variables (CI, Render, shell) always win because dotenv does not override.
config({ path: ".env.local" });
config({ path: ".env" });

export default defineConfig({
  schema: "./lib/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
});
