'use strict';
// Private local companion: the R tools and approval UI call this same core.
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const changes = require('../dist/change-service.js');
const clone = value => JSON.parse(JSON.stringify(value));
function initial() {
  return { state: { version: 1, current: 'p-local', selected: null,
    projects: [{ id: 'p-local', name: 'Local research' }], nodes: [], edges: [], inbox: [], proposals: [], audit: [] }, drafts: [] };
}
async function execute(db, request, owner = 'local-user') {
  changes.validate(db.state);
  const { action } = request;
  if (action === 'status') return { projects: db.state.projects, records: db.state.nodes.length, approvals: db.state.audit?.length || 0 };
  if (action === 'search') {
    const q = String(request.query || '').toLowerCase();
    return db.state.nodes.filter(n => (!request.project || n.project === request.project) && `${n.title} ${n.text}`.toLowerCase().includes(q)).slice(0, 50);
  }
  if (action === 'get') {
    const n = db.state.nodes.find(n => n.id === request.id);
    if (!n) throw new Error('Record not found');
    return { record: n, relationships: db.state.edges.filter(e => e.from === n.id || e.to === n.id) };
  }
  if (action === 'list') return db.drafts.filter(d => !d.status).map(d => ({ id: d.id, revision: d.revision, reason: d.reason, created: d.created }));
  if (action === 'preview') {
    const d = db.drafts.find(d => d.id === request.id && !d.status);
    if (!d) throw new Error('Pending proposal not found');
    return d;
  }
  if (action === 'draft_update') {
    const next = clone(db.state), n = next.nodes.find(n => n.id === request.id);
    if (!n) throw new Error('Record not found');
    n.title = request.title; n.text = request.text;
    const p = await changes.prepare(db.state, next, { reason: request.reason, author: 'mcp-draft' });
    db.drafts.push(p); return p;
  }
  if (action === 'draft_observation') {
    if (typeof request.text !== 'string' || !request.text.trim() || request.text.length > 20000) throw new Error('Observation must contain 1–20000 characters');
    const next = clone(db.state);
    if (!next.projects.some(p => p.id === request.project)) throw new Error('Project not found');
    const target = request.experiment ? next.nodes.find(n => n.id === request.experiment && n.project === request.project && n.type === 'experiment') : null;
    if (request.experiment && !target) throw new Error('Experiment not found in project');
    const id = `n-${randomUUID()}`, capture = `c-${randomUUID()}`, created = new Date().toISOString();
    const text = request.text.trim();
    next.inbox.push({ id: capture, project: request.project, kind: 'text', status: 'filed', title: 'MCP text observation', text, created, node: id });
    next.nodes.push({ id, project: request.project, type: 'observation', title: text.slice(0, 100), text,
      x: 400, y: 210, origin: 'capture', sourceCapture: capture, created });
    if (target) next.edges.push({ id: `e-${randomUUID()}`, from: id, to: target.id, label: 'evidence for' });
    const p = await changes.prepare(db.state, next, { reason: 'Add source-backed text observation', author: 'mcp-draft' });
    db.drafts.push(p); return p;
  }
  if (action === 'draft_import') {
    const exported = request.export;
    if (!exported || exported.app !== 'paivik') throw new Error('Not a PAIvik export');
    changes.validate(exported.state);
    if ([...exported.state.nodes, ...exported.state.inbox].some(n => n.fileId)) throw new Error('This first companion supports text-only imports. Keep file-bearing workspaces in the browser.');
    const p = await changes.prepare(db.state, exported.state, { reason: 'Import text-only browser workspace', author: owner });
    db.drafts.push(p); return p;
  }
  if (action === 'export') return { app: 'paivik', version: 1, exported: new Date().toISOString(), state: db.state, files: {} };
  if (action === 'commit') {
    const index = db.drafts.findIndex(d => d.id === request.id && !d.status);
    if (index < 0) throw new Error('Pending proposal not found or already committed');
    const p = db.drafts[index];
    // A status field would invalidate the proposal hash; keep the original immutable.
    db.state = await changes.commit(db.state, p, request.confirmation, owner);
    db.drafts.splice(index, 1);
    return { committed: p.id, audit: db.state.audit.at(-1) };
  }
  throw new Error('Unsupported workspace action');
}
async function run(file, request, owner) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  // Fail closed on concurrent access. A crashed process leaves a lock for manual inspection.
  const lock = `${file}.lock`;
  let fd;
  try { fd = fs.openSync(lock, 'wx'); }
  catch { throw new Error('Workspace busy or stale lock present; retry after checking the local worker'); }
  try {
    fs.writeFileSync(fd, String(process.pid));
    const db = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : initial();
    const result = await execute(db, request, owner);
    if (['draft_update', 'draft_observation', 'draft_import', 'commit'].includes(request.action)) {
      const tmp = `${file}.${randomUUID()}.tmp`;
      try {
        const out = fs.openSync(tmp, 'wx', 0o600);
        try { fs.writeFileSync(out, JSON.stringify(db)); fs.fsyncSync(out); } finally { fs.closeSync(out); }
        fs.renameSync(tmp, file);
      } finally { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); }
    }
    return result;
  } finally { fs.closeSync(fd); fs.unlinkSync(lock); }
}
if (require.main === module) {
  let input = '';
  process.stdin.setEncoding('utf8'); process.stdin.on('data', chunk => { input += chunk; });
  process.stdin.on('end', async () => {
    try {
      const file = process.env.PAIVIK_WORKSPACE;
      if (!file || !path.isAbsolute(file)) throw new Error('PAIVIK_WORKSPACE must be an absolute file path');
      const result = await run(file, JSON.parse(input), process.env.PAIVIK_OWNER || 'local-user');
      process.stdout.write(JSON.stringify({ ok: true, result }));
    } catch (error) { process.stdout.write(JSON.stringify({ ok: false, error: error.message })); process.exitCode = 1; }
  });
}
module.exports = { execute, run, initial };
