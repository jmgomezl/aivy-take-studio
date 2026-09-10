import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const copy = async (from, to) => {
  await fs.mkdir(path.dirname(path.join(root, to)), { recursive: true });
  await fs.copyFile(path.join(root, from), path.join(root, to));
};
await copy(
  "node_modules/mediabunny/dist/bundles/mediabunny.mjs",
  "vendor/mediabunny.js",
);
await copy("node_modules/mediabunny/LICENSE", "vendor/MEDIABUNNY-LICENSE.txt");
await copy("node_modules/fflate/esm/browser.js", "vendor/fflate.js");
await copy("node_modules/fflate/LICENSE", "vendor/FFLATE-LICENSE.txt");
await copy(
  "node_modules/@mediapipe/tasks-vision/vision_bundle.mjs",
  "vendor/vision.js",
);
for (const ext of ["js", "wasm"])
  await copy(
    `node_modules/@mediapipe/tasks-vision/wasm/vision_wasm_module_internal.${ext}`,
    `vendor/wasm/vision_wasm_module_internal.${ext}`,
  );
const download = async (url, name) => {
  const r = await fetch(url);
  if (!r.ok) throw Error(`${r.status}: ${url}`);
  await fs.writeFile(
    path.join(root, "vendor", name),
    Buffer.from(await r.arrayBuffer()),
  );
};
await download(
  "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/1/selfie_segmenter.tflite",
  "selfie_segmenter.tflite",
);
await download(
  "https://raw.githubusercontent.com/google-ai-edge/mediapipe/master/LICENSE",
  "MEDIAPIPE-LICENSE.txt",
);
await download(
  "https://raw.githubusercontent.com/google/fonts/main/ofl/manrope/OFL.txt",
  "MANROPE-OFL.txt",
);
const fonts = await (
  await fetch(
    "https://fonts.googleapis.com/css2?family=Manrope:wght@400..800",
    {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36",
      },
    },
  )
).text();
const fontUrl = [...fonts.matchAll(/url\((https:[^)]+)\)/g)].at(-1)?.[1];
if (!fontUrl) throw Error("Font URL missing");
await download(fontUrl, "manrope.woff2");
const manifest = {
  versions: JSON.parse(await fs.readFile(path.join(root, "package.json")))
    .dependencies,
  files: {},
};
async function visit(dir) {
  for (const item of await fs.readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, item.name);
    if (item.isDirectory()) await visit(p);
    else if (item.name !== "manifest.json") {
      const b = await fs.readFile(p);
      manifest.files[path.relative(path.join(root, "vendor"), p)] = {
        bytes: b.length,
        sha256: createHash("sha256").update(b).digest("hex"),
      };
    }
  }
}
await visit(path.join(root, "vendor"));
await fs.writeFile(
  path.join(root, "vendor/manifest.json"),
  JSON.stringify(manifest, null, 2) + "\n",
);
console.log("Self-hosted browser dependencies ready.");
