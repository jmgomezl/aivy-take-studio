import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
const root = new URL("../", import.meta.url);
const dest = new URL("vendor/speech/", root);
await fs.mkdir(dest, { recursive: true });
for (const name of [
  "transformers.min.js",
  "ort-wasm-simd-threaded.jsep.mjs",
  "ort-wasm-simd-threaded.jsep.wasm",
])
  await fs.copyFile(
    new URL("node_modules/@huggingface/transformers/dist/" + name, root),
    new URL(name.replace(/\.mjs$/, ".js"), dest),
  );
await fs.copyFile(
  new URL("node_modules/@huggingface/transformers/LICENSE", root),
  new URL("TRANSFORMERS-LICENSE.txt", dest),
);
const ortLicense = await fetch(
  "https://raw.githubusercontent.com/microsoft/onnxruntime/v1.22.0/LICENSE",
);
if (!ortLicense.ok) throw Error("ONNX license unavailable");
await fs.writeFile(
  new URL("ONNXRUNTIME-LICENSE.txt", dest),
  await ortLicense.text(),
);
const revision = "5332fcc35e32a33b86612b9a57a89be7906102b1";
const files = [
  "config.json",
  "generation_config.json",
  "preprocessor_config.json",
  "tokenizer.json",
  "tokenizer_config.json",
  "onnx/encoder_model_quantized.onnx",
  "onnx/decoder_model_merged_quantized.onnx",
];
for (const name of files) {
  const out = new URL("whisper-tiny-timestamps/" + name, dest);
  await fs.mkdir(path.dirname(out.pathname), { recursive: true });
  const response = await fetch(
    `https://huggingface.co/Xenova/whisper-tiny/resolve/${revision}/${name}`,
  );
  if (!response.ok) throw Error(`${name}: ${response.status}`);
  await fs.writeFile(out, Buffer.from(await response.arrayBuffer()));
  console.log("Vendored " + name);
}
const license = await fetch(
  "https://raw.githubusercontent.com/openai/whisper/v20250625/LICENSE",
);
if (!license.ok) throw Error("Whisper license unavailable");
await fs.writeFile(new URL("WHISPER-LICENSE.txt", dest), await license.text());
const manifest = {
  model: "Xenova/whisper-tiny",
  revision,
  transformers: "3.8.1",
  files: {},
};
async function walk(dir) {
  for (const f of await fs.readdir(dir, { withFileTypes: true })) {
    const full = new URL(f.name + (f.isDirectory() ? "/" : ""), dir);
    if (f.isDirectory()) await walk(full);
    else if (f.name !== "manifest.json") {
      const b = await fs.readFile(full);
      manifest.files[full.pathname.slice(dest.pathname.length)] = {
        bytes: b.length,
        sha256: createHash("sha256").update(b).digest("hex"),
      };
    }
  }
}
await walk(dest);
await fs.writeFile(
  new URL("manifest.json", dest),
  JSON.stringify(manifest, null, 2) + "\n",
);
