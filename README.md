# Take Studio

**Your story, one good take at a time.** An independent creator tool: record
a scripted video in chapters, keep your best takes and export a finished film.
The 14-chapter Quorum film is included as a sample project.

[Open Take Studio](https://quorum.aivylabs.xyz/demo-video/studio/)

**Proprietary software · v1.1.0.** Hosted use is permitted for your personal or
commercial videos; software reuse and self-hosting require separate permission.
Your recordings remain yours. [License and prior MIT release](LICENSING.md).

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

## Your own video projects

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

## Authorized development

The following instructions are for the copyright holder and developers with
separate written permission. They do not grant software reuse or self-hosting
rights. Run locally with **Node.js 22 or later**:

```sh
git clone https://github.com/jmgomezl/aivy-take-studio.git
cd aivy-take-studio
npm run dev
```

Open **http://127.0.0.1:5183/**. Runtime assets are already bundled; no install,
API key, account or Quorum backend is needed. Run `npm test` for the core checks.

The studio is plain HTML/CSS/ES modules and deploys as a static site. It has
**its own repository, dependencies and release directory**, separate from
Quorum's application and financial services. [Deployment guide](deploy/README.md).
The existing public URL is retained to preserve browser-saved recordings.

All default assets live in [`presets/quorum/`](presets/quorum/README.md) and
`assets/`; custom projects use your imported video and script. The default
project and IndexedDB identifiers remain compatible with the original studio.

To reproduce processing dependencies, run `npm ci --ignore-scripts && npm run
vendor`. See [third-party notices](THIRD-PARTY.md) and [checks](QA.md).

**Submission boundary:** this is a founder's recording utility. It does not
extend Quorum's insurance functionality or prove a new blockchain integration.
