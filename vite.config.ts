import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";
import { assertPublicSupabaseKey } from "./src/publicConnection";
import react from "@vitejs/plugin-react";
import { readFileSync, writeFileSync } from "node:fs";
const version = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8"),
).version;
const buildId = version + "-" + Date.now();
let outputDirectory = "dist";
export default defineConfig(({ mode }) => {
  assertPublicSupabaseKey(
    loadEnv(mode, process.cwd(), "VITE_").VITE_SUPABASE_ANON_KEY || "",
  );
  const backend =
    loadEnv(mode, process.cwd(), "VITE_").VITE_BACKEND ||
    (mode === "firebase" || mode === "firebase-emulator"
      ? "firebase"
      : "supabase");
  return {
    test: { maxWorkers: 1, fileParallelism: false },
    define: {
      "import.meta.env.VITE_BACKEND": JSON.stringify(backend),
      __APP_VERSION__: JSON.stringify(version),
      __APP_BUILD_ID__: JSON.stringify(buildId),
    },
    plugins: [
      react(),
      {
        name: "heimfriseur-version",
        apply: "build",
        configResolved(config) {
          outputDirectory = config.build.outDir;
        },
        closeBundle() {
          writeFileSync(
            outputDirectory + "/version.json",
            JSON.stringify({ version, buildId }),
          );
          writeFileSync(
            outputDirectory + "/sw.js",
            "// Build " + buildId + "\n" + readFileSync("public/sw.js", "utf8"),
          );
        },
      },
    ],
    preview: {
      headers: Object.fromEntries(
        JSON.parse(
          readFileSync(
            new URL(
              backend === "firebase"
                ? "./firebase.parallel.json"
                : "./firebase.clean.json",
              import.meta.url,
            ),
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
            firebaseAuth: ["firebase/auth"],
            firebaseFirestore: ["firebase/firestore"],
            firebaseCore: ["firebase/app"],
          },
        },
      },
    },
  };
});
