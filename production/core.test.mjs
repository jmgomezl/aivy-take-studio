import test from "node:test";
import assert from "node:assert/strict";
import {
  validateTimeline,
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
