# Independent static deployment

For the copyright holder and separately authorized operators only. These steps
do not grant self-hosting rights. See [LICENSE](../LICENSE) and
[LICENSING.md](../LICENSING.md).

Take Studio owns its source and releases. Quorum only links to it and routes its
existing URL to this independent directory. No Quorum API, wallet, PM2 process,
environment file or financial journal is part of a studio deployment.

```text
Take Studio repo → npm run build → release directory
                                         ↑
quorum.aivylabs.xyz/demo-video/studio/ → nginx alias
Quorum application /api/             → unchanged agent service
```

1. Commit the studio changes, run `npm test` and `npm run build` using Node 22+.
   The build creates `dist/` with public assets and a `REVISION` file. No install
   is needed unless regenerating the bundled vendor assets.
2. Copy `dist/` to `/var/www/take-studio-releases/<commit>/` on the VPS.
3. Point `/var/www/take-studio` at that release. Keep the previous release for
   rollback. The symlink swap can be atomic; it does not restart any agent.
4. Install [nginx-location.conf](nginx-location.conf) as
   `/etc/nginx/snippets/take-studio.conf` and include that file inside the
   existing HTTPS server block. Run `nginx -t` before reloading nginx.
5. Verify the page, `REVISION`, JS/WASM MIME types, video range requests and a
   recording/export in an isolated browser context. Later static releases only
   need the symlink update; nginx does not need a reload.

For a new host, serve `dist/` at any HTTPS root or subpath. All runtime asset paths
are relative and bundled. A different origin has **different browser storage**:
download a ZIP backup at the old origin and restore it at the new one first.

## September 2026 extraction

The current URL is deliberately unchanged:
<https://quorum.aivylabs.xyz/demo-video/studio/>. The IndexedDB name/version,
project IDs and media format are also unchanged. Existing takes load without
copying or uploading them. The old studio folder is removed from Quorum's
current source tree; its historical commits remain intact. Take Studio's own
history retains the original studio commits via `git subtree split`.

Quorum's rehearsal page, film, script and blockchain evidence stay in Quorum.
The bundled sample film in this repository allows the studio to run by itself.
