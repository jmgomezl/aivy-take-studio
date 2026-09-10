# Third-party sources

All runtime assets are self-hosted. Their exact hashes are in
[`vendor/manifest.json`](vendor/manifest.json). No recording is sent to these projects.

| Component | Version / source | License |
| --- | --- | --- |
| Mediabunny | [1.56.1](https://github.com/Vanilagy/mediabunny/tree/v1.56.1), unmodified readable browser bundle | [MPL-2.0](vendor/MEDIABUNNY-LICENSE.txt). Corresponding source available in the linked release and npm package. |
| MediaPipe Tasks Vision | [1.0.1 package](https://www.npmjs.com/package/@mediapipe/tasks-vision/v/1.0.1), unmodified JS and module WASM | [Apache-2.0](vendor/MEDIAPIPE-LICENSE.txt) |
| Selfie segmenter | [float16 model, version 1](https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/1/selfie_segmenter.tflite) · [model documentation](https://developers.google.com/edge/mediapipe/solutions/vision/image_segmenter) | MediaPipe model distribution; [model card](https://storage.googleapis.com/mediapipe-assets/Model%20Card%20MediaPipe%20Selfie%20Segmentation.pdf) |
| fflate | [0.8.3](https://www.npmjs.com/package/fflate/v/0.8.3), unmodified browser module | [MIT](vendor/FFLATE-LICENSE.txt) |
| Manrope | [Google Fonts](https://github.com/google/fonts/tree/main/ofl/manrope), variable Latin WOFF2 | [OFL-1.1](vendor/MANROPE-OFL.txt) |
| JetBrains Mono | Parent demo kit's mono font | [OFL-1.1](../assets/JetBrainsMono-OFL.txt) |

Design and implementation are original application code. Browser techniques were
checked against [Mediabunny's guide](https://mediabunny.dev/guide/quick-start),
[Google's segmentation guide](https://developers.google.com/edge/mediapipe/solutions/vision/image_segmenter/web_js),
[MDN MediaRecorder](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder)
and [Apple's Continuity Camera guidance](https://support.apple.com/en-us/102546).

The external model demonstration photo used in local QA comes from Google's
segmentation documentation. It is a temporary fixture, **not included in the
studio or Quorum video**. Synthetic microphone/camera inputs and generated test
tones are also used only in isolated QA browser contexts, never as narration.
