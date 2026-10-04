import { mkdir, copyFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
const require = createRequire(import.meta.url),
  out = new URL("../public/ocr/", import.meta.url);
await mkdir(out, { recursive: true });
const engine = dirname(require.resolve("tesseract.js-core/package.json"));
for (const name of [
  "tesseract-core-lstm.wasm.js",
  "tesseract-core-lstm.wasm",
  "tesseract-core-simd-lstm.wasm.js",
  "tesseract-core-simd-lstm.wasm",
])
  await copyFile(join(engine, name), new URL(name, out));
await copyFile(
  join(
    dirname(require.resolve("tesseract.js/package.json")),
    "dist/worker.min.js",
  ),
  new URL("worker.min.js", out),
);
const language = require("@tesseract.js-data/deu");
await copyFile(
  join(language.langPath, "deu.traineddata.gz"),
  new URL("deu.traineddata.gz", out),
);
console.log("Lokale deutsche OCR-Dateien vorbereitet.");
