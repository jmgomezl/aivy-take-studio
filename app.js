import {
  clock,
  clamp,
  takePlan,
  validateTimeline,
  safeName,
  overlayRect,
} from "./core.js";
import * as Store from "./storage.js";
import {
  inspectMedia,
  decodeTake,
  mixNarration,
  wavBlob,
  BackgroundRemover,
  drawPresenter,
  exportFilm,
  audioCache,
} from "./media.js";
import { zipSync, unzipSync, strToU8, strFromU8 } from "./vendor/fflate.js";
const $ = (id) => document.getElementById(id),
  base = $("base-video"),
  camera = $("camera-video"),
  takeVideo = $("take-video"),
  canvas = $("composition"),
  ctx = canvas.getContext("2d");
const defaults = {
  background: "remove",
  position: "left",
  size: 0.2,
  mirror: true,
  polish: true,
  autoStop: true,
  camera: false,
  mic: "",
  cameraId: "",
  font: 24,
};
let project,
  takes = [],
  index = 0,
  baseBlob,
  baseUrl,
  mode = "idle",
  devices = null,
  audioCtx,
  analyser,
  micSource,
  meterData,
  recorder,
  recordTimer,
  recordStarted = 0,
  countToken = 0,
  playbackSource,
  playbackOrigin = 0,
  playbackAt = 0,
  playbackEnd = 0,
  playTake = null,
  playTakeStarted = false,
  saveQueue = Promise.resolve(),
  exportAbort,
  renderUrl,
  ready = false;
let devicesConfig = "",
  deviceGeneration = 0,
  deviceSetupPromise = null;
let liveForeground = null,
  segmentBusy = false,
  lastSegment = 0,
  segmentError = false,
  lastCameraSource = null,
  waveToken = 0;
const remover = new BackgroundRemover(),
  blobUrls = new Map(),
  downloadUrls = new Set(),
  unsavedTakes = new Set();
const chapter = () => project?.chapters[index],
  selectedTake = () => takes.find((t) => t.id === project?.selected?.[index]);
const locked = () =>
  [
    "preparing",
    "countdown",
    "recording",
    "saving",
    "rendering",
    "loading",
  ].includes(mode);
function message(text, error = false) {
  $("notice").textContent = text;
  $("notice").classList.toggle("error", error);
  const dialog = document.querySelector("dialog[open]");
  if (dialog) {
    let note = dialog.querySelector(".dialog-message");
    if (!note) {
      note = document.createElement("p");
      note.className = "dialog-message muted";
      note.setAttribute("role", "status");
      dialog.append(note);
    }
    note.textContent = text;
    note.style.color = error ? "var(--red)" : "";
  }
}
function setMode(value) {
  mode = value;
  document.body.classList.toggle("recording", value === "recording");
  document.body.classList.toggle("busy", locked());
  for (const id of [
    "project",
    "new-project",
    "backup",
    "settings-open",
    "devices",
    "record",
    "play-chapter",
    "previous",
    "next",
    "edit-script",
    "preview-all",
    "export-open",
    "import-take",
    "trim-in",
    "trim-out",
    "take-offset",
    "take-select",
    "delete-take",
    "take-camera",
    "listen-take",
    "scrub",
  ])
    $(id).disabled = locked();
  $("stop").disabled = ![
    "preparing",
    "countdown",
    "recording",
    "playing",
  ].includes(value);
  $("record").disabled = locked() || !ready;
  $("mode-label").textContent =
    {
      recording: "● Recording your voice",
      countdown: "Get comfortable",
      saving: "Saving your take",
      playing: "Chapter playback",
      rendering: "Building your film",
      preparing: "Preparing devices",
    }[value] || "Ready when you are";
  $("stage-badge").textContent =
    value === "recording"
      ? "● YOUR TAKE · RECORDING"
      : value === "playing"
        ? "CHAPTER PREVIEW · 1×"
        : "YOUR VISUAL EDIT · 1×";
  document
    .querySelectorAll("#chapters button")
    .forEach((b) => (b.disabled = locked()));
  $("take-camera").disabled = locked() || !selectedTake()?.hasVideo;
}
function persist() {
  project.updatedAt = Date.now();
  const snapshot = structuredClone(project);
  saveQueue = saveQueue
    .catch(() => {})
    .then(() => Store.saveProject(snapshot))
    .catch((e) => {
      message(
        "Could not save locally. Download a backup now. " + e.message,
        true,
      );
      throw e;
    });
  return saveQueue;
}
function download(blob, name) {
  const url = URL.createObjectURL(blob);
  downloadUrls.add(url);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    downloadUrls.delete(url);
  }, 120000);
}
function urlFor(take) {
  if (!blobUrls.has(take.id))
    blobUrls.set(take.id, URL.createObjectURL(take.blob));
  return blobUrls.get(take.id);
}
function countReady() {
  return project.chapters.filter((c, i) => {
    const t = takes.find((t) => t.id === project.selected?.[i]);
    if (!t) return false;
    try {
      takePlan(c, t);
      return true;
    } catch {
      return false;
    }
  }).length;
}
function refreshProgress() {
  const count = countReady(),
    total = project.chapters.length;
  $("complete-count").replaceChildren(document.createTextNode(count + " "));
  const small = document.createElement("small");
  small.textContent = "/ " + total;
  $("complete-count").append(small);
  $("complete-bar").style.width = `${(count / total) * 100}%`;
  for (const [i, b] of [...$("chapters").children].entries()) {
    const t = takes.find((t) => t.id === project.selected?.[i]);
    let valid = false;
    if (t)
      try {
        takePlan(project.chapters[i], t);
        valid = true;
      } catch {}
    b.classList.toggle("ready", valid);
    b.setAttribute(
      "aria-label",
      `Chapter ${i + 1}: ${project.chapters[i].title}${valid ? ", recorded" : ", not ready"}`,
    );
  }
  $("finish-title").textContent =
    count === total
      ? "All chapters ready. Let’s hear the whole story."
      : `${total - count} chapter${total - count === 1 ? "" : "s"} to go. One good take at a time.`;
}
function drawClocks(elapsed = 0) {
  const c = chapter();
  if (!c) return;
  const duration = c.end - c.start;
  const full = clock(elapsed, true);
  $("elapsed").replaceChildren(document.createTextNode(full.slice(0, -2)));
  const small = document.createElement("span");
  small.textContent = full.slice(-2);
  $("elapsed").append(small);
  $("remaining").textContent = clock(Math.max(0, duration - elapsed));
  $("remaining").style.color =
    mode === "recording" && duration - elapsed < 5 ? "var(--red)" : "";
  $("film-time").replaceChildren(
    document.createTextNode(clock(c.start + Math.min(elapsed, duration)) + " "),
  );
  const total = document.createElement("small");
  total.textContent = "/ " + clock(project.duration);
  $("film-time").append(total);
  $("scrub").value = String(Math.min(elapsed, duration));
  if (mode === "recording" && $("auto-scroll").checked) {
    const area = $("script-scroll"),
      max = area.scrollHeight - area.clientHeight;
    area.scrollTop = Math.max(
      0,
      max * clamp((elapsed / duration - 0.15) / 0.7, 0, 1),
    );
  }
}
async function seekVideo(video, time) {
  if (Math.abs(video.currentTime - time) < 0.015 && video.readyState >= 2)
    return;
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      clean();
      reject(Error("Video took too long to load. Try again."));
    }, 12000);
    const clean = () => {
      clearTimeout(timer);
      video.removeEventListener("seeked", done);
      video.removeEventListener("loadeddata", done);
      video.removeEventListener("error", fail);
    };
    const done = () => {
      if (video.readyState >= 2 && !video.seeking) {
        clean();
        resolve();
      }
    };
    const fail = () => {
      clean();
      reject(Error("This video could not be played."));
    };
    video.addEventListener("seeked", done);
    video.addEventListener("loadeddata", done);
    video.addEventListener("error", fail);
    video.currentTime = Math.max(0, time);
    done();
  });
}
function applySettings() {
  const s = project.settings;
  $("camera-enabled").checked = s.camera;
  $("background").value = s.background;
  $("position").value = s.position;
  $("overlay-size").value = s.size;
  $("mirror-camera").checked = s.mirror;
  $("polish").checked = s.polish;
  $("auto-stop").checked = s.autoStop;
  document.documentElement.style.setProperty("--script-size", s.font + "px");
}
function settingsChanged() {
  Object.assign(project.settings, {
    camera: $("camera-enabled").checked,
    background: $("background").value,
    position: $("position").value,
    size: Number($("overlay-size").value),
    mirror: $("mirror-camera").checked,
    polish: $("polish").checked,
    autoStop: $("auto-stop").checked,
    mic: $("mic-select").value,
    cameraId: $("camera-select").value,
  });
  segmentError = false;
  liveForeground?.close();
  liveForeground = null;
  void persist().catch(() => {});
}
async function refreshDevices() {
  if (!navigator.mediaDevices?.enumerateDevices) return;
  const list = await navigator.mediaDevices.enumerateDevices();
  for (const [id, kind, saved] of [
    ["mic-select", "audioinput", project.settings.mic],
    ["camera-select", "videoinput", project.settings.cameraId],
  ]) {
    const select = $(id);
    select.replaceChildren();
    const def = document.createElement("option");
    def.value = "";
    def.textContent =
      kind === "audioinput" ? "Default microphone" : "Default camera";
    select.append(def);
    list
      .filter((d) => d.kind === kind)
      .forEach((d, i) => {
        const o = document.createElement("option");
        o.value = d.deviceId;
        o.textContent =
          d.label ||
          `${kind === "audioinput" ? "Microphone" : "Camera"} ${i + 1}`;
        select.append(o);
      });
    select.value = [...select.options].some((o) => o.value === saved)
      ? saved
      : "";
  }
}
function stopDevices() {
  deviceGeneration++;
  devicesConfig = "";
  devices?.getTracks().forEach((t) => t.stop());
  devices = null;
  camera.srcObject = null;
  micSource?.disconnect();
  micSource = null;
  analyser = null;
  liveForeground?.close();
  liveForeground = null;
  $("input-label").textContent = "Microphone off";
  $("meter-fill").style.width = "0%";
  $("device-status").textContent = "Microphone and camera are off.";
}
function enableDevices() {
  if (deviceSetupPromise) return deviceSetupPromise;
  $("enable-devices").disabled = true;
  deviceSetupPromise = enableDevicesNow().finally(() => {
    deviceSetupPromise = null;
    $("enable-devices").disabled = false;
  });
  return deviceSetupPromise;
}
const deviceConfig = () =>
  JSON.stringify([
    project.settings.camera,
    project.settings.mic,
    project.settings.cameraId,
  ]);
async function enableDevicesNow() {
  if (!navigator.mediaDevices?.getUserMedia)
    throw Error(
      "Recording needs HTTPS and a browser with microphone support. Try Chrome.",
    );
  stopDevices();
  settingsChanged();
  const s = project.settings,
    generation = deviceGeneration,
    config = deviceConfig();
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      ...(s.mic ? { deviceId: { exact: s.mic } } : {}),
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
    video: s.camera
      ? {
          ...(s.cameraId ? { deviceId: { exact: s.cameraId } } : {}),
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30, max: 30 },
        }
      : false,
  });
  if (generation !== deviceGeneration) {
    stream.getTracks().forEach((t) => t.stop());
    throw Error("Device setup canceled.");
  }
  devices = stream;
  devicesConfig = config;
  audioCtx ??= new AudioContext();
  await audioCtx.resume();
  micSource = audioCtx.createMediaStreamSource(stream);
  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 512;
  meterData = new Float32Array(analyser.fftSize);
  micSource.connect(analyser);
  if (s.camera) {
    camera.srcObject = stream;
    await camera.play();
  }
  for (const track of stream.getTracks())
    track.onended = () => {
      if (mode === "recording")
        stopRecording(
          "A recording device disconnected. The captured part has been kept.",
        );
      message(
        "A device disconnected. Reconnect it and enable preview again.",
        true,
      );
    };
  $("input-label").textContent =
    stream.getAudioTracks()[0]?.label || "Microphone ready";
  $("device-status").textContent = s.camera
    ? "Camera and microphone ready."
    : "Microphone ready.";
  await refreshDevices();
  void Store.persistStorage();
  if (s.camera && s.background === "remove") {
    $("mask-status").textContent = "Preparing local background removal…";
    try {
      await remover.ready();
      $("mask-status").textContent =
        "Background removal ready · processed on this device.";
    } catch (e) {
      segmentError = true;
      $("mask-status").textContent = e.message;
      message(
        "Camera is connected, but background removal failed. Choose the rounded frame or try again.",
        true,
      );
    }
  }
}
async function selectChapter(i) {
  if (locked()) return;
  stopPlayback();
  setMode("loading");
  try {
    index = clamp(i, 0, project.chapters.length - 1);
    const c = chapter();
    $("chapter-number").textContent =
      `${String(index + 1).padStart(2, "0")} / ${project.chapters.length}`;
    $("chapter-title").textContent = c.title;
    $("script").textContent = c.script;
    $("direction").textContent = c.direction;
    $("word-count").textContent =
      `${c.script.trim() ? c.script.trim().split(/\s+/).length : 0} words · ${Math.round(c.end - c.start)} seconds`;
    $("script-scroll").scrollTop = 0;
    $("chapter-range").textContent = `${clock(c.start)} — ${clock(c.end)}`;
    $("scrub").max = String(c.end - c.start);
    [...$("chapters").children].forEach((b, j) =>
      b.setAttribute("aria-current", String(j === index)),
    );
    drawClocks();
    await seekVideo(base, c.start + Math.min(0.35, (c.end - c.start) / 4));
    await refreshTakes();
  } finally {
    setMode("idle");
  }
}
async function refreshTakes() {
  const local = takes
      .filter((t) => t.chapter === index)
      .sort((a, b) => b.createdAt - a.createdAt),
    take = selectedTake();
  $("take-count").textContent = local.length;
  $("empty-takes").hidden = local.length > 0;
  $("take-editor").hidden = !local.length;
  $("take-select").replaceChildren();
  local.forEach((t, i) => {
    const o = document.createElement("option");
    o.value = t.id;
    o.textContent = `${t.label || "Take " + (local.length - i)} · ${t.duration.toFixed(1)}s · ${t.hasVideo ? "camera + voice" : "voice"}`;
    $("take-select").append(o);
  });
  if (!take) {
    refreshProgress();
    return;
  }
  $("take-select").value = take.id;
  $("trim-in").value = Number((take.trimIn || 0).toFixed(3));
  $("trim-out").value = Number((take.trimOut ?? take.duration).toFixed(3));
  $("take-offset").value = Number((take.offset || 0).toFixed(3));
  $("take-camera").checked = take.hasVideo && take.showCamera !== false;
  $("take-camera").disabled = !take.hasVideo;
  showFit();
  const token = ++waveToken;
  try {
    const audio = await decodeTake(take);
    if (token !== waveToken) return;
    const wave = $("waveform"),
      w = wave.width,
      h = wave.height,
      c = wave.getContext("2d"),
      data = audio.getChannelData(0);
    c.clearRect(0, 0, w, h);
    c.fillStyle = "#afe4cc";
    for (let x = 0; x < w; x += 4) {
      let peak = 0;
      const start = Math.floor((x / w) * data.length),
        end = Math.floor(((x + 4) / w) * data.length);
      for (
        let n = start;
        n < end;
        n += Math.max(1, Math.floor((end - start) / 120))
      )
        peak = Math.max(peak, Math.abs(data[n]));
      const size = Math.max(2, Math.min(h - 10, peak * h * 2.5));
      c.fillRect(x, h / 2 - size / 2, 2, size);
    }
  } catch (e) {
    message(e.message, true);
  }
  refreshProgress();
}
function showFit() {
  const take = selectedTake();
  if (!take) return;
  try {
    const p = takePlan(chapter(), take);
    $("take-fit").textContent =
      `${p.length.toFixed(1)}s voice · ${(chapter().end - chapter().start - p.length - p.offset).toFixed(1)}s breathing room`;
    $("take-fit").style.color = "var(--mint)";
  } catch (e) {
    $("take-fit").textContent = e.message;
    $("take-fit").style.color = "var(--red)";
  }
}
async function updateTrim() {
  if (locked()) return;
  stopPlayback();
  const take = selectedTake();
  if (!take) return;
  Object.assign(take, {
    trimIn: Number($("trim-in").value),
    trimOut: Number($("trim-out").value),
    offset: Number($("take-offset").value),
    showCamera: $("take-camera").checked,
  });
  showFit();
  await Store.saveTake(take);
  refreshProgress();
}
function stopPlayback() {
  base.pause();
  takeVideo.pause();
  try {
    playbackSource?.stop();
  } catch {}
  playbackSource = null;
  playTake = null;
  playTakeStarted = false;
  $("play-chapter").textContent = "▶";
  $("play-chapter").setAttribute("aria-label", "Play chapter");
  if (mode === "playing") setMode("idle");
}
async function playChapter() {
  if (mode === "playing") {
    stopPlayback();
    return;
  }
  if (locked()) return;
  setMode("preparing");
  try {
    const c = chapter(),
      take = selectedTake();
    await seekVideo(base, c.start);
    audioCtx ??= new AudioContext();
    await audioCtx.resume();
    playTake = null;
    let buffer, plan;
    if (take) {
      plan = takePlan(c, take);
      buffer = await decodeTake(take);
      if (take.hasVideo && take.showCamera !== false) {
        takeVideo.src = urlFor(take);
        takeVideo.load();
        await seekVideo(takeVideo, plan.trimIn);
        playTake = { take, plan };
      }
    }
    const mix = buffer
      ? await mixNarration(
          {
            ...project,
            duration: c.end,
            chapters: project.chapters.map((ch, i) =>
              i === index ? ch : { ...ch },
            ),
            selected: { [index]: take.id },
          },
          takes,
        )
      : null;
    await base.play();
    playbackAt = c.start;
    playbackEnd = c.end;
    playbackOrigin = audioCtx.currentTime;
    if (mix) {
      playbackSource = audioCtx.createBufferSource();
      playbackSource.buffer = mix;
      playbackSource.connect(audioCtx.destination);
      playbackSource.start(playbackOrigin, c.start, c.end - c.start);
    }
    setMode("playing");
    $("play-chapter").textContent = "Ⅱ";
    $("play-chapter").setAttribute("aria-label", "Pause chapter");
  } catch (e) {
    stopPlayback();
    setMode("idle");
    throw e;
  }
}
function recordingMime(withCamera) {
  const types = withCamera
    ? [
        "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
        "video/webm;codecs=vp8,opus",
        "video/mp4",
        "video/webm",
      ]
    : ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"];
  return types.find((t) => MediaRecorder.isTypeSupported(t));
}
async function recordChapter() {
  if (locked()) return;
  stopPlayback();
  setMode("preparing");
  const token = ++countToken,
    chapterIndex = index,
    c = chapter();
  try {
    if (
      !devices ||
      devicesConfig !== deviceConfig() ||
      !devices.getAudioTracks().some((t) => t.readyState === "live")
    )
      await enableDevices();
    if (token !== countToken) return;
    await seekVideo(base, c.start);
    const type = recordingMime(devices.getVideoTracks().length > 0);
    if (!type)
      throw Error(
        "This browser cannot record the selected devices. Use current Chrome or Edge.",
      );
    const chunks = [],
      recordedStream = new MediaStream(devices.getTracks()),
      hasVideo = recordedStream.getVideoTracks().length > 0;
    recorder = new MediaRecorder(recordedStream, {
      mimeType: type,
      audioBitsPerSecond: 160000,
      ...(hasVideo ? { videoBitsPerSecond: 2500000 } : {}),
    });
    recorder.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };
    recorder.onerror = (e) => {
      message(e.error?.message || "Recording stopped unexpectedly.", true);
      stopRecording();
    };
    recorder.onstop = async () => {
      clearInterval(recordTimer);
      base.pause();
      const blob = new Blob(chunks, { type: recorder.mimeType });
      setMode("saving");
      try {
        const meta = await inspectMedia(blob);
        if (!meta.hasAudio || meta.duration < 0.2)
          throw Error("That take was too short. Give yourself another try.");
        const duration = meta.duration,
          take = {
            id: crypto.randomUUID(),
            project: project.id,
            chapter: chapterIndex,
            blob,
            duration,
            hasVideo: meta.hasVideo,
            showCamera: meta.hasVideo,
            createdAt: Date.now(),
            trimIn: 0,
            trimOut: Math.min(duration, c.end - c.start),
            offset: 0,
          };
        takes.push(take);
        project.selected[chapterIndex] = take.id;
        try {
          await Store.saveTake(take);
          await persist();
          message("Take saved. Keep it, or give yourself another try.");
        } catch (e) {
          unsavedTakes.add(take.id);
          message(
            "Your take is in memory, but local storage could not save it. Download Original or Backup before leaving.",
            true,
          );
        }
        await refreshTakes();
      } catch (e) {
        message(e.message, true);
        if (blob.size > 0)
          download(
            blob,
            `recovered-take.${type.includes("mp4") ? "mp4" : "webm"}`,
          );
      } finally {
        setMode("idle");
        drawClocks();
      }
    };
    $("countdown").hidden = false;
    setMode("countdown");
    for (let n = 3; n > 0; n--) {
      document.querySelector("#countdown strong").textContent = n;
      await new Promise((r) => setTimeout(r, 1000));
      if (token !== countToken) {
        $("countdown").hidden = true;
        setMode("idle");
        return;
      }
    }
    $("countdown").hidden = true;
    recorder.start(1000);
    recordStarted = performance.now();
    setMode("recording");
    void base.play().catch(() => {});
    message("Your voice is recording. A small pause is perfectly fine.");
    recordTimer = setInterval(() => {
      const elapsed = (performance.now() - recordStarted) / 1000;
      drawClocks(elapsed);
      const limit = project.settings.autoStop
        ? c.end - c.start
        : Math.min(1200, (c.end - c.start) * 2 + 15);
      if (elapsed >= limit) stopRecording();
      if (base.currentTime >= c.end) base.pause();
    }, 40);
  } catch (e) {
    $("countdown").hidden = true;
    setMode("idle");
    message(
      e.name === "NotAllowedError"
        ? "Microphone or camera permission was declined. Allow access in your browser, then try again."
        : e.message,
      true,
    );
  }
}
function stopRecording(note) {
  if (["preparing", "countdown"].includes(mode)) {
    countToken++;
    $("countdown").hidden = true;
    setMode("idle");
    return;
  }
  if (mode !== "recording") return;
  clearInterval(recordTimer);
  if (recorder?.state === "recording") recorder.stop();
  base.pause();
  if (note) message(note, true);
}
async function loadProject(p) {
  if (unsavedTakes.size)
    throw Error(
      "Download a backup of your unsaved takes before switching projects.",
    );
  stopPlayback();
  stopDevices();
  ready = false;
  setMode("loading");
  project = p;
  project.settings = { ...defaults, ...p.settings };
  project.selected ??= {};
  takes = await Store.projectTakes(p.id);
  index = 0;
  for (const url of blobUrls.values()) URL.revokeObjectURL(url);
  blobUrls.clear();
  audioCache.clear();
  if (baseUrl) URL.revokeObjectURL(baseUrl);
  baseBlob =
    p.videoBlob ||
    (await fetch("../aivy-quorum-visual-cut.mp4?v=20260910-mirror").then(
      (r) => {
        if (!r.ok) throw Error("The visual video could not load.");
        return r.blob();
      },
    ));
  baseUrl = URL.createObjectURL(baseBlob);
  base.src = baseUrl;
  base.load();
  $("chapters").replaceChildren();
  project.chapters.forEach((c, i) => {
    const b = document.createElement("button");
    b.textContent = String(i + 1).padStart(2, "0");
    b.title = `${c.title} · ${clock(c.start)}–${clock(c.end)}`;
    const progress = document.createElement("i");
    progress.className = "chapter-progress";
    b.append(progress);
    b.onclick = () => run(() => selectChapter(i));
    $("chapters").append(b);
  });
  $("chapters").style.gridTemplateColumns =
    project.chapters.length < 7
      ? `repeat(${project.chapters.length},minmax(0,1fr))`
      : "";
  applySettings();
  await refreshDevices();
  ready = true;
  setMode("idle");
  await selectChapter(0);
  refreshProgress();
  message(
    "Your video is ready. Start with any chapter; your takes stay on this device.",
  );
}
async function refreshProjectMenu() {
  const all = (await Store.projects()).sort(
    (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0),
  );
  $("project").replaceChildren();
  for (const p of all) {
    const o = document.createElement("option");
    o.value = p.id;
    o.textContent = p.title;
    $("project").append(o);
  }
  if (project) $("project").value = project.id;
  return all;
}
function draw() {
  if (mode !== "rendering") {
    ctx.fillStyle = "#080b0b";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (base.readyState >= 2) {
      const scale = Math.min(
          canvas.width / base.videoWidth,
          canvas.height / base.videoHeight,
        ),
        w = base.videoWidth * scale,
        h = base.videoHeight * scale;
      ctx.drawImage(
        base,
        (canvas.width - w) / 2,
        (canvas.height - h) / 2,
        w,
        h,
      );
    }
    let cam = null;
    if (mode === "playing" && playTake) {
      const elapsed = audioCtx.currentTime - playbackOrigin,
        time = playbackAt + elapsed;
      if (time >= playTake.plan.start && time < playTake.plan.end) {
        cam = takeVideo;
        if (!playTakeStarted) {
          playTakeStarted = true;
          void takeVideo.play().catch(() => {});
        }
      } else takeVideo.pause();
    } else if (mode !== "playing" && devices && project?.settings.camera)
      cam = camera;
    if (cam && cam.readyState >= 2 && project.settings.background !== "none") {
      if (project.settings.background === "remove") {
        if (lastCameraSource !== cam) {
          liveForeground?.close();
          liveForeground = null;
          lastCameraSource = cam;
        }
        if (
          !segmentBusy &&
          !segmentError &&
          performance.now() - lastSegment > 85
        ) {
          segmentBusy = true;
          lastSegment = performance.now();
          remover
            .process(cam)
            .then((frame) => {
              liveForeground?.close();
              liveForeground = frame;
            })
            .catch((e) => {
              segmentError = true;
              $("mask-status").textContent = e.message;
              message(
                "Background removal is unavailable. Choose the rounded frame in settings.",
                true,
              );
            })
            .finally(() => (segmentBusy = false));
        }
        if (liveForeground)
          drawPresenter(ctx, liveForeground, project.settings);
      } else drawPresenter(ctx, cam, project.settings);
    }
    if (mode === "playing") {
      const elapsed = audioCtx.currentTime - playbackOrigin;
      drawClocks(elapsed);
      if (playbackAt + elapsed >= playbackEnd) {
        stopPlayback();
        void seekVideo(base, chapter().start)
          .then(() => drawClocks())
          .catch(() => {});
      }
    }
  }
  if (analyser) {
    analyser.getFloatTimeDomainData(meterData);
    let peak = 0;
    for (const n of meterData) peak = Math.max(peak, Math.abs(n));
    $("meter-fill").style.width = `${Math.min(100, peak * 220)}%`;
    $("meter-fill").classList.toggle("hot", peak > 0.88);
  }
  requestAnimationFrame(draw);
}
function openDialog(id) {
  if (locked()) return;
  stopPlayback();
  const dialog = $(id);
  dialog.querySelector(".dialog-message")?.remove();
  dialog.showModal();
}
function run(fn) {
  Promise.resolve()
    .then(fn)
    .catch((e) => message(e.message || String(e), true));
}
function exportDialog(draft = false) {
  if (locked()) return;
  stopPlayback();
  $("resolution").value = draft ? "720" : "1080";
  $("allow-gaps").checked = draft;
  $("export-title").textContent = draft
    ? "Hear it all together"
    : "Your final cut";
  $("export-summary").textContent =
    `${countReady()} of ${project.chapters.length} chapters recorded · ${clock(project.duration)} · presenter ${project.settings.position === "left" ? "lower left" : "lower right"}`;
  openDialog("export-dialog");
}
function checkExport() {
  const missing = [];
  for (let i = 0; i < project.chapters.length; i++) {
    const t = takes.find((t) => t.id === project.selected[i]);
    if (t) takePlan(project.chapters[i], t);
    else missing.push(i + 1);
  }
  if (missing.length && !$("allow-gaps").checked)
    throw Error(
      `Record chapters ${missing.join(", ")} first, or allow silent chapters for a draft.`,
    );
  if (!takes.some((t) => Object.values(project.selected).includes(t.id)))
    throw Error("Record or import at least one take first.");
}
async function renderFilm() {
  checkExport();
  stopPlayback();
  setMode("rendering");
  exportAbort = new AbortController();
  $("export-progress").hidden = false;
  $("cancel-render").hidden = false;
  for (const id of [
    "render",
    "audio-export",
    "resolution",
    "allow-gaps",
    "export-close",
  ])
    $(id).disabled = true;
  $("result-downloads").replaceChildren();
  $("result-video").hidden = true;
  try {
    while (segmentBusy) await new Promise((r) => setTimeout(r, 50));
    const result = await exportFilm({
      project: structuredClone(project),
      takes,
      baseBlob,
      resolution: Number($("resolution").value),
      canvas,
      remover,
      signal: exportAbort.signal,
      onProgress: (p, text) => {
        document.querySelector("#export-progress progress").value = p;
        $("export-status").textContent = text;
      },
    });
    if (renderUrl) URL.revokeObjectURL(renderUrl);
    renderUrl = URL.createObjectURL(result.blob);
    $("result-video").src = renderUrl;
    $("result-video").hidden = false;
    const a = document.createElement("a");
    a.className = "primary";
    a.href = renderUrl;
    a.download = safeName(project.title) + "." + result.extension;
    a.textContent = `Download ${result.extension.toUpperCase()} ↓`;
    $("result-downloads").append(a);
    const voice = document.createElement("button");
    voice.className = "secondary";
    voice.textContent = "Combined voice WAV ↓";
    voice.onclick = () =>
      download(wavBlob(result.audio), safeName(project.title) + "-voice.wav");
    $("result-downloads").append(voice);
    message("Your video is ready. Watch it through once, then download it.");
  } catch (e) {
    $("export-status").textContent =
      e.name === "AbortError"
        ? "Export canceled. Your takes are safe."
        : e.message;
    message(
      e.name === "AbortError"
        ? "Export canceled. Your takes are safe."
        : e.message,
      e.name !== "AbortError",
    );
  } finally {
    canvas.width = 1280;
    canvas.height = 720;
    for (const id of [
      "render",
      "audio-export",
      "resolution",
      "allow-gaps",
      "export-close",
    ])
      $(id).disabled = false;
    $("cancel-render").hidden = true;
    exportAbort = null;
    setMode("idle");
  }
}
async function backup() {
  await saveQueue.catch(() => {});
  const files = {},
    meta = structuredClone(project);
  delete meta.videoBlob;
  const rows = [];
  for (const take of takes) {
    const item = { ...take, blobType: take.blob.type };
    delete item.blob;
    item.file = `takes/${take.id}.bin`;
    rows.push(item);
    files[item.file] = new Uint8Array(await take.blob.arrayBuffer());
  }
  if (project.videoBlob) {
    files["visual.bin"] = new Uint8Array(await project.videoBlob.arrayBuffer());
    meta.videoFile = "visual.bin";
  }
  files["project.json"] = strToU8(
    JSON.stringify({ schema: 1, project: meta, takes: rows }),
  );
  message("Preparing your private backup…");
  await new Promise((r) => setTimeout(r, 0));
  const total = Object.values(files).reduce((a, b) => a + b.length, 0);
  if (total > 512 * 1024 * 1024)
    throw Error(
      "This project is too large for a browser ZIP. Download individual original takes instead.",
    );
  download(
    new Blob([zipSync(files, { level: 0 })], { type: "application/zip" }),
    safeName(project.title) + "-studio-backup.zip",
  );
  unsavedTakes.clear();
  message(
    "Backup downloaded. It includes original takes, settings and your chapter script.",
  );
}
async function restore(file) {
  if (!file || file.size > 512 * 1024 * 1024)
    throw Error("Choose a studio backup smaller than 512 MB.");
  let inflated = 0;
  const files = unzipSync(new Uint8Array(await file.arrayBuffer()), {
    filter: (entry) => {
      inflated += entry.originalSize;
      if (inflated > 600 * 1024 * 1024)
        throw Error("Backup expands beyond the import limit.");
      return (
        entry.name === "project.json" ||
        entry.name === "visual.bin" ||
        /^takes\/[a-z0-9-]+\.bin$/i.test(entry.name)
      );
    },
  });
  if (!files["project.json"]) throw Error("This is not a Take Studio backup.");
  const data = JSON.parse(strFromU8(files["project.json"]));
  if (
    data.schema !== 1 ||
    !Array.isArray(data.takes) ||
    data.takes.length > 1000
  )
    throw Error("Unsupported backup.");
  const timeline = validateTimeline(data.project, data.project.duration),
    id = crypto.randomUUID(),
    p = {
      ...timeline,
      id,
      updatedAt: Date.now(),
      selected: {},
      settings: { ...defaults, ...data.project.settings },
    };
  if (data.project.videoFile) {
    if (!files["visual.bin"])
      throw Error("The backup is missing its visual video.");
    p.videoBlob = new Blob([files["visual.bin"]]);
    const info = await inspectMedia(p.videoBlob);
    if (Math.abs(info.duration - p.duration) > 0.1)
      throw Error("The backup video does not match its timeline.");
  } else if (p.duration !== 239)
    throw Error("The backup is missing its visual video.");
  const restored = [];
  for (const original of data.takes) {
    if (
      !Number.isInteger(original.chapter) ||
      original.chapter < 0 ||
      original.chapter >= p.chapters.length ||
      !files[original.file]
    )
      throw Error("A backup take is missing or invalid.");
    const blob = new Blob([files[original.file]], {
        type:
          original.blobType ||
          (original.hasVideo ? "video/webm" : "audio/webm"),
      }),
      info = await inspectMedia(blob);
    if (!info.hasAudio || info.duration <= 0 || info.duration > 1200)
      throw Error("A backup take has invalid media.");
    const t = {
      ...original,
      id: crypto.randomUUID(),
      project: id,
      blob,
      duration: info.duration,
      hasVideo: info.hasVideo,
    };
    delete t.file;
    restored.push(t);
    if (data.project.selected?.[t.chapter] === original.id)
      p.selected[t.chapter] = t.id;
  }
  await Store.saveProject(p);
  for (const t of restored) await Store.saveTake(t);
  $("project-dialog").close();
  await loadProject(p);
  await refreshProjectMenu();
  message(
    "Backup restored as a separate project. Your other projects are unchanged.",
  );
}
async function newProject() {
  const file = $("new-video").files[0];
  if (!file) throw Error("Choose your visual video first.");
  if (file.size > 512 * 1024 * 1024)
    throw Error("Choose a video smaller than 512 MB.");
  const info = await inspectMedia(file);
  if (!info.hasVideo) throw Error("Choose a video with a visual track.");
  const raw = $("new-timeline").files[0]
    ? JSON.parse(await $("new-timeline").files[0].text())
    : {
        title: $("new-name").value || file.name,
        chapters: [
          {
            start: 0,
            end: info.duration,
            title: "Your story",
            script: "Add your own words with Edit above the script.",
            direction: "Take it one sentence at a time.",
          },
        ],
      };
  const timeline = validateTimeline(raw, info.duration),
    p = {
      ...timeline,
      title: $("new-name").value.trim() || timeline.title,
      id: crypto.randomUUID(),
      updatedAt: Date.now(),
      videoBlob: file,
      settings: { ...defaults },
      selected: {},
    };
  await Store.saveProject(p);
  $("project-dialog").close();
  await loadProject(p);
  await refreshProjectMenu();
}
// Event bindings stay local: there are no upload, purchase or agent endpoints.
$("record").onclick = recordChapter;
$("stop").onclick = () =>
  mode === "playing" ? stopPlayback() : stopRecording();
$("play-chapter").onclick = () => run(playChapter);
$("listen-take").onclick = () => run(playChapter);
$("previous").onclick = () => run(() => selectChapter(index - 1));
$("next").onclick = () => run(() => selectChapter(index + 1));
$("scrub").oninput = () => {
  if (locked()) return;
  stopPlayback();
  const n = Number($("scrub").value);
  base.currentTime = chapter().start + n;
  drawClocks(n);
};
for (const id of ["settings-open", "devices"])
  $(id).onclick = () => openDialog("settings-dialog");
$("help-open").onclick = () => openDialog("help-dialog");
$("new-project").onclick = () => openDialog("project-dialog");
$("enable-devices").onclick = () => run(enableDevices);
$("disable-devices").onclick = stopDevices;
$("refresh-devices").onclick = () => run(refreshDevices);
for (const id of [
  "camera-enabled",
  "background",
  "position",
  "overlay-size",
  "mirror-camera",
  "polish",
  "auto-stop",
])
  $(id).onchange = () => {
    settingsChanged();
    if (id === "camera-enabled" && !$("camera-enabled").checked) stopDevices();
  };
for (const id of ["mic-select", "camera-select"])
  $(id).onchange = () => {
    settingsChanged();
    if (devices)
      message("Device selection changed. Press Enable preview to apply it.");
  };
$("take-select").onchange = () =>
  run(async () => {
    stopPlayback();
    project.selected[index] = $("take-select").value;
    await persist();
    await refreshTakes();
  });
for (const id of ["trim-in", "trim-out", "take-offset", "take-camera"])
  $(id).onchange = () => run(updateTrim);
$("download-take").onclick = () => {
  const t = selectedTake();
  if (t)
    download(
      t.blob,
      `chapter-${index + 1}-${safeName(t.id.slice(0, 8))}.${t.blob.type.includes("mp4") ? "mp4" : t.blob.type.includes("wav") ? "wav" : "webm"}`,
    );
};
$("delete-take").onclick = () =>
  run(async () => {
    const t = selectedTake();
    if (!t || !confirm("Delete this take? Your other takes will remain."))
      return;
    stopPlayback();
    await Store.deleteTake(t.id);
    takes = takes.filter((x) => x.id !== t.id);
    audioCache.delete(t.id);
    if (blobUrls.has(t.id)) {
      URL.revokeObjectURL(blobUrls.get(t.id));
      blobUrls.delete(t.id);
    }
    const replacement = takes
      .filter((x) => x.chapter === index)
      .sort((a, b) => b.createdAt - a.createdAt)[0];
    if (replacement) project.selected[index] = replacement.id;
    else delete project.selected[index];
    await persist();
    await refreshTakes();
  });
$("import-take").onchange = (e) =>
  run(async () => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 256 * 1024 * 1024)
      throw Error("Choose a take smaller than 256 MB.");
    const meta = await inspectMedia(file);
    if (!meta.hasAudio || meta.duration < 0.1 || meta.duration > 1200)
      throw Error(
        "Choose an audio or camera take with readable sound, up to 20 minutes.",
      );
    const t = {
      id: crypto.randomUUID(),
      project: project.id,
      chapter: index,
      blob: file,
      duration: meta.duration,
      hasVideo: meta.hasVideo,
      showCamera: meta.hasVideo,
      createdAt: Date.now(),
      trimIn: 0,
      trimOut: meta.duration,
      offset: 0,
      label: file.name.slice(0, 80),
    };
    await Store.saveTake(t);
    takes.push(t);
    project.selected[index] = t.id;
    await persist();
    await refreshTakes();
    message(
      meta.duration > chapter().end - chapter().start
        ? "Take imported. Trim it to fit this chapter before exporting."
        : "Take imported and saved.",
    );
  });
$("preview-all").onclick = () => exportDialog(true);
$("export-open").onclick = () => exportDialog(false);
$("render").onclick = () => run(renderFilm);
$("cancel-render").onclick = () => exportAbort?.abort();
$("audio-export").onclick = () =>
  run(async () => {
    checkExport();
    const audio = await mixNarration(project, takes);
    download(wavBlob(audio), safeName(project.title) + "-voice.wav");
    message("Combined voice downloaded. Chapter timing is preserved.");
  });
$("backup").onclick = () => run(backup);
$("restore").onchange = (e) => {
  const f = e.target.files[0];
  e.target.value = "";
  run(() => restore(f));
};
$("create-project").onclick = () => run(newProject);
$("script-template").onclick = () =>
  download(
    new Blob(
      [
        JSON.stringify(
          {
            title: "My next demo",
            chapters: [
              {
                start: 0,
                end: 10,
                title: "The problem",
                script: "Your opening words.",
              },
              {
                start: 10,
                end: 30,
                title: "The demo",
                script: "Show what you built.",
              },
            ],
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    ),
    "chapter-template.json",
  );
$("project").onchange = () =>
  run(async () => {
    await saveQueue.catch(() => {});
    const p = (await Store.projects()).find((x) => x.id === $("project").value);
    if (p) await loadProject(p);
  });
$("edit-script").onclick = () => {
  const c = chapter();
  $("edit-title").value = c.title;
  $("edit-words").value = c.script;
  $("edit-direction").value = c.direction;
  openDialog("script-dialog");
};
$("save-script").onclick = () =>
  run(async () => {
    Object.assign(chapter(), {
      title: $("edit-title").value,
      script: $("edit-words").value,
      direction: $("edit-direction").value,
    });
    await persist();
    $("script-dialog").close();
    await selectChapter(index);
  });
for (const [id, delta] of [
  ["script-smaller", -2],
  ["script-larger", 2],
])
  $(id).onclick = () => {
    project.settings.font = clamp(project.settings.font + delta, 18, 36);
    document.documentElement.style.setProperty(
      "--script-size",
      project.settings.font + "px",
    );
    void persist().catch(() => {});
  };
document.querySelectorAll(".close-dialog").forEach(
  (b) =>
    (b.onclick = () => {
      if (mode === "rendering") return;
      b.closest("dialog").close();
    }),
);
document.querySelectorAll("dialog").forEach((d) => {
  d.addEventListener("cancel", (e) => {
    if (mode === "rendering") e.preventDefault();
  });
  d.addEventListener("click", (e) => {
    if (e.target === d && !locked()) {
      const r = d.getBoundingClientRect();
      if (
        e.clientX < r.left ||
        e.clientX > r.right ||
        e.clientY < r.top ||
        e.clientY > r.bottom
      )
        d.close();
    }
  });
});
window.addEventListener("beforeunload", (e) => {
  if (locked() || unsavedTakes.size) {
    e.preventDefault();
    e.returnValue = "";
  }
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    if (mode === "recording")
      stopRecording(
        "The tab became hidden. Your partial take is saved; record again with the studio visible.",
      );
    if (mode === "playing") stopPlayback();
  }
});
navigator.mediaDevices?.addEventListener?.("devicechange", () =>
  run(refreshDevices),
);
async function init() {
  setMode("loading");
  if (!window.MediaRecorder)
    throw Error(
      "Recording needs a current browser. Open this studio in Chrome or Edge.",
    );
  let all = await Store.projects();
  if (!all.length) {
    const response = await fetch("../timeline.json?v=20260910-mirror");
    if (!response.ok) throw Error("The chapter script could not load.");
    const raw = await response.json();
    const p = {
      ...validateTimeline(raw, raw.duration),
      id: "quorum-september-2026",
      updatedAt: Date.now(),
      settings: { ...defaults },
      selected: {},
    };
    await Store.saveProject(p);
    all = [p];
  }
  await loadProject(
    all.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0],
  );
  await refreshProjectMenu();
  requestAnimationFrame(draw);
}
run(init);
