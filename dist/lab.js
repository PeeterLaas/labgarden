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
    if (!/^[a-z0-9/_-]+\/$/i.test(gw)) return;  // only a path on this same address
    L.base = gw; L.on = true;
    document.body.classList.add('lab-on');
    $$('[data-lab]').forEach((el) => { el.hidden = false; });
    try {
      L.me = await api('me');
      $('.privacy').textContent = `Lab connected · ${L.me.user}`;
    } catch (err) {
      $('.privacy').textContent = err.code === 'SIGN_IN' ? 'Lab: not signed in' : 'Lab server not reachable';
    }
    refreshBadges();
    setInterval(refreshBadges, 60000);
    window.dispatchEvent(new Event('hashchange'));  // app.js re-renders; lab views (#planner, ...) are allowed now
  }

  const currentView = () => location.hash.slice(1) || 'graph';

  async function refreshBadges() {
    if (!L.me) return;
    try {
      const p = await api('proposals');
      const b = $('#count-lab-review'); if (b) b.textContent = p.pending || '';
      const note = $('#lab-review-note');
      if (note) {
        note.hidden = false;
        note.innerHTML = `<b>Lab notebook proposals:</b> ${p.pending} waiting. ${p.recent.slice(0, 3).map((r) => `<a href="${esc(r.url)}" target="_blank" rel="noopener">#${r.id} ${esc(r.summary)}</a>`).join(' · ')}
 <a href="${esc(p.review_url)}" target="_blank" rel="noopener">Open the review page ↗</a> <span class="labhint">(approving happens there)</span>`;
      }
    } catch { /* badges are a convenience */ }
    if (!L.me.has_key) return;
    try {
      const ins = await api('instruments');
      const busy = ins.filter((i) => i.state !== 'free').length;
      $('#count-instruments').textContent = busy ? `${busy} busy` : '';
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
<summary><span class="labhint">${esc(time)}</span> <b>${esc(t.title)}</b>${t.category ? ` <span class="chip">${esc(t.category)}</span>` : ''}${t.plan_id ? ' <span class="chip">PCR plan</span>' : ''}${t.comments.length ? ` <span class="chip">💬 ${t.comments.length}</span>` : ''}
<span class="labhint"> · ${esc(t.who)}</span>
${t.follows.map((x) => `<div class="chain">↳ follows ${esc(x.title)}</div>`).join('')}${t.next.map((x) => `<div class="chain">→ next: ${esc(x.title)}</div>`).join('')}</summary>
<div class="tickbody"><p><a href="${esc(link)}" target="_blank" rel="noopener">Open in notebook ↗</a>${t.plan_id ? ` · <a href="#planner" data-lab-run="${t.plan_id}">Open run in Planner</a>` : ''}</p>
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
    return `<div class="planner" data-lab-planner>
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
      if (JSON.stringify([draft.plan.mix, draft.plan.tubes]) !== shown) {
        L.preview = draft.plan; $('#lab-preview').innerHTML = previewHtml(draft.plan, true);
        toast('The records changed while you were planning. Check the numbers and save again.');
        return;
      }
      const saved = await api(`plans/${draft.id}/save`, { method: 'POST', body: { hash: draft.hash } });
      toast('Saved to the notebook');
      L.choice.samples = []; L.choice.title = ''; L.choice.more = '';
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
  });
  document.addEventListener('input', (ev) => { if (ev.target.closest('[data-lab-form="plan"]') && ev.target.matches('input[type=text],input[type=number],textarea')) updatePreview(); });

  document.addEventListener('click', (ev) => {
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
      } else if (kind === 'share') {
        L.run = await api(`plans/${L.runId}/share`, { method: 'POST', body: { mode: fd.get('mode'), users: fd.getAll('user') } });
        toast('Shared'); renderPlanner();
      }
    } catch (err) { toast(err.message); } finally { if (btn) btn.disabled = false; }
  });

  window.PAIvikLab = { render, init, get on() { return L.on; } };
  document.addEventListener('DOMContentLoaded', init);
})();
