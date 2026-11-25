/* A static file server for trying the examples: node tools/serve.js [port].
 * ES modules need http://, not file://. Serves the repository root. */
import {createServer} from 'node:http';
import {readFile, stat} from 'node:fs/promises';
import {extname, join, normalize, resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.argv[2] || process.env.PORT || 8090);
const types = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.md': 'text/plain; charset=utf-8', '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg'};

createServer(async (request, response) => {
  try {
    let path = decodeURIComponent(new URL(request.url, 'http://x').pathname);
    let file = normalize(join(root, path));
    if (!file.startsWith(root)) { response.writeHead(403).end('forbidden'); return; }
    if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
    const body = await readFile(file);
    const headers = {
      'content-type': types[extname(file)] || 'application/octet-stream',
      'content-length': body.length,
      'cache-control': 'no-store',
    };
    if (headers['content-type'] === 'audio/mpeg') {
      headers['accept-ranges'] = 'bytes';
      const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.range ?? '');
      if (range && (range[1] || range[2])) {
        const start = range[1] ? Number(range[1]) : Math.max(0, body.length - Number(range[2]));
        const end = range[1] && range[2] ? Math.min(Number(range[2]), body.length - 1) : body.length - 1;
        if (start > end) {
          response.writeHead(416, {'content-range': `bytes */${body.length}`}).end();
          return;
        }
        response.writeHead(206, {
          ...headers, 'content-length': end - start + 1,
          'content-range': `bytes ${start}-${end}/${body.length}`,
        }).end(body.subarray(start, end + 1));
        return;
      }
    }
    response.writeHead(200, headers).end(body);
  } catch {
    response.writeHead(404, {'content-type': 'text/plain'}).end('not found');
  }
}).listen(port, () => console.log(`Slice Engine examples: http://localhost:${port}/examples/`));
