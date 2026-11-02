const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const core = require('../dist/change-service.js');
const backend = require('../server/workspace.cjs');
const clone = value => structuredClone(value);
function state() {
  const s = backend.initial().state;
  s.nodes.push({ id: 'experiment-1', project: 'p-local', type: 'experiment', title: 'Experiment 1', text: 'Original evidence', x: 100, y: 100 });
  return s;
}
async function edit(s = state()) {
  const next = clone(s); next.nodes[0].text = 'Updated description';
  return core.prepare(s, next, { reason: 'Correct description' });
}
test('drafting never changes source state; approval is mandatory', async () => {
  const s = state(), original = clone(s), p = await edit(s);
  assert.deepEqual(s, original);
  await assert.rejects(core.commit(s, p), /approval/);
  assert.deepEqual(s, original);
});
test('matching approval commits exact operations with history and source values', async () => {
  const s = state(), p = await edit(s);
  const next = await core.commit(s, p, core.confirmation(p));
  assert.equal(next.nodes[0].text, 'Updated description');
  assert.equal(next.audit[0].operations[0].before.text, 'Original evidence');
  assert.equal(next.audit[0].hash, p.hash);
  assert.equal(s.nodes[0].text, 'Original evidence');
});
test('wrong actor, revision, hash or proposal ID cannot approve', async () => {
  const s = state(), p = await edit(s);
  for (const mismatch of [{actor:'model'}, {revision:2}, {hash:'wrong'}, {proposalId:'other'}, {confirmed:false}]) {
    await assert.rejects(core.commit(s, p, {...core.confirmation(p), ...mismatch}));
  }
});
test('changing an already previewed proposal invalidates its approval', async () => {
  const s = state(), p = await edit(s), approval = core.confirmation(p);
  p.operations[0].after.text = 'Hidden addition';
  await assert.rejects(core.commit(s, p, approval), /Proposal changed/);
});
test('stale workspace and replay are rejected', async () => {
  const s = state(), p = await edit(s), approval = core.confirmation(p);
  const concurrent = clone(s); concurrent.nodes[0].title = 'Changed by another session';
  await assert.rejects(core.commit(concurrent, p, approval), /Workspace changed/);
  const committed = await core.commit(s, p, approval);
  await assert.rejects(core.commit(committed, p, approval), /already committed/);
});
test('moving nodes does not invalidate scientific approval or undo layout', async () => {
  const s = state(), p = await edit(s); s.nodes[0].x = 300;
  const next = await core.commit(s, p, core.confirmation(p));
  assert.equal(next.nodes[0].x, 300);
});
test('deleting a linked record without its edge fails before any change', async () => {
  const s = state(); s.nodes.push({...s.nodes[0], id:'sample-1',type:'sample'});
  s.edges.push({id:'edge-1', from:'experiment-1',to:'sample-1',label:'analyzes'});
  const next = clone(s); next.nodes.pop();
  await assert.rejects(core.prepare(s,next,{reason:'Delete sample'}),/missing record/);
  assert.equal(s.nodes.length,2);
});
test('delete with its relationships commits atomically', async () => {
  const s = state(); s.nodes.push({...s.nodes[0], id:'sample-1',type:'sample'});
  s.edges.push({id:'edge-1', from:'experiment-1',to:'sample-1',label:'analyzes'});
  const next = clone(s); next.nodes.pop(); next.edges=[];
  const p=await core.prepare(s,next,{reason:'Delete sample and its link'});
  const result=await core.commit(s,p,core.confirmation(p));
  assert.equal(result.nodes.length,1);assert.equal(result.edges.length,0);assert.equal(result.audit[0].operations.length,2);
});
test('invalid imports reject duplicate IDs, unsafe IDs and broken projects', () => {
  for (const mutate of [s=>s.nodes.push(clone(s.nodes[0])),s=>s.nodes[0].id='"><script>',s=>s.nodes[0].project='missing']) {
    const s=state();mutate(s);assert.throws(()=>core.validate(s));
  }
});
test('MCP drafts create no research records until approved by owner', async () => {
  const db=backend.initial();
  const p=await backend.execute(db,{action:'draft_observation',project:'p-local',text:'Observed at station 8'});
  assert.equal(db.state.nodes.length,0);assert.equal(db.state.inbox.length,0);assert.equal(db.drafts.length,1);
  await assert.rejects(backend.execute(db,{action:'commit',id:p.id,confirmation:core.confirmation(p,'model')}));
  await backend.execute(db,{action:'commit',id:p.id,confirmation:core.confirmation(p)});
  assert.equal(db.state.nodes.length,1);assert.equal(db.state.nodes[0].sourceCapture,db.state.inbox[0].id);
  assert.equal(db.drafts.length,0);
});
test('unknown operations and file-bearing imports fail closed', async () => {
  const db=backend.initial();
  await assert.rejects(backend.execute(db,{action:'approve'}),/Unsupported/);
  const s=state();s.nodes[0].fileId='f-1';
  await assert.rejects(backend.execute(db,{action:'draft_import',export:{app:'paivik',state:s}}),/text-only/);
});
test('local drafts survive restart, approval persists, and locks fail closed', async () => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'paivik-test-')),file=path.join(dir,'workspace.json');
  try {
    const p=await backend.run(file,{action:'draft_observation',project:'p-local',text:'Persist this observation'});
    assert.equal((await backend.run(file,{action:'list'})).length,1);
    await backend.run(file,{action:'commit',id:p.id,confirmation:core.confirmation(p)});
    assert.equal((await backend.run(file,{action:'status'})).records,1);
    const prior=fs.readFileSync(file,'utf8');
    await assert.rejects(backend.run(file,{action:'commit',id:p.id,confirmation:core.confirmation(p)}));
    assert.equal(fs.readFileSync(file,'utf8'),prior);
    fs.writeFileSync(file+'.lock','test');
    await assert.rejects(backend.run(file,{action:'status'}),/busy/);
  } finally {fs.rmSync(dir,{recursive:true,force:true});}
});

test('committing removes drafts it made out of date and reports them', async () => {
  const db = backend.initial();
  const first = await backend.execute(db, { action: 'draft_observation', project: 'p-local', text: 'First note' });
  const second = await backend.execute(db, { action: 'draft_observation', project: 'p-local', text: 'Second note' });
  assert.deepEqual((await backend.execute(db, { action: 'list' })).map(d => d.stale), [false, false]);
  const done = await backend.execute(db, { action: 'commit', id: first.id, confirmation: core.confirmation(first) });
  assert.deepEqual(done.removedOutdated.map(d => d.id), [second.id]);
  assert.equal((await backend.execute(db, { action: 'list' })).length, 0);
  assert.equal(db.state.nodes.length, 1);
  await assert.rejects(backend.execute(db, { action: 'commit', id: second.id, confirmation: core.confirmation(second) }), /not found/);
});

test('drafts left behind by older versions are flagged and can be discarded', async () => {
  const db = backend.initial();
  const stuck = await backend.execute(db, { action: 'draft_observation', project: 'p-local', text: 'Stuck note' });
  db.state.projects[0].name = 'Renamed outside this draft';
  assert.equal((await backend.execute(db, { action: 'list' }))[0].stale, true);
  await assert.rejects(backend.execute(db, { action: 'commit', id: stuck.id, confirmation: core.confirmation(stuck) }), /Workspace changed/);
  assert.equal(db.drafts.length, 1, 'a refused commit keeps the draft');
  assert.equal((await backend.execute(db, { action: 'discard', id: stuck.id })).discarded, stuck.id);
  assert.equal(db.drafts.length, 0);
  assert.equal(db.state.nodes.length, 0);
  await assert.rejects(backend.execute(db, { action: 'discard', id: stuck.id }), /not found/);
});

test('a discard persists across restarts and leaves research records alone', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'paivik-test-')), file = path.join(dir, 'workspace.json');
  try {
    const p = await backend.run(file, { action: 'draft_observation', project: 'p-local', text: 'Discard me' });
    await backend.run(file, { action: 'discard', id: p.id });
    assert.equal((await backend.run(file, { action: 'list' })).length, 0);
    assert.equal((await backend.run(file, { action: 'status' })).records, 0);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
