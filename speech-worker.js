// Copyright (c) 2026 Juanma Gomez. All rights reserved.
// SPDX-License-Identifier: LicenseRef-Take-Studio-Proprietary
import { phraseTranscript } from "./voice.js";
import { pipeline, env } from "./vendor/speech/transformers.min.js";
env.allowRemoteModels = false;
env.allowLocalModels = true;
env.localModelPath = new URL("./vendor/speech/", import.meta.url).href;
env.backends.onnx.wasm.wasmPaths = {
  mjs: new URL(
    "./vendor/speech/ort-wasm-simd-threaded.jsep.js",
    import.meta.url,
  ).href,
  wasm: new URL(
    "./vendor/speech/ort-wasm-simd-threaded.jsep.wasm",
    import.meta.url,
  ).href,
};
env.backends.onnx.wasm.numThreads = 1;
let transcriber;
self.onmessage = async ({ data }) => {
  try {
    transcriber ??= await pipeline(
      "automatic-speech-recognition",
      "whisper-tiny-timestamps",
      {
        device: "wasm",
        dtype: "q8",
        progress_callback: (p) =>
          self.postMessage({ type: "progress", value: p }),
      },
    );
    self.postMessage({ type: "working" });
    const result = await transcriber(data.audio, {
      return_timestamps: "word",
      chunk_length_s: 30,
      stride_length_s: 5,
      task: "transcribe",
      ...(data.language ? { language: data.language } : {}),
    });
    result.chunks = phraseTranscript(result.chunks, data.audio.length / 16000);
    self.postMessage({ type: "result", result });
  } catch (e) {
    self.postMessage({ type: "error", message: e.message });
  }
};
