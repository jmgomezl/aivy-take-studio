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
| Public deployment | The same browser workflow passed on the HTTPS site, including microphone/camera takes, local model loading, persistence, backup and a playable MP4. JS and WASM content types were verified. |
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

## Independent repository check

The extracted studio was checked from its own checkout at
`http://127.0.0.1:5183/`, with no Quorum server running on that origin. All five
unit checks and the complete short browser workflow passed: responsive layouts,
synthetic microphone/camera takes, persistence, local segmentation model,
backup, missing-chapter guard, a custom project and the 4-second video export.

For the short browser check, create temporary fixtures with FFmpeg first:

```sh
mkdir -p /tmp/take-studio-qa
ffmpeg -y -f lavfi -i testsrc2=size=1280x720:rate=30 -t 4 -c:v libx264 -pix_fmt yuv420p /tmp/take-studio-qa/visual.mp4
ffmpeg -y -f lavfi -i sine=frequency=440:sample_rate=48000 -t 1.7 /tmp/take-studio-qa/voice.wav
npm run dev
# In another terminal, with Playwright + Chrome installed:
npm run test:browser
```

The extended `test:export` check additionally expects `presenter.mp4` (a short
camera fixture) and `recorded-backup.zip` (produced by the browser check).


## iPhone reconnection · September 27, 2026

- **17 unit checks passed**, including changing Continuity Camera IDs,
  missing/ambiguous device names, dead video tracks with a live microphone,
  separate permission failures, probe cleanup/cancellation and preserving an
  active preview during discovery.
- On the author's Mac, **Find devices** discovered **Androide Camera** (the
  iPhone's name). Selecting it with **Shure MV51** produced live, unmuted audio
  and video tracks and a **1280 × 720** playing preview in Chrome.
- The live-hardware check used preview only: **no take was recorded or uploaded**.
  Physical disconnect/reconnect recovery is covered by mocked device tests;
  we did not unplug the user's active camera during this check.
- Existing project IDs, IndexedDB schema, recordings, scripts and selected
  takes are unchanged. This patch changes device discovery/setup only; export
  was not rerun for this patch. Earlier export results above remain historical.

## Portrait / chair cleanup · September 27, 2026

- **25 unit checks passed.** Added threshold/feathering, compatibility with old
  settings, model switching in fresh workers, GPU failure → CPU retry, and
  release of stale frames after a model change.
- Compared the previous filter and the actual new `BackgroundRemover` using a
  user-supplied screenshot in `production/check-mask.html`. The portrait model
  removed the large chair region beside the headphones while retaining the
  face, beard and headphones. This is one still-image example, not a guarantee
  for every chair, person, lighting condition or moving camera.
- Verified GPU inference in Chrome on the author's Mac. One warmed crop took
  about **27 ms**, compared with about **710 ms** for the detailed model on CPU;
  these are local measurements, not a cross-device performance claim.
- Switching **Portrait → Fast → Portrait** works. The SDK's module initialization
  requires a fresh worker for model changes; a regression test covers this.
- The cleanup slider and quality selection survived a page reload. Defaults are
  Portrait / 60 for older projects; no take or original recording is rewritten.
- A generated **2-second 720p MP4 with audio and a portrait overlay** passed
  through the real export function using the new filter. The container is
  2.069 seconds because of AAC padding. No microphone was accessed for this test.
- The comparison/export harness accepts a local image through a file input and
  generates silent media fixtures in browser memory. No photo or video fixture
  is included in Git or uploaded; the harness is excluded from the public build.
  Run the local server and open `/production/check-mask.html` to repeat it.


## Voice first — 1.3.0

Validated through Chrome UI using local synthetic media, with no user camera,
microphone, recordings or production storage modified:

- New-project workflow choice; blank-line script sections and headings; existing
  sample and custom Video first projects still load separately.
- Synthetic microphone recording continued to 14.6 seconds past a five-second
  estimate; Stop retained the complete take and reflowed the timeline.
- Synthetic camera + microphone recording retained both tracks and prior take.
  Trimming to three seconds updated the timeline; 720p MP4 export decoded with
  `readyState=4`, duration 3.072 seconds (AAC padding).
- Two imported voice sections, title card and timed demo clip cut produced a
  22-second film; resulting MP4 decoded at 22.08 seconds with audio padding.
- A 15-second Video first regression project exported through the original path.
- Self-hosted Whisper Tiny transcribed the public JFK fixture into editable
  phrases at 0.3, 4.6, 8.2 and 10.1 seconds. Cancellation unlocked the UI and
  preserved the previous transcript/take. No remote inference request.
- ZIP backup restored as a separate project with both recordings, transcript,
  original clip, visual cuts and selected-take mapping preserved.
- 390 px layout has no horizontal overflow; desktop transcript and clip columns
  reviewed at 1280 px. Responsive breakpoint checks also cover 320/768 px.
- 34 unit tests cover reflow, caps, invalid trims, visual ordering, missing clips,
  explicit last-frame holds, timestamp mapping, plus existing devices/masks.
- `npm audit`: zero reported vulnerabilities. Build excludes development fixtures.

For authorized manual recording regression, open
`/production/recording-fixture.html` on a separate local port/origin. Its synthetic
mic/camera adapter runs only in that development page; neither fixture file is
included in the release. No real microphone/camera permission is needed.

Transcription is approximate. Review words and visual cue timing. Real iPhone
availability and background cutout quality remain hardware/lighting dependent.

## Script-file import · 2026-09-27

- 40 automated tests pass, including BOM/CRLF normalization, Markdown grouping, chapter JSON metadata, ignored fixed timing, malformed files and input limits.
- Chrome local UI: created a two-section Voice first project from JSON; verified titles, spoken text and delivery notes.
- Loaded Markdown into the script editor, selected its second section and canceled: original chapter remained unchanged.
- Malformed JSON displayed a readable error without changing the draft.
- Imported TXT, selected its second section and saved: only the current chapter script changed; the second project chapter remained intact. Existing projects remained listed.
- UI screenshot capture and further browser checks were interrupted by an intermittent browser connection timeout. No production recording tab was reloaded.
