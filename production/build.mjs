// Package only public assets; no backend or Quorum checkout is needed.
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const output = path.join(root, "dist");
await fs.rm(output, { recursive: true, force: true });
await fs.mkdir(output);
for (const name of [
  "index.html", "style.css", "app.js", "core.js", "storage.js", "media.js",
  "segment-worker.js", "vendor", "assets", "presets", "THIRD-PARTY.md", "LICENSE", "LICENSING.md",
]) {
  await fs.cp(path.join(root, name), path.join(output, name), { recursive: true });
}
const revision = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: root, encoding: "utf8",
});
await fs.writeFile(path.join(output, "REVISION"), revision);
console.log("Take Studio static release ready in dist/.");
