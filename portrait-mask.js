// Copyright (c) 2026 Juanma Gomez. All rights reserved.
// SPDX-License-Identifier: LicenseRef-Take-Studio-Proprietary
// See LICENSE and LICENSING.md; prior MIT grants are preserved.
export function maskOptions(settings = {}) {
  const value = Number(settings.maskCleanup ?? 60);
  return {
    quality: settings.maskQuality === "fast" ? "fast" : "portrait",
    cleanup: Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 60,
  };
}

// Discard uncertain background while feathering the remaining edge. Increasing
// cleanup cannot bring background back. Confident hair/skin/accessories stay opaque.
export function personAlpha(confidence, cleanup = 60) {
  if (!Number.isFinite(confidence)) return 0;
  const amount = maskOptions({ maskCleanup: cleanup }).cleanup / 100;
  const low = 0.25 + amount * 0.5, high = Math.min(1, 0.65 + amount * (5 / 12));
  const t = Math.max(0, Math.min(1, (confidence - low) / (high - low)));
  return Math.round(t * t * (3 - 2 * t) * 255);
}
