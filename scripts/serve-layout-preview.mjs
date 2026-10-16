import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, resolve, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../preview");
const port = Number(process.env.PREVIEW_PORT || 4176);
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml" };
const server = createServer(async (request, response) => {
  if (!["GET", "HEAD"].includes(request.method)) { response.writeHead(405, { Allow: "GET, HEAD" }); response.end(); return; }
  try {
    const url = new URL(request.url, "http://localhost");
    const path = resolve(root, `.${decodeURIComponent(url.pathname === "/" ? "/recursive-layout-preview.html" : url.pathname)}`);
    if (!path.startsWith(root + sep)) { response.writeHead(403); response.end(); return; }
    const content = await readFile(path);
    response.writeHead(200, { "Content-Type": types[extname(path)] || "application/octet-stream", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
    response.end(request.method === "HEAD" ? undefined : content);
  } catch (error) {
    response.writeHead(error.code === "ENOENT" || error.code === "EISDIR" ? 404 : 400, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("无法读取预览资源");
  }
});
server.on("error", (error) => { console.error(`预览服务启动失败：${error.message}`); process.exitCode = 1; });
server.listen(port, "127.0.0.1", () => console.log(`预览：http://127.0.0.1:${port}/recursive-layout-preview.html`));
