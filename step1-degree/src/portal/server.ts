// CredVault MVP portal server — verifier portal, holder PWA, issuer console.
// Static hosting + JSON API. Stateless w.r.t. credential data (the presentation
// drop is a TTL cache for QR handoff only — bundles are processed and discarded).
import * as http from 'node:http';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { verifyPresentation } from '../verify-core';
import { projectRoot } from '../common';

const PORT = Number(process.env.PORT ?? 4050);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(__dirname, 'public');
const PACKAGES = path.join(projectRoot, 'packages');

// ─── presentation drop (TTL cache for QR handoff; NOT a credential store) ───
// MVP convenience for the QR handoff. PRODUCTION MODEL: the holder re-shares
// instantly (their app always has the package), so links are short-lived BY
// DESIGN — durable shares (with holder-controlled revocation) are a future
// product feature needing a real store. TTL configurable via env for pilots.
const DROP_TTL_MS = Number(process.env.PRESENTATION_TTL_MINUTES ?? 15) * 60 * 1000;
const drop = new Map<string, { presentation: any; expires: number }>();
setInterval(() => { const now = Date.now(); for (const [k, v] of drop) if (v.expires < now) drop.delete(k); }, 60000).unref();

// ─── batch/revoke job runner (spawns the runtime CLI, streams status) ───
const jobs = new Map<string, { status: string; log: string[]; startedAt: number }>();
function runJob(kind: 'batch' | 'revoke', args: string[]): string {
  const id = crypto.randomBytes(6).toString('hex');
  const job = { status: 'running', log: [] as string[], startedAt: Date.now() };
  jobs.set(id, job);
  const child = spawn('npm', ['run', 'runtime', '--silent', ...args], { cwd: projectRoot });
  child.stdout.on('data', (d) => job.log.push(...String(d).split('\n').filter(Boolean)));
  child.stderr.on('data', (d) => job.log.push(...String(d).split('\n').filter(Boolean)));
  child.on('close', (code) => {
    if (code !== 0) { job.status = 'failed (exit ' + code + ')'; return; }
    if (kind === 'batch') {
      // batch → premint → share: mint L2 proofs automatically so new packages
      // are immediately shareable with thresholds (the recurring footgun).
      job.log.push('── anchoring done; minting L2 proofs (premint)…');
      const pm = spawn('npm', ['run', 'premint', '--silent'], { cwd: projectRoot });
      pm.stdout.on('data', (d) => job.log.push(...String(d).split('\n').filter(Boolean)));
      pm.stderr.on('data', (d) => job.log.push(...String(d).split('\n').filter(Boolean)));
      pm.on('close', (pcode) => { job.status = pcode === 0 ? 'done' : 'failed (premint exit ' + pcode + ')'; });
    } else {
      job.status = 'done';
    }
  });
  return id;
}

const MIME: Record<string, string> = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
};

function send(res: http.ServerResponse, code: number, body: any, type = 'application/json') {
  res.writeHead(code, { 'Content-Type': type, 'Access-Control-Allow-Origin': '*' });
  res.end(typeof body === 'string' ? body : JSON.stringify(body, null, 2));
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve) => { let b = ''; req.on('data', (c) => { b += c; }); req.on('end', () => resolve(b)); });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://x');
  const p = url.pathname;

  try {
    // ─── API ───
    if (req.method === 'POST' && p === '/api/verify') {
      const { presentation, minGpa } = JSON.parse(await readBody(req));
      const result = await verifyPresentation(presentation, minGpa);
      return send(res, result.verdict === 'VERIFIED' ? 200 : 422, result);
    }
    if (req.method === 'POST' && p === '/api/presentations') {
      const { presentation } = JSON.parse(await readBody(req));
      const token = crypto.randomBytes(8).toString('hex');
      drop.set(token, { presentation, expires: Date.now() + DROP_TTL_MS });
      return send(res, 200, { token, expiresInSeconds: DROP_TTL_MS / 1000 });
    }
    if (req.method === 'GET' && p.startsWith('/api/presentations/')) {
      const token = p.split('/').pop()!;
      const entry = drop.get(token);
      if (!entry) return send(res, 404, { error: 'link expired or unknown — ask the holder to share again' });
      return send(res, 200, entry.presentation);
    }
    if (req.method === 'GET' && p === '/api/issuer/students') {
      const files = fs.existsSync(PACKAGES) ? fs.readdirSync(PACKAGES).filter((f) => f.endsWith('.package.json')) : [];
      const students = files.map((f) => {
        const pkg = JSON.parse(fs.readFileSync(path.join(PACKAGES, f), 'utf-8'));
        return { studentId: pkg.studentId, fullName: pkg.values.fullName, degree: pkg.values.degree, gpa: pkg.values.gpa, issuer: pkg.issuer, cohort: pkg.cohort, courses: (pkg.courses ?? []).length, l2Thresholds: (pkg.l2Proofs ?? []).map((x: any) => x.minGpa) };
      });
      return send(res, 200, { students });
    }
    if (req.method === 'GET' && p.startsWith('/api/packages/')) {
      const id = p.split('/').pop()!.replace(/\.json$/, '').replace(/[^A-Za-z0-9-]/g, '');
      const file = path.join(PACKAGES, id + '.package.json');
      if (!fs.existsSync(file)) return send(res, 404, { error: 'no such package' });
      return send(res, 200, fs.readFileSync(file, 'utf-8'));
    }
    if (req.method === 'POST' && p === '/api/issuer/batch') {
      const body = JSON.parse(await readBody(req));
      const cohortFile = path.join(projectRoot, 'data', 'cohort-upload.json');
      fs.writeFileSync(cohortFile, JSON.stringify(body.cohort, null, 2));
      const jobId = runJob('batch', ['batch', cohortFile]);
      return send(res, 202, { jobId });
    }
    if (req.method === 'POST' && p === '/api/issuer/revoke') {
      const { studentId } = JSON.parse(await readBody(req));
      const jobId = runJob('revoke', ['revoke', studentId]);
      return send(res, 202, { jobId });
    }
    if (req.method === 'GET' && p.startsWith('/api/issuer/jobs/')) {
      const job = jobs.get(p.split('/').pop()!);
      return job ? send(res, 200, job) : send(res, 404, { error: 'unknown job' });
    }
    if (req.method === 'GET' && p === '/api/health') {
      return send(res, 200, { status: 'ok', service: 'credvault-portal' });
    }

    // ─── static ───
    let file = p === '/' ? '/index.html' : p;
    const abs = path.join(PUBLIC, file);
    if (!abs.startsWith(PUBLIC) || !fs.existsSync(abs) || fs.statSync(abs).isDirectory()) {
      return send(res, 404, 'not found', 'text/plain');
    }
    // static files: send raw bytes with the right MIME type (not JSON!)
    res.writeHead(200, { 'Content-Type': MIME[path.extname(abs)] ?? 'application/octet-stream' });
    return res.end(fs.readFileSync(abs));
  } catch (e) {
    return send(res, 500, { error: (e as Error).message });
  }
});

server.listen(PORT, () => {
  console.log('credvault portal on :' + PORT);
  console.log('  verifier portal → http://localhost:' + PORT + '/verify.html');
  console.log('  holder app      → http://localhost:' + PORT + '/holder.html');
  console.log('  issuer console  → http://localhost:' + PORT + '/issuer.html');
});
