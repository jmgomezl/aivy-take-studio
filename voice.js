// Copyright (c) 2026 Juanma Gomez. All rights reserved.
// SPDX-License-Identifier: LicenseRef-Take-Studio-Proprietary
import { takePlan, clamp } from "./core.js";
export const isVoice = (p) => p?.workflow === "voice";
export function scriptChapters(script) {
  const text = String(script).trim();
  const paragraphs = text
    .split(/^#{1,3}\s+/m.test(text) ? /\n(?=#{1,3}\s+)/ : /\n\s*\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (paragraphs.length > 100)
    throw Error("Use up to 100 sections. Separate them with a blank line.");
  let at = 0;
  return (paragraphs.length ? paragraphs : [""]).map((text, i) => {
    const lines = text.split("\n");
    const heading = /^#{1,3}\s+/.test(lines[0]);
    const title = heading
      ? lines.shift().replace(/^#{1,3}\s+/, "")
      : `Section ${i + 1}`;
    const words = lines.join("\n");
    const estimate = Math.max(
      5,
      Math.ceil(words.trim().split(/\s+/).filter(Boolean).length / 2.2),
    );
    const start = at;
    at += estimate;
    if (at > 1200)
      throw Error(
        "This script is longer than the 20-minute project limit. Split it into projects.",
      );
    return {
      start,
      end: at,
      title: title.slice(0, 180),
      script: words,
      direction: "Speak naturally. Stop when you’re done.",
      estimate,
      visuals: [{ at: 0, asset: "", source: 0, hold: false }],
    };
  });
}
export function reflowVoice(project, takes) {
  if (!isVoice(project)) return;
  let at = 0;
  const chapters = project.chapters.map((c, i) => {
    const t = takes.find((t) => t.id === project.selected?.[i]);
    let length = c.estimate || c.end - c.start;
    if (t) {
      const p = takePlan({ start: 0, end: 1200 }, t);
      length = Math.max(0.25, p.offset + p.length);
    }
    const start = at;
    at += length;
    return { ...c, start, end: at };
  });
  if (at > 1200)
    throw Error(
      "This project exceeds 20 minutes. Trim the selected take or use a shorter one.",
    );
  project.chapters = chapters;
  project.duration = at;
}
export function visualPlan(project) {
  const result = [];
  for (const [i, c] of project.chapters.entries()) {
    const duration = c.end - c.start;
    const cues = c.visuals?.length
      ? c.visuals
      : [{ at: 0, asset: "", source: 0, hold: false }];
    let previous = -1;
    for (const [j, cue] of cues.entries()) {
      const at = Number(cue.at),
        end = j + 1 < cues.length ? Number(cues[j + 1].at) : duration;
      if (
        !Number.isFinite(at) ||
        !Number.isFinite(end) ||
        at < 0 ||
        at <= previous ||
        (j === 0 && at !== 0) ||
        end - at < 0.1 ||
        end > duration + 0.001
      )
        throw Error(
          `Section ${i + 1}: keep visual cues in order, starting at 0 and inside the section.`,
        );
      const asset = (project.assets || []).find((a) => a.id === cue.asset);
      if (cue.asset && !asset)
        throw Error(`Section ${i + 1}: a demo clip is missing.`);
      const source = Number(cue.source || 0);
      if (
        !Number.isFinite(source) ||
        source < 0 ||
        (asset && source >= asset.duration)
      )
        throw Error(`Section ${i + 1}: choose a start inside the demo clip.`);
      if (asset && source + end - at > asset.duration + 0.04 && !cue.hold)
        throw Error(
          `Section ${i + 1}: the clip is too short. Choose an earlier start, add another cue, or enable Hold last frame.`,
        );
      result.push({
        start: c.start + at,
        end: c.start + end,
        source,
        asset,
        title: c.title,
        section: i,
        hold: !!cue.hold,
      });
      previous = at;
    }
  }
  return result;
}
export function transcriptCues(chunks, take) {
  const from = Number(take.trimIn || 0),
    to = Number(take.trimOut ?? take.duration);
  return (Array.isArray(chunks) ? chunks : [])
    .filter((c) => c && typeof c === "object")
    .map((c, originalIndex) => ({ ...c, originalIndex }))
    .filter(
      (c) =>
        Array.isArray(c.timestamp) &&
        Number.isFinite(c.timestamp[0]) &&
        c.timestamp[0] < to &&
        (c.timestamp[1] ?? take.duration) > from,
    )
    .map((c) => ({
      at: clamp(c.timestamp[0] - from, 0, to - from) + Number(take.offset || 0),
      end:
        clamp(c.timestamp[1] ?? take.duration, from, to) -
        from +
        Number(take.offset || 0),
      originalIndex: c.originalIndex,
      text: String(c.text || "").trim(),
    }));
}
export function drawTitle(ctx, w, h, title) {
  ctx.fillStyle = "#101716";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#afe4cc";
  ctx.fillRect(w * 0.085, h * 0.32, w * 0.045, Math.max(3, h * 0.005));
  ctx.fillStyle = "#e8eeeb";
  ctx.font = `500 ${Math.round(h * 0.062)}px sans-serif`;
  const words = String(title).split(/\s+/);
  let line = "",
    y = h * 0.45;
  for (const word of words) {
    const next = (line + " " + word).trim();
    if (ctx.measureText(next).width > w * 0.75 && line) {
      ctx.fillText(line, w * 0.085, y);
      y += h * 0.09;
      line = word;
    } else line = next;
    if (y > h * 0.75) break;
  }
  ctx.fillText(line, w * 0.085, y);
}

// Keep word-aligned timestamps readable as short, editable phrases.
export function phraseTranscript(words, duration) {
  const phrases = [];
  let group = null,
    count = 0;
  for (const word of words || []) {
    if (!Array.isArray(word.timestamp) || !Number.isFinite(word.timestamp[0]))
      continue;
    const start = clamp(word.timestamp[0], 0, duration),
      end = clamp(word.timestamp[1] ?? duration, start, duration);
    if (!group) {
      group = { timestamp: [start, end], text: "" };
      count = 0;
    }
    group.text += (group.text ? " " : "") + String(word.text || "").trim();
    group.timestamp[1] = end;
    count++;
    if (
      count >= 7 ||
      end - group.timestamp[0] >= 4 ||
      /[.!?]$/.test(group.text)
    ) {
      phrases.push(group);
      group = null;
    }
  }
  if (group) phrases.push(group);
  return phrases;
}
