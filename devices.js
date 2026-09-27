// Copyright (c) 2026 Juanma Gomez. All rights reserved.
// SPDX-License-Identifier: LicenseRef-Take-Studio-Proprietary
// See LICENSE and LICENSING.md; prior MIT grants are preserved.

// IDs may change when Continuity Camera reconnects. Only recover by an exact,
// unique label; never silently switch a saved selection to another camera.
export function resolveDevice(list, kind, id = "", label = "") {
  const inputs = list.filter(d => d.kind === kind && d.deviceId);
  if (!id) return { id: "", label: "", missing: false };
  const exact = inputs.find(d => d.deviceId === id);
  if (exact) return { id, label: exact.label || label, missing: false };
  const matches = label ? inputs.filter(d => d.label === label) : [];
  if (matches.length === 1)
    return { id: matches[0].deviceId, label, missing: false };
  return { id, label, missing: true };
}

export function devicesReady(stream, withCamera) {
  return Boolean(stream?.getAudioTracks().some(t => t.readyState === "live") &&
    (!withCamera || stream.getVideoTracks().some(t => t.readyState === "live")));
}

export function deviceError(error, device = "Camera or microphone") {
  switch (error?.name) {
    case "NotAllowedError":
    case "SecurityError":
      return `${device} access is blocked. Allow it in this site's browser permissions and macOS Privacy & Security, then try again.`;
    case "NotFoundError":
      return `${device} was not made available by the browser. For iPhone, connect by USB, tap Trust, then lock and mount it nearby. Press Find devices again. If it is still missing, save your work and restart the browser.`;
    case "NotReadableError":
    case "AbortError":
      return `${device} could not start. Close other apps using it, reconnect it, then try again.`;
    case "OverconstrainedError":
      return `${device} selection is no longer available. Press Find devices and select the reconnected device.`;
    default:
      return error?.message || `${device} could not connect. Please try again.`;
  }
}

// Explicit user action only. Probe the inputs separately: an unavailable camera
// must not hide a working microphone. Every temporary track is stopped, including
// when the user cancels while the browser permission prompt is still open.
export async function discoverDevices(media, { active, canceled = () => false } = {}) {
  const errors = [];
  for (const kind of ["audio", "video"]) {
    if (canceled()) break;
    if (active?.getTracks().some(t => t.kind === kind && t.readyState === "live")) continue;
    let stream;
    try {
      stream = await media.getUserMedia({ audio: kind === "audio", video: kind === "video" });
    } catch (error) {
      errors.push({ kind, error });
    } finally {
      stream?.getTracks().forEach(t => t.stop());
    }
  }
  return { errors, canceled: canceled() };
}
