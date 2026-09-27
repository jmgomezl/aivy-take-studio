// Copyright (c) 2026 Juanma Gomez. All rights reserved.
// SPDX-License-Identifier: LicenseRef-Take-Studio-Proprietary
// See LICENSE and LICENSING.md; prior MIT grants are preserved.
import { FilesetResolver, ImageSegmenter } from "./vendor/vision.js";
import { personAlpha, maskOptions } from "./portrait-mask.js?v=20260927-portrait";
let segmenter, quality, backend, files, output, maskCanvas, queue = Promise.resolve();

async function prepare(nextQuality, forceCPU = false) {
  if (segmenter && quality === nextQuality) return;
  segmenter?.close();
  segmenter = null;
  files ??= await FilesetResolver.forVisionTasks(new URL("./vendor/wasm", self.location.href).href, true);
  const options = {
    baseOptions: {
      modelAssetPath: new URL(nextQuality === "portrait"
        ? "./vendor/selfie_multiclass_256x256.tflite"
        : "./vendor/selfie_segmenter.tflite", self.location.href).href,
    },
    runningMode: "IMAGE",
    outputCategoryMask: false,
    outputConfidenceMasks: true,
  };
  // The detailed model is substantially faster on GPU. CPU preserves the same
  // model/quality when WebGL is unavailable; the UI offers a lighter Fast mode.
  if (nextQuality === "portrait" && !forceCPU) {
    try {
      segmenter = await ImageSegmenter.createFromOptions(files, {
        ...options, canvas: new OffscreenCanvas(256, 256),
        baseOptions: { ...options.baseOptions, delegate: "GPU" },
      });
      backend = "GPU";
    } catch (cause) {
      // This SDK consumes its WASM module factory. Retry CPU in a fresh worker,
      // rather than attempting a second initialization in this context.
      const error = new Error(cause.message || "GPU initialization failed.");
      error.gpuUnavailable = true;
      throw error;
    }
  }
  if (!segmenter) {
    segmenter = await ImageSegmenter.createFromOptions(files, {
      ...options, baseOptions: { ...options.baseOptions, delegate: "CPU" },
    });
    backend = "CPU";
  }
  quality = nextQuality;
  const labels = segmenter.getLabels();
  if (quality === "portrait" && (labels.length !== 6 || labels[0] !== "background")) {
    segmenter.close(); segmenter = null;
    throw Error("Portrait model labels do not match. Reload the studio to update its assets.");
  }
}
async function processFrame(data) {
  const { id, bitmap } = data;
  const options = maskOptions(data.settings);
  try {
    await prepare(options.quality, data.forceCPU);
    if (!bitmap) {
      self.postMessage({ id, ready: true, quality, backend });
      return;
    }
    output ??= new OffscreenCanvas(bitmap.width, bitmap.height);
    if (output.width !== bitmap.width) output.width = bitmap.width;
    if (output.height !== bitmap.height) output.height = bitmap.height;
    const ctx = output.getContext("2d");
    ctx.globalCompositeOperation = "source-over";
    ctx.clearRect(0, 0, output.width, output.height);
    ctx.drawImage(bitmap, 0, 0);
    segmenter.segment(bitmap, result => {
      // Multiclass: keep ALL non-background classes (including headphones and
      // glasses). The older one-channel model directly returns person confidence.
      const masks = result.confidenceMasks;
      const mask = quality === "portrait" ? masks?.[0] : masks?.at(-1);
      if (!mask || (quality === "portrait" && masks.length !== 6))
        throw Error("Person mask is unavailable.");
      const values = mask.getAsFloat32Array();
      maskCanvas ??= new OffscreenCanvas(mask.width, mask.height);
      if (maskCanvas.width !== mask.width) maskCanvas.width = mask.width;
      if (maskCanvas.height !== mask.height) maskCanvas.height = mask.height;
      const image = new ImageData(mask.width, mask.height);
      for (let i = 0; i < values.length; i++) {
        const confidence = quality === "portrait" ? 1 - values[i] : values[i];
        image.data[i * 4] = 255;
        image.data[i * 4 + 1] = 255;
        image.data[i * 4 + 2] = 255;
        image.data[i * 4 + 3] = personAlpha(confidence, options.cleanup);
      }
      maskCanvas.getContext("2d").putImageData(image, 0, 0);
      ctx.globalCompositeOperation = "destination-in";
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(maskCanvas, 0, 0, output.width, output.height);
      ctx.globalCompositeOperation = "source-over";
    });
    const foreground = output.transferToImageBitmap();
    self.postMessage({ id, foreground, quality, backend }, [foreground]);
  } catch (e) {
    self.postMessage({ id, error: e.message || "Background removal failed.", gpuUnavailable: Boolean(e.gpuUnavailable) });
  } finally {
    bitmap?.close();
  }
}
// Model switches and initialization must not race with another in-flight frame.
self.onmessage = ({ data }) => { queue = queue.then(() => processFrame(data), () => processFrame(data)); };
