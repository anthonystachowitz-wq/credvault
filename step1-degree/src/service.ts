// Step 2.8 — stateless verifier HTTP service (portal precursor).
// POST /verify  { presentation, minGpa? }  →  JSON verdict. Holds NO state.
import * as http from 'node:http';
import { verifyPresentation } from './verify-core';

const PORT = Number(process.env.PORT ?? 4050);

const server = http.createServer(async (req, res) => {
  if (req.method === 'POST' && req.url === '/verify') {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', async () => {
      try {
        const { presentation, minGpa } = JSON.parse(body);
        const result = await verifyPresentation(presentation, minGpa);
        res.writeHead(result.verdict === 'VERIFIED' ? 200 : 422, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result, null, 2));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: (e as Error).message }));
      }
    });
    return;
  }
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', service: 'credvault-verifier', stateless: true }));
    return;
  }
  res.writeHead(404).end('POST /verify or GET /health');
});

server.listen(PORT, () => console.log('credvault verifier service on :' + PORT + ' (stateless — stores nothing)'));
