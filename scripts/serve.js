import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import { join, normalize, extname } from "node:path";

const root = join(process.cwd(), process.argv[2] || "examples");
const port = Number(process.env.PORT) || 5173;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

const server = http.createServer(async (req, res) => {
  try {
    // Resolve the request path inside the repo, never above it.
    let urlPath = decodeURIComponent(new URL(req.url, "http://x").pathname);
    let filePath = normalize(join(process.cwd(), urlPath));
    if (!filePath.startsWith(process.cwd())) {
      res.writeHead(403).end("Forbidden");
      return;
    }
    if (urlPath === "/") filePath = join(root, "index.html");
    else {
      try {
        if ((await stat(filePath)).isDirectory()) filePath = join(filePath, "index.html");
      } catch {
        // fall through to read attempt / 404
      }
    }
    const body = await readFile(filePath);
    res.writeHead(200, { "content-type": MIME[extname(filePath)] || "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404, { "content-type": "text/plain" }).end("Not found");
  }
});

server.listen(port, () => {
  console.log(`RisBo.js examples → http://localhost:${port}/`);
  console.log(`Serving ${root}`);
});
