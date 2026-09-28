import test from "node:test";
import assert from "node:assert/strict";
import {
  scriptChapters,
  reflowVoice,
  visualPlan,
  transcriptCues,
  phraseTranscript,
} from "../voice.js";
const take = (id, duration, trimIn = 0, trimOut = duration) => ({
  id,
  duration,
  trimIn,
  trimOut,
  offset: 0,
});
function project() {
  const chapters = scriptChapters(
    "# Opening\nStart with the problem.\n\n# Demo\nShow the solution.",
  );
  return {
    workflow: "voice",
    chapters,
    duration: chapters.at(-1).end,
    selected: {},
    assets: [],
  };
}
test("script sections start estimated, chosen narration defines timing without truncation", () => {
  const p = project();
  p.selected = { 0: "long", 1: "short" };
  reflowVoice(p, [take("long", 50, 1, 41), take("short", 8)]);
  assert.equal(p.chapters[0].end, 40);
  assert.equal(p.chapters[1].start, 40);
  assert.equal(p.duration, 48);
  assert.equal(p.chapters[0].title, "Opening");
  p.selected[0] = "retake";
  reflowVoice(p, [take("retake", 10), take("short", 8)]);
  assert.equal(p.duration, 18);
  assert.equal(p.chapters[1].start, 10);
});
test("reflow rejects malformed and oversized takes without changing chapter timing", () => {
  const p = project(),
    before = structuredClone(p.chapters);
  p.selected = { 0: "bad" };
  assert.throws(() => reflowVoice(p, [take("bad", 10, 7, 2)]), /trim/);
  assert.deepEqual(p.chapters, before);
  assert.throws(() => reflowVoice(p, [take("bad", 1200)]), /20 minutes/);
  assert.deepEqual(p.chapters, before);
});
test("video-first projects remain unchanged", () => {
  const p = project();
  delete p.workflow;
  const before = structuredClone(p);
  reflowVoice(p, [take("x", 80)]);
  assert.deepEqual(p, before);
});
test("a visual cue cannot hide missing footage, overlap, or silently loop a short clip", () => {
  const p = project();
  p.assets = [{ id: "clip", duration: 3 }];
  p.chapters[0].visuals = [{ at: 0, asset: "clip", source: 0 }];
  assert.throws(() => visualPlan(p), /too short/);
  p.chapters[0].visuals[0].hold = true;
  assert.equal(visualPlan(p)[0].hold, true);
  p.chapters[0].visuals.push({ at: 0, asset: "" });
  assert.throws(() => visualPlan(p), /order/);
  p.chapters[0].visuals = [{ at: 0, asset: "absent" }];
  assert.throws(() => visualPlan(p), /missing/);
  p.chapters[0].visuals = [{ at: 0, asset: "clip", source: 3, hold: true }];
  assert.throws(() => visualPlan(p), /inside/);
});
test("visual cuts retain original speed with exact relative clip starts", () => {
  const p = project();
  p.assets = [{ id: "clip", duration: 20 }];
  p.chapters[0].visuals = [
    { at: 0, asset: "" },
    { at: 2, asset: "clip", source: 7 },
  ];
  const slots = visualPlan(p);
  assert.equal(slots[0].end, 2);
  assert.equal(slots[1].start, 2);
  assert.equal(slots[1].source, 7);
  assert.equal(slots[1].end, 5);
});
test("transcript cues follow trims and lead-in, excluding removed speech", () => {
  const t = { ...take("a", 12, 3, 10), offset: 1 };
  const cues = transcriptCues(
    [
      { timestamp: [0, 2], text: "removed" },
      { timestamp: [2, 6], text: " first " },
      { timestamp: [6, null], text: "second" },
    ],
    t,
  );
  assert.deepEqual(
    cues.map(({ at, end, text }) => ({ at, end, text })),
    [
      { at: 1, end: 4, text: "first" },
      { at: 4, end: 8, text: "second" },
    ],
  );
});
test("cue points outside a shorter retake require explicit repair", () => {
  const p = project();
  p.chapters[0].visuals.push({ at: 4, asset: "" });
  p.selected = { 0: "short" };
  reflowVoice(p, [take("short", 2)]);
  assert.throws(() => visualPlan(p), /order/);
});

test("word timestamps become short phrases without changing their audio position", () => {
  const words = Array.from({ length: 10 }, (_, i) => ({
    timestamp: [i * 0.5, (i + 1) * 0.5],
    text: "word",
  }));
  const phrases = phraseTranscript(words, 5);
  assert.equal(phrases.length, 2);
  assert.deepEqual(phrases[0].timestamp, [0, 3.5]);
  assert.deepEqual(phrases[1].timestamp, [3.5, 5]);
});

test("Markdown headings keep their paragraphs together", () => {
  const c = scriptChapters(
    "# Opening\n\nOne thought.\n\nAnother thought.\n\n# Demo\n\nShow the product.",
  );
  assert.equal(c.length, 2);
  assert.match(c[0].script, /Another thought/);
  assert.equal(c[1].title, "Demo");
});
