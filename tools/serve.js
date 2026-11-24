/* A static file server for trying the examples: node tools/serve.js [port].
 * ES modules need http://, not file://. Serves the repository root. */
import {createServer} from 'node:http';
import {readFile, stat} from 'node:fs/promises';
import {extname, join, normalize, resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.argv[2] || process.env.PORT || 8090);
const types = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.md': 'text/plain; charset=utf-8', '.ico': 'image/x-icon'};

createServer(async (request, response) => {
  try {
    let path = decodeURIComponent(new URL(request.url, 'http://x').pathname);
    let file = normalize(join(root, path));
    if (!file.startsWith(root)) { response.writeHead(403).end('forbidden'); return; }
    if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
    const body = await readFile(file);
    response.writeHead(200, {'content-type': types[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store'});
    response.end(body);
  } catch {
    response.writeHead(404, {'content-type': 'text/plain'}).end('not found');
  }
}).listen(port, () => console.log(`Slice Engine examples: http://localhost:${port}/examples/`));
