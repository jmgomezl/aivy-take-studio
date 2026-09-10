# Take Studio

**Your story, one good take at a time.** A separate creator tool, preloaded with
the 14-chapter Quorum film and reusable for later projects.

[Open Take Studio](https://quorum.aivylabs.xyz/demo-video/studio/)

```text
Choose a chapter → record voice / camera → choose & trim a take
                                             ↓
                       preview → combine → download video + voice
```

## Record

1. **Set up mic & camera.** Choose your microphone. Optionally enable the camera,
   choose a device, then press **Enable preview**. Nothing records before you
   press **Record chapter** and the three-second countdown finishes.
2. **Record one chapter.** Follow the script beside the video. The clocks show
   elapsed time, time remaining and position in the full film. Recording stops
   at the chapter boundary by default. Turn that off in settings to allow an
   overrun; trim it before export.
3. **Keep your favourite take.** Every retake stays available. Choose one, listen,
   trim its start/end, or add a lead-in. Imported audio and video work too.
4. **Build a preview**, then **Finish & export**. The chosen take in each chapter
   follows the original video timing. Export refuses missing chapters unless
   you explicitly allow silent gaps for a draft.
5. **Download the video and a backup.** The backup includes original recordings,
   trim decisions, selected takes, camera settings and your script. Custom
   projects include the imported visual video too.

The studio does **not** upload your recordings or automatically publish the final
video. Download it, watch it once in full and submit it yourself.

## Camera

- Choose the MacBook camera or an iPhone that macOS exposes through
  [Continuity Camera](https://support.apple.com/en-us/102546). The website cannot
  activate a phone that the operating system has not made available. Use the
  device refresh button after connecting it.
- **Remove background** runs Google's MediaPipe selfie segmentation locally in
  a worker. No camera frames go to an AI service. Front lighting and an uncluttered
  background improve edges; this is not a guarantee of perfect hair masking.
- The presenter defaults to the **lower left**. Change corner, size or mirror
  orientation. Turn the camera off for individual chapters where it covers
  important evidence. A rounded frame is available as an alternative.
- Original camera recordings keep the original background **in your local
  browser and backup**. The final composited video uses the chosen effect.

## What “polish” does

Voice levels are matched using a silence-aware RMS estimate, with a maximum
6 dB boost and peak headroom. A 25 ms fade at each audio edge reduces clicks;
100 ms presenter fades soften video entrances/exits. Short takes leave silence
inside their allotted chapter. Speech and the visual edit are never sped up.

This does not invent words, repair a sentence cut in the middle or perform
studio-grade denoising. The browser's microphone processing helps with noise and
echo. Use a retake when the delivery does not fit; headphones help during review.

## Local storage and export

| Function | Implementation |
| --- | --- |
| Takes and settings | IndexedDB, scoped to this browser and origin. A take is called saved only after its transaction commits. |
| Backup / restore | Local ZIP via fflate. Restoring creates another project; it does not overwrite the original. |
| Microphone and camera | Browser `getUserMedia` and `MediaRecorder`; explicit user controls. |
| Background removal | Self-hosted MediaPipe 1.0.1 and the pinned selfie model, in a Web Worker. |
| Voice assembly | Decoded audio at 48 kHz, deterministic chapter placement, gain and fades. WAV export available separately. |
| Final composition | Mediabunny 1.56.1 + WebCodecs, a 30 fps canvas with exact frame timestamps. 1080p or 720p. |
| Format | H.264/AAC MP4 when the browser can encode both; VP9/Opus WebM fallback. The download uses its actual format. |

Keep the export tab open. Browser storage can be cleared or evicted; **backup is
the portable copy**. There is no cloud account recovery. Imports are limited to
20 minutes and 512 MB for the visual video, 256 MB per take. Browser ZIP backups
are limited to 512 MB; a long project may require individual take downloads.

Use a current Chrome or Edge on macOS for the broadest codec support. Device and
codec support is detected at runtime, and failures are shown instead of creating
a pretend export. Safari and specific Continuity Camera hardware still need
testing on your actual devices.

## Reuse and development

**New project** accepts a local video and a JSON chapter script. Download the
example in the dialog. Times must be consecutive and cover the entire video:

```json
{"title":"My demo","chapters":[
  {"start":0,"end":10,"title":"The problem","script":"Your own words."},
  {"start":10,"end":30,"title":"The demo","script":"Show what you built."}
]}
```

Without JSON, the imported video becomes one chapter. Edit text from the prompter.
The visual video’s existing audio is muted; the output uses your selected takes.
The original Quorum project and its recordings stay separate.

Serve the parent kit locally with `node docs/demo-video/production/serve.mjs` and
open `http://127.0.0.1:5180/studio/index.html`. HTTPS is required outside localhost.

The studio is plain HTML/CSS/ES modules. It has **no dependency on the Quorum
agent, wallet or financial APIs**. Copy this folder and replace the two preset
URLs (`../timeline.json` and the visual MP4) to host it elsewhere. The mono font
is in the parent kit; all processing libraries, model and body font are bundled.

To reproduce vendor assets: run `npm ci --ignore-scripts && npm run vendor` in
this folder. Versions are locked independently from Quorum's runtime.
See [third-party notices](THIRD-PARTY.md) and [checks](QA.md).

**Submission boundary:** this is a founder's recording utility. It does not
extend Quorum's insurance functionality or prove a new blockchain integration.
