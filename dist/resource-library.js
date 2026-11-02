(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PaivikLibrary = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const clone = value => JSON.parse(JSON.stringify(value));
  function install(state, catalog) {
    if (catalog.id !== 'minion-sequencer' || catalog.schemaVersion !== 1) throw new Error('Unsupported resource catalog');
    const next = clone(state), project = 'p-sequencing-resources', created = new Date().toISOString();
    if (!next.projects.some(p => p.id === project)) next.projects.push({ id: project, name: 'Sequencing resources' });
    const add = record => {
      if (!next.nodes.some(n => n.id === record.id)) next.nodes.push({ project, created, origin: 'library', x: 400, y: 210, text: '', ...record });
    };
    const edge = (from, to, label) => {
      if (!next.edges.some(e => e.from === from && e.to === to && e.label === label)) {
        next.edges.push({ id: `e-${from}-${to}`, from, to, label });
      }
    };
    add({ id: 'n-minion', type: 'resource', title: 'MinION Sequencer', resourceKind: 'instrument', x: 400, y: 170,
      text: 'Sequencing instrument resource. Serial number, location and local owner have not been recorded. Linked documents are a supplied library, not a declaration of current compatibility.' });
    add({ id: 'n-minion-flongle', type: 'resource', title: 'Flongle adapter', resourceKind: 'adapter', x: 640, y: 170,
      text: 'Separate resource for the supplied Flongle-specific workflows. Confirm the actual adapter and flow cell before an experiment.' });
    edge('n-minion-flongle', 'n-minion', 'adapter for');
    catalog.documents.forEach((d, i) => {
      const id = `n-minion-${d.id}`;
      add({ id, type: d.type, title: d.title, text: d.description, protocolFamily: d.protocolFamily,
        revision: d.revision || '', revisionDate: d.revisionDate || '', platform: d.platform,
        platformKey: d.platformKey, documentKind: d.documentKind,
        kits: d.kits, source: { file: d.sourceFile, aliases: d.aliases, sha256: d.sha256, pages: d.pages, page: d.sourcePage, size: d.size, publisher: d.publisher },
        x: 90 + (i % 5) * 150, y: 60 + Math.floor(i / 5) * 125 });
      edge(id, d.platformKey === 'flongle' ? 'n-minion-flongle' : 'n-minion', d.type === 'note' ? 'reference for' : d.documentKind === 'maintenance' ? 'maintenance for' : 'protocol for');
    });
    edge('n-minion-ligation-dna-checklist', 'n-minion-ligation-dna', 'checklist for this revision');
    edge('n-minion-rapid-checklist', 'n-minion-rapid-minion', 'checklist for this revision');
    edge('n-minion-ligation-dna-web-export', 'n-minion-ligation-dna', 'alternate export of');
    edge('n-minion-poly-a', 'n-minion-direct-rna', 'older-kit background; applicability unverified');
    catalog.notes.forEach((note, i) => {
      const id = `n-minion-note-${note.id}`;
      add({ id, type: 'note', title: note.title, text: note.text, x: 90 + i * 230, y: 380 });
      edge(id, 'n-minion', 'catalog note for');
    });
    next.current = project; next.selected = 'n-minion';
    return next;
  }
  // A stack represents one method on one platform. Artifacts of the same revision stay together.
  function stacks(nodes) {
    const groups = new Map();
    for (const n of nodes.filter(n => n.type === 'protocol' || n.type === 'checklist')) {
      const family = n.protocolFamily || n.id;
      const platform = n.platformKey || n.platform || 'unspecified';
      const key = `${family}\u0000${platform}`;
      if (!groups.has(key)) groups.set(key, { family, platform, title: family, versions: [] });
      const group = groups.get(key), revision = n.revision || `unversioned:${n.id}`;
      let version = group.versions.find(v => v.revision === revision);
      if (!version) { version = { revision, date: n.revisionDate || '', records: [] }; group.versions.push(version); }
      version.records.push(n);
      if ((n.revisionDate || '') > version.date) version.date = n.revisionDate;
    }
    for (const group of groups.values()) {
      group.versions.sort((a, b) => b.date.localeCompare(a.date) || b.revision.localeCompare(a.revision));
      // Unknown dates never become a claimed newest version.
      const newestDate = group.versions[0]?.date;
      const tied = group.versions.filter(v => v.date && v.date === newestDate).length > 1;
      group.versions.forEach((v, i) => { v.latestKnown = i === 0 && !!v.date && !tied; });
      group.title = group.versions[0]?.records.find(n => n.type === 'protocol')?.title || group.versions[0]?.records[0]?.title || group.family;
    }
    return [...groups.values()].sort((a, b) => a.title.localeCompare(b.title));
  }
  return { install, stacks };
});
