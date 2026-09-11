import test from "node:test";
import assert from "node:assert/strict";
import {
  validateTimeline,
  refreshPreset,
  takePlan,
  voiceGain,
  edgeGain,
  overlayRect,
} from "../core.js";
test("a chapter script cannot create overlapping or missing narration slots", () => {
  const raw = {
    chapters: [
      { start: 0, end: 2 },
      { start: 2, end: 5 },
    ],
  };
  assert.equal(validateTimeline(raw, 5).chapters.length, 2);
  for (const chapters of [
    [
      { start: 0, end: 3 },
      { start: 2, end: 5 },
    ],
    [
      { start: 0, end: 2 },
      { start: 3, end: 5 },
    ],
    [{ start: 0, end: 6 }],
  ])
    assert.throws(() => validateTimeline({ chapters }, 5));
});
test("trimming preserves playback speed and respects the fixed chapter boundary", () => {
  const c = { start: 16, end: 27 };
  assert.deepEqual(
    takePlan(c, { duration: 14, trimIn: 3, trimOut: 12, offset: 1 }),
    { start: 17, end: 26, trimIn: 3, trimOut: 12, length: 9, offset: 1 },
  );
  assert.throws(() => takePlan(c, { duration: 14, trimIn: 0, trimOut: 14 }));
  assert.throws(() =>
    takePlan(c, { duration: 14, trimIn: 0, trimOut: 10, offset: 2 }),
  );
  assert.throws(() => takePlan(c, { duration: 14, trimIn: 5, trimOut: 3 }));
});
test("voice normalization leaves silence alone and never boosts beyond 6 dB or clips peaks", () => {
  assert.equal(voiceGain(new Float32Array(4800)), 1);
  assert.equal(voiceGain(new Float32Array(4800).fill(0.02)), 2);
  const samples = new Float32Array(4800).fill(0.01);
  samples[50] = 1;
  assert(voiceGain(samples) <= 0.88);
});
test("short fades reach silence at clip boundaries and full voice inside", () => {
  assert.equal(edgeGain(0, 4), 0);
  assert.equal(edgeGain(4, 4), 0);
  assert.equal(edgeGain(0.05, 4), 1);
  assert.equal(edgeGain(2, 4), 1);
});
test("presenter remains inside the video at both corners and every allowed size", () => {
  for (const width of [1280, 1920])
    for (const position of ["left", "right"])
      for (const size of [0.15, 0.25, 0.4]) {
        const r = overlayRect(width, (width * 9) / 16, size, position);
        assert(
          r.x >= 0 &&
            r.y >= 0 &&
            r.x + r.w <= width &&
            r.y + r.h <= (width * 9) / 16,
        );
      }
});

import { readFileSync } from "node:fs";
const sampleUpdate = JSON.parse(readFileSync(new URL("../presets/quorum/update.json", import.meta.url)));
const sampleTimeline = JSON.parse(readFileSync(new URL("../presets/quorum/timeline.json", import.meta.url)));
function originalSample() {
  const p = { ...validateTimeline(sampleTimeline, sampleTimeline.duration),
    id: sampleUpdate.projectId, updatedAt: 123,
    selected: { 7: "saved-take-8", 12: "saved-take-13" },
    settings: { mic: "chosen-mic", camera: true, polish: false } };
  for (const patch of sampleUpdate.patches) p.chapters[patch.index][patch.field] = patch.previous;
  return p;
}
test("sample refresh preserves recording choices, custom fields, timings and project recency", () => {
  const original = originalSample();
  const before = structuredClone(original);
  const result = refreshPreset(original, sampleUpdate);
  assert.deepEqual(original, before);
  assert.equal(result.selected, original.selected);
  assert.equal(result.settings, original.settings);
  assert.equal(result.updatedAt, original.updatedAt);
  assert.equal(result.id, original.id);
  assert.deepEqual(result.chapters.map(c => [c.start, c.end]), sampleUpdate.boundaries);
  for (const patch of sampleUpdate.patches)
    assert.equal(result.chapters[patch.index][patch.field], patch.value);
  assert.equal(refreshPreset(result, sampleUpdate), result);
});
test("sample refresh never replaces a user's rewritten narration or delivery notes", () => {
  const p = originalSample();
  p.chapters[7].script = "My personal narration.";
  p.chapters[12].direction = "Pause here.";
  const result = refreshPreset(p, sampleUpdate);
  assert.equal(result.chapters[7].script, "My personal narration.");
  assert.equal(result.chapters[12].direction, "Pause here.");
  assert.equal(result.chapters[12].script, sampleTimeline.chapters[12].script);
});
test("sample refresh leaves custom projects, uploaded video and changed chapter timing alone", () => {
  for (const change of [p => p.id = "my-project", p => p.videoBlob = new Blob(["user video"]),
    p => p.chapters[7].start++, p => p.chapters.pop(), p => p.duration++]) {
    const p = originalSample();
    change(p);
    assert.equal(refreshPreset(p, sampleUpdate), p);
  }
});
