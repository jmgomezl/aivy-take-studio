// Copyright (c) 2026 Juanma Gomez. All rights reserved.
// SPDX-License-Identifier: LicenseRef-Take-Studio-Proprietary
import { scriptChapters, reflowVoice } from "./voice.js";
export const SCRIPT_FILE_LIMIT = 1024 * 1024;
export function parseScriptFile(name, source) {
  if (!/\.(txt|md|markdown|json)$/i.test(name))
    throw Error("Choose a TXT, Markdown (.md), or chapter JSON file.");
  const text = source
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .trim();
  if (!text) throw Error("This script file is empty.");
  if (text.length > 100000)
    throw Error("Use a script with at most 100,000 characters.");
  if (text.includes("\0"))
    throw Error("Choose a text script, not a binary document.");
  let title = name.replace(/\.[^.]+$/, "").slice(0, 180),
    chapters;
  if (/\.json$/i.test(name)) {
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw Error("Invalid JSON. Use a chapter file with a chapters array.");
    }
    if (!data || !Array.isArray(data.chapters))
      throw Error(
        "The JSON needs a chapters array containing title and script fields.",
      );
    if (data.title !== undefined) {
      if (typeof data.title !== "string" || data.title.length > 180)
        throw Error("Project title must be text, up to 180 characters.");
      title = data.title.trim() || title;
    }
    chapters = data.chapters;
  } else chapters = scriptChapters(text);
  if (!chapters.length || chapters.length > 100)
    throw Error("Use between 1 and 100 sections.");
  let at = 0;
  chapters = chapters.map((c, i) => {
    if (!c || typeof c.script !== "string")
      throw Error(`Section ${i + 1} needs a text script.`);
    for (const [key, max] of [
      ["script", 20000],
      ["title", 180],
      ["direction", 1000],
    ]) {
      if (
        c[key] !== undefined &&
        (typeof c[key] !== "string" || c[key].length > max)
      )
        throw Error(
          `Section ${i + 1}: ${key} must be text, up to ${max.toLocaleString()} characters.`,
        );
    }
    const script = c.script.trim();
    if (!script) throw Error(`Section ${i + 1} has no spoken text.`);
    const estimate = Math.max(5, Math.ceil(script.split(/\s+/).length / 2.2));
    const start = at;
    at += estimate;
    if (at > 1200)
      throw Error(
        "This script exceeds the 20-minute estimate. Split it into projects.",
      );
    return {
      title: c.title?.trim() || `Section ${i + 1}`,
      script,
      direction: c.direction ?? "Speak naturally. Stop when you’re done.",
      start,
      end: at,
      estimate,
      visuals: [{ at: 0, asset: "", source: 0, hold: false }],
    };
  });
  return {
    title,
    chapters,
    preview: chapters.map((c) => `# ${c.title}\n${c.script}`).join("\n\n"),
  };
}
export async function readScriptFile(file) {
  if (file.size > SCRIPT_FILE_LIMIT)
    throw Error("Choose a script file smaller than 1 MB.");
  return parseScriptFile(file.name, await file.text());
}

// Keep existing chapter indexes stable: takes and visual cues refer to them.
export function mergeScriptSections(project, imported, takes = []) {
  if (project.workflow !== "voice")
    throw Error(
      "Whole-script import into an existing project needs Voice first.",
    );
  const candidate = structuredClone(project);
  const normalize = (value) =>
    String(value || "")
      .trim()
      .replace(/\s+/g, " ")
      .toLowerCase();
  const used = new Set();
  let added = 0,
    kept = 0;
  const entries = [];
  for (const c of imported.chapters) {
    const match = candidate.chapters.findIndex(
      (old, i) =>
        !used.has(i) &&
        (normalize(old.script) === normalize(c.script) ||
          normalize(old.title) === normalize(c.title)),
    );
    if (match >= 0) {
      used.add(match);
      kept++;
      entries.push({ title: candidate.chapters[match].title, kept: true });
      continue;
    }
    const blank = candidate.chapters.findIndex(
      (old, i) =>
        !used.has(i) &&
        !old.script.trim() &&
        !takes.some((t) => t.chapter === i) &&
        !candidate.selected?.[i] &&
        !old.visuals?.some((v) => v.asset),
    );
    const at = blank >= 0 ? blank : candidate.chapters.length;
    candidate.chapters[at] = structuredClone(c);
    used.add(at);
    added++;
    entries.push({ title: c.title, kept: false });
  }
  if (candidate.chapters.length > 100)
    throw Error("Maximum 100 sections. Use a new project for this script.");
  reflowVoice(candidate, takes);
  return { project: candidate, added, kept, entries };
}
