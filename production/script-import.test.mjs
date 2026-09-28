import test from "node:test";
import assert from "node:assert/strict";
import {
  parseScriptFile,
  readScriptFile,
  SCRIPT_FILE_LIMIT,
} from "../script-import.js";
test("plain text normalizes BOM and CRLF and splits paragraphs", () => {
  const p = parseScriptFile(
    "story.TXT",
    "\uFEFFHello world.\r\n\r\nShow the product.",
  );
  assert.equal(p.title, "story");
  assert.equal(p.chapters.length, 2);
  assert.equal(p.chapters[1].script, "Show the product.");
  assert.equal(p.chapters[1].start, 5);
});
test("Markdown headings name sections and retain paragraphs within them", () => {
  const p = parseScriptFile(
    "demo.md",
    "# Problem\nHello.\n\nMore words.\n\n## Solution\nSee it work.",
  );
  assert.deepEqual(
    p.chapters.map((c) => c.title),
    ["Problem", "Solution"],
  );
  assert.equal(p.chapters[0].script, "Hello.\n\nMore words.");
});
test("chapter JSON keeps narrative metadata but never imports timing, selections or visuals", () => {
  const p = parseScriptFile(
    "demo.json",
    JSON.stringify({
      title: "Story",
      chapters: [
        {
          title: "Opening",
          script: "Hello there.",
          direction: "Smile",
          start: 500,
          end: 900,
          visuals: [{ asset: "foreign" }],
        },
      ],
      selected: { 0: "foreign" },
    }),
  );
  assert.equal(p.title, "Story");
  assert.equal(p.chapters[0].direction, "Smile");
  assert.equal(p.chapters[0].start, 0);
  assert.equal(p.chapters[0].end, 5);
  assert.equal(p.chapters[0].visuals[0].asset, "");
  assert.equal(p.selected, undefined);
});
test("rejects malformed, unsupported, empty and non-text scripts", () => {
  for (const [name, text] of [
    ["x.json", "{"],
    ["x.json", "[]"],
    ["x.json", '{"chapters":[]}'],
    ["x.json", '{"chapters":[{"script":4}]}'],
    ["x.md", "# Empty"],
    ["x.txt", " "],
    ["x.txt", "a\0b"],
    ["x.docx", "hello"],
  ])
    assert.throws(() => parseScriptFile(name, text));
});
test("enforces section, field and total duration limits", () => {
  assert.throws(
    () => parseScriptFile("x.txt", Array(101).fill("hello").join("\n\n")),
    /100/,
  );
  for (const [key, max] of [
    ["title", 180],
    ["direction", 1000],
    ["script", 20000],
  ])
    assert.throws(
      () =>
        parseScriptFile(
          "x.json",
          JSON.stringify({
            chapters: [{ script: "Hello", [key]: "x".repeat(max + 1) }],
          }),
        ),
      /characters/,
    );
  assert.throws(
    () => parseScriptFile("x.txt", "word ".repeat(2800)),
    /20-minute/,
  );
  assert.throws(() => parseScriptFile("x.txt", "x".repeat(100001)), /100,000/);
});
test("rejects oversized files before reading their contents", async () => {
  let read = false;
  await assert.rejects(
    () =>
      readScriptFile({
        size: SCRIPT_FILE_LIMIT + 1,
        text: () => {
          read = true;
        },
      }),
    /1 MB/,
  );
  assert.equal(read, false);
});

import { mergeScriptSections } from "../script-import.js";
const sample = () =>
  parseScriptFile(
    "script.md",
    "# Opening\n\nHello there.\n\n# Demo\n\nShow the product.\n\n# Closing\n\nTry it yourself.",
  );
const project = () => ({
  id: "existing",
  workflow: "voice",
  chapters: [sample().chapters[0]],
  selected: { 0: "take4" },
  assets: [],
  settings: { camera: true },
});
test("whole script adds missing sections and keeps all existing take indexes and choices", () => {
  const p = project();
  const original = structuredClone(p);
  const takes = Array.from({ length: 4 }, (_, i) => ({
    id: `take${i + 1}`,
    chapter: 0,
    duration: 15.5,
    trimIn: 0,
    trimOut: 15.5,
    offset: 0,
  }));
  const plan = mergeScriptSections(p, sample(), takes);
  assert.equal(plan.added, 2);
  assert.equal(plan.kept, 1);
  assert.equal(plan.project.chapters.length, 3);
  assert.deepEqual(p, original);
  assert.deepEqual(plan.project.selected, { 0: "take4" });
  assert.equal(plan.project.chapters[0].end, 15.5);
  assert.equal(plan.project.chapters[1].start, 15.5);
  assert.equal(takes.length, 4);
  assert.ok(takes.every((t) => t.chapter === 0));
  assert.equal(mergeScriptSections(plan.project, sample(), takes).added, 0);
});
test("matching edited titles or narration keeps existing scripts and visual cues", () => {
  const p = project();
  p.chapters[0].script = "Personal rewrite.";
  p.chapters[0].visuals = [{ at: 0, asset: "clip", source: 2 }];
  const plan = mergeScriptSections(p, sample());
  assert.equal(plan.project.chapters[0].script, "Personal rewrite.");
  assert.equal(plan.project.chapters[0].visuals[0].asset, "clip");
  assert.equal(plan.kept, 1);
});
test("replaces only an unrecorded empty placeholder and rejects non-voice projects", () => {
  const p = {
    workflow: "voice",
    chapters: [{ title: "Section 1", script: "", start: 0, end: 5 }],
    selected: {},
  };
  assert.equal(mergeScriptSections(p, sample()).project.chapters.length, 3);
  assert.equal(
    mergeScriptSections(p, sample(), [{ id: "saved", chapter: 0 }]).project
      .chapters.length,
    4,
  );
  assert.throws(
    () => mergeScriptSections({ ...p, workflow: "video" }, sample()),
    /Voice first/,
  );
});
test("failed duration or section-limit merge leaves project unchanged", () => {
  const p = project();
  const before = structuredClone(p);
  assert.throws(
    () =>
      mergeScriptSections(p, sample(), [
        {
          id: "take4",
          chapter: 0,
          duration: 1200,
          trimIn: 0,
          trimOut: 1200,
          offset: 0,
        },
      ]),
    /20 minutes/,
  );
  assert.deepEqual(p, before);
  const many = {
    ...p,
    chapters: Array.from({ length: 100 }, (_, i) => ({
      ...sample().chapters[0],
      title: `Unique ${i}`,
      script: `unique text ${i}`,
    })),
    selected: {},
  };
  assert.throws(() => mergeScriptSections(many, sample()), /100/);
});
