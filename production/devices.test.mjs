// Copyright (c) 2026 Juanma Gomez. All rights reserved.
// SPDX-License-Identifier: LicenseRef-Take-Studio-Proprietary
// See LICENSE and LICENSING.md; prior MIT grants are preserved.
import test from "node:test";
import assert from "node:assert/strict";
import { resolveDevice, devicesReady, discoverDevices, deviceError } from "../devices.js";

const cam = (deviceId, label = "Androide Camera") => ({ kind: "videoinput", deviceId, label });
const track = kind => ({ kind, readyState: "live", stop() { this.readyState = "ended"; } });
const stream = tracks => ({
  getTracks: () => tracks,
  getAudioTracks: () => tracks.filter(t => t.kind === "audio"),
  getVideoTracks: () => tracks.filter(t => t.kind === "video"),
});

test("reconnecting an iPhone restores its unique label after its ID changes", () => {
  assert.deepEqual(resolveDevice([cam("new")], "videoinput", "old", "Androide Camera"),
    { id: "new", label: "Androide Camera", missing: false });
});
test("missing or ambiguous cameras keep the saved choice instead of selecting the Mac camera", () => {
  for (const list of [[cam("mac", "MacBook Pro Camera")], [cam("a"), cam("b")], [cam("", "")]]) {
    assert.deepEqual(resolveDevice(list, "videoinput", "old", "Androide Camera"),
      { id: "old", label: "Androide Camera", missing: true });
  }
});
test("explicit default stays default; exact IDs win over label recovery", () => {
  assert.equal(resolveDevice([cam("new")], "videoinput").id, "");
  assert.equal(resolveDevice([cam("old", "Updated name"), cam("new")], "videoinput", "old", "Androide Camera").id, "old");
});
test("a live mic does not make a disconnected camera ready for recording", () => {
  const mic = track("audio"), camera = track("video"), live = stream([mic, camera]);
  assert.equal(devicesReady(live, true), true);
  camera.stop();
  assert.equal(devicesReady(live, true), false);
  assert.equal(devicesReady(live, false), true);
  mic.stop();
  assert.equal(devicesReady(live, false), false);
  assert.equal(devicesReady(null, true), false);
});
test("discovery releases both probes and requests each kind separately", async () => {
  const tracks = [], calls = [];
  const result = await discoverDevices({ async getUserMedia(constraints) {
    calls.push(constraints);
    const t = track(constraints.audio ? "audio" : "video"); tracks.push(t);
    return stream([t]);
  } });
  assert.deepEqual(calls, [{ audio: true, video: false }, { audio: false, video: true }]);
  assert.equal(tracks.every(t => t.readyState === "ended"), true);
  assert.deepEqual(result, { errors: [], canceled: false });
});
test("a mic permission error does not prevent discovery of the camera", async () => {
  const camera = track("video"), blocked = { name: "NotAllowedError" };
  const result = await discoverDevices({ async getUserMedia({ audio }) {
    if (audio) throw blocked;
    return stream([camera]);
  } });
  assert.deepEqual(result.errors, [{ kind: "audio", error: blocked }]);
  assert.equal(camera.readyState, "ended");
});
test("canceling during a permission request releases the eventual stream and skips the next input", async () => {
  let canceled = false, calls = 0;
  const mic = track("audio");
  const result = await discoverDevices({ async getUserMedia() {
    calls++; canceled = true; return stream([mic]);
  } }, { canceled: () => canceled });
  assert.equal(calls, 1);
  assert.equal(result.canceled, true);
  assert.equal(mic.readyState, "ended");
});
test("discovery does not reopen or stop an active preview", async () => {
  const mic = track("audio"), camera = track("video");
  const result = await discoverDevices({ getUserMedia() { throw Error("Must not be called"); } }, { active: stream([mic, camera]) });
  assert.deepEqual(result.errors, []);
  assert.equal(mic.readyState, "live");
  assert.equal(camera.readyState, "live");
});
test("device errors distinguish blocked permission, absent camera and stale selection", () => {
  assert.match(deviceError({ name: "NotAllowedError" }, "Camera"), /Camera access is blocked/);
  assert.match(deviceError({ name: "NotFoundError" }, "Camera"), /USB/);
  assert.match(deviceError({ name: "OverconstrainedError" }, "Camera"), /selection is no longer available/);
});
