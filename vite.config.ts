import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";
import { assertPublicSupabaseKey } from "./src/publicConnection";
import react from "@vitejs/plugin-react";
import { readFileSync, writeFileSync } from "node:fs";
const version = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8"),
).version;
const buildId = version + "-" + Date.now();
export default defineConfig(({ mode }) => {
  assertPublicSupabaseKey(
    loadEnv(mode, process.cwd(), "VITE_").VITE_SUPABASE_ANON_KEY || "",
  );
  return {
    test: { maxWorkers: 1, fileParallelism: false },
    define: {
      __APP_VERSION__: JSON.stringify(version),
      __APP_BUILD_ID__: JSON.stringify(buildId),
    },
    plugins: [
      react(),
      {
        name: "heimfriseur-version",
        apply: "build",
        closeBundle() {
          writeFileSync(
            "dist/version.json",
            JSON.stringify({ version, buildId }),
          );
          writeFileSync(
            "dist/sw.js",
            "// Build " + buildId + "\n" + readFileSync("public/sw.js", "utf8"),
          );
        },
      },
    ],
    preview: {
      headers: Object.fromEntries(
        JSON.parse(
          readFileSync(
            new URL("./firebase.clean.json", import.meta.url),
            "utf8",
          ),
        )
          .hosting.headers.find((x: { source: string }) => x.source === "**")
          .headers.map((x: { key: string; value: string }) => [x.key, x.value]),
      ),
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            react: ["react", "react-dom"],
            supabase: ["@supabase/supabase-js"],
          },
        },
      },
    },
  };
});
