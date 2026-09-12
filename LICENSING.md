# Take Studio licensing

**Version 1.1.0 onward is proprietary. Copyright (c) 2026 Juanma Gomez.
All rights reserved, subject to the permissions and exceptions in [LICENSE](LICENSE).**

You may use the authorized hosted studio for personal or commercial recordings.
You keep your rights to your own content and may export, share and monetize it.
Software redistribution, modification and self-hosting require separate written
permission, except where a prior license or applicable law grants those rights.

## Release boundary

The last MIT release is version 1.0.0 at commit
[`64479f8`](https://github.com/jmgomezl/aivy-take-studio/tree/64479f89b4ca18b15b3cc46a44f28caf40eb609b).
Its [original MIT license](https://github.com/jmgomezl/aivy-take-studio/blob/64479f89b4ca18b15b3cc46a44f28caf40eb609b/LICENSE)
and Git history remain intact. Existing MIT permissions are not revoked or
replaced. The proprietary change begins with the commit introducing version
1.1.0 and this notice, effective 2026-09-11.

Existing MIT code can still be used under its original grant. This transition
reserves rights in new original contributions; it cannot make earlier published
MIT copies exclusive. A public GitHub repository also remains subject to
GitHub's viewing and on-platform forking terms.

## Dependencies and sample media

[Third-party components](THIRD-PARTY.md) retain their individual licenses.
Mediabunny remains MPL-2.0, MediaPipe's code Apache-2.0, fflate MIT, and the bundled
fonts OFL-1.1. The model and example film retain their documented provenance and
applicable terms; the Studio license does not claim ownership of those assets.
MPL-covered source and notices remain available through the links in
THIRD-PARTY.md and the bundled readable vendor source.

Quorum's sample film and script are imported from a separately licensed project.
See [sample provenance](presets/quorum/README.md). User recordings and exports
are not relicensed as Studio software.

## Maintainer notes

- Keep `LICENSE`, this notice, and third-party notices in every static release.
- Keep package metadata marked `SEE LICENSE IN LICENSE` and `private: true`.
- Do not replace third-party notices with the proprietary application notice.
- Changes to third-party code must continue to comply with its own license.
- Obtain appropriate rights before accepting outside code contributions.

For separate software permissions, contact [Juanma Gomez](https://github.com/jmgomezl).
