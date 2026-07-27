import { execFileSync } from "node:child_process";

execFileSync(process.execPath, ["scripts/build-prompt-bundle.mjs", "--check"], {
  cwd: process.cwd(),
  stdio: "inherit",
});
