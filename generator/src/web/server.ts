// CredVault Generator Web Server
// Serves the schema builder UI and exposes generator APIs.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { parseSchema } from '../schemas/parser.js';
import { assertValid } from '../schemas/validator.js';
import { emitDescriptor, canonicalJson } from '../schemas/descriptor.js';
import { emitIssuerConfig } from '../runtime/issuer-config.js';
import { generatePackages } from '../runtime/package.js';
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..', '..');
const webDist = path.join(projectRoot, 'web', 'dist');

const templatesDir = path.join(projectRoot, 'templates');
const templateManifest = JSON.parse(fs.readFileSync(path.join(templatesDir, 'index.json'), 'utf8'));

function loadTemplate(id: string) {
  const entry = templateManifest.templates.find((t: any) => t.id === id);
  if (!entry) throw new Error(`TEMPLATE_NOT_FOUND:${id}`);
  return JSON.parse(fs.readFileSync(path.join(projectRoot, entry.path), 'utf8'));
}

const app = express();
app.use(express.json({ limit: '5mb' }));

// API: validate schema
app.post('/api/validate-schema', (req, res) => {
  try {
    const schema = parseSchema(req.body.schema);
    const issues = assertValid(schema);
    res.json({ ok: true, issues: [] });
  } catch (e: any) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

// API: generate preview (descriptor + issuer config)
app.post('/api/generate-preview', (req, res) => {
  try {
    const schema = parseSchema(req.body.schema);
    assertValid(schema);
    const descriptor = emitDescriptor(schema);
    const hash = createHash('sha256').update(canonicalJson(descriptor)).digest('hex');
    const issuerConfig = emitIssuerConfig(descriptor, hash);
    res.json({ ok: true, descriptor, issuerConfig, descriptorHash: hash });
  } catch (e: any) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

// API: generate full artifacts
app.post('/api/generate', (req, res) => {
  try {
    const schema = parseSchema(req.body.schema);
    assertValid(schema);
    const descriptor = emitDescriptor(schema);
    const hash = createHash('sha256').update(canonicalJson(descriptor)).digest('hex');
    const issuerConfig = emitIssuerConfig(descriptor, hash, { network: 'undeployed' });

    const outDir = path.join(projectRoot, 'output', schema.name);
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'descriptor.json'), JSON.stringify(descriptor, null, 2));
    fs.writeFileSync(path.join(outDir, 'issuer-config.json'), JSON.stringify(issuerConfig, null, 2));
    fs.writeFileSync(path.join(outDir, 'schema.ast.json'), JSON.stringify(schema, null, 2));

    // Compile contract
    const contractSrc = path.join(projectRoot, 'contracts', 'anchor-core.compact');
    const contractOut = path.join(outDir, 'managed', 'anchor-core');
    fs.mkdirSync(path.dirname(contractOut), { recursive: true });
    execSync(`compact compile "${contractSrc}" "${contractOut}"`, {
      stdio: 'pipe',
      env: { ...process.env, PATH: `${process.env.HOME}/.local/bin:${process.env.PATH}` },
    });

    res.json({ ok: true, outDir, descriptorHash: hash });
  } catch (e: any) {
    res.status(400).json({ ok: false, error: e.message });
  }
});


// API: list templates
app.get('/api/templates', (_req, res) => {
  res.json({ ok: true, templates: templateManifest.templates });
});

// API: load a template
app.get('/api/templates/:id', (req, res) => {
  try {
    const schema = loadTemplate(req.params.id);
    res.json({ ok: true, schema });
  } catch (e: any) {
    res.status(404).json({ ok: false, error: e.message });
  }
});

// Serve static UI in production; dev uses Vite proxy
if (fs.existsSync(webDist)) {
  app.use(express.static(webDist));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(webDist, 'index.html'));
  });
}

const PORT = process.env.PORT || 4051;
app.listen(PORT, () => {
  console.log(`CredVault generator web server on http://127.0.0.1:${PORT}`);
  if (!fs.existsSync(webDist)) {
    console.log('  (web/dist not found; run "cd web && npm run build" to serve the UI)');
  }
});