import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync, writeFileSync } from "node:fs";
const version = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8"),
).version;
const buildId = version + "-" + Date.now();
export default defineConfig({
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
});
