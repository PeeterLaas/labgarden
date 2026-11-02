const { test } = require('node:test');
const assert = require('node:assert/strict');
const core = require('../dist/change-service.js');
const library = require('../dist/resource-library.js');
const catalog = require('../dist/catalogs/minion.json');
const { initial } = require('../server/workspace.cjs');

test('MinION catalog preserves 13 distinct sources and all 14 filename aliases', () => {
  assert.equal(catalog.documents.length,13);
  assert.equal(new Set(catalog.documents.map(d=>d.sha256)).size,13);
  assert.equal(catalog.documents.reduce((n,d)=>n+d.aliases.length,0),14);
  const poly=catalog.documents.find(d=>d.id==='poly-a');
  assert.equal(poly.aliases.length,2);assert.equal(poly.type,'note');
  assert.ok(poly.kits.includes('SQK-RNA002'));assert.ok(!poly.kits.includes('SQK-RNA004'));
  assert.equal(catalog.documents.find(d=>d.id==='ligation-dna-web-export').platformKey,'minion');
});
test('resource catalog merges without modifying existing research and is idempotent', () => {
  const old=initial().state, before=structuredClone(old);
  const next=library.install(old,catalog);
  assert.deepEqual(old,before);assert.equal(next.projects.length,2);assert.equal(next.nodes.length,18);
  assert.equal(next.nodes.find(n=>n.id==='n-minion').type,'resource');
  assert.equal(next.nodes.filter(n=>n.type==='checklist').length,3);
  core.validate(next);assert.deepEqual(library.install(next,catalog),next);
});
test('library installation remains a proposal until exact approval', async () => {
  const old=initial().state, desired=library.install(old,catalog);
  const p=await core.prepare(old,desired,{reason:'Add MinION library'});
  await assert.rejects(core.commit(old,p),/approval/);
  const next=await core.commit(old,p,core.confirmation(p));
  assert.equal(old.nodes.length,0);assert.equal(next.nodes.length,18);core.validate(next);
});
test('stacks separate platforms and group artifacts of the same revision', () => {
  const next=library.install(initial().state,catalog), stacks=library.stacks(next.nodes);
  const dna=stacks.find(s=>s.family==='ligation-dna' && s.platform==='minion');
  assert.equal(dna.versions.length,1);assert.equal(dna.versions[0].records.length,3);
  assert.equal(stacks.filter(s=>s.family==='rapid-barcoding').length,2);
  assert.ok(!stacks.some(s=>s.family==='poly-a-requirements'));
});
test('new revisions sort above older ones without retargeting experiment links', async () => {
  const old=library.install(initial().state,catalog);
  old.nodes.push({id:'experiment-actual',project:old.current,type:'experiment',title:'Recorded experiment',text:'',x:400,y:210});
  old.edges.push({id:'used-old',from:'experiment-actual',to:'n-minion-ligation-dna',label:'uses version'});
  const next=structuredClone(old), original=next.nodes.find(n=>n.id==='n-minion-ligation-dna');
  const newer={...original,id:'new-revision',revision:'GDE-new',revisionDate:'2026-11-02',supersedes:original.id};
  delete newer.source;next.nodes.push(newer);
  next.edges.push({id:'supersedes-old',from:newer.id,to:original.id,label:'supersedes'});
  const p=await core.prepare(old,next,{reason:'Add new revision'});
  const committed=await core.commit(old,p,core.confirmation(p));
  const stack=library.stacks(committed.nodes).find(s=>s.family==='ligation-dna'&&s.platform==='minion');
  assert.equal(stack.versions[0].revision,'GDE-new');assert.ok(stack.versions[0].latestKnown);
  assert.equal(committed.edges.find(e=>e.id==='used-old').to,original.id);
  assert.equal(committed.nodes.find(n=>n.id===original.id).source.sha256,original.source.sha256);
});
test('unknown or tied revision dates do not claim an unambiguous latest release', () => {
  const n={id:'p1',type:'protocol',protocolFamily:'method',platformKey:'minion',revision:'v1',revisionDate:''};
  assert.equal(library.stacks([n])[0].versions[0].latestKnown,false);
  const tied=library.stacks([{...n,revisionDate:'2025-01-01'},{...n,id:'p2',revision:'v2',revisionDate:'2025-01-01'}]);
  assert.ok(tied[0].versions.every(v=>!v.latestKnown));
});
test('category avatars require approval and survive round-trip state serialization', async () => {
  const old=initial().state,next=structuredClone(old);
  next.avatars=[{id:'resource',kind:'emoji',value:'🔬'},{id:'protocol',kind:'emoji',value:'📋'}];
  const p=await core.prepare(old,next,{reason:'Choose category avatars'});
  await assert.rejects(core.commit(old,p),/approval/);
  const committed=await core.commit(old,p,core.confirmation(p));
  assert.deepEqual(JSON.parse(JSON.stringify(committed)).avatars.toSorted((a,b)=>a.id.localeCompare(b.id)),next.avatars.toSorted((a,b)=>a.id.localeCompare(b.id)));
  assert.equal(committed.audit[0].operations.length,2);
});
test('avatar validation rejects active image formats, unknown categories and markup', () => {
  for(const avatar of [{id:'resource',kind:'image',value:'data:image/svg+xml;base64,PHN2Zz4='},{id:'unknown',kind:'emoji',value:'X'},{id:'protocol',kind:'emoji',value:'<img>'}]) {
    const s=initial().state;s.avatars=[avatar];assert.throws(()=>core.validate(s));
  }
  const s=initial().state;s.avatars=[{id:'note',kind:'image',value:'data:image/png;base64,aGVsbG8='}];core.validate(s);
});
test('invalid revision dates are rejected', () => {
  const s=library.install(initial().state,catalog);
  s.nodes.find(n=>n.revisionDate).revisionDate='2025-02-30';
  assert.throws(()=>core.validate(s),/revision date/);
});
test('revision history cannot cross platforms or form cycles', () => {
  const s=library.install(initial().state,catalog), original=s.nodes.find(n=>n.id==='n-minion-ligation-dna');
  const newer={...original,id:'next-revision',revision:'v-next',supersedes:original.id,platformKey:'flongle'};
  s.nodes.push(newer);assert.throws(()=>core.validate(s),/platform/);
  newer.platformKey='minion';original.supersedes=newer.id;assert.throws(()=>core.validate(s),/cycle/);
});
