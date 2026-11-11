/* PAIvik lab mode for the Living Record.
 *
 * Off by default. It switches on only where a lab hosts this page with a lab.json beside it
 * ({"gateway": "gw/"}), pointing at the lab's PAIvik gateway on the same address. Nothing here is
 * used on the public demo. Lab data (planner, ticker, instruments) stays on the lab's server: it is
 * read and written through the gateway, with the signed-in person's own notebook key, and is never
 * stored in this browser. The browser-only graph keeps working as before.
 */
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const when = (iso) => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }); };
  const num = (v) => (Math.round(Number(v) * 10) / 10).toLocaleString('en', { maximumFractionDigits: 1 });

  const L = {
    on: false, base: '', me: null, cat: null, error: '',
    choice: { title: '', protocol: '', mix: '', primer_f: '', primer_r: '', instrument: '', positive: '', samples: [], more: '', ntc: true, extra_pct: 13, modification: '', volumes: {}, volume_ul: '', template_ul: '' },
    preview: null, runId: null, run: null, people: null, tickWho: 'me', timers: [],
    askFound: null, map: null, level: 0, placeKey: null, arranging: false, stashing: false, sem: null, slide: -1,
  };

  // ---------- talking to the gateway ----------
  class LabError extends Error { constructor(msg, code, extra) { super(msg); this.code = code; this.extra = extra || {}; } }

  async function api(path, { method = 'GET', body, form } = {}) {
    const opts = { method, credentials: 'same-origin', headers: { Accept: 'application/json' } };
    if (form) opts.body = form;
    else if (body !== undefined) { opts.body = JSON.stringify(body); opts.headers['Content-Type'] = 'application/json'; }
    let res;
    try { res = await fetch(L.base + 'api/v1/' + path, opts); } catch { throw new LabError('The lab server is not reachable.', 'OFFLINE'); }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const code = data.error || String(res.status);
      const msg = { SIGN_IN: 'Sign in to the lab first.', NO_KEY: 'Connect your notebook account first.' }[code] || code;
      throw new LabError(msg, code, data);
    }
    return data;
  }

  function toast(msg) {
    const t = document.createElement('div');
    t.className = 'labtoast'; t.setAttribute('role', 'status'); t.textContent = msg;
    document.body.appendChild(t); setTimeout(() => t.remove(), 4200);
  }

  function problem(panel, err) {
    if (err.code === 'NO_KEY') return keyForm(panel);
    if (err.code === 'SIGN_IN') {
      const href = err.extra.sign_in ? `${esc(err.extra.sign_in)}?next=/` : '';
      panel.innerHTML = `<div class="labcard"><h2>Sign in to the lab</h2><p>${href ? `<a class="btn" href="${href}">Sign in</a>` : 'Open this page through the lab network.'}</p></div>`;
      return;
    }
    panel.innerHTML = `<div class="labcard warn"><p>${esc(err.message)}</p><button type="button" class="link" data-lab-retry>Try again</button></div>`;
  }

  function keyForm(panel) {
    const url = (L.me && L.me.keys_url) || '#';
    panel.innerHTML = `<div class="labcard"><h2>Connect your notebook account</h2>
<p>The Planner and Ticker write <b>in your name</b>, so they need your own notebook key once.</p>
<ol><li>Open <a href="${esc(url)}" target="_blank" rel="noopener">your notebook settings → API keys</a>.</li>
<li>Create a key named “PAIvik” with <b>Read/Write</b> access and copy it.</li><li>Paste it here.</li></ol>
<form data-lab-form="key" class="labrow"><input type="password" name="key" required maxlength="200" autocomplete="off" aria-label="Notebook API key" placeholder="Paste the key">
<button class="btn">Check and save</button></form>
<p class="labhint">The key is stored only on the lab server, readable only by the PAIvik service.</p></div>`;
  }

  // ---------- switching lab mode on ----------
  async function init() {
    if (location.hostname.endsWith('github.io')) return;
    let cfg;
    try {
      const r = await fetch('lab.json', { cache: 'no-store' });
      if (!r.ok) return;
      cfg = await r.json();
    } catch { return; }
    const gw = cfg && typeof cfg.gateway === 'string' ? cfg.gateway : '';
    if (gw.startsWith('/') || !/^[a-z0-9/_-]+\/$/i.test(gw)) return;  // only a relative path on this same address (never //host/)
    L.base = gw; L.on = true;
    document.body.classList.add('lab-on');
    $$('[data-lab]').forEach((el) => { el.hidden = false; });
    const pr = $('#lab-print'); if (pr) pr.href = printToday();
    try {
      L.me = await api('me');
      $('.privacy').textContent = `Lab connected · ${L.me.user}`;
    } catch (err) {
      $('.privacy').textContent = err.code === 'SIGN_IN' ? 'Lab: not signed in' : 'Lab server not reachable';
    }
    refreshBadges();
    setInterval(refreshBadges, 60000);
    const asked = new URLSearchParams(location.search).get('ask');  // e.g. a link Claude made: ?ask=PCR+of+colonies+1-8#planner
    if (asked && L.me) {
      history.replaceState(null, '', location.pathname + location.hash);
      $('#lab-ask-text').value = asked.slice(0, 4000);
      askPaivik(asked.slice(0, 4000));
    }
    window.dispatchEvent(new Event('hashchange'));  // app.js re-renders; lab views (#planner, ...) are allowed now
  }

  const currentView = () => location.hash.slice(1) || 'graph';

  // One click for the paper notebook: today's ticks (yours), print dialog opens by itself.
  function printToday() {
    const d = new Date(), day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return `${L.base}ticker/print?day=${day}&user=me&auto=1`;
  }

  async function refreshBadges() {
    if (!L.me) return;
    try {
      const p = await api('proposals');
      const b = $('#count-lab-review'); if (b) b.textContent = p.pending || '';
      const note = $('#lab-review-note');
      if (note) {
        note.hidden = false;
        note.innerHTML = `<b>Lab notebook changes:</b> ${p.pending ? `${p.pending} not written yet.` : 'all written.'} ${p.recent.slice(0, 3).map((r) => `<a href="${esc(r.url)}" target="_blank" rel="noopener">#${r.id} ${esc(r.summary)}</a>`).join(' · ')}
 <a href="${esc(p.review_url)}" target="_blank" rel="noopener">Open the review page ↗</a> <span class="labhint">(your own changes are written at once; ones drafted by a model wait there for an approver)</span>`;
      }
    } catch { /* badges are a convenience */ }
    if (!L.me.has_key) return;
    try {
      const m = await api('map');  // one call: instruments in use and open notes on the lab map
      const busy = m.busy || 0;  // all instruments, in every room
      $('#count-map').textContent = [busy ? `${busy} busy` : '', m.open_notes ? `💬${m.open_notes}` : ''].filter(Boolean).join(' ');
      const plans = await api('plans');
      L.timers = plans.mine.filter((p) => p.booking_end && new Date(p.booking_end) > new Date()).map((p) => ({ id: p.id, title: p.plan.title, end: p.booking_end }));
      tickTimers();
    } catch { /* ignore */ }
  }

  // A running PCR shows in the top bar on every page, and rings when it finishes.
  let timerLoop = null;
  function tickTimers() {
    const chip = $('#lab-timer');
    if (!chip) return;
    clearTimeout(timerLoop);
    const now = Date.now();
    const live = L.timers.filter((t) => new Date(t.end).getTime() > now - 60000);
    if (!live.length) { chip.hidden = true; return; }
    const t = live[0], s = Math.round((new Date(t.end).getTime() - now) / 1000);
    chip.hidden = false;
    chip.innerHTML = s > 0 ? `⏱ ${esc(t.title)} · ${clock(s)}` : `✓ ${esc(t.title)} finished`;
    chip.dataset.run = t.id;
    if (s <= 0 && !t.told) {
      t.told = true;
      if ('Notification' in window && Notification.permission === 'granted') new Notification('PAIvik: your run is finished', { body: t.title });
      try { const a = new AudioContext(), o = a.createOscillator(); o.connect(a.destination); o.start(); o.stop(a.currentTime + 0.4); } catch { /* sound is optional */ }
    }
    timerLoop = setTimeout(tickTimers, 1000);
  }
  const clock = (s) => { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return (h ? h + ':' : '') + String(m).padStart(2, '0') + ':' + String(x).padStart(2, '0'); };

  // ---------- rendering, called by app.js after every render ----------
  function render(v) {
    if (!L.on) return;
    if (v === 'ticker') renderTicker();
    else if (v === 'planner') renderPlanner();
    else if (v === 'instruments') renderInstruments();
    else if (v === 'map') renderMap();
    else if (v === 'seminar') renderSeminar();
  }

  // ---------- Instruments ----------
  async function renderInstruments() {
    const panel = $('#panel-instruments');
    if (!panel.innerHTML) panel.innerHTML = '<p class="labhint">Loading instruments…</p>';
    try {
      const rows = await api('instruments');
      panel.innerHTML = (rows.map((r) => `<div class="labcard inst ${r.state.replace(' ', '-')}">
<div class="labrow"><b>${esc(r.title)}</b><span class="state">${esc(r.state)}</span></div>
<p class="labhint">${esc(r.kind || 'Instrument')} · ${r.slots} slot${r.slots > 1 ? 's' : ''}${r.where ? ' · 📍 ' + esc(r.where) : ''}${r.bookable ? '' : ' · not bookable yet'}</p>
${r.now.map((x) => `<p>${esc(x.who)}: ${esc(x.title)} · until ${esc(x.until)}</p>`).join('')}
${r.later.length ? `<p class="labhint">Later today: ${r.later.map((x) => `${esc(x.from)}–${esc(x.until)} ${esc(x.who)}`).join(', ')}</p>` : ''}</div>`).join('')
        || '<p class="labhint">No instruments in the notebook yet. Add them there under Instruments.</p>')
        + '<p class="labhint">From notebook bookings. Starting a run in the Planner books its instrument.</p>';
    } catch (err) { problem(panel, err); }
  }

  // ---------- Ticker ----------
  async function renderTicker() {
    const panel = $('#panel-ticker');
    if (!panel.innerHTML) panel.innerHTML = '<p class="labhint">Loading ticks…</p>';
    try {
      const [feed, people] = await Promise.all([api('ticker?user=' + encodeURIComponent(L.tickWho)), L.people || api('people')]);
      L.people = people;
      const mineView = feed.owner === feed.me;
      const opts = [['me', 'My ticks'], ['all', 'Workgroup (all I can see)'], ...people.filter((p) => p.id !== feed.me).map((p) => [String(p.id), p.name])]
        .map(([v, t]) => `<option value="${esc(v)}"${v === L.tickWho ? ' selected' : ''}>${esc(t)}</option>`).join('');
      const days = {};
      feed.ticks.forEach((t) => { const d = t.at.slice(0, 10); (days[d] = days[d] || []).push(t); });
      const who = feed.owner === null ? 'all' : feed.owner;
      const open = new Set($$('.tick[open]', panel).map((d) => d.id));  // keep what the person had open
      panel.innerHTML = `<div class="labrow"><select data-lab-tickwho aria-label="Whose ticks">${opts}</select>
<a class="btn" href="${esc(printToday())}" target="_blank" rel="noopener">🖨 Print my day's work</a>
<span class="labhint">You see what the notebook lets you read: yours, ones shared with you, and as team admin the whole workgroup.</span></div>
${mineView ? `<form data-lab-form="tick" class="labcard labform"><input type="text" name="title" required maxlength="200" placeholder="New tick: what did you do?" aria-label="New tick title">
<textarea name="note" rows="2" maxlength="4000" placeholder="Details (optional)" aria-label="Details"></textarea><div class="labrow"><button class="btn">Add tick</button><span class="labhint">Runs from the Planner appear here by themselves.</span></div></form>` : ''}
${Object.entries(days).map(([d, ts]) => `<div class="tickday"><span>${esc(new Date(d + 'T12:00').toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' }))}</span>
<a href="${esc(L.base)}ticker/print?day=${esc(d)}&user=${esc(who)}" target="_blank" rel="noopener">🖨 Print this day</a></div>${ts.map(tickHtml).join('')}`).join('')
  || '<p class="labhint">No ticks yet.</p>'}`;
      open.forEach((id) => { const d = document.getElementById(id); if (d) d.open = true; });
    } catch (err) { problem(panel, err); }
  }

  function tickHtml(t) {
    const time = new Date(t.at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    const link = L.me ? `${L.me.notebook}/experiments.php?mode=view&id=${t.id}` : '#';
    return `<details class="tick" id="tick-${t.id}"${t.color ? ` style="border-left-color:#${esc(t.color)}"` : ''}>
<summary><span class="labhint">${esc(time)}</span> <b>${esc(t.title)}</b>${t.category ? ` <span class="chip">${esc(t.category)}</span>` : ''}${t.plan_id ? ' <span class="chip">PCR plan</span>' : ''}${t.comments.length ? ` <span class="chip">💬 ${t.comments.length}</span>` : ''}${t.seminar ? ' <span class="chip sem">⚑ seminar</span>' : ''}
<span class="labhint"> · ${esc(t.who)}</span>
${t.follows.map((x) => `<div class="chain">↳ follows ${esc(x.title)}</div>`).join('')}${t.next.map((x) => `<div class="chain">→ next: ${esc(x.title)}</div>`).join('')}</summary>
<div class="tickbody"><p><a href="${esc(link)}" target="_blank" rel="noopener">Open in notebook ↗</a>${t.plan_id ? ` · <a href="#planner" data-lab-run="${t.plan_id}">Open run in Planner</a>` : ''}
${t.mine ? ` · <button type="button" class="link" data-sem-flag="${t.id}" data-on="${t.seminar ? '0' : '1'}">${t.seminar ? 'Take off the seminar' : '⚑ Show at the seminar'}</button>` : ''}</p>
${t.comments.map((c) => `<div class="cm"><b>${esc(c.who)}</b> <span class="labhint">${esc(new Date(c.at).toLocaleString())}</span><br>${esc(c.text)}</div>`).join('')}
<form data-lab-form="comment" data-exp="${t.id}" class="labrow"><input type="text" name="text" required maxlength="4000" placeholder="Comment…" aria-label="Comment"><button class="link">Comment</button></form>
${t.mine ? `<details><summary class="labhint">＋ Attach next tick</summary><form data-lab-form="tick" data-parent="${t.id}" class="labform">
<input type="text" name="title" required maxlength="200" placeholder="e.g. DNA concentrations measured on NanoDrop" aria-label="Next tick title">
<textarea name="note" rows="2" maxlength="4000" placeholder="Values, observations…" aria-label="Details"></textarea><button class="btn">Attach</button></form></details>` : ''}</div></details>`;
  }

  // ---------- Planner ----------
  async function renderPlanner() {
    const panel = $('#panel-planner');
    if (L.runId) return renderRun(panel);
    if (!panel.querySelector('[data-lab-planner]')) panel.innerHTML = '<p class="labhint">Loading the lab’s records…</p>';
    try {
      if (!L.cat) L.cat = await api('catalogue');
      const plans = await api('plans');
      if (!panel.querySelector('[data-lab-planner]')) { panel.innerHTML = plannerHtml(plans); updatePreview(); }
      else $('#lab-runs').innerHTML = runsHtml(plans);
    } catch (err) { problem(panel, err); }
  }

  function opts(rows, sel, blank = '— none —') {
    return (blank ? `<option value="">${esc(blank)}</option>` : '') + rows.map((r) =>
      `<option value="${r.id}"${String(r.id) === String(sel) ? ' selected' : ''}>${r.relevant ? '★ ' : ''}${esc(r.title)}${r.where ? ' · ' + esc(r.where) : ''}</option>`).join('');
  }

  function plannerHtml(plans) {
    const c = L.choice, cat = L.cat;
    const cyclers = cat.instruments.filter((r) => !r.kind || r.kind === 'Thermocycler');
    const samples = cat.samples.map((r) => `<label class="pick"><input type="checkbox" data-lab-sample value="${r.id}"${c.samples.includes(String(r.id)) ? ' checked' : ''}>
<span>${r.relevant ? '★ ' : ''}${esc(r.title)} <small>${esc(r.category)}</small>${r.where ? `<br><small>📍 ${esc(r.where)}</small>` : ''}</span></label>`).join('')
      || '<p class="labhint">No samples in the notebook yet. Type them below.</p>';
    const understood = L.askFound ? `<div class="labcard askfound"><div class="labrow"><b>Filled in from your words</b><button type="button" class="link" data-ask-clear aria-label="Hide">✕</button></div>
<ul class="tight">${L.askFound.map((f) => `<li>${esc(f)}</li>`).join('') || '<li>Nothing matched the notebook; pick below.</li>'}</ul><p class="labhint">Check and change anything below, then save.</p></div>` : '';
    return `${understood}<div class="planner" data-lab-planner>
<form class="labcard labform" data-lab-form="plan" autocomplete="off">
<h2>PCR</h2>
<label>Run name <input type="text" name="title" maxlength="200" value="${esc(c.title)}" placeholder="e.g. 16S colony PCR, plate 3"></label>
<div class="labgrid">
<label>Protocol <select name="protocol">${opts(cat.protocols, c.protocol, 'Default PCR recipe')}</select></label>
<label>Polymerase / master mix <select name="mix">${opts(cat.mix, c.mix)}</select></label>
<label>Forward primer <select name="primer_f">${opts(cat.primers, c.primer_f)}</select></label>
<label>Reverse primer <select name="primer_r">${opts(cat.primers, c.primer_r)}</select></label>
<label>Thermocycler <select name="instrument">${opts(cyclers.length ? cyclers : cat.instruments, c.instrument)}</select></label>
<label>Extra mix % <input type="number" name="extra_pct" min="0" max="50" value="${esc(c.extra_pct)}"></label>
</div>
<fieldset><legend>Samples <span class="labhint">— tube order follows the order you tick them</span></legend><div class="picks">${samples}</div>
<label>Other samples <small class="labhint">one per line</small><textarea name="more" rows="2" maxlength="4000">${esc(c.more)}</textarea></label>
<div class="labgrid"><label>Positive control <select name="positive">${opts(cat.samples, c.positive)}</select></label>
<label class="pick"><input type="checkbox" name="ntc"${c.ntc ? ' checked' : ''}> No-template control (water)</label></div></fieldset>
<label>Change to the protocol for this run <input type="text" name="modification" maxlength="500" value="${esc(c.modification)}" placeholder="e.g. annealing 56 °C instead of 58 °C"></label>
</form>
<div class="labcard" id="lab-preview" aria-live="polite"><p class="labhint">Pick samples to see the master mix.</p></div>
</div><div id="lab-runs">${runsHtml(plans)}</div>`;
  }

  function runsHtml(plans) {
    const row = (p, by) => `<li><a href="#planner" data-lab-run="${p.id}">${esc(p.plan.title)}</a> <span class="labhint">${by ? 'from ' + esc(by) + ' · ' : ''}${esc(p.status || 'shared')} · ${esc(when(p.created_at || p.at))}</span></li>`;
    return (plans.shared.length ? `<div class="labcard"><h3>Shared with you</h3><ul>${plans.shared.map((s) => row({ id: s.id, plan: { title: s.title }, at: s.at, status: s.results ? s.results.positive.length + ' positive' : 'shared' }, s.by)).join('')}</ul></div>` : '')
      + (plans.mine.length ? `<div class="labcard"><h3>Your runs</h3><ul>${plans.mine.map((p) => row(p)).join('')}</ul></div>` : '');
  }

  function readPlanForm() {
    const f = $('[data-lab-form="plan"]');
    if (!f) return;
    const c = L.choice, fd = new FormData(f);
    ['title', 'protocol', 'mix', 'primer_f', 'primer_r', 'instrument', 'positive', 'modification', 'more', 'extra_pct'].forEach((k) => { c[k] = fd.get(k) ?? ''; });
    c.ntc = fd.get('ntc') === 'on';
  }

  function choiceBody() {
    const c = L.choice;
    return { ...c, more: c.more.split('\n').map((s) => s.trim()).filter(Boolean) };
  }

  let previewTimer = null;
  function updatePreview() {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(async () => {
      const box = $('#lab-preview');
      if (!box) return;
      readPlanForm();
      const c = L.choice;
      if (!c.samples.length && !c.more.trim() && !c.positive) { box.innerHTML = '<p class="labhint">Pick samples to see the master mix.</p>'; L.preview = null; return; }
      try {
        L.preview = await api('plan/preview', { method: 'POST', body: choiceBody() });
        box.innerHTML = previewHtml(L.preview, true);
      } catch (err) { box.innerHTML = `<p class="warn">${esc(err.message)}</p>`; L.preview = null; }
    }, 250);
  }

  function mixTable(plan, editable) {
    const m = plan.mix;
    return `<table class="labtable"><thead><tr><th>Component</th><th class="r">µL / rxn</th><th class="r">µL total</th></tr></thead><tbody>
${m.rows.map((r, i) => `<tr><td>${esc(r.name)}${r.item_title ? ` <small class="labhint">${esc(r.item_title)}</small>` : ''}</td>
<td class="r">${editable && r.role !== 'water' ? `<input class="n" type="number" min="0" step="0.1" value="${r.per_rxn}" data-lab-vol="${i}" aria-label="${esc(r.name)} µL per reaction">` : num(r.per_rxn)}</td><td class="r"><b>${num(r.total)}</b></td></tr>`).join('')}
<tr class="sum"><td>Master mix <small class="labhint">— ${num(m.mix_per_tube)} µL per tube, then ${num(m.template_ul)} µL template</small></td><td class="r">${num(m.mix_per_tube)}</td><td class="r"><b>${num(m.mix_total)}</b></td></tr></tbody></table>`;
  }

  function previewHtml(plan, editable) {
    const m = plan.mix;
    return `<h3>${m.reactions} reactions + ${num(m.extra_pct)}% = mix for ${Number(m.factor).toLocaleString('en', { maximumFractionDigits: 2 })}</h3>
${editable ? `<p class="labrow"><label>Reaction <input class="n" type="number" min="1" step="0.5" value="${m.volume_ul}" data-lab-total="volume_ul"> µL</label>
<label>Template <input class="n" type="number" min="0" step="0.5" value="${m.template_ul}" data-lab-total="template_ul"> µL</label></p>` : ''}
${mixTable(plan, editable)}
<p class="labhint">Cycling: ${esc(plan.recipe.cycling || '')}${plan.modification ? ` · <b>This run:</b> ${esc(plan.modification)}` : ''}</p>
<div class="labgrid"><div><h4>Tubes</h4><ol class="tight">${plan.tubes.map((t) => `<li>${esc(t.label)}</li>`).join('')}</ol></div>
<div><h4>Gel lanes</h4><ol class="tight">${plan.lanes.map((l) => `<li>${esc(l.label)}</li>`).join('')}</ol></div></div>
${editable ? `<div class="labrow"><button type="button" class="btn" data-lab-save>Save run to the notebook</button><span class="labhint">Creates the experiment in your name, linked to ${plan.records.length} records; private until you share it.</span></div>` : ''}`;
  }

  async function saveRun(btn) {
    if (!L.preview) return;
    btn.disabled = true; btn.textContent = 'Saving…';
    try {
      const shown = JSON.stringify([L.preview.mix, L.preview.tubes]);
      const draft = await api('plans/new', { method: 'POST', body: choiceBody() });
      // No second check-and-confirm: save what the notebook records give now, and say so if that differs from the screen.
      const changed = JSON.stringify([draft.plan.mix, draft.plan.tubes]) !== shown;
      const saved = await api(`plans/${draft.id}/save`, { method: 'POST', body: { hash: draft.hash } });
      toast(changed ? 'Saved. The records had changed, so the numbers were updated: check the run page.' : 'Saved to the notebook');
      L.choice.samples = []; L.choice.title = ''; L.choice.more = ''; L.askFound = null;
      openRun(saved.id);
    } catch (err) { toast(err.message); } finally { btn.disabled = false; btn.textContent = 'Save run to the notebook'; }
  }

  function openRun(id) { L.runId = Number(id); L.run = null; if (location.hash !== '#planner') location.hash = 'planner'; else renderPlanner(); }

  async function renderRun(panel) {
    try {
      const p = L.run && L.run.id === L.runId ? L.run : await api('plans/' + L.runId);
      L.run = p;
      if (p.mine && p.status === 'saved' && !L.people) L.people = await api('people').catch(() => []);
      const plan = p.plan, exp = p.experiment_id && L.me ? `${L.me.notebook}/experiments.php?mode=view&id=${p.experiment_id}` : '';
      const ins = plan.instrument;
      let act = '';
      if (p.status === 'saved' && p.mine) {
        const running = p.booking_end && new Date(p.booking_end) > new Date();
        act += p.booking_end
          ? `<div class="labcard"><h3>${running ? 'Running' : 'Run finished'} on ${esc(ins ? ins.title : 'the instrument')}</h3><p class="bigclock" data-lab-clock="${esc(p.booking_end)}"></p><p class="labhint">Others see the instrument as busy until then.</p></div>`
          : `<form class="labcard labrow" data-lab-form="start"><b>Start the run</b><label>Run time <input class="n" type="number" name="minutes" min="1" max="1440" value="${esc(plan.recipe.run_minutes || 90)}"> min</label>
<button class="btn"${ins ? '' : ' disabled'}>▶ Start timer${ins ? ' and book ' + esc(ins.title) : ''}</button>${ins ? '' : '<span class="labhint">No thermocycler was chosen for this run.</span>'}</form>`;
        act += gelHtml(p) + shareHtml(p);
      } else if (p.gel_upload) act += gelHtml(p);
      panel.innerHTML = `<p><a href="#planner" data-lab-back>← Planner</a></p><div class="labcard"><h2>${esc(plan.title)}</h2>
<p class="labhint">${esc(p.created_by)} · ${esc(p.status)}${exp ? ` · <a href="${esc(exp)}" target="_blank" rel="noopener">experiment ${p.experiment_id} ↗</a>` : ''}</p>${previewHtml(plan, false)}</div>${act}`;
      startClocks();
      if (p.booking_end && 'Notification' in window && Notification.permission === 'default') Notification.requestPermission();
    } catch (err) { problem(panel, err); }
  }

  function startClocks() {
    $$('[data-lab-clock]').forEach((el) => {
      const end = new Date(el.dataset.labClock).getTime();
      const step = () => { if (!el.isConnected) return; const s = Math.round((end - Date.now()) / 1000); el.textContent = s > 0 ? clock(s) : 'Done'; if (s > 0) setTimeout(step, 1000); };
      step();
    });
  }

  function gelHtml(p) {
    if (!p.gel_upload) {
      return p.mine ? `<form class="labcard labrow" data-lab-form="gel"><b>Gel picture</b><span class="labhint">Lane 1 ladder, then tubes in order.</span>
<input type="file" name="gel" accept="image/*" capture="environment" required aria-label="Gel picture"><button class="btn">Upload</button></form>` : '';
    }
    const res = p.results, calls = (res && res.calls) || {}, expect = { ntc: '-', positive: '+' };
    const rows = p.plan.lanes.map((l) => {
      if (l.kind === 'ladder') return `<tr><td>${l.lane}</td><td>${esc(l.label)}</td><td class="labhint">ladder</td></tr>`;
      const cur = calls[l.lane] || (res ? '' : expect[l.kind] || '');
      return `<tr><td>${l.lane}</td><td>${esc(l.label)}</td><td>${[['+', 'band'], ['-', 'none'], ['?', 'unclear']].map(([v, t]) =>
        `<label class="pick inline"><input type="radio" name="lane_${l.lane}" value="${v}"${cur === v ? ' checked' : ''}${p.mine ? '' : ' disabled'}> ${t}</label>`).join('')}</td></tr>`;
    }).join('');
    return `<form class="labcard" data-lab-form="results"><h3>Gel</h3><div class="labgrid"><img class="gel" src="${esc(L.base)}api/v1/plans/${p.id}/gel" alt="Gel picture for this run">
<table class="labtable"><thead><tr><th>Lane</th><th>Content</th><th>Band?</th></tr></thead><tbody>${rows}</tbody></table></div>
${res ? `<p><b>Positive:</b> ${esc(res.positive.join(', ') || 'none')} · <b>Negative:</b> ${esc(res.negative.join(', ') || 'none')} <span class="labhint">(recorded ${esc(res.at)})</span></p>` : ''}
${((res && res.warnings) || []).map((w) => `<p class="warn">${esc(w)}</p>`).join('')}
${p.mine ? '<div class="labrow"><input type="text" name="note" maxlength="500" placeholder="Note (optional)" aria-label="Note"><button class="btn">Write result to the notebook</button></div>' : ''}</form>`;
  }

  function shareHtml(p) {
    const others = (L.people || []).filter((x) => L.me && x.email.toLowerCase() !== L.me.user.toLowerCase());
    return `<form class="labcard" data-lab-form="share"><h3>Share results ${p.shared ? `<span class="chip ok">shared with ${esc(p.shared.label)}</span>` : '<span class="labhint">— now only you and team admins</span>'}</h3>
<label class="pick"><input type="radio" name="mode" value="people" checked> Chosen people (e.g. your supervisor)</label>
<div class="picks indent">${others.map((x) => `<label class="pick"><input type="checkbox" name="user" value="${x.id}"> ${esc(x.name)}${x.admin ? ' <small class="labhint">team admin</small>' : ''}</label>`).join('') || '<span class="labhint">No one else in the workgroup yet.</span>'}</div>
<label class="pick"><input type="radio" name="mode" value="wg"> The whole workgroup</label><div class="labrow"><button class="btn">Share</button></div></form>`;
  }

  // ---------- Lab map: fridges, freezers, instruments; notes; today's products ----------
  const ICON = { freezer80: '❄❄', freezer: '❄', fridge: '▯', cabinet: '▦', shelf: '▤', bench: '▭', instrument: '⚙', storage: '▢', room: '⌂' };
  // Names wrap onto two lines inside the box; longer ones end in an ellipsis (the full name is in the side panel).
  function lines(t, w) {
    const max = Math.max(5, Math.floor(w / 8.6)), words = String(t).split(/\s+/), out = [''];
    for (const word of words) {
      const cur = out[out.length - 1];
      if (!cur) out[out.length - 1] = word; else if ((cur + ' ' + word).length <= max) out[out.length - 1] = cur + ' ' + word; else out.push(word);
    }
    const two = out.slice(0, 2).map((l) => (l.length > max ? l.slice(0, max - 1) + '…' : l));
    if (out.length > 2) two[1] = two[1].slice(0, max - 1) + '…';
    return two;
  }

  async function renderMap() {
    const panel = $('#panel-map');
    if (!panel.innerHTML) panel.innerHTML = '<p class="labhint">Loading the lab map…</p>';
    try {
      L.map = await api('map?level=' + L.level);
      drawMap(panel);
      if (L.placeKey && L.map.places.some((x) => x.key === L.placeKey)) openPlace(L.placeKey);
      else if (L.level) openPlace('s:' + L.level);  // inside a room: its own notes and contents
      else L.placeKey = null;
    } catch (err) { problem(panel, err); }
  }

  function drawMap(panel) {
    const m = L.map, room = m.trail.length ? m.trail[m.trail.length - 1] : null;
    const kinds = Object.entries(m.kinds).filter(([k]) => k !== 'instrument').map(([k, v]) => `<option value="${esc(k)}">${esc(v)}</option>`).join('');
    const pic = m.picture ? `<image class="plan" href="${esc(L.base)}api/v1/map/picture?level=${m.level}&v=${encodeURIComponent(m.picture.at)}" x="0" y="0" width="${m.w}" height="${m.h}" preserveAspectRatio="none"/>` : '';
    const box = (p) => {
      const st = p.state ? ` ${p.state.replace(' ', '-')}` : '';
      const badges = [p.count ? `${p.count}` : '', p.notes ? `💬${p.notes}` : ''].filter(Boolean).join(' ');
      const isRoom = p.kind === 'room';
      const label = lines(p.name, p.w - 16);
      return `<g class="place ${esc(p.kind)}${st}${p.key === L.placeKey ? ' sel' : ''}" data-place="${esc(p.key)}" transform="translate(${p.x} ${p.y})" tabindex="0" role="button"
 aria-label="${esc(p.name)}${isRoom ? ' (room, opens its plan)' : ''}${p.count ? `, ${p.count} stored` : ''}${p.notes ? `, ${p.notes} notes` : ''}${p.state ? `, ${esc(p.state)}` : ''}">
<rect width="${p.w}" height="${p.h}" rx="${isRoom ? 4 : 10}"/>${isRoom
  ? label.map((l, i) => `<text x="8" y="${20 + i * 17}" class="nm">${esc(l)}</text>`).join('')
  : `<text x="10" y="28" class="ico">${ICON[p.kind] || '▢'}</text>${label.map((l, i, a) => `<text x="10" y="${p.h - 12 - (a.length - 1 - i) * 18}" class="nm">${esc(l)}</text>`).join('')}`}
${badges ? `<text x="${p.w - 8}" y="${isRoom ? p.h - 10 : 26}" class="bd" text-anchor="end">${esc(badges)}</text>` : ''}
${L.arranging ? `<rect class="grip" data-grip width="16" height="16" x="${p.w - 16}" y="${p.h - 16}" rx="3"/>` : ''}</g>`;
    };
    const crumbs = [`<button type="button" class="link" data-map-level="0"${m.level ? '' : ' aria-current="page"'}>Floor</button>`,
      ...m.trail.map((t, i) => (i === m.trail.length - 1 ? `<b>${esc(t.name)}</b>` : `<button type="button" class="link" data-map-level="${t.id}">${esc(t.name)}</button>`))].join(' › ');
    panel.innerHTML = `<div class="labrow"><b class="mapcrumbs">${crumbs}</b>
<span class="labhint">${m.places.length ? (m.level ? 'Tap a fridge, freezer or instrument: see what is in it, leave a note, or put today’s products there.' : 'Tap a room to go in, or a fridge or instrument to see it.') : (m.level ? 'Nothing placed in this room yet.' : 'No storage yet: add a room or your first fridge.')}</span>
<button type="button" class="link" data-map-arrange>${L.arranging ? '✓ Done arranging' : '✥ Arrange'}</button>
<a class="link" href="#instruments">Instrument list</a></div>
${L.arranging || !m.places.length ? `<div class="labcard"><form data-lab-form="unit" class="labrow"><input name="name" required maxlength="100" placeholder="${m.level ? 'New here: e.g. Freezer −20 °C by the door' : 'New: e.g. 613 BSL-2 lab, or Freezer −80 °C'}" aria-label="Name of the new room, fridge or freezer">
<select name="kind" aria-label="Kind">${kinds.replace(`value="${m.level ? 'freezer' : 'room'}"`, `value="${m.level ? 'freezer' : 'room'}" selected`)}</select><button class="btn">Add</button></form>
<form data-lab-form="mappic" class="labrow"><label class="labhint">Floor plan picture${room ? ` for ${esc(room.name)}` : ''} (PDF, PNG or JPEG) <input type="file" name="picture" accept="application/pdf,image/png,image/jpeg,image/webp" required></label><button class="btn">Upload</button>
${m.picture ? '<button type="button" class="link" data-map-nopic>Remove picture</button>' : ''}</form>
${L.arranging ? '<p class="labhint">Drag boxes to where they are; drag the corner square to resize (rooms: trace them over the plan). Saved when you press Done.</p>' : ''}</div>` : ''}
<div class="labmap-wrap"><div class="labmap-scroll"><svg class="labmap${L.arranging ? ' arranging' : ''}${m.picture ? ' haspic' : ''}" viewBox="0 0 ${m.w} ${m.h}" role="group" aria-label="${room ? esc(room.name) : 'Floor plan'}">
${pic || `<rect class="room-outline" x="4" y="4" width="${m.w - 8}" height="${m.h - 8}" rx="14"/>`}${m.places.map(box).join('')}</svg></div>
<aside id="lab-place" class="labcard labplace"${L.placeKey ? '' : ' hidden'}></aside></div>`;
  }

  const notebookLink = (entity, id) => L.me && L.me.notebook ? `${L.me.notebook}/${entity === 'experiments' ? 'experiments' : 'database'}.php?mode=view&id=${encodeURIComponent(id)}` : '#';

  async function openPlace(key) {
    L.placeKey = key; L.stashing = false;
    $$('.labmap .place').forEach((g) => g.classList.toggle('sel', g.dataset.place === key));
    const side = $('#lab-place'); if (!side) return;
    side.hidden = false; side.innerHTML = '<p class="labhint">Opening…</p>';
    try { const pl = await api('map/place?key=' + encodeURIComponent(key)); if (L.placeKey === key) drawPlace(side, pl); }
    catch (err) { side.innerHTML = `<p>${esc(err.message)}</p>`; }
  }

  function notesHtml(pl) {
    const open = pl.notes.filter((n) => !n.done_at), done = pl.notes.filter((n) => n.done_at);
    return `<h4>Notes for others</h4>${open.map((n) => `<div class="pnote"><p>${esc(n.text)}</p><p class="labhint">${esc(n.name)} · ${esc(when(n.at))}
<button type="button" class="link" data-note-done="${n.id}">✓ Done</button></p></div>`).join('') || '<p class="labhint">No open notes.</p>'}
<form data-lab-form="note" class="labform"><textarea name="text" rows="2" maxlength="1000" required placeholder="e.g. Door does not close properly · Out of Taq, ordered" aria-label="New note"></textarea>
<div class="labrow"><button class="btn">Leave note</button></div></form>
${done.length ? `<details><summary class="labhint">${done.length} done</summary>${done.map((n) => `<p class="labhint"><s>${esc(n.text)}</s> · ${esc(n.name)}</p>`).join('')}</details>` : ''}`;
  }

  function drawPlace(side, pl) {
    const kind = pl.type === 'instrument' ? 'instrument' : pl.key === 's:' + L.level ? 'room' : (L.map.places.find((p) => p.key === pl.key) || {}).kind;
    const head = `<div class="labrow"><b>${ICON[kind] || '▢'} ${esc(pl.name)}</b>
<button type="button" class="link" data-place-close aria-label="Close">✕</button></div>`;
    if (pl.type === 'instrument') {
      side.innerHTML = `${head}<p><span class="chip inst-${esc(pl.state.replace(' ', '-'))}">${esc(pl.state)}</span>${pl.responsible ? ` <span class="labhint">Responsible: ${esc(pl.responsible)}</span>` : ''}</p>
${pl.now.map((x) => `<p>${esc(x.who)}: ${esc(x.title)} · until ${esc(x.until)}</p>`).join('')}
${pl.later.length ? `<p class="labhint">Later today: ${pl.later.map((x) => `${esc(x.from)}–${esc(x.until)} ${esc(x.who)}`).join(', ')}</p>` : ''}
<p class="labrow"><a class="btn" href="#planner">Plan a run</a><a class="link" href="${esc(notebookLink('items', pl.id))}" target="_blank" rel="noopener">Book in the notebook ↗</a></p>
${L.map.rooms.length ? `<p class="labrow"><label class="labhint">Stands in <select data-inst-room="${esc(pl.key)}">${[['0', 'the floor plan'], ...L.map.rooms.map((r) => [String(r.id), r.name])].map(([v, t]) => `<option value="${esc(v)}"${Number(v) === L.map.level ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select></label></p>` : ''}
${notesHtml(pl)}`;
      return;
    }
    const rows = pl.sections.map((s) => `<div class="psec" style="--d:${s.depth}"><p class="labhint">${s.depth ? '└ ' : ''}${esc(s.name)}</p>
${s.items.map((it) => `<div class="labrow prow"><a href="${esc(notebookLink(it.entity, it.id))}" target="_blank" rel="noopener">${it.entity === 'experiments' ? '⚗ ' : ''}${esc(it.title)}</a>
<span class="labhint">${esc(num(it.qty))}${it.unit && it.unit !== '•' ? ' ' + esc(it.unit) : ''} · ${esc(it.who)}</span>
<button type="button" class="link" data-takeout="${esc(it.entity)}:${it.id}:${it.container}" title="Used up, thrown away or moved">Take out</button></div>`).join('')}</div>`).join('');
    const count = pl.sections.reduce((n, s) => n + s.items.length, 0);
    side.innerHTML = `${head}
<button type="button" class="btn big" data-stash="${pl.id}">⬇ Put today’s products here</button><div id="lab-stash"></div>
<h4>Inside (${count})</h4>${count ? rows : `${rows}<p class="labhint">Empty, as far as the notebook knows.</p>`}
<form data-lab-form="shelf" class="labrow"><input name="name" required maxlength="100" placeholder="＋ Shelf or box inside" aria-label="New shelf or box">
<select name="parent" aria-label="Inside">${pl.sections.map((s) => `<option value="${s.id}">${esc('· '.repeat(s.depth) + s.name)}</option>`).join('')}</select><button class="btn">Add</button></form>
${notesHtml(pl)}`;
  }

  async function openStash(unit) {
    const box = $('#lab-stash'); if (!box) return;
    if (L.stashing) { L.stashing = false; box.innerHTML = ''; return; }
    L.stashing = true; box.innerHTML = '<p class="labhint">Finding today’s runs…</p>';
    try {
      const runs = await api('map/today');
      box.innerHTML = runs.length ? `<form data-lab-form="stash" data-unit="${esc(unit)}" class="labform">
${runs.map((r) => `<label class="pick"><input type="checkbox" name="pick" value="${r.id}" checked> ${esc(r.title)}
<input class="n" type="number" name="qty_${r.id}" min="1" max="999" value="${r.tubes}" aria-label="Tubes"> tubes</label>`).join('')}
<div class="labrow"><button class="btn">Store here</button><span class="labhint">Each run then shows where its tubes went.</span></div></form>`
        : '<p class="labhint">No ticks from you today yet. Runs saved from the Planner and ticks you add appear here.</p>';
    } catch (err) { box.innerHTML = `<p>${esc(err.message)}</p>`; }
  }

  // dragging boxes while arranging (pointer events: mouse, pen and touch)
  let drag = null;
  document.addEventListener('pointerdown', (ev) => {
    const g = ev.target.closest('.labmap.arranging .place'); if (!g) return;
    const svg = g.ownerSVGElement, pt = svg.createSVGPoint(); pt.x = ev.clientX; pt.y = ev.clientY;
    const at = pt.matrixTransform(svg.getScreenCTM().inverse()), p = L.map.places.find((x) => x.key === g.dataset.place);
    drag = { g, p, dx: at.x - p.x, dy: at.y - p.y, svg, resize: !!ev.target.closest('[data-grip]') }; g.setPointerCapture(ev.pointerId); ev.preventDefault();
  });
  document.addEventListener('pointermove', (ev) => {
    if (!drag) return;
    const pt = drag.svg.createSVGPoint(); pt.x = ev.clientX; pt.y = ev.clientY;
    const at = pt.matrixTransform(drag.svg.getScreenCTM().inverse());
    const p = drag.p; p.moved = true;
    if (drag.resize) {  // corner square: resize, then redraw so the label and grip follow
      p.w = Math.round(Math.min(Math.max(at.x - p.x, 30), L.map.w - p.x) / 5) * 5;
      p.h = Math.round(Math.min(Math.max(at.y - p.y, 24), L.map.h - p.y) / 5) * 5;
      const r = drag.g.querySelector('rect'), grip = drag.g.querySelector('[data-grip]');
      r.setAttribute('width', p.w); r.setAttribute('height', p.h); grip.setAttribute('x', p.w - 16); grip.setAttribute('y', p.h - 16);
      return;
    }
    p.x = Math.round(Math.min(Math.max(at.x - drag.dx, 0), L.map.w - p.w) / 5) * 5;
    p.y = Math.round(Math.min(Math.max(at.y - drag.dy, 0), L.map.h - p.h) / 5) * 5;
    drag.g.setAttribute('transform', `translate(${p.x} ${p.y})`);
  });
  document.addEventListener('pointerup', () => { if (drag && drag.resize) drawMap($('#panel-map')); drag = null; });
  document.addEventListener('keydown', (ev) => {
    const g = ev.target.closest && ev.target.closest('.labmap .place');
    if (g && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); openPlace(g.dataset.place); }
  });

  async function mapClick(t) {
    if (t.matches('[data-map-arrange]')) {
      if (L.arranging) {
        const moved = L.map.places.filter((p) => p.moved).map(({ key, kind, x, y, w, h }) => ({ key, kind, x, y, w, h, level: L.level }));
        if (moved.length) { await api('map/layout', { method: 'POST', body: { places: moved } }); toast('Room layout saved'); }
      }
      L.arranging = !L.arranging; drawMap($('#panel-map')); if (L.placeKey && !L.arranging) openPlace(L.placeKey);
    } else if (t.matches('[data-map-level]')) { L.level = Number(t.dataset.mapLevel); L.placeKey = null; renderMap(); }
    else if (t.matches('[data-map-nopic]')) {
      const fd = new FormData(); fd.append('remove', '1');
      await api('map/picture?level=' + L.level, { method: 'POST', form: fd }); toast('Picture removed'); renderMap();
    } else if (t.matches('[data-place]')) {
      if (L.arranging) return;
      const p = L.map.places.find((x) => x.key === t.dataset.place);
      if (p && p.kind === 'room') { L.level = Number(p.key.slice(2)); L.placeKey = null; renderMap(); } else openPlace(t.dataset.place);
    }
    else if (t.matches('[data-place-close]')) { L.placeKey = null; $('#lab-place').hidden = true; $$('.labmap .place.sel').forEach((g) => g.classList.remove('sel')); }
    else if (t.matches('[data-stash]')) openStash(t.dataset.stash);
    else if (t.matches('[data-note-done]')) { await api(`map/notes/${t.dataset.noteDone}/done`, { method: 'POST', body: {} }); renderMap(); refreshBadges(); }
    else if (t.matches('[data-takeout]')) {
      const [entity, id, container] = t.dataset.takeout.split(':');
      await api('map/takeout', { method: 'POST', body: { entity, id: Number(id), container: Number(container) } });
      toast('Taken out. The record itself stays in the notebook.'); renderMap();
    }
  }

  // ---------- Seminar: Never Ending Research Communication ----------
  const WHY = { flagged: '⚑ flagged', result: '✓ result', question: '? open question' };
  const dayName = (iso) => new Date(iso + 'T12:00').toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });

  async function renderSeminar() {
    const panel = $('#panel-seminar');
    if (!panel.innerHTML) panel.innerHTML = '<p class="labhint">Putting the seminar together…</p>';
    try { L.sem = await api('seminar'); drawSeminar(panel); } catch (err) { problem(panel, err); }
  }

  const semItems = () => (L.sem ? L.sem.people.flatMap((p) => p.items.map((t) => ({ ...t, person: p.name }))) : []);

  function semItem(t) {
    const gel = t.plan_id ? `<img class="semgel" src="${esc(L.base)}api/v1/plans/${t.plan_id}/gel" alt="Gel picture of ${esc(t.title)}" loading="lazy" onerror="this.remove()">` : '';
    const last = t.comments.filter((c) => !c.text.startsWith('[Seminar ')).slice(-2);  // seminar remarks are listed below as notes
    return `<div class="semitem" id="sem-${t.id}"><div class="labrow"><b>${esc(t.title)}</b>${t.why.map((w) => `<span class="chip ${esc(w)}">${esc(WHY[w] || w)}</span>`).join('')}
<span class="labhint">${esc(when(t.at))}</span></div>
${t.excerpt ? `<p class="labhint">${esc(t.excerpt)}</p>` : ''}${gel}
${last.map((c) => `<div class="cm"><b>${esc(c.who)}</b>: ${esc(c.text)}</div>`).join('')}
${t.notes.map((n) => `<div class="cm semnote"><b>${esc(n.name)}</b> at the seminar: ${esc(n.text)}</div>`).join('')}
<form data-lab-form="semnote" data-exp="${t.id}" class="labrow"><input type="text" name="text" required maxlength="2000" placeholder="Remark or next step (goes to their Ticker)" aria-label="Seminar remark on ${esc(t.title)}"><button class="link">Add</button></form></div>`;
  }

  function drawSeminar(panel) {
    const d = L.sem, s = d.seminar;
    panel.innerHTML = `<div class="labcard semhead"><div class="labrow"><h2>${esc(dayName(s.day))}</h2>
<span class="labhint">${d.count} on the agenda · everything since ${esc(new Date(d.since).toLocaleDateString())}</span></div>
<p class="labhint">The agenda builds itself from the Ticker: ticks people flagged (⚑ in their Ticker), runs with a result, and ticks with an open question. Remarks made here go back to that person’s Ticker as comments, so the discussion carries on.</p>
<div class="labrow"><button type="button" class="btn" data-sem-present ${d.count ? '' : 'disabled'}>▶ Present</button>
<button type="button" class="link" data-sem-print>🖨 Handout</button>
<form data-lab-form="semday" class="labrow"><label class="labhint">Date <input type="date" name="day" value="${esc(s.day)}" required></label><button class="link">Move</button></form>
<button type="button" class="link" data-sem-close>Close and open the next one</button>
${d.guide ? `<a class="link" href="${esc(d.guide)}" target="_blank" rel="noopener">How we run the discussion ↗</a>` : ''}</div></div>
${d.people.map((p) => `<section class="labcard semperson"><h3>${esc(p.name)} <span class="labhint">${p.items.length}</span></h3>${p.items.map(semItem).join('')}</section>`).join('')
  || '<p class="labhint">Nothing yet. Flag a tick with ⚑ in the Ticker, or read a gel in the Planner, and it appears here.</p>'}
${d.past.length ? `<details class="labcard"><summary>Earlier seminars</summary>${d.past.map((x) => `<p><button type="button" class="link" data-sem-minutes="${x.id}">${esc(x.title)}</button></p>`).join('')}<div id="sem-minutes"></div></details>` : ''}
${d.not_on_agenda ? `<p class="labhint">${d.not_on_agenda} other recent ticks are not on the agenda (no flag, result or question).</p>` : ''}`;
  }

  function present(i) {
    const items = semItems(); let ov = $('#sem-present');
    if (i < 0 || i >= items.length) { if (ov) ov.remove(); L.slide = -1; document.body.classList.remove('sem-presenting'); renderSeminar(); return; }
    L.slide = i;
    if (!ov) { ov = document.createElement('div'); ov.id = 'sem-present'; ov.className = 'sempresent'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-label', 'Seminar presentation'); document.body.append(ov); document.body.classList.add('sem-presenting'); }
    const t = items[i];
    ov.innerHTML = `<div class="semslide"><p class="labhint">${esc(t.person)} · ${i + 1} / ${items.length}</p><h1>${esc(t.title)}</h1>
<p>${t.why.map((w) => `<span class="chip ${esc(w)}">${esc(WHY[w] || w)}</span>`).join(' ')}</p>
${t.plan_id ? `<img src="${esc(L.base)}api/v1/plans/${t.plan_id}/gel" alt="Gel picture" onerror="this.remove()">` : ''}
${t.excerpt ? `<p class="big">${esc(t.excerpt)}</p>` : ''}
${t.comments.filter((c) => !c.text.startsWith('[Seminar ')).slice(-3).map((c) => `<div class="cm"><b>${esc(c.who)}</b>: ${esc(c.text)}</div>`).join('')}
${t.notes.map((n) => `<div class="cm semnote"><b>${esc(n.name)}</b>: ${esc(n.text)}</div>`).join('')}
<form data-lab-form="semnote" data-exp="${t.id}" data-present="1" class="labrow"><input type="text" name="text" required maxlength="2000" placeholder="Remark or next step for ${esc(t.person)}" aria-label="Remark"><button class="btn">Add</button></form></div>
<div class="semnav"><button type="button" class="btn" data-sem-slide="${i - 1}" ${i ? '' : 'disabled'}>← Back</button><button type="button" class="link" data-sem-slide="-1">✕ End</button><button type="button" class="btn" data-sem-slide="${i + 1}">${i + 1 < items.length ? 'Next →' : 'Finish'}</button></div>`;
    $('button[data-sem-slide]', ov) && ov.querySelector(`[data-sem-slide="${i + 1}"]`).focus();
  }
  document.addEventListener('keydown', (ev) => {
    if (L.slide < 0 || ev.target.matches('input,textarea')) return;
    if (ev.key === 'ArrowRight' || ev.key === 'PageDown') present(L.slide + 1);
    else if (ev.key === 'ArrowLeft' || ev.key === 'PageUp') present(Math.max(0, L.slide - 1));
    else if (ev.key === 'Escape') present(-1);
  });

  async function semClick(t) {
    if (t.matches('[data-sem-flag]')) {
      await api('seminar/flag', { method: 'POST', body: { exp: Number(t.dataset.semFlag), on: t.dataset.on === '1' } });
      toast(t.dataset.on === '1' ? 'On the next seminar' : 'Taken off the seminar'); renderTicker();
    } else if (t.matches('[data-sem-present]')) present(0);
    else if (t.matches('[data-sem-slide]')) present(Number(t.dataset.semSlide));
    else if (t.matches('[data-sem-print]')) { document.body.classList.add('sem-print'); window.print(); document.body.classList.remove('sem-print'); }
    else if (t.matches('[data-sem-close]')) {
      const r = await api('seminar/close', { method: 'POST', body: {} });
      toast(`Minutes kept. Next seminar: ${dayName(r.next.day)}`); renderSeminar();
    } else if (t.matches('[data-sem-minutes]')) {
      const m = await api('seminar/' + t.dataset.semMinutes), box = $('#sem-minutes');
      const mm = m.minutes || { people: [] };
      box.innerHTML = `<h4>${esc(m.title)}</h4>${mm.people.map((p) => `<p><b>${esc(p.name)}</b></p><ul>${p.items.map((it) => `<li>${esc(it.title)}${it.notes.map((n) => `<br><span class="labhint">${esc(n.name)}: ${esc(n.text)}</span>`).join('')}</li>`).join('')}</ul>`).join('') || '<p class="labhint">Nothing was on the agenda.</p>'}`;
    }
  }

  // ---------- Ask PAIvik: one sentence -> the Planner filled in, or a note written to the notebook ----------
  async function askPaivik(text) {
    const out = $('#lab-ask-out'); out.hidden = false; out.innerHTML = '<span class="labhint">Working on it…</span>';
    try {
      const r = await api('ask', { method: 'POST', body: { text } });
      if (r.kind === 'plan') {
        L.choice = { ...L.choice, ...r.choices, volumes: {}, volume_ul: '', template_ul: '' };
        L.askFound = r.found; L.runId = null; out.hidden = true; out.innerHTML = '';
        const panel = $('#panel-planner'); if (panel) panel.innerHTML = '';
        if (location.hash !== '#planner') location.hash = 'planner'; else renderPlanner();
        $('#lab-ask-text').value = '';
      } else if (r.kind === 'change') {
        out.innerHTML = r.status === 'committed'
          ? `✓ Written to the notebook: ${esc(r.summary)} <a href="${esc(r.url)}" target="_blank" rel="noopener">details / fix ↗</a>`
          : `Not written yet: ${esc(r.questions.join(' ') || r.summary)} <a href="${esc(r.url)}" target="_blank" rel="noopener">answer on the review page ↗</a>`;
        $('#lab-ask-text').value = '';
      } else if (r.kind === 'model_off') {
        out.innerHTML = `The drafting model is off right now, so this was not sorted into an entry. <button type="button" class="link" data-ask-tick>Add it as a new tick instead</button>`;
        out.dataset.text = r.text;
      }
    } catch (err) { if (err.code === 'NO_KEY' || err.code === 'SIGN_IN') { out.hidden = true; location.hash = 'ticker'; } else out.textContent = err.message; }
  }

  // ---------- events (one delegated listener each, like app.js) ----------
  document.addEventListener('change', (ev) => {
    const t = ev.target;
    if (t.matches('[data-lab-sample]')) {
      const s = L.choice.samples, i = s.indexOf(t.value);
      if (t.checked && i < 0) s.push(t.value); if (!t.checked && i >= 0) s.splice(i, 1);
      updatePreview();
    } else if (t.closest('[data-lab-form="plan"]')) updatePreview();
    else if (t.matches('[data-lab-vol]')) { L.choice.volumes[t.dataset.labVol] = t.value; updatePreview(); }
    else if (t.matches('[data-lab-total]')) { L.choice[t.dataset.labTotal] = t.value; updatePreview(); }
    else if (t.matches('[data-lab-tickwho]')) { L.tickWho = t.value; renderTicker(); }
    else if (t.matches('[data-inst-room]')) {
      const p = L.map.places.find((x) => x.key === t.dataset.instRoom) || { w: 130, h: 84 };
      api('map/layout', { method: 'POST', body: { places: [{ key: t.dataset.instRoom, kind: 'instrument', x: 435, y: 250, w: p.w, h: p.h, level: Number(t.value) }] } })
        .then(() => { toast('Moved'); L.placeKey = null; renderMap(); }).catch((err) => toast(err.message));
    }
  });
  document.addEventListener('input', (ev) => { if (ev.target.closest('[data-lab-form="plan"]') && ev.target.matches('input[type=text],input[type=number],textarea')) updatePreview(); });

  document.addEventListener('click', (ev) => {
    const ak = ev.target.closest('[data-ask-clear],[data-ask-tick]');
    if (ak) {
      if (ak.matches('[data-ask-clear]')) { L.askFound = null; const b = $('.askfound'); if (b) b.remove(); }
      else {
        const out = $('#lab-ask-out');
        api('ticker/attach', { method: 'POST', body: { title: out.dataset.text.slice(0, 200), note: out.dataset.text.length > 200 ? out.dataset.text : '' } })
          .then(() => { out.innerHTML = '✓ Added as a tick. <a href="#ticker">Open the Ticker</a>'; $('#lab-ask-text').value = ''; if (currentView() === 'ticker') renderTicker(); })
          .catch((err) => toast(err.message));
      }
      return;
    }
    const sm = ev.target.closest('[data-sem-flag],[data-sem-present],[data-sem-slide],[data-sem-print],[data-sem-close],[data-sem-minutes]');
    if (sm) { semClick(sm).catch((err) => toast(err.message)); return; }
    const m = ev.target.closest('[data-map-arrange],[data-map-level],[data-map-nopic],[data-place],[data-place-close],[data-stash],[data-note-done],[data-takeout]');
    if (m) { mapClick(m).catch((err) => toast(err.message)); return; }
    const t = ev.target.closest('[data-lab-save],[data-lab-run],[data-lab-back],[data-lab-retry],#lab-timer');
    if (!t) return;
    if (t.matches('[data-lab-save]')) saveRun(t);
    else if (t.matches('[data-lab-run]')) { ev.preventDefault(); openRun(t.dataset.labRun); }
    else if (t.matches('#lab-timer')) openRun(t.dataset.run);
    else if (t.matches('[data-lab-back]')) { ev.preventDefault(); L.runId = null; renderPlanner(); }
    else if (t.matches('[data-lab-retry]')) render(currentView());
  });

  document.addEventListener('submit', async (ev) => {
    const f = ev.target.closest('[data-lab-form]');
    if (!f) return;
    ev.preventDefault();
    const kind = f.dataset.labForm, fd = new FormData(f), btn = f.querySelector('button');
    if (kind === 'plan') return;
    if (kind === 'ask') { if (btn) btn.disabled = true; await askPaivik(String(fd.get('text') || '').trim()); if (btn) btn.disabled = false; return; }
    if (btn) btn.disabled = true;
    try {
      if (kind === 'key') {
        await api('keys', { method: 'POST', body: { key: fd.get('key') } });
        L.me = await api('me'); toast('Notebook account connected'); refreshBadges(); render(currentView());
      } else if (kind === 'tick') {
        await api('ticker/attach', { method: 'POST', body: { title: fd.get('title'), note: fd.get('note'), parent: f.dataset.parent || null } });
        toast('Tick added'); renderTicker();
      } else if (kind === 'comment') {
        await api(`ticker/${f.dataset.exp}/comment`, { method: 'POST', body: { text: fd.get('text') } });
        renderTicker();
      } else if (kind === 'start') {
        L.run = await api(`plans/${L.runId}/start`, { method: 'POST', body: { item: L.run.plan.instrument.id, minutes: fd.get('minutes') } });
        toast('Run started; the instrument shows as busy'); refreshBadges(); renderPlanner();
      } else if (kind === 'gel') {
        const up = new FormData(); up.append('gel', fd.get('gel'));
        L.run = await api(`plans/${L.runId}/gel`, { method: 'POST', form: up }); renderPlanner();
      } else if (kind === 'results') {
        const calls = {}; L.run.plan.lanes.forEach((l) => { const v = fd.get('lane_' + l.lane); if (v) calls[l.lane] = v; });
        L.run = await api(`plans/${L.runId}/results`, { method: 'POST', body: { calls, note: fd.get('note') || '' } });
        toast('Result written to the notebook'); renderPlanner();
      } else if (kind === 'unit') {
        await api('map/units', { method: 'POST', body: { name: fd.get('name'), kind: fd.get('kind'), level: L.level } });
        toast('Added. Drag it to where it stands.'); L.arranging = true; renderMap();
      } else if (kind === 'mappic') {
        const up = new FormData(); up.append('picture', fd.get('picture'));
        await api('map/picture?level=' + L.level, { method: 'POST', form: up });
        toast('Floor plan added. Arrange: trace the rooms over it.'); L.arranging = true; renderMap();
      } else if (kind === 'shelf') {
        await api('map/units', { method: 'POST', body: { name: fd.get('name'), parent: fd.get('parent') } });
        toast('Shelf added'); renderMap();
      } else if (kind === 'note') {
        await api('map/notes', { method: 'POST', body: { key: L.placeKey, text: fd.get('text') } });
        toast('Note left for others'); renderMap(); refreshBadges();
      } else if (kind === 'stash') {
        const picks = fd.getAll('pick').map((id) => ({ id: Number(id), qty: Number(fd.get('qty_' + id) || 1) }));
        const r = await api('map/stash', { method: 'POST', body: { unit: Number(f.dataset.unit), picks } });
        toast(`Stored ${r.stored.length} run${r.stored.length === 1 ? '' : 's'} here`); renderMap();
      } else if (kind === 'semnote') {
        await api('seminar/note', { method: 'POST', body: { exp: Number(f.dataset.exp), text: fd.get('text') } });
        toast('Remark added; it is in their Ticker now');
        if (f.dataset.present) { const i = L.slide; L.sem = await api('seminar'); present(i); f.reset(); } else renderSeminar();
      } else if (kind === 'semday') {
        await api('seminar/day', { method: 'POST', body: { day: fd.get('day') } }); toast('Seminar moved'); renderSeminar();
      } else if (kind === 'share') {
        L.run = await api(`plans/${L.runId}/share`, { method: 'POST', body: { mode: fd.get('mode'), users: fd.getAll('user') } });
        toast('Shared'); renderPlanner();
      }
    } catch (err) { toast(err.message); } finally { if (btn) btn.disabled = false; }
  });

  window.PAIvikLab = { render, init, get on() { return L.on; } };
  document.addEventListener('DOMContentLoaded', init);
})();
