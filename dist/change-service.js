/* Shared by the browser and the local R/MCP companion. No DOM or model calls. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('node:crypto').webcrypto);
  else root.PaivikChanges = factory(root.crypto);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (crypto) {
  'use strict';
  const collections = ['projects', 'nodes', 'edges', 'inbox', 'proposals'];
  const types = new Set(['project', 'experiment', 'protocol', 'sample', 'dataset', 'observation', 'voice', 'photo', 'file', 'note']);
  const clone = value => JSON.parse(JSON.stringify(value));
  const canonical = value => JSON.stringify(normalize(value));
  function normalize(value) {
    if (Array.isArray(value)) return value.map(normalize);
    if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, normalize(value[k])]));
    return value;
  }
  async function hash(value) {
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical(value)));
    return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
  }
  function check(ok, message) { if (!ok) throw new Error(message); }
  function text(value, max, required = false) {
    return typeof value === 'string' && value.length <= max && (!required || value.trim().length > 0);
  }
  function validate(state) {
    check(state && state.version === 1, 'Unsupported workspace version');
    for (const key of collections) {
      check(Array.isArray(state[key]), `Missing ${key}`);
      const seen = new Set();
      for (const item of state[key]) {
        check(item && text(item.id, 160, true) && /^[A-Za-z0-9_-]+$/.test(item.id), `Invalid ${key} identifier`);
        check(!seen.has(item.id), `Duplicate ${key} identifier`); seen.add(item.id);
      }
    }
    check(state.projects.length > 0, 'At least one project is required');
    const projects = new Set(state.projects.map(p => p.id));
    state.projects.forEach(p => check(text(p.name, 120, true), 'Invalid project name'));
    const nodes = new Map(state.nodes.map(n => [n.id, n]));
    for (const n of state.nodes) {
      check(projects.has(n.project) && types.has(n.type), 'Invalid record project or type');
      check(text(n.title, 120, true) && text(n.text, 20000), 'Invalid record title or description');
      check(Number.isFinite(n.x) && Number.isFinite(n.y), 'Invalid record position');
    }
    for (const e of state.edges) {
      check(nodes.has(e.from) && nodes.has(e.to), 'A relationship refers to a missing record');
      check(nodes.get(e.from).project === nodes.get(e.to).project, 'Cross-project relationships are not supported');
      check(e.from !== e.to && text(e.label, 80, true), 'Invalid relationship');
    }
    const captures = new Set(state.inbox.map(c => c.id));
    for (const c of state.inbox) {
      check(projects.has(c.project) && ['text', 'file', 'audio'].includes(c.kind), 'Invalid capture');
      check(['pending', 'filed', 'dismissed'].includes(c.status), 'Invalid capture status');
      check(text(c.title, 500) && text(c.text, 20000), 'Invalid capture text');
    }
    for (const p of state.proposals) {
      check(projects.has(p.project) && captures.has(p.capture), 'A suggestion refers to a missing capture');
      check(['add', 'flag'].includes(p.kind) && ['pending', 'accepted', 'dismissed', 'resolved'].includes(p.status), 'Invalid suggestion');
      if (p.kind === 'add') {
        check(p.node && types.has(p.node.type) && text(p.node.title, 120, true) && text(p.node.text, 20000), 'Invalid suggested record');
        check(Array.isArray(p.links) && p.links.every(l => text(l.to, 160, true) && text(l.label, 80, true) && typeof l.checked === 'boolean'), 'Invalid suggested links');
      } else check(text(p.title, 500, true) && text(p.why, 20000), 'Invalid suggestion flag');
    }
    return true;
  }
  // Graph layout and view selection are presentation state, not scientific edits.
  function snapshot(state) {
    return Object.fromEntries(collections.map(key => [key, state[key].map(item => {
      const value = clone(item);
      if (key === 'nodes') { delete value.x; delete value.y; }
      return value;
    }).sort((a, b) => a.id.localeCompare(b.id))]));
  }
  function diff(before, after) {
    const changes = [];
    for (const collection of collections) {
      const a = new Map(before[collection].map(item => [item.id, item]));
      const b = new Map(after[collection].map(item => [item.id, item]));
      for (const id of new Set([...a.keys(), ...b.keys()])) {
        if (canonical(a.get(id) ?? null) !== canonical(b.get(id) ?? null)) {
          changes.push({ collection, id, before: a.get(id) ?? null, after: b.get(id) ?? null });
        }
      }
    }
    return changes;
  }
  async function prepare(state, desired, { reason, author = 'local-user', id, revision = 1 } = {}) {
    validate(state); validate(desired);
    check(text(reason, 1000, true), 'A change description is required');
    const operations = diff(snapshot(state), snapshot(desired));
    check(operations.length > 0, 'No research changes to approve');
    const proposal = {
      id: id || `change-${crypto.randomUUID()}`, revision, author, reason,
      created: new Date().toISOString(), baseHash: await hash(snapshot(state)), operations,
    };
    proposal.hash = await hash(proposal);
    return proposal;
  }
  async function verify(proposal) {
    const value = clone(proposal); delete value.hash;
    check(await hash(value) === proposal.hash, 'Proposal changed; preview and confirm it again');
    check(Array.isArray(proposal.operations) && proposal.operations.length > 0, 'Empty proposal');
  }
  async function commit(state, proposal, confirmation, owner = 'local-user') {
    validate(state); await verify(proposal);
    check(confirmation && confirmation.confirmed === true && confirmation.actor === owner, 'Explicit user approval is required');
    check(confirmation.proposalId === proposal.id && confirmation.revision === proposal.revision && confirmation.hash === proposal.hash, 'Approval does not match this proposal revision');
    check(!(state.audit || []).some(e => e.proposalId === proposal.id), 'This proposal was already committed');
    check(await hash(snapshot(state)) === proposal.baseHash, 'Workspace changed; prepare a fresh preview before approving');
    const next = clone(state);
    for (const op of proposal.operations) {
      check(collections.includes(op.collection), 'Unsupported change operation');
      const items = next[op.collection], index = items.findIndex(item => item.id === op.id);
      if (op.after === null) { check(index >= 0, 'Missing change target'); items.splice(index, 1); }
      else {
        check(op.after.id === op.id, 'Change identifier mismatch');
        const value = clone(op.after);
        if (op.collection === 'nodes') {
          value.x = index >= 0 ? items[index].x : 400;
          value.y = index >= 0 ? items[index].y : 210;
        }
        if (index >= 0) items[index] = value; else items.push(value);
      }
    }
    validate(next);
    next.audit = [...(state.audit || []), {
      id: `event-${crypto.randomUUID()}`, proposalId: proposal.id, revision: proposal.revision,
      hash: proposal.hash, actor: confirmation.actor, method: confirmation.method || 'button',
      at: new Date().toISOString(), reason: proposal.reason, operations: clone(proposal.operations),
    }];
    return next;
  }
  function confirmation(proposal, actor = 'local-user', method = 'button') {
    return { confirmed: true, proposalId: proposal.id, revision: proposal.revision, hash: proposal.hash, actor, method };
  }
  return { prepare, commit, validate, verify, snapshot, hash, canonical, confirmation };
});
