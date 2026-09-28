// Copyright (c) 2026 Juanma Gomez. All rights reserved.
// SPDX-License-Identifier: LicenseRef-Take-Studio-Proprietary
import {
  isVoice,
  reflowVoice,
  visualPlan,
  transcriptCues,
  drawTitle,
} from "./voice.js";
import { clock } from "./core.js";
import { inspectMedia, decodeTake } from "./media.js?v=20260927-voice";
const $ = (id) => document.getElementById(id);
export function setupVoice(api) {
  let worker,
    cancelJob,
    visualKey = "",
    visualGeneration = 0,
    previewAt = 0,
    plan = [],
    planError = "";
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  const urls = new Map();
  const state = () => api.state();
  const slotKey = (slot) => `${slot.asset.id}:${slot.start}:${slot.source}`;
  function refresh() {
    const { project: p, take: t, index } = state();
    $("voice-workspace").hidden = !isVoice(p);
    $("workflow-label").hidden = !isVoice(p);
    $("chapter-left-label").textContent = isVoice(p)
      ? "Your pace"
      : "Chapter left";
    $("script-timing-note").textContent = isVoice(p)
      ? "Your chosen take sets the timing. A blank line in a new script creates a section."
      : "The chapter timing stays fixed so your voice follows the visual edit.";
    if (!isVoice(p)) return;
    try {
      plan = visualPlan(p);
      planError = "";
    } catch (e) {
      plan = [];
      planError = e.message;
    }
    $("visual-status").textContent =
      planError ||
      "Clips play at original speed. Their sound is replaced by your narration.";
    $("visual-status").classList.toggle("error", !!planError);
    const c = p.chapters[index];
    $("voice-section-label").textContent =
      `Section ${index + 1} · ${c.title} · ${clock(c.end - c.start)}`;
    $("transcribe").disabled = !t;
    $("transcript-rows").replaceChildren();
    $("transcript-empty").hidden = !!t?.transcript?.length;
    for (const [i, row] of transcriptCues(t?.transcript, t || {}).entries()) {
      const el = document.createElement("div");
      el.className = "transcript-row";
      const seek = document.createElement("button");
      seek.className = "cue-time";
      seek.textContent = clock(row.at, true);
      seek.title = "Listen from this phrase";
      seek.onclick = () => api.run(() => api.play(row.at));
      const words = document.createElement("textarea");
      words.value = row.text;
      words.rows = 2;
      words.maxLength = 4000;
      words.setAttribute("aria-label", `Transcript at ${clock(row.at, true)}`);
      words.onblur = words.onchange = () =>
        api.run(async () => {
          if (api.locked()) return;
          t.transcript[row.originalIndex].text = words.value;
          await api.saveTake(t);
        });
      const add = document.createElement("button");
      add.className = "quiet";
      add.textContent = "+ Visual";
      add.title = "Start a visual at this phrase";
      add.onclick = () =>
        api.run(async () => {
          if (row.at < 0.1) {
            $("visual-cues").querySelector("select")?.focus();
            return;
          }
          await addCue(row.at);
        });
      el.append(seek, words, add);
      $("transcript-rows").append(el);
    }
    $("asset-count").textContent =
      `${p.assets?.length || 0} clip${p.assets?.length === 1 ? "" : "s"}`;
    $("visual-cues").replaceChildren();
    c.visuals ??= [{ at: 0, asset: "", source: 0, hold: false }];
    for (const [j, cue] of c.visuals.entries()) {
      const row = document.createElement("div");
      row.className = "visual-cue";
      const label = (text, input) => {
        const l = document.createElement("label");
        l.append(document.createTextNode(text), input);
        return l;
      };
      const at = document.createElement("input");
      at.type = "number";
      at.min = 0;
      at.step = ".1";
      at.value = cue.at;
      at.disabled = j === 0;
      const select = document.createElement("select");
      select.add(new Option("Title card", ""));
      for (const a of p.assets || [])
        select.add(new Option(`${a.name} · ${clock(a.duration)}`, a.id));
      select.value = cue.asset;
      const start = document.createElement("input");
      start.type = "number";
      start.min = 0;
      start.step = ".1";
      start.value = cue.source || 0;
      const hold = document.createElement("input");
      hold.type = "checkbox";
      hold.checked = !!cue.hold;
      const holdLabel = label("Hold last frame", hold);
      holdLabel.className = "toggle-inline";
      const remove = document.createElement("button");
      remove.className = "quiet";
      remove.textContent = "Remove";
      remove.disabled = j === 0;
      const update = () =>
        api.run(async () => {
          if (api.locked()) return;
          api.stop();
          cue.at = Number(at.value);
          cue.asset = select.value;
          cue.source = Number(start.value);
          cue.hold = hold.checked;
          await api.persist();
          refresh();
          void seek(c.start + cue.at);
        });
      at.onblur =
        start.onblur =
        at.onchange =
        select.onchange =
        start.onchange =
        hold.onchange =
          update;
      remove.onclick = () =>
        api.run(async () => {
          if (api.locked()) return;
          c.visuals.splice(j, 1);
          await api.persist();
          refresh();
        });
      row.append(
        label("At second", at),
        label("Show", select),
        label("Clip starts at", start),
        holdLabel,
        remove,
      );
      $("visual-cues").append(row);
    }
    $("visual-strip").replaceChildren();
    for (const slot of plan.filter((s) => s.section === index)) {
      const b = document.createElement("button");
      b.style.flex = String(slot.end - slot.start);
      b.textContent = slot.asset?.name || "Title card";
      b.title = `${clock(slot.start - c.start)} — ${clock(slot.end - c.start)}`;
      b.onclick = () => api.run(() => api.play(slot.start - c.start));
      $("visual-strip").append(b);
    }
    $("transcript-rows")
      .querySelectorAll("button,textarea")
      .forEach((el) => (el.disabled = api.locked()));
    $("voice-timing-note").textContent = t
      ? "Timing follows your selected take. Trimming it updates the whole film."
      : "Record or import a take. The estimated section length will follow your actual voice.";
  }
  async function addCue(at) {
    if (api.locked()) return;
    api.stop();
    const { project: p, index } = state(),
      c = p.chapters[index];
    if (at < 0.1 || at >= c.end - c.start - 0.1)
      throw Error(
        "Choose a cue inside the section. The first visual already starts at 0.",
      );
    if (c.visuals.some((x) => Math.abs(x.at - at) < 0.1))
      throw Error("There is already a visual cue here. Choose its clip below.");
    c.visuals.push({
      at: Math.round(at * 100) / 100,
      asset: "",
      source: 0,
      hold: false,
    });
    c.visuals.sort((a, b) => a.at - b.at);
    await api.persist();
    refresh();
  }
  async function seek(time, play = false) {
    previewAt = time;
    const slot =
      plan.find((s) => time >= s.start && time < s.end) || plan.at(-1);
    const generation = ++visualGeneration;
    if (!slot?.asset) {
      visualKey = "";
      video.pause();
      return;
    }
    const key = slotKey(slot);
    if (!urls.has(key)) urls.set(key, URL.createObjectURL(slot.asset.blob));
    const newSource = visualKey !== key;
    visualKey = key;
    if (newSource) {
      video.src = urls.get(key);
      video.load();
    }
    const at = Math.min(
      slot.source + Math.max(0, time - slot.start),
      Math.max(0, slot.asset.duration - 0.05),
    );
    await api.seek(video, at);
    if (generation !== visualGeneration) return;
    if (play && slot.source + time - slot.start < slot.asset.duration - 0.04)
      await video.play();
    else video.pause();
  }
  function draw(ctx, w, h, time, playing, allowSync = true) {
    const { project: p, index } = state();
    const slot = plan.find((s) => time >= s.start && time < s.end);
    drawTitle(ctx, w, h, slot?.title || p.chapters[index].title);
    if (slot?.asset) {
      if (
        allowSync &&
        (visualKey !== slotKey(slot) ||
          Math.abs(previewAt - time) > 0.5 ||
          (playing &&
            video.paused &&
            slot.source + time - slot.start < slot.asset.duration - 0.1))
      ) {
        previewAt = time;
        void seek(time, playing).catch((e) => {
          if (planError !== e.message) {
            planError = e.message;
            api.message("Clip preview: " + e.message, true);
          }
        });
      }
      if (visualKey === slotKey(slot) && video.readyState >= 2) {
        const scale = Math.min(w / video.videoWidth, h / video.videoHeight);
        ctx.fillStyle = "#080b0b";
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(
          video,
          (w - video.videoWidth * scale) / 2,
          (h - video.videoHeight * scale) / 2,
          video.videoWidth * scale,
          video.videoHeight * scale,
        );
      }
    } else video.pause();
  }
  $("add-visual-cue").onclick = () =>
    api.run(() => addCue(Number($("cue-at").value)));
  $("add-section").onclick = () =>
    api.run(async () => {
      if (api.locked()) return;
      const { project: p } = state();
      if (p.chapters.length >= 100) throw Error("Maximum 100 sections.");
      if (p.duration + 10 > 1200)
        throw Error(
          "Trim this project before adding another section; the limit is 20 minutes.",
        );
      p.chapters.push({
        start: p.duration,
        end: p.duration + 10,
        estimate: 10,
        title: `Section ${p.chapters.length + 1}`,
        script: "",
        direction: "Speak naturally. Stop when you’re done.",
        visuals: [{ at: 0, asset: "", source: 0, hold: false }],
      });
      reflowVoice(p, state().takes);
      await api.persist();
      await api.reload(p, p.chapters.length - 1);
    });
  $("import-clips").onchange = (e) =>
    api.run(async () => {
      if (api.locked()) return;
      const files = [...e.target.files];
      e.target.value = "";
      if (!files.length) return;
      api.stop();
      api.setMode("loading");
      try {
        const { project: p } = state();
        const added = [];
        let bytes = (p.assets || []).reduce((n, a) => n + a.blob.size, 0);
        if ((p.assets?.length || 0) + files.length > 100)
          throw Error("Use up to 100 demo clips.");
        for (const f of files) {
          bytes += f.size;
          if (bytes > 512 * 1024 * 1024)
            throw Error("Keep your clip library below 512 MB.");
          const m = await inspectMedia(f);
          if (!m.hasVideo || m.duration < 0.1 || m.duration > 1200)
            throw Error(`${f.name}: choose a video up to 20 minutes.`);
          added.push({
            id: crypto.randomUUID(),
            name: f.name.slice(0, 120),
            duration: m.duration,
            blob: f,
          });
        }
        p.assets = [...(p.assets || []), ...added];
        await api.persist();
        refresh();
        api.message(
          "Clips saved locally. Choose what to show in each section.",
        );
      } finally {
        api.setMode("idle");
      }
    });
  $("transcribe").onclick = () =>
    api.run(async () => {
      if (api.locked()) return;
      const { take: t } = state();
      if (!t) return;
      api.stop();
      api.setMode("loading");
      $("cancel-transcribe").hidden = false;
      let canceled = false;
      let rejectJob;
      cancelJob = () => {
        canceled = true;
        worker?.terminate();
        worker = null;
        rejectJob?.(new DOMException("Transcription canceled.", "AbortError"));
      };
      try {
        $("speech-status").textContent = "Preparing audio on your device…";
        const decoded = await decodeTake(t);
        const offline = new OfflineAudioContext(
            1,
            Math.ceil(decoded.duration * 16000),
            16000,
          ),
          source = offline.createBufferSource();
        source.buffer = decoded;
        source.connect(offline.destination);
        source.start();
        const audio = (await offline.startRendering()).getChannelData(0);
        if (canceled) return;
        worker ??= new Worker(
          new URL("./speech-worker.js?v=20260927-voice", import.meta.url),
          { type: "module" },
        );
        const result = await new Promise((resolve, reject) => {
          rejectJob = reject;
          worker.onerror = (e) => {
            worker.terminate();
            worker = null;
            reject(
              Error(
                "Local transcription could not start. You can still record and arrange clips manually. " +
                  (e.message || "Check that the speech model files loaded."),
              ),
            );
          };
          worker.onmessage = ({ data }) => {
            if (data.type === "progress")
              $("speech-status").textContent =
                `Loading local speech model${Number.isFinite(data.value.progress) ? " · " + Math.round(data.value.progress) + "%" : ""}…`;
            if (data.type === "working")
              $("speech-status").textContent =
                "Listening on your device… Longer takes may take a few minutes.";
            if (data.type === "error") {
              worker.terminate();
              worker = null;
              reject(Error(data.message));
            }
            if (data.type === "result") resolve(data.result);
          };
          worker.postMessage({ audio, language: $("speech-language").value }, [
            audio.buffer,
          ]);
        });
        t.transcript = result.chunks?.length
          ? result.chunks
          : [{ timestamp: [0, t.duration], text: result.text }];
        await api.saveTake(t);
        $("speech-status").textContent =
          "Transcript ready. Check the words and timing before choosing visuals.";
        refresh();
      } catch (e) {
        $("speech-status").textContent = e.message;
        if (e.name !== "AbortError") throw e;
      } finally {
        cancelJob = null;
        $("cancel-transcribe").hidden = true;
        api.setMode("idle");
      }
    });
  $("cancel-transcribe").onclick = () => cancelJob?.();
  return {
    refresh,
    seek,
    draw,
    stop: () => video.pause(),
    reset: () => {
      worker?.terminate();
      worker = null;
      visualGeneration++;
      video.pause();
      video.removeAttribute("src");
      video.load();
      visualKey = "";
      for (const u of urls.values()) URL.revokeObjectURL(u);
      urls.clear();
    },
    validate: () => visualPlan(state().project),
  };
}
