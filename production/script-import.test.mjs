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
