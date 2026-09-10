import { FilesetResolver, ImageSegmenter } from "./vendor/vision.js";
let segmenter, initializing, output, maskCanvas;
self.onmessage = async ({ data }) => {
  const { id, bitmap } = data;
  try {
    if (!segmenter) {
      initializing ??= (async () => {
        const files = await FilesetResolver.forVisionTasks(
          new URL("./vendor/wasm", self.location.href).href,
          true,
        );
        segmenter = await ImageSegmenter.createFromOptions(files, {
          baseOptions: {
            modelAssetPath: new URL(
              "./vendor/selfie_segmenter.tflite",
              self.location.href,
            ).href,
            delegate: "CPU",
          },
          runningMode: "IMAGE",
          outputCategoryMask: false,
          outputConfidenceMasks: true,
        });
      })().catch((e) => {
        initializing = null;
        throw e;
      });
      await initializing;
    }
    if (!bitmap) {
      self.postMessage({ id, ready: true });
      return;
    }
    output ??= new OffscreenCanvas(bitmap.width, bitmap.height);
    output.width = bitmap.width;
    output.height = bitmap.height;
    const ctx = output.getContext("2d");
    ctx.drawImage(bitmap, 0, 0);
    segmenter.segment(bitmap, (result) => {
      // The binary selfie model exposes person confidence as its last output.
      const mask = result.confidenceMasks?.at(-1);
      if (!mask) throw Error("Person mask is unavailable.");
      const values = mask.getAsFloat32Array();
      maskCanvas ??= new OffscreenCanvas(mask.width, mask.height);
      maskCanvas.width = mask.width;
      maskCanvas.height = mask.height;
      const image = new ImageData(mask.width, mask.height);
      for (let i = 0; i < values.length; i++) {
        const a = Math.max(0, Math.min(1, (values[i] - 0.25) / 0.5));
        image.data[i * 4] = 255;
        image.data[i * 4 + 1] = 255;
        image.data[i * 4 + 2] = 255;
        image.data[i * 4 + 3] = Math.round(a * 255);
      }
      maskCanvas.getContext("2d").putImageData(image, 0, 0);
      ctx.globalCompositeOperation = "destination-in";
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(maskCanvas, 0, 0, output.width, output.height);
      ctx.globalCompositeOperation = "source-over";
    });
    const foreground = output.transferToImageBitmap();
    self.postMessage({ id, foreground }, [foreground]);
  } catch (e) {
    self.postMessage({ id, error: e.message || "Background removal failed." });
  } finally {
    bitmap?.close();
  }
};
