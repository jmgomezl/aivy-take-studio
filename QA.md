# Take Studio checks · September 10, 2026

Tests use isolated browser storage, fake browser devices, generated test tones
and a temporary model demonstration photo. No user microphone or camera was
accessed, no recordings were uploaded, and no Quorum business action was called.

| Check | Result |
| --- | --- |
| Layout | Desktop, 1024, 768, 390 and 320 px: no horizontal overflow. Desktop and mobile screenshots visually reviewed. |
| Recording | Real browser MediaRecorder output from synthetic microphone and camera; three-second countdown, stop, retake selection and playable media. |
| Persistence | Original audio and camera blobs survived reload. A take is marked saved after IndexedDB commit. Failure keeps the take available in memory with backup/download guidance. |
| Camera effect | Local worker initialized the self-hosted model. A human model fixture produced a visible presenter cutout over the actual Quorum video, inspected at full resolution. |
| Timing rules | Unit checks reject gaps/overlaps in chapter scripts, negative trims and clips extending past the allotted chapter. Timing is never compressed. |
| Audio | Silence-aware normalization, bounded gain and edge fades tested; the combined 48 kHz mono WAV follows chapter positions. |
| Short export | Two imported takes → a playable 4-second 720p H.264/AAC MP4. Video track is exactly 4 seconds; AAC encoder padding adds about 75 ms to the container. |
| Full export | 14 voice takes + two camera cutouts → 1920 × 1080 H.264/AAC MP4, 30 fps. Video track exactly 239 seconds; container 239.083 seconds. Complete file decoded without errors. |
| Export boundaries | Missing chapters block final export; draft silence must be selected explicitly. Canceling export retains all takes and permits another export. |
| Backup | Downloaded ZIP restored two original media takes into a separate project. The original project remained available. |
| Reuse | A new local video + two-chapter JSON created a separate project and exported successfully. |
| Privacy | Runtime processing assets are self-hosted. Camera/microphone access is requested only by user controls. No upload or Quorum API endpoints are used. |

Automated scripts:

- `npm test` in this directory: timing, normalization, fades and overlay bounds.
- `production/check-browser.mjs`: UI, devices, persistence, responsive layouts,
  model loading, new projects and a short export.
- `production/check-export.mjs`: backup restoration, 14 takes, cancellation and
  full-length export with segmentation.

The browser scripts require Playwright + Chrome. Use `PLAYWRIGHT_MODULE` to
select an existing installation and `TAKE_STUDIO_URL` to test another host.
Temporary media fixtures and results go under `/tmp/take-studio-qa`, outside Git.

Actual MacBook/Continuity Camera hardware, your room lighting, your voice and
Safari still need a short check on your device. The app detects available codecs
and cameras, but a synthetic-device test cannot establish those hardware results.
Watch your complete human-narrated final export before submitting.
