import { spawn } from "node:child_process";
const child = spawn(
  process.platform === "win32" ? "npm.cmd" : "npm",
  ["run", "dev", "--", "--mode", "firebase-emulator", "--port", "5174"],
  {
    detached: process.platform !== "win32",
    stdio: "ignore",
    env: {
      ...process.env,
      VITE_FIREBASE_PROJECT_ID: "demo-heimfriseur",
      VITE_FIREBASE_API_KEY: "demo-key",
      VITE_FIREBASE_APP_ID: "1:demo:web:local",
      VITE_FIREBASE_EMULATORS: "true",
    },
  },
);
let emulator;
async function ready() {
  for (let n = 0; n < 100; n++) {
    try {
      if ((await fetch("http://127.0.0.1:5174")).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw Error("Firebase test server not ready.");
}
try {
  await ready();
  emulator = spawn(
    process.env.FIREBASE_CLI_PATH
      ? process.execPath
      : process.platform === "win32"
        ? "npx.cmd"
        : "npx",
    [
      ...(process.env.FIREBASE_CLI_PATH
        ? [process.env.FIREBASE_CLI_PATH]
        : ["--yes", "--package", "firebase-tools@15.32.1", "firebase"]),
      "emulators:exec",
      "--only",
      "firestore,auth",
      "--project",
      "demo-heimfriseur",
      "--config",
      "firebase.parallel.json",
      "node scripts/firebase-browser-check.mjs",
    ],
    { stdio: "inherit", env: process.env },
  );
  const code = await new Promise((resolve) => {
    emulator.on("exit", resolve);
    emulator.on("error", () => resolve(1));
  });
  process.exitCode = typeof code === "number" ? code : 1;
} finally {
  if (process.platform !== "win32") {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {}
  } else child.kill("SIGTERM");
  if (emulator && emulator.exitCode === null) emulator.kill("SIGTERM");
}
