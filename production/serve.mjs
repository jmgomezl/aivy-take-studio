// Local static server with byte ranges for media seeking.
import http from "node:http";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const port = Number(process.env.TAKE_STUDIO_PORT || 5183);
const types = {
  ".html": "text/html", ".css": "text/css", ".js": "text/javascript",
  ".wasm": "application/wasm", ".json": "application/json", ".mp4": "video/mp4",
  ".md": "text/plain", ".txt": "text/plain", ".woff2": "font/woff2",
};

http.createServer(async (req, res) => {
  try {
    if (!["GET", "HEAD"].includes(req.method)) {
      res.writeHead(405); return res.end();
    }
    const pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    if (pathname.split("/").some((part) => part.startsWith(".") || part === "node_modules")) {
      res.writeHead(403); return res.end();
    }
    const file = path.resolve(root, "." + (pathname.endsWith("/") ? pathname + "index.html" : pathname));
    if (!file.startsWith(root + path.sep)) {
      res.writeHead(403); return res.end();
    }
    const stat = await fsp.stat(file);
    if (!stat.isFile() || !stat.size) {
      res.writeHead(404); return res.end();
    }
    let start = 0, end = stat.size - 1, status = 200;
    if (req.headers.range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
      if (!match || (!match[1] && !match[2])) {
        res.writeHead(416, { "Content-Range": `bytes */${stat.size}` }); return res.end();
      }
      if (match[1]) {
        start = Number(match[1]);
        end = match[2] ? Math.min(Number(match[2]), end) : end;
      } else start = Math.max(0, stat.size - Number(match[2]));
      if (start > end || start >= stat.size) {
        res.writeHead(416, { "Content-Range": `bytes */${stat.size}` }); return res.end();
      }
      status = 206;
    }
    const headers = {
      "Content-Type": types[path.extname(file)] || "application/octet-stream",
      "Content-Length": end - start + 1, "Accept-Ranges": "bytes",
      "Cache-Control": "no-cache", "X-Content-Type-Options": "nosniff",
    };
    if (status === 206) headers["Content-Range"] = `bytes ${start}-${end}/${stat.size}`;
    res.writeHead(status, headers);
    if (req.method === "HEAD") return res.end();
    const stream = fs.createReadStream(file, { start, end });
    stream.on("error", () => res.destroy());
    stream.pipe(res);
  } catch {
    res.writeHead(404); res.end("Not found");
  }
}).listen(port, "127.0.0.1", () => console.log(`Take Studio: http://127.0.0.1:${port}/`));
