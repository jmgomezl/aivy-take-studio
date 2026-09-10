import * as M from "./vendor/mediabunny.js";
import { clamp, edgeGain, overlayRect, takePlan, voiceGain } from "./core.js";
export { M };
export const audioCache = new Map();
export function mediaInput(blob) {
  return new M.Input({
    formats: M.ALL_FORMATS,
    source: new M.BlobSource(blob),
  });
}
export async function inspectMedia(blob) {
  const input = mediaInput(blob);
  try {
    const first = await input.getFirstTimestamp(),
      duration = (await input.computeDuration()) - first,
      video = await input.getPrimaryVideoTrack(),
      audio = await input.getPrimaryAudioTrack();
    return {
      duration,
      first,
      hasVideo: !!video,
      hasAudio: !!audio,
      width: video ? await video.getDisplayWidth() : 0,
      height: video ? await video.getDisplayHeight() : 0,
    };
  } finally {
    input.dispose();
  }
}
export async function decodeTake(take) {
  if (audioCache.has(take.id)) return audioCache.get(take.id);
  const input = mediaInput(take.blob);
  try {
    const track = await input.getPrimaryAudioTrack();
    if (!track || !(await track.canDecode()))
      throw Error(
        "This recording has no readable audio. Try Chrome or import a WAV file.",
      );
    const first = await input.getFirstTimestamp(),
      duration = (await input.computeDuration()) - first;
    if (!Number.isFinite(duration) || duration <= 0 || duration > 1200)
      throw Error("Recording duration is not supported.");
    const offline = new OfflineAudioContext(
        1,
        Math.ceil(duration * 48000),
        48000,
      ),
      sink = new M.AudioBufferSink(track);
    for await (const part of sink.buffers()) {
      const source = offline.createBufferSource();
      source.buffer = part.buffer;
      source.connect(offline.destination);
      const start = part.timestamp - first;
      source.start(Math.max(0, start), Math.max(0, -start));
    }
    const buffer = await offline.startRendering();
    audioCache.set(take.id, buffer);
    return buffer;
  } finally {
    input.dispose();
  }
}
export async function mixNarration(project, takes, progress = () => {}) {
  const buffer = new AudioBuffer({
      numberOfChannels: 1,
      length: Math.ceil(project.duration * 48000),
      sampleRate: 48000,
    }),
    dest = buffer.getChannelData(0);
  for (let i = 0; i < project.chapters.length; i++) {
    const take = takes.find((t) => t.id === project.selected?.[i]);
    if (!take) continue;
    const plan = takePlan(project.chapters[i], take),
      decoded = await decodeTake(take),
      input = decoded.getChannelData(0),
      from = Math.round(plan.trimIn * 48000),
      length = Math.min(Math.round(plan.length * 48000), input.length - from),
      offset = Math.round(plan.start * 48000);
    if (length <= 0)
      throw Error(`Chapter ${i + 1}: no audio remains after trimming.`);
    const samples = input.subarray(from, from + length),
      gain = project.settings.polish ? voiceGain(samples) : 1;
    for (let n = 0; n < length && offset + n < dest.length; n++)
      dest[offset + n] =
        samples[n] *
        gain *
        (project.settings.polish ? edgeGain(n / 48000, length / 48000) : 1);
    progress(i + 1, project.chapters.length);
  }
  return buffer;
}
export function wavBlob(buffer) {
  const data = buffer.getChannelData(0),
    out = new ArrayBuffer(44 + data.length * 2),
    v = new DataView(out),
    str = (at, s) => {
      for (let i = 0; i < s.length; i++) v.setUint8(at + i, s.charCodeAt(i));
    };
  str(0, "RIFF");
  v.setUint32(4, out.byteLength - 8, true);
  str(8, "WAVE");
  str(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, buffer.sampleRate, true);
  v.setUint32(28, buffer.sampleRate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, "data");
  v.setUint32(40, data.length * 2, true);
  for (let i = 0; i < data.length; i++) {
    const n = clamp(data[i], -1, 1);
    v.setInt16(44 + i * 2, n < 0 ? n * 32768 : n * 32767, true);
  }
  return new Blob([out], { type: "audio/wav" });
}
export class BackgroundRemover {
  constructor() {
    this.worker = null;
    this.pending = new Map();
    this.next = 0;
  }
  request(bitmap) {
    this.worker ??= new Worker(
      new URL("./segment-worker.js", import.meta.url),
      { type: "module" },
    );
    this.worker.onmessage = ({ data }) => {
      const p = this.pending.get(data.id);
      if (!p) {
        data.foreground?.close();
        return;
      }
      this.pending.delete(data.id);
      clearTimeout(p.timer);
      data.error
        ? p.reject(Error(data.error))
        : p.resolve(data.foreground || true);
    };
    this.worker.onerror = (e) => {
      for (const p of this.pending.values()) {
        clearTimeout(p.timer);
        p.reject(Error(e.message || "Background removal could not start."));
      }
      this.pending.clear();
      this.worker.terminate();
      this.worker = null;
    };
    return new Promise((resolve, reject) => {
      const id = ++this.next,
        timer = setTimeout(() => {
          this.pending.delete(id);
          reject(
            Error(
              "Background removal took too long. Try the rounded frame instead.",
            ),
          );
        }, 45000);
      this.pending.set(id, { resolve, reject, timer });
      this.worker.postMessage({ id, bitmap }, bitmap ? [bitmap] : []);
    });
  }
  ready() {
    return this.request();
  }
  async process(source) {
    const w = source.videoWidth || source.width,
      h = source.videoHeight || source.height;
    const bitmap = await createImageBitmap(source, {
      resizeWidth: Math.min(640, w),
      resizeHeight: Math.round((h * Math.min(640, w)) / w),
      resizeQuality: "high",
    });
    return this.request(bitmap);
  }
  close() {
    this.worker?.terminate();
    this.worker = null;
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(Error("Background removal stopped."));
    }
    this.pending.clear();
  }
}
export function drawPresenter(ctx, image, settings, opacity = 1) {
  if (!image || settings.background === "none") return;
  const { x, y, w, h } = overlayRect(
      ctx.canvas.width,
      ctx.canvas.height,
      Number(settings.size),
      settings.position,
    ),
    iw = image.videoWidth || image.width,
    ih = image.videoHeight || image.height;
  if (!iw || !ih) return;
  ctx.save();
  ctx.globalAlpha = clamp(opacity, 0, 1);
  ctx.translate(x, y);
  if (settings.background === "card") {
    ctx.beginPath();
    ctx.roundRect(0, 0, w, h, w * 0.08);
    ctx.clip();
  }
  if (settings.mirror) {
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
  }
  // A centred portrait crop makes a presenter readable without a wide webcam box.
  const scale = Math.max(w / iw, h / ih);
  ctx.drawImage(
    image,
    (w - iw * scale) / 2,
    (h - ih * scale) / 2,
    iw * scale,
    ih * scale,
  );
  ctx.restore();
}
export async function exportFilm({
  project,
  takes,
  baseBlob,
  resolution = 1080,
  canvas,
  remover,
  signal,
  onProgress,
}) {
  const source = mediaInput(baseBlob),
    opened = [source],
    iterators = [];
  let output;
  const check = () => {
    if (signal?.aborted)
      throw new DOMException("Export canceled.", "AbortError");
  };
  try {
    const videoTrack = await source.getPrimaryVideoTrack();
    if (!videoTrack || !(await videoTrack.canDecode()))
      throw Error(
        "This browser cannot decode the visual video. Try current Chrome or Edge.",
      );
    const w = Math.round((resolution * 16) / 9 / 2) * 2,
      h = resolution,
      fps = 30,
      total = Math.ceil(project.duration * fps);
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { alpha: false });
    const mp4 =
      (await M.canEncodeVideo("avc", { width: w, height: h })) &&
      (await M.canEncodeAudio("aac", {
        numberOfChannels: 1,
        sampleRate: 48000,
      }));
    if (
      !mp4 &&
      !(
        (await M.canEncodeVideo("vp9", { width: w, height: h })) &&
        (await M.canEncodeAudio("opus"))
      )
    )
      throw Error(
        "Video encoding is unavailable here. Use current Chrome or Edge; you can still download your voice and original takes.",
      );
    const format = mp4
        ? new M.Mp4OutputFormat({ fastStart: "in-memory" })
        : new M.WebMOutputFormat(),
      target = new M.BufferTarget();
    output = new M.Output({ format, target });
    const videoSource = new M.CanvasSource(canvas, {
        codec: mp4 ? "avc" : "vp9",
        bitrate: resolution === 1080 ? 6_000_000 : 3_000_000,
        keyFrameInterval: 2,
      }),
      audioSource = new M.AudioBufferSource({
        codec: mp4 ? "aac" : "opus",
        bitrate: 160000,
      });
    output.addVideoTrack(videoSource, { frameRate: fps });
    output.addAudioTrack(audioSource);
    output.setMetadataTags({
      title: project.title,
      comment: "Human-recorded narration. Original playback timing.",
    });
    onProgress(0.01, "Aligning voice takes…");
    const audio = await mixNarration(project, takes, () => check());
    check();
    const first = await source.getFirstTimestamp();
    const timestamps = function* (start, count) {
      for (let n = 0; n < count; n++) yield start + n / fps;
    };
    const baseFrames = new M.CanvasSink(videoTrack, {
      width: w,
      height: h,
      fit: "contain",
    }).canvasesAtTimestamps(timestamps(first, total));
    iterators.push(baseFrames);
    const cameras = [];
    for (let i = 0; i < project.chapters.length; i++) {
      const take = takes.find((t) => t.id === project.selected?.[i]);
      if (
        !take?.hasVideo ||
        take.showCamera === false ||
        project.settings.background === "none"
      )
        continue;
      const plan = takePlan(project.chapters[i], take),
        input = mediaInput(take.blob);
      opened.push(input);
      const track = await input.getPrimaryVideoTrack();
      if (!track || !(await track.canDecode()))
        throw Error(`Chapter ${i + 1}: the camera take cannot be decoded.`);
      const startFrame = Math.ceil(plan.start * fps),
        endFrame = Math.min(total, Math.ceil(plan.end * fps)),
        origin = await input.getFirstTimestamp();
      const times = function* () {
        for (let n = startFrame; n < endFrame; n++)
          yield Math.max(origin, origin + plan.trimIn + n / fps - plan.start);
      };
      const frames = new M.CanvasSink(track, {
        width: 640,
      }).canvasesAtTimestamps(times());
      iterators.push(frames);
      cameras.push({ startFrame, endFrame, frames, plan });
    }
    if (cameras.length && project.settings.background === "remove") {
      onProgress(0.03, "Preparing background removal on your device…");
      await remover.ready();
      check();
    }
    await output.start();
    await audioSource.add(audio);
    audioSource.close();
    let current = 0;
    for (let n = 0; n < total; n++) {
      check();
      const frame = (await baseFrames.next()).value;
      if (!frame) throw Error(`Visual frame ${n + 1} could not be decoded.`);
      ctx.fillStyle = "#080b0b";
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(frame.canvas, 0, 0, w, h);
      while (current < cameras.length && n >= cameras[current].endFrame)
        current++;
      const cam = cameras[current];
      if (cam && n >= cam.startFrame && n < cam.endFrame) {
        const shot = (await cam.frames.next()).value;
        if (shot) {
          let presenter = shot.canvas;
          try {
            if (project.settings.background === "remove")
              presenter = await remover.process(shot.canvas);
            const alpha = edgeGain(
              n / fps - cam.plan.start,
              cam.plan.length,
              0.1,
            );
            drawPresenter(ctx, presenter, project.settings, alpha);
          } finally {
            if (presenter !== shot.canvas) presenter.close();
          }
        }
      }
      await videoSource.add(
        n / fps,
        Math.min(1 / fps, project.duration - n / fps),
      );
      if (n % 15 === 0) {
        onProgress(
          0.05 + (0.92 * n) / total,
          `Composing ${Math.floor(n / fps)} / ${Math.round(project.duration)} seconds`,
        );
        await new Promise((r) => setTimeout(r, 0));
      }
    }
    videoSource.close();
    check();
    onProgress(0.98, "Finishing your video…");
    await output.finalize();
    onProgress(1, "Your video is ready.");
    return {
      blob: new Blob([target.buffer], {
        type: mp4 ? "video/mp4" : "video/webm",
      }),
      extension: mp4 ? "mp4" : "webm",
      audio,
    };
  } catch (e) {
    if (output)
      try {
        await output.cancel();
      } catch {}
    throw e;
  } finally {
    for (const it of iterators)
      try {
        await it.return();
      } catch {}
    for (const input of opened) input.dispose();
  }
}
