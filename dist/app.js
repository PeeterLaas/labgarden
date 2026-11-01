'use strict';
/* PAIvik — local-first research workspace. All data stays in this browser (IndexedDB). */
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const uid = (p) => `${p}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  const now = () => new Date().toISOString();
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const when = (iso) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const size = (b) => (b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1e3))} kB`);
  const W = 800, H = 420;

  // ---------- Record types and icons ----------
  const TYPES = {
    project: { label: 'Project', kind: 'rec', icon: 'folder', r: 30 },
    experiment: { label: 'Experiment', kind: 'hub', icon: 'flask', r: 40 },
    protocol: { label: 'Protocol', kind: 'rec', icon: 'list', r: 30 },
    sample: { label: 'Sample', kind: 'rec', icon: 'tube', r: 26 },
    dataset: { label: 'Dataset', kind: 'rec', icon: 'grid', r: 30 },
    observation: { label: 'Observation', kind: 'evi', icon: 'eye', r: 24 },
    voice: { label: 'Voice note', kind: 'evi', icon: 'wave', r: 24 },
    photo: { label: 'Photo', kind: 'evi', icon: 'image', r: 24 },
    file: { label: 'File', kind: 'evi', icon: 'file', r: 24 },
    note: { label: 'Note', kind: 'evi', icon: 'note', r: 24 },
  };
  const ICONS = {
    folder: 'M3 7h6l2 2h10v10H3z',
    flask: 'M9 3h6M10 3v6L5 18.5A1.2 1.2 0 0 0 6 20.5h12a1.2 1.2 0 0 0 1-2L14 9V3M7.5 14h9',
    list: 'M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01',
    tube: 'M9 3h6M10 3v14a2 2 0 0 0 4 0V3M10 11h4',
    grid: 'M4 4h16v16H4zM4 9.5h16M4 14.5h16M9.5 4v16M14.5 4v16',
    eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z',
    wave: 'M3 12h2M7 8v8M11 5v14M15 9v6M19 11v2',
    image: 'M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M15.5 9h.01',
    file: 'M6 3h8l4 4v14H6zM14 3v4h4',
    note: 'M5 4h14v16H5zM8 9h8M8 13h8M8 17h5',
  };
  const icon = (type) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${ICONS[(TYPES[type] || TYPES.file).icon]}"/></svg>`;
  const kindOf = (type) => (TYPES[type] || TYPES.file).kind;

  // ---------- Storage: IndexedDB, with an in-memory fallback ----------
  const store = {
    db: null,
    memFiles: new Map(),
    async open() {
      try {
        this.db = await new Promise((res, rej) => {
          const r = indexedDB.open('paivik', 1);
          r.onupgradeneeded = () => { r.result.createObjectStore('kv'); r.result.createObjectStore('files'); };
          r.onsuccess = () => res(r.result);
          r.onerror = () => rej(r.error);
        });
      } catch { this.db = null; }
      return !!this.db;
    },
    run(name, mode, fn) {
      return new Promise((res, rej) => {
        const t = this.db.transaction(name, mode);
        const req = fn(t.objectStore(name));
        t.oncomplete = () => res(req ? req.result : undefined);
        t.onerror = () => rej(t.error);
      });
    },
    async get(k) { return this.db ? this.run('kv', 'readonly', (s) => s.get(k)) : null; },
    async set(k, v) { if (this.db) await this.run('kv', 'readwrite', (s) => s.put(v, k)); },
    async putFile(id, blob) { this.db ? await this.run('files', 'readwrite', (s) => s.put(blob, id)) : this.memFiles.set(id, blob); },
    async getFile(id) { return this.db ? this.run('files', 'readonly', (s) => s.get(id)) : this.memFiles.get(id); },
    async delFile(id) { this.db ? await this.run('files', 'readwrite', (s) => s.delete(id)) : this.memFiles.delete(id); },
    async clearFiles() { this.db ? await this.run('files', 'readwrite', (s) => s.clear()) : this.memFiles.clear(); },
  };

  // ---------- Sample data ----------
  function sample() {
    const t = (minsAgo) => new Date(Date.now() - minsAgo * 60000).toISOString();
    const n = (id, project, type, title, text, x, y) => ({ id, project, type, title, text, x, y, origin: 'sample', created: t(5000) });
    const e = (from, to, label) => ({ id: uid('e'), from, to, label });
    const s = {
      version: 1,
      current: 'p-water',
      selected: 'n-e014',
      projects: [{ id: 'p-water', name: 'Water quality' }, { id: 'p-soil', name: 'Soil microbiome' }],
      nodes: [
        n('n-wq', 'p-water', 'project', 'Water quality', 'River sampling at eight stations, spring 2026.', 170, 95),
        n('n-e014', 'p-water', 'experiment', 'Experiment 014', 'Turbidity and nitrate after filtration, stations 1–8.', 400, 200),
        n('n-filt', 'p-water', 'protocol', 'Filtration v2.1', '0.45 µm filtration, 250 ml per sample. Version 2.1 adds a field blank.', 630, 85),
        n('n-res', 'p-water', 'dataset', 'results_014.csv', 'Turbidity (NTU) and nitrate (mg/l) per station.', 650, 255),
        n('n-obs', 'p-water', 'voice', 'Field observation', 'Water looked cloudy at station 8. Check the sampling time.', 175, 300),
        n('n-photo', 'p-water', 'photo', 'Sample photo', 'Station 8 bottle before filtration.', 420, 350),
        n('n-soil', 'p-soil', 'project', 'Soil microbiome', 'Bacterial communities in arable soil cores.', 190, 200),
        n('n-s03', 'p-soil', 'experiment', 'Experiment S-03', '16S sequencing of six cores from field B.', 420, 210),
        n('n-dna', 'p-soil', 'protocol', 'DNA extraction v1', 'Bead-beating extraction, 0.25 g soil per sample.', 640, 110),
        n('n-cores', 'p-soil', 'dataset', 'soil_cores.csv', 'Core depth, moisture and pH.', 640, 310),
      ],
      edges: [
        e('n-e014', 'n-wq', 'belongs to'), e('n-e014', 'n-filt', 'uses version'), e('n-e014', 'n-res', 'produced'),
        e('n-res', 'n-filt', 'processed with'), e('n-obs', 'n-e014', 'observed in'), e('n-photo', 'n-e014', 'evidence for'),
        e('n-obs', 'n-photo', 'same station'),
        e('n-s03', 'n-soil', 'belongs to'), e('n-s03', 'n-dna', 'uses version'), e('n-s03', 'n-cores', 'produced'),
      ],
      inbox: [],
      proposals: [],
    };
    addCapture(s, { kind: 'text', title: '', text: 'Station 9: turbidity higher after the rain. Same filtration as Experiment 014.', created: t(90) });
    addCapture(s, { kind: 'file', title: 'results_015.csv', mime: 'text/csv', size: 2048, text: 'Sample entry: the file itself is not included.', created: t(30) });
    return s;
  }

  // ---------- The gardener: transparent, rule-based suggestions ----------
  function typeForCapture(c) {
    if (c.kind === 'audio') return 'voice';
    if (c.kind === 'text') return 'observation';
    const name = (c.title || '').toLowerCase(), mime = c.mime || '';
    if (mime.startsWith('image/')) return 'photo';
    if (mime.startsWith('audio/')) return 'voice';
    if (/\.(csv|tsv|xlsx?|json)$/.test(name) || mime === 'text/csv') return 'dataset';
    return 'file';
  }
  const ids = (s) => (String(s).match(/\b[a-z]*-?\d{2,}\b|\b[a-z]-\d+\b/gi) || []).map((x) => x.toLowerCase().replace(/^[a-z]+-?(?=\d)/, (p) => (p.length > 2 ? '' : p)));
  const linkLabel = (from, to) => {
    if (to === 'project') return 'belongs to';
    if (to === 'protocol') return 'uses';
    if (to === 'experiment') return from === 'dataset' ? 'produced by' : 'evidence for';
    return 'related to';
  };

  function suggest(s, cap) {
    const type = typeForCapture(cap);
    const hay = `${cap.title} ${cap.text}`.toLowerCase();
    const capIds = new Set(ids(hay));
    const nodes = s.nodes.filter((n) => n.project === cap.project);
    const links = [];
    for (const n of nodes) {
      if (n.type === 'project') continue;
      const title = n.title.toLowerCase();
      const shared = ids(title).filter((i) => capIds.has(i));
      let why = '';
      if (title.length > 3 && hay.includes(title)) why = `mentions “${n.title}”`;
      else if (shared.length) why = `shares the ID “${shared[0]}”`;
      if (why) links.push({ to: n.id, label: linkLabel(type, n.type), why, checked: true });
    }
    const proj = nodes.find((n) => n.type === 'project');
    if (proj) links.push({ to: proj.id, label: 'belongs to', why: 'captured in this project', checked: !links.some((l) => l.checked) });
    const title = cap.title || (cap.text.split(/\s+/).slice(0, 7).join(' ') + (cap.text.split(/\s+/).length > 7 ? '…' : ''));
    const out = [{
      id: uid('r'), project: cap.project, capture: cap.id, kind: 'add', status: 'pending', created: now(),
      node: { type, title, text: cap.text || '', fileId: cap.fileId || null, mime: cap.mime || '' },
      links,
    }];
    if ((type === 'observation' || type === 'voice') && /\b(station|sample|site|plot|core)\b/i.test(cap.text) && !/\b\d{1,2}[:.]\d{2}\b|\b(am|pm|morning|afternoon|evening|noon)\b/i.test(cap.text)) {
      out.push({ id: uid('r'), project: cap.project, capture: cap.id, kind: 'flag', status: 'pending', created: now(),
        title: `Missing collection time in “${title}”`, why: 'It mentions a station or sample but no time. Ask the researcher; don’t invent one.' });
    }
    const dup = nodes.find((n) => n.title.toLowerCase() === title.toLowerCase());
    if (dup) {
      out.push({ id: uid('r'), project: cap.project, capture: cap.id, kind: 'flag', status: 'pending', created: now(),
        title: `Possible duplicate of “${dup.title}”`, why: 'A record with the same name already exists. Keep both until their identity is checked.' });
    }
    return out;
  }

  function addCapture(s, c) {
    const cap = { id: uid('c'), project: s.current, status: 'pending', created: now(), title: '', text: '', ...c };
    s.inbox.push(cap);
    const props = suggest(s, cap);
    s.proposals.push(...props);
    return { cap, props };
  }

  // ---------- App state ----------
  let state;
  let saveTimer;
  const urls = new Map();
  const save = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      try { await store.set('state', state); } catch { setStorage(false); }
    }, 150);
  };
  const setStorage = (ok) => {
    const el = $('#storage-status');
    el.textContent = ok ? 'Saved in this browser' : 'Not saved: browser storage is unavailable. Use Export.';
    el.classList.toggle('warn', !ok);
  };
  const cur = () => state.projects.find((p) => p.id === state.current) || state.projects[0];
  const nodesHere = () => state.nodes.filter((n) => n.project === state.current);
  const node = (id) => state.nodes.find((n) => n.id === id);
  const edgesHere = () => { const ids = new Set(nodesHere().map((n) => n.id)); return state.edges.filter((e) => ids.has(e.from) && ids.has(e.to)); };
  const pending = () => state.proposals.filter((p) => p.project === state.current && p.status === 'pending');

  // ---------- Toast ----------
  const toast = (() => {
    const el = document.createElement('div');
    el.className = 'toast'; el.setAttribute('role', 'status'); document.body.append(el);
    let t;
    return (msg) => { el.textContent = msg; el.classList.add('show'); clearTimeout(t); t = setTimeout(() => el.classList.remove('show'), 2600); };
  })();

  // ---------- Dialog helper ----------
  function ask({ title, body, ok = 'Save', danger = false }) {
    const dlg = $('#dialog');
    $('#dialog-title').textContent = title;
    $('#dialog-body').innerHTML = body;
    const okBtn = $('#dialog-ok');
    okBtn.textContent = ok;
    okBtn.style.background = danger ? 'var(--danger)' : '';
    dlg.returnValue = '';
    dlg.showModal();
    const first = $('#dialog-body input, #dialog-body select, #dialog-body textarea');
    if (first) first.focus();
    return new Promise((res) => dlg.addEventListener('close', () => res(dlg.returnValue === 'ok' ? new FormData($('#dialog-form')) : null), { once: true }));
  }
  const typeOptions = (sel, skip = ['project']) => Object.entries(TYPES).filter(([k]) => !skip.includes(k))
    .map(([k, v]) => `<option value="${k}"${k === sel ? ' selected' : ''}>${v.label}</option>`).join('');
  const nodeOptions = (exclude) => nodesHere().filter((n) => n.id !== exclude)
    .map((n) => `<option value="${n.id}">${esc(n.title)} · ${TYPES[n.type].label}</option>`).join('');

  // ---------- Routing ----------
  const VIEWS = ['graph', 'inbox', 'review', 'about'];
  const view = () => (VIEWS.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'graph');

  // ---------- Rendering ----------
  function render() {
    const v = view();
    const p = cur();
    $('#crumb-project').textContent = p.name;
    $('#project-title').textContent = p.name;
    $('#view-work').hidden = v === 'about';
    $('#view-about').hidden = v !== 'about';
    $$('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === v));
    $$('[data-tab]').forEach((a) => { a.classList.toggle('active', a.dataset.tab === v); a.setAttribute('aria-selected', a.dataset.tab === v); });
    ['graph', 'inbox', 'review'].forEach((k) => { $(`#panel-${k}`).hidden = k !== v; });

    const inboxN = state.inbox.filter((c) => c.project === state.current && c.status === 'pending').length;
    const reviewN = pending().length;
    $('#count-graph').textContent = nodesHere().length;
    $('#count-inbox').textContent = inboxN;
    $('#count-review').textContent = reviewN;
    $('#tab-inbox').textContent = inboxN || '';
    $('#tab-review').textContent = reviewN || '';

    $('#project-list').innerHTML = state.projects.map((pr) => {
      const n = state.proposals.filter((r) => r.project === pr.id && r.status === 'pending').length;
      return `<li><button type="button" data-project="${pr.id}" class="${pr.id === state.current ? 'active' : ''}"><span class="pdot"></span>${esc(pr.name)}${n ? `<span class="n" title="${n} waiting for review">${n}</span>` : ''}</button></li>`;
    }).join('');

    if (v === 'graph') { renderGraph(); renderDetail(); }
    if (v === 'inbox') renderInbox();
    if (v === 'review') renderReview();
  }

  function renderGraph() {
    const nodes = nodesHere();
    $('#graph-empty').hidden = nodes.length > 0;
    // An edge label goes at the first point along its line that clears every node and node caption.
    const blocked = (x, y, half) => nodes.some((n) => {
      const r = (TYPES[n.type] || TYPES.file).r;
      const nearX = Math.max(Math.abs(x - n.x) - half, 0);
      if (Math.hypot(nearX, y - n.y) < r + 10) return true;
      return Math.abs(x - n.x) < 62 + half && y > n.y + r - 2 && y < n.y + r + 40;
    });
    const edges = edgesHere().map((e) => {
      const a = node(e.from), b = node(e.to), half = e.label.length * 3.1;
      const t = [0.5, 0.42, 0.58, 0.34, 0.66, 0.26, 0.74].find((k) => !blocked(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k - 4, half)) ?? 0.5;
      return `<line class="edge" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"/>` +
        `<text class="elabel" x="${a.x + (b.x - a.x) * t}" y="${a.y + (b.y - a.y) * t - 4}" text-anchor="middle">${esc(e.label)}</text>`;
    }).join('');
    const ns = nodes.map((n) => {
      const t = TYPES[n.type] || TYPES.file, r = t.r, sc = (r * 0.9) / 24;
      const label = n.title.length > 24 ? n.title.slice(0, 23) + '…' : n.title;
      return `<g class="node ${t.kind}${n.id === state.selected ? ' selected' : ''}" data-id="${n.id}" tabindex="0" role="button" aria-label="${esc(n.title)}, ${t.label}">` +
        `<circle class="ring" cx="${n.x}" cy="${n.y}" r="${r + 7}"/>` +
        `<circle class="body" cx="${n.x}" cy="${n.y}" r="${r}"/>` +
        `<g class="icon" transform="translate(${n.x - 12 * sc} ${n.y - 12 * sc}) scale(${sc})"><path d="${ICONS[t.icon]}"/></g>` +
        `<text class="nlabel" x="${n.x}" y="${n.y + r + 18}">${esc(label)}</text>` +
        `<text class="ntype" x="${n.x}" y="${n.y + r + 31}">${t.label}</text></g>`;
    }).join('');
    $('#graph').innerHTML = edges + ns;
  }

  async function filePreview(n) {
    if (!n.fileId) return '';
    let blob;
    try { blob = await store.getFile(n.fileId); } catch { blob = null; }
    if (!blob) return '<p class="meta">File not stored in this browser.</p>';
    if (!urls.has(n.fileId)) urls.set(n.fileId, URL.createObjectURL(blob));
    const url = urls.get(n.fileId), mime = blob.type || n.mime || '';
    let inner = '';
    if (mime.startsWith('image/')) inner = `<img src="${url}" alt="${esc(n.title)}">`;
    else if (mime.startsWith('audio/')) inner = `<audio controls src="${url}"></audio>`;
    else if (/csv|tab-separated/.test(mime) || /\.(csv|tsv)$/i.test(n.title)) {
      const rows = (await blob.slice(0, 20000).text()).split(/\r?\n/).filter(Boolean).slice(0, 6)
        .map((l) => l.split(/[,\t;]/).slice(0, 8));
      inner = `<table>${rows.map((r, i) => `<tr>${r.map((c) => (i ? `<td>${esc(c)}</td>` : `<th>${esc(c)}</th>`)).join('')}</tr>`).join('')}</table>`;
    }
    return `<div class="preview">${inner}</div><a class="link" href="${url}" download="${esc(n.title)}">Download ${esc(n.title)} (${size(blob.size)})</a>`;
  }

  async function renderDetail() {
    const box = $('#detail');
    let n = node(state.selected);
    if (!n || n.project !== state.current) n = nodesHere().find((x) => x.type === 'experiment') || nodesHere()[0];
    if (!n) { box.innerHTML = ''; return; }
    state.selected = n.id;
    const t = TYPES[n.type] || TYPES.file;
    const rels = state.edges.filter((e) => e.from === n.id || e.to === n.id).map((e) => {
      const other = node(e.from === n.id ? e.to : e.from);
      const phrase = e.from === n.id ? e.label : `← ${e.label}`;
      return `<span class="chip" data-goto="${other.id}"><i>${esc(phrase)}</i> ${esc(other.title)} <button type="button" class="x" data-unlink="${e.id}" aria-label="Remove link to ${esc(other.title)}">×</button></span>`;
    }).join('');
    const origin = { sample: 'Sample record', capture: 'Accepted from review', manual: 'Added by you' }[n.origin] || '';
    box.innerHTML = `<div class="dicon ${t.kind === 'evi' ? 'evi' : ''}">${icon(n.type)}</div>
      <div><h2>${esc(n.title)}</h2>
        <p class="meta">${t.label} · ${when(n.created)}</p>
        ${n.text ? `<p class="text">${esc(n.text)}</p>` : ''}
        <div id="detail-file"></div>
        <div class="rels">${rels || '<span class="meta">Not connected yet.</span>'}</div>
        <div class="dactions">
          <button type="button" class="link" data-act="edit">Edit</button>
          <button type="button" class="link" data-act="link">Link to…</button>
          ${n.type === 'project' ? '' : '<button type="button" class="link danger" data-act="delete">Delete</button>'}
        </div></div>
      <span class="status">${origin === 'Sample record' ? origin : `✓ ${origin}`}</span>`;
    const preview = await filePreview(n);
    if (state.selected === n.id && $('#detail-file')) $('#detail-file').innerHTML = preview;
  }

  const capIcon = (c) => icon(c.kind === 'text' ? 'observation' : typeForCapture(c));
  function renderInbox() {
    const items = state.inbox.filter((c) => c.project === state.current).slice().reverse();
    const status = { pending: '<span class="tag new">Waiting for review</span>', filed: '<span class="tag">Added to graph</span>', dismissed: '<span class="tag">Dismissed</span>' };
    $('#inbox-list').innerHTML = items.length ? items.map((c) => `
      <li class="card${c.status === 'pending' ? '' : ' done'}">
        <div class="cicon">${capIcon(c)}</div>
        <div><h3>${esc(c.title || (c.kind === 'text' ? 'Note' : 'Capture'))}</h3>
          <p>${esc(c.text || '')}${c.size ? ` · ${size(c.size)}` : ''}</p></div>
        <span class="when">${when(c.created)}</span>
        <div class="acts">${status[c.status] || ''}
          ${c.status === 'pending' ? '<a class="link" href="#review">Review suggestions</a>' : ''}
          ${c.node && node(c.node) ? `<button type="button" class="link" data-goto="${c.node}">Open in graph</button>` : ''}
          <button type="button" class="link danger" data-delcap="${c.id}">Delete</button></div>
      </li>`).join('') : '<li class="blank">The inbox is empty. Capture a note, a file or a voice memo below.</li>';
  }

  function renderReview() {
    const list = pending();
    $('#review-list').innerHTML = list.length ? list.map((r) => {
      if (r.kind === 'flag') {
        return `<li class="card flag"><div class="cicon">!</div>
          <div><h3>${esc(r.title)}</h3><p>${esc(r.why)}</p></div><span class="when">${when(r.created)}</span>
          <div class="acts"><button type="button" class="btn" data-resolve="${r.id}">Mark resolved</button>
          <button type="button" class="link" data-dismiss="${r.id}">Dismiss</button></div></li>`;
      }
      const opts = r.links.filter((l) => node(l.to)).map((l, i) => `<li><label><input type="checkbox" data-r="${r.id}" data-i="${i}"${l.checked ? ' checked' : ''}>
        <span>${esc(l.label)} <b>${esc(node(l.to).title)}</b> <span class="why">— ${esc(l.why)}</span></span></label></li>`).join('');
      return `<li class="card"><div class="cicon">${icon(r.node.type)}</div>
        <div><h3>Add “${esc(r.node.title)}” as ${TYPES[r.node.type].label.toLowerCase()}</h3>
          <p>${esc(r.node.text)}</p></div><span class="when">${when(r.created)}</span>
        ${opts ? `<ul class="opts">${opts}</ul>` : ''}
        <div class="acts"><button type="button" class="btn" data-accept="${r.id}">Accept</button>
          <button type="button" class="link" data-edit-accept="${r.id}">Edit, then accept</button>
          <button type="button" class="link" data-dismiss="${r.id}">Dismiss</button></div></li>`;
    }).join('') : '<li class="blank">Nothing to review. New captures will bring suggestions here.</li>';
    const done = state.proposals.filter((r) => r.project === state.current && r.status !== 'pending').slice().reverse();
    $('#history-count').textContent = done.length;
    $('#history-list').innerHTML = done.map((r) => `<li>${{ accepted: 'Accepted', dismissed: 'Dismissed', resolved: 'Resolved' }[r.status]}: ${esc(r.kind === 'flag' ? r.title : `add “${r.node.title}”`)} · ${when(r.decided || r.created)}</li>`).join('');
  }

  // ---------- Graph mutations ----------
  function place(n, near = []) {
    const pts = near.map(node).filter(Boolean);
    let x = pts.length ? pts.reduce((a, p) => a + p.x, 0) / pts.length : W / 2;
    let y = pts.length ? pts.reduce((a, p) => a + p.y, 0) / pts.length : H / 2;
    const a = Math.random() * Math.PI * 2;
    x += Math.cos(a) * 110; y += Math.sin(a) * 90;
    n.x = x; n.y = y;
    const others = nodesHere().filter((o) => o.id !== n.id);
    for (let k = 0; k < 60; k++) {          // push away from neighbours, stay inside the canvas
      for (const o of others) {
        const dx = n.x - o.x, dy = n.y - o.y, d = Math.hypot(dx, dy) || 1;
        if (d < 95) { n.x += (dx / d) * (95 - d) * 0.5; n.y += (dy / d) * (95 - d) * 0.5; }
      }
      n.x = Math.min(W - 60, Math.max(60, n.x)); n.y = Math.min(H - 60, Math.max(45, n.y));
    }
  }
  function addNode(data, links = [], origin = 'manual') {
    const n = { id: uid('n'), project: state.current, created: now(), origin, text: '', ...data };
    state.nodes.push(n);
    place(n, links.map((l) => l.to));
    links.forEach((l) => state.edges.push({ id: uid('e'), from: n.id, to: l.to, label: l.label }));
    state.selected = n.id;
    return n;
  }
  function fileInUse(fileId, exceptNode) {
    return state.nodes.some((n) => n.fileId === fileId && n.id !== exceptNode) || state.inbox.some((c) => c.fileId === fileId && c.status === 'pending');
  }

  function accept(r, override) {
    const links = r.links.filter((l, i) => node(l.to) && (override ? override.links.includes(i) : l.checked));
    const n = addNode({ ...r.node, ...(override ? override.node : {}) }, links, 'capture');
    r.status = 'accepted'; r.decided = now(); r.result = n.id;
    const cap = state.inbox.find((c) => c.id === r.capture);
    if (cap) { cap.status = 'filed'; cap.node = n.id; }
    toast(`Added “${n.title}” to the graph`);
  }

  // ---------- Events ----------
  function bind() {
    window.addEventListener('hashchange', render);

    document.addEventListener('click', async (ev) => {
      const t = ev.target.closest('button, [data-goto]');
      if (!t) return;
      const d = t.dataset;
      if (d.project) { state.current = d.project; state.selected = null; save(); if (view() === 'about') location.hash = 'graph'; render(); return; }
      if (d.unlink) {
        ev.stopPropagation();
        const e = state.edges.find((x) => x.id === d.unlink);
        if (e && await ask({ title: 'Remove this link?', body: `<p>${esc(node(e.from).title)} — ${esc(e.label)} — ${esc(node(e.to).title)}</p>`, ok: 'Remove', danger: true })) {
          state.edges = state.edges.filter((x) => x !== e); save(); render();
        }
        return;
      }
      if (d.goto) { state.selected = d.goto; save(); if (view() !== 'graph') location.hash = 'graph'; else render(); return; }
      if (d.act) return detailAction(d.act);
      if (d.accept || d.editAccept) return reviewAccept(d.accept || d.editAccept, !!d.editAccept);
      if (d.dismiss || d.resolve) {
        const r = state.proposals.find((x) => x.id === (d.dismiss || d.resolve));
        r.status = d.resolve ? 'resolved' : 'dismissed'; r.decided = now();
        if (r.kind === 'add') { const c = state.inbox.find((x) => x.id === r.capture); if (c) c.status = 'dismissed'; }
        save(); render(); return;
      }
      if (d.delcap) {
        const c = state.inbox.find((x) => x.id === d.delcap);
        if (!(await ask({ title: 'Delete this capture?', body: `<p>“${esc(c.title || c.text.slice(0, 60))}” and its open suggestions will be removed. Records already in the graph stay.</p>`, ok: 'Delete', danger: true }))) return;
        state.inbox = state.inbox.filter((x) => x !== c);
        state.proposals = state.proposals.filter((r) => !(r.capture === c.id && r.status === 'pending'));
        if (c.fileId && !fileInUse(c.fileId)) await store.delFile(c.fileId);
        save(); render(); return;
      }
    });

    document.addEventListener('change', (ev) => {
      const cb = ev.target.closest('input[data-r]');
      if (!cb) return;
      const r = state.proposals.find((x) => x.id === cb.dataset.r);
      const live = r.links.filter((l) => node(l.to));
      live[Number(cb.dataset.i)].checked = cb.checked; save();
    });

    // Graph: select, drag and keyboard
    const svg = $('#graph');
    let drag = null;
    const toSvg = (e) => { const p = svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY; return p.matrixTransform(svg.getScreenCTM().inverse()); };
    svg.addEventListener('pointerdown', (e) => {
      const g = e.target.closest('.node'); if (!g) return;
      const n = node(g.dataset.id), p = toSvg(e);
      drag = { n, dx: n.x - p.x, dy: n.y - p.y, x0: e.clientX, y0: e.clientY, moved: false };
      svg.setPointerCapture(e.pointerId);
    });
    svg.addEventListener('pointermove', (e) => {
      if (!drag) return;
      if (!drag.moved && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 4) return;
      drag.moved = true;
      const p = toSvg(e);
      drag.n.x = Math.min(W - 30, Math.max(30, p.x + drag.dx));
      drag.n.y = Math.min(H - 45, Math.max(30, p.y + drag.dy));
      requestAnimationFrame(renderGraph);
    });
    svg.addEventListener('pointerup', () => {
      if (!drag) return;
      if (!drag.moved) state.selected = drag.n.id;
      drag = null; save(); renderGraph(); renderDetail();
    });
    svg.addEventListener('keydown', (e) => {
      const g = e.target.closest('.node'); if (!g) return;
      const n = node(g.dataset.id);
      const mv = { ArrowLeft: [-12, 0], ArrowRight: [12, 0], ArrowUp: [0, -12], ArrowDown: [0, 12] }[e.key];
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); state.selected = n.id; save(); renderGraph(); renderDetail(); }
      else if (mv) {
        e.preventDefault();
        n.x = Math.min(W - 30, Math.max(30, n.x + mv[0])); n.y = Math.min(H - 45, Math.max(30, n.y + mv[1]));
        save(); renderGraph(); svg.querySelector(`[data-id="${n.id}"]`).focus();
      }
    });

    // Capture: text, files, voice
    $('#capture').addEventListener('submit', (e) => {
      e.preventDefault();
      const text = $('#capture-text').value.trim();
      if (!text) { $('#capture-text').focus(); return; }
      const { props } = addCapture(state, { kind: 'text', text });
      $('#capture-text').value = '';
      captured(props);
    });
    $('#capture-text').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('#capture').requestSubmit(); }
    });
    $('#add-file').addEventListener('click', () => $('#file-input').click());
    $('#file-input').addEventListener('change', async (e) => {
      const files = [...e.target.files]; e.target.value = '';
      let props = [];
      for (const f of files) {
        if (f.size > 50e6) { toast(`${f.name} is larger than 50 MB and was skipped`); continue; }
        const fileId = uid('f');
        await store.putFile(fileId, f);
        props = props.concat(addCapture(state, { kind: 'file', title: f.name, mime: f.type, size: f.size, fileId, text: `${f.type || 'file'} · added from this device` }).props);
      }
      if (props.length) captured(props);
    });
    let rec = null;
    const voiceBtn = $('#record-voice');
    if (!navigator.mediaDevices || !window.MediaRecorder) voiceBtn.hidden = true;
    voiceBtn.addEventListener('click', async () => {
      if (rec) { rec.stop(); return; }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const chunks = [];
        rec = new MediaRecorder(stream);
        rec.ondataavailable = (e) => chunks.push(e.data);
        rec.onstop = async () => {
          stream.getTracks().forEach((t) => t.stop());
          voiceBtn.classList.remove('recording'); voiceBtn.textContent = '♫ Record voice note';
          const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' }); rec = null;
          const fileId = uid('f');
          await store.putFile(fileId, blob);
          const label = `Voice note ${new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
          const typed = $('#capture-text').value.trim();
          const { props } = addCapture(state, { kind: 'audio', title: label, mime: blob.type, size: blob.size, fileId, text: typed || 'Recorded in the browser. Add a transcript or description when you review it.' });
          if (typed) $('#capture-text').value = '';
          captured(props);
        };
        rec.start();
        voiceBtn.classList.add('recording'); voiceBtn.textContent = '■ Stop recording';
      } catch { toast('Microphone not available or permission denied'); rec = null; }
    });

    // Records, projects, data
    $('#new-record').addEventListener('click', newRecord);
    $('#new-project').addEventListener('click', async () => {
      const f = await ask({ title: 'New project', body: '<label>Project name<input name="name" required maxlength="60"></label><label>Short description<input name="text" maxlength="200"></label>', ok: 'Create' });
      if (!f || !f.get('name').trim()) return;
      const p = { id: uid('p'), name: f.get('name').trim() };
      state.projects.push(p); state.current = p.id;
      const n = addNode({ type: 'project', title: p.name, text: f.get('text').trim() });
      n.x = W / 2; n.y = H / 2;
      save(); location.hash = 'graph'; render();
    });
    $('#export').addEventListener('click', exportData);
    $('#import').addEventListener('click', () => $('#import-file').click());
    $('#import-file').addEventListener('change', importData);
    $('#reset').addEventListener('click', async () => {
      if (!(await ask({ title: 'Reset to the sample?', body: '<p>All projects, records, captures and files in this browser will be replaced by the sample. Export first if you want to keep them.</p>', ok: 'Reset', danger: true }))) return;
      await store.clearFiles(); urls.forEach((u) => URL.revokeObjectURL(u)); urls.clear();
      state = sample(); save(); location.hash = 'graph'; render(); toast('Sample restored');
    });
  }

  function captured(props) {
    const adds = props.filter((p) => p.kind === 'add').length, flags = props.length - adds;
    $('#capture-status').textContent = `Added to inbox · ${adds} suggestion${adds === 1 ? '' : 's'}${flags ? ` and ${flags} flag${flags === 1 ? '' : 's'}` : ''} waiting for review`;
    save(); render();
  }

  async function detailAction(act) {
    const n = node(state.selected); if (!n) return;
    if (act === 'edit') {
      const f = await ask({ title: `Edit ${TYPES[n.type].label.toLowerCase()}`, body: `
        <label>Title<input name="title" required maxlength="120" value="${esc(n.title)}"></label>
        ${n.type === 'project' ? '' : `<label>Type<select name="type">${typeOptions(n.type)}</select></label>`}
        <label>Description<textarea name="text" rows="3" maxlength="2000">${esc(n.text)}</textarea></label>` });
      if (!f) return;
      n.title = f.get('title').trim() || n.title; n.text = f.get('text').trim();
      if (f.get('type')) n.type = f.get('type');
      if (n.type === 'project') { const p = state.projects.find((x) => x.id === n.project); if (p) p.name = n.title; }
    }
    if (act === 'link') {
      const opts = nodeOptions(n.id);
      if (!opts) { toast('Add another record first'); return; }
      const f = await ask({ title: `Link “${n.title}” to…`, body: `<label>Record<select name="to">${opts}</select></label><label>Relationship<input name="label" required maxlength="40" value="related to"></label>`, ok: 'Link' });
      if (!f) return;
      state.edges.push({ id: uid('e'), from: n.id, to: f.get('to'), label: f.get('label').trim() || 'related to' });
    }
    if (act === 'delete') {
      if (!(await ask({ title: `Delete “${n.title}”?`, body: '<p>The record and its links are removed from the graph. This can’t be undone (unless you exported a copy).</p>', ok: 'Delete', danger: true }))) return;
      state.nodes = state.nodes.filter((x) => x !== n);
      state.edges = state.edges.filter((e) => e.from !== n.id && e.to !== n.id);
      if (n.fileId && !fileInUse(n.fileId)) { await store.delFile(n.fileId); urls.delete(n.fileId); }
      state.selected = null;
    }
    save(); render();
  }

  async function reviewAccept(id, edit) {
    const r = state.proposals.find((x) => x.id === id);
    if (!edit) { accept(r); save(); render(); return; }
    const live = r.links.map((l, i) => ({ l, i })).filter(({ l }) => node(l.to));
    const f = await ask({ title: 'Edit, then accept', ok: 'Accept', body: `
      <label>Title<input name="title" required maxlength="120" value="${esc(r.node.title)}"></label>
      <label>Type<select name="type">${typeOptions(r.node.type)}</select></label>
      <label>Description<textarea name="text" rows="3" maxlength="2000">${esc(r.node.text)}</textarea></label>
      ${live.map(({ l, i }) => `<label style="flex-direction:row;gap:8px"><input type="checkbox" name="link" value="${i}"${l.checked ? ' checked' : ''}> ${esc(l.label)} ${esc(node(l.to).title)}</label>`).join('')}` });
    if (!f) return;
    accept(r, { node: { title: f.get('title').trim() || r.node.title, type: f.get('type'), text: f.get('text').trim() }, links: f.getAll('link').map(Number) });
    save(); render();
  }

  async function newRecord() {
    const opts = nodeOptions(null);
    const f = await ask({ title: 'New record', ok: 'Add', body: `
      <label>Type<select name="type">${typeOptions('experiment')}</select></label>
      <label>Title<input name="title" required maxlength="120"></label>
      <label>Description<textarea name="text" rows="3" maxlength="2000"></textarea></label>
      ${opts ? `<label>Link to (optional)<select name="to"><option value="">— none —</option>${opts}</select></label>
      <label>Relationship<input name="label" maxlength="40" value="related to"></label>` : ''}` });
    if (!f || !f.get('title').trim()) return;
    const to = f.get('to');
    addNode({ type: f.get('type'), title: f.get('title').trim(), text: f.get('text').trim() }, to ? [{ to, label: f.get('label').trim() || 'related to' }] : []);
    save(); location.hash = 'graph'; render();
  }

  // ---------- Export / import ----------
  async function exportData() {
    const ids = new Set([...state.nodes, ...state.inbox].map((x) => x.fileId).filter(Boolean));
    const files = {};
    for (const id of ids) {
      const blob = await store.getFile(id);
      if (blob) files[id] = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(blob); });
    }
    const out = JSON.stringify({ app: 'paivik', version: 1, exported: now(), state, files });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([out], { type: 'application/json' }));
    a.download = `paivik-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast(`Exported ${state.nodes.length} records and ${Object.keys(files).length} files`);
  }

  async function importData(e) {
    const file = e.target.files[0]; e.target.value = '';
    if (!file) return;
    let data;
    try { data = JSON.parse(await file.text()); } catch { toast('That file is not valid JSON'); return; }
    const s = data && data.state;
    if (data.app !== 'paivik' || !s || !Array.isArray(s.nodes) || !Array.isArray(s.projects) || !s.projects.length) { toast('Not a PAIvik export'); return; }
    if (!(await ask({ title: 'Import this export?', body: `<p>${s.projects.length} projects and ${s.nodes.length} records from ${esc(data.exported ? when(data.exported) : 'an export')}. Everything currently in this browser will be replaced.</p>`, ok: 'Import', danger: true }))) return;
    await store.clearFiles(); urls.clear();
    for (const [id, dataUrl] of Object.entries(data.files || {})) {
      try { await store.putFile(id, await (await fetch(dataUrl)).blob()); } catch { /* skip unreadable file */ }
    }
    state = { edges: [], inbox: [], proposals: [], ...s };
    save(); location.hash = 'graph'; render(); toast('Import complete');
  }

  // ---------- Start ----------
  (async () => {
    const ok = await store.open();
    setStorage(ok);
    let saved = null;
    try { saved = await store.get('state'); } catch { saved = null; }
    state = saved && saved.version === 1 && Array.isArray(saved.nodes) ? saved : sample();
    if (!saved) save();
    bind();
    render();
  })();
})();
