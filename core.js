export const clamp = (n, low, high) => Math.max(low, Math.min(high, n));
export function clock(seconds, decimal = false) {
  seconds = Math.max(0, seconds || 0);
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(Math.floor(seconds) % 60).padStart(2, "0")}${decimal ? "." + (Math.floor(seconds * 10) % 10) : ""}`;
}
export function validateTimeline(raw, duration) {
  if (
    !raw ||
    !Array.isArray(raw.chapters) ||
    !raw.chapters.length ||
    raw.chapters.length > 100
  )
    throw Error("Use a script with 1–100 chapters.");
  if (!Number.isFinite(duration) || duration <= 0 || duration > 1200)
    throw Error("Choose a video up to 20 minutes long.");
  let previous = 0;
  const chapters = raw.chapters.map((c, i) => {
    const start = Number(c.start),
      end = Number(c.end);
    if (
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      Math.abs(start - previous) > 0.04 ||
      end - start < 0.25 ||
      end > duration + 0.06
    )
      throw Error(
        `Chapter ${i + 1}: use consecutive start/end times within the video.`,
      );
    previous = end;
    return {
      start,
      end,
      title: String(c.title || `Chapter ${i + 1}`).slice(0, 180),
      script: String(c.script || "").slice(0, 20000),
      direction: String(c.direction || "").slice(0, 1000),
    };
  });
  if (Math.abs(previous - duration) > 0.06)
    throw Error("The last chapter must end at the end of the video.");
  return {
    title: String(raw.title || "My demo").slice(0, 180),
    duration,
    chapters,
  };
}
export function takePlan(chapter, take) {
  const trimIn = Number(take.trimIn || 0),
    trimOut = Number(take.trimOut ?? take.duration),
    offset = Number(take.offset || 0),
    length = trimOut - trimIn;
  if (
    ![trimIn, trimOut, offset, take.duration].every(Number.isFinite) ||
    trimIn < 0 ||
    trimOut > take.duration + 0.025 ||
    length < 0.1 ||
    offset < 0
  )
    throw Error("Choose valid trim points for this take.");
  if (length + offset > chapter.end - chapter.start + 0.04)
    throw Error(
      "This take is longer than the chapter. Trim it or record a shorter take.",
    );
  return {
    start: chapter.start + offset,
    end: chapter.start + offset + length,
    trimIn,
    trimOut,
    length,
    offset,
  };
}
// Voice-aware gain: ignore silence, limit boost to 6 dB and keep peak headroom.
export function voiceGain(samples) {
  let peak = 0,
    sum = 0,
    count = 0;
  for (let i = 0; i < samples.length; i++) {
    const x = Math.abs(samples[i]);
    peak = Math.max(peak, x);
    if (x > 0.006) {
      sum += x * x;
      count++;
    }
  }
  if (!count || peak < 0.008) return 1;
  return Math.min(2, 0.1 / Math.sqrt(sum / count), 0.88 / peak);
}
export function edgeGain(time, duration, fade = 0.025) {
  return clamp(Math.min(time / fade, (duration - time) / fade), 0, 1);
}
export function overlayRect(width, height, size = 0.25, position = "left") {
  const w = width * clamp(size, 0.15, 0.4),
    h = w * 1.12,
    gap = width * 0.02;
  return {
    x: position === "right" ? width - w - gap : gap,
    y: height - h - gap,
    w,
    h,
  };
}
export function safeName(s) {
  return (
    String(s)
      .replace(/[^a-z0-9_-]/gi, "-")
      .replace(/-+/g, "-")
      .slice(0, 80) || "my-demo"
  );
}
