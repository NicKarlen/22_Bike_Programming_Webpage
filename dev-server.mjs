// Throwaway static file server for local testing only — not part of the deployed app.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

const ROOT = import.meta.dirname;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };

http.createServer(async (req, res) => {
  let path = decodeURIComponent(req.url.split('?')[0]);
  if (path === '/') path = '/index.html';
  try {
    const data = await readFile(join(ROOT, path));
    res.writeHead(200, { 'Content-Type': TYPES[extname(path)] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
}).listen(8123, () => console.log('Serving on http://localhost:8123'));
