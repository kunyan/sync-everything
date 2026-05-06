import { defineConfig } from "tsdown";

export default defineConfig([
  {
    entry: ["src/onelap/index.ts"],
    format: "esm",
    dts: true,
    clean: true,
    outDir: "dist/onelap",
  },
  {
    entry: ["src/strava/index.ts"],
    format: "esm",
    dts: true,
    clean: true,
    outDir: "dist/strava",
  },
]);
