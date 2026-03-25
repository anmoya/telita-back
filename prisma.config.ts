import { defineConfig } from "prisma/config";
import { getRuntimeEnv } from "./src/shared/infrastructure/config/load-env";

getRuntimeEnv();

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts"
  }
});
