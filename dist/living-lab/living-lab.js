/* Living Lab: the lab's public page. Reads published talks, lab notes, people and answered questions from the
 * lab's Supabase project (config.js) with its publishable key, through the plain REST API: no libraries.
 * Visitors can ask a question about a talk; it is stored unpublished and shown only once a lab member answers.
 * Without a configured project it shows built-in example content, so the page can be tried anywhere.
 * All text from the database is escaped before it enters the page.
 */
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const safeUrl = (u) => (/^https:\/\//.test(String(u || '')) ? String(u) : '');
  const day = (iso) => new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
  const time = (iso) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

  const CFG = window.LIVING_LAB || {};
  const LIVE = Boolean(CFG.url && CFG.key && /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(CFG.url));

  // ---------- data ----------
  async function rest(path, opts = {}) {
    const res = await fetch(`${CFG.url}/rest/v1/${path}`, {
      ...opts, headers: { apikey: CFG.key, Accept: 'application/json', ...(opts.headers || {}) },
    });
    if (!res.ok) throw new Error(`The lab’s server answered ${res.status}.`);
    return res.status === 201 || res.status === 204 ? null : res.json();
  }

  const D = { talks: null, posts: null, people: null };

  async function load() {
    if (!LIVE) { Object.assign(D, example()); return; }
    const [talks, posts, people] = await Promise.all([
      rest('talks?select=*&published=is.true&order=starts_at.desc'),
      rest('posts?select=*&published=is.true&order=published_at.desc'),
      rest('people?select=*&published=is.true&order=sort.asc,name.asc'),
    ]);
    Object.assign(D, { talks, posts, people });
  }

  async function questionsFor(talk) {
    if (!LIVE) return D.questions.filter((q) => q.talk_id === talk.id);
    return rest(`questions?select=name,question,answer,answered_by,answered_at&talk_id=eq.${Number(talk.id)}&order=answered_at.asc`);
  }

  async function ask(talk, name, question) {
    if (!LIVE) throw new Error('This is the example page: questions are not sent anywhere yet.');
    // return=minimal: visitors cannot read an unanswered question back, not even their own
    await rest('questions', { method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ talk_id: talk.id, name, question }) });
  }

  // ---------- a small Markdown reader (headings, lists, bold, italics, links) ----------
  function md(src) {
    const inline = (t) => esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\*(.+?)\*/g, '<i>$1</i>')
      .replace(/\[([^\]]+)\]\((https:\/\/[^)\s]+)\)/g, '<a href="$2" rel="noopener">$1</a>');
    const out = []; let list = null;
    const close = () => { if (list) { out.push(`</${list}>`); list = null; } };
    for (const line of String(src || '').split('\n')) {
      let m;
      if ((m = line.match(/^(#{2,4})\s+(.*)/))) { close(); const n = Math.min(m[1].length + 1, 5); out.push(`<h${n}>${inline(m[2])}</h${n}>`); }
      else if ((m = line.match(/^\s*[-*]\s+(.*)/))) { if (list !== 'ul') { close(); out.push('<ul>'); list = 'ul'; } out.push(`<li>${inline(m[1])}</li>`); }
      else if ((m = line.match(/^\s*\d+[.)]\s+(.*)/))) { if (list !== 'ol') { close(); out.push('<ol>'); list = 'ol'; } out.push(`<li>${inline(m[1])}</li>`); }
      else if (line.trim()) { close(); out.push(`<p>${inline(line)}</p>`); }
      else close();
    }
    close();
    return out.join('');
  }

  // ---------- views ----------
  const KIND = { update: 'Update', result: 'Result', method: 'Method', story: 'Story' };
  const upcoming = () => D.talks.filter((t) => t.status !== 'done' && new Date(t.starts_at).getTime() + (t.minutes || 60) * 60000 > Date.now())
    .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
  const past = () => D.talks.filter((t) => !upcoming().includes(t));

  function talkCard(t, big) {
    const cancelled = t.status === 'cancelled';
    return `<a class="card talk${big ? ' big' : ''}${cancelled ? ' cancelled' : ''}" href="#talk/${encodeURIComponent(t.slug)}">
<span class="when">${cancelled ? 'Cancelled · ' : ''}${esc(day(t.starts_at))} · ${esc(time(t.starts_at))}</span>
<span class="title">${esc(t.title)}</span>
<span class="muted">${esc(t.speaker_name)}${t.speaker_affiliation ? ', ' + esc(t.speaker_affiliation) : ''}${t.place ? ' · ' + esc(t.place) : ''}</span>
${big ? `<span class="abstract">${esc(t.abstract.slice(0, 260))}${t.abstract.length > 260 ? '…' : ''}</span>` : ''}
${!big && (t.slides_url || t.recording_url) ? `<span class="chips">${t.recording_url ? '<span class="chip">▶ recording</span>' : ''}${t.slides_url ? '<span class="chip">slides</span>' : ''}</span>` : ''}</a>`;
  }

  function postCard(p) {
    return `<a class="card post" href="#note/${encodeURIComponent(p.slug)}"><span class="chip">${esc(KIND[p.kind] || p.kind)}</span>
<span class="title">${esc(p.title)}</span><span class="muted">${esc(p.summary)}</span>
<span class="when">${esc(day(p.published_at))}</span></a>`;
  }

  function home() {
    const next = upcoming();
    return `<section class="hero"><h1>Research, in the open</h1>
<p>We are a microbiology lab. Here we share what we learn as we learn it, and run a seminar series that never ends: every talk stays open for your questions, and the speaker answers.</p></section>
<section aria-labelledby="h-next"><h2 id="h-next">Next talk</h2>
${next.length ? talkCard(next[0], true) : '<p class="muted">The next talk is being planned. Past talks and their answers are below.</p>'}
${next.length > 1 ? `<div class="grid">${next.slice(1).map((t) => talkCard(t)).join('')}</div>` : ''}</section>
<section aria-labelledby="h-notes"><h2 id="h-notes">Latest lab notes</h2>
<div class="grid">${D.posts.slice(0, 4).map(postCard).join('') || '<p class="muted">No lab notes yet.</p>'}</div>
${D.posts.length > 4 ? '<p><a href="#notes">All lab notes →</a></p>' : ''}</section>
<section aria-labelledby="h-past"><h2 id="h-past">Past talks</h2>
<div class="grid">${past().slice(0, 6).map((t) => talkCard(t)).join('') || '<p class="muted">The first talk is still ahead.</p>'}</div>
${past().length > 6 ? '<p><a href="#talks">All talks →</a></p>' : ''}</section>`;
  }

  function talksView() {
    return `<h1>The seminar series</h1><p class="lead">Never-ending research communication: a talk is never over. Ask your question any time; the speaker’s answer appears on the talk’s page.</p>
<h2>Coming up</h2><div class="grid">${upcoming().map((t) => talkCard(t)).join('') || '<p class="muted">The next talk is being planned.</p>'}</div>
<h2>Past talks</h2><div class="grid">${past().map((t) => talkCard(t)).join('') || '<p class="muted">None yet.</p>'}</div>`;
  }

  async function talkView(slug) {
    const t = D.talks.find((x) => x.slug === slug);
    if (!t) return notFound();
    const qs = await questionsFor(t).catch(() => []);
    const online = safeUrl(t.online_url), slides = safeUrl(t.slides_url), rec = safeUrl(t.recording_url);
    const open = t.status !== 'cancelled';
    return `<p><a href="#talks">← All talks</a></p><article class="card plain">
<p class="when">${t.status === 'cancelled' ? '<b>Cancelled</b> · ' : ''}${esc(day(t.starts_at))} · ${esc(time(t.starts_at))} · ${Number(t.minutes) || 60} min</p>
<h1>${esc(t.title)}</h1>
<p class="muted">${esc(t.speaker_name)}${t.speaker_affiliation ? ', ' + esc(t.speaker_affiliation) : ''}${t.place ? ' · ' + esc(t.place) : ''}</p>
${md(t.abstract)}
<p class="actions">${online && upcoming().includes(t) ? `<a class="btn" href="${esc(online)}" rel="noopener">Join online</a>` : ''}
${rec ? `<a class="btn" href="${esc(rec)}" rel="noopener">▶ Watch the recording</a>` : ''}${slides ? `<a class="btn ghost" href="${esc(slides)}" rel="noopener">Slides</a>` : ''}
${upcoming().includes(t) && open ? `<a class="btn ghost" href="${icsHref(t)}" download="${esc(t.slug)}.ics">Add to calendar</a>` : ''}</p></article>
<section aria-labelledby="h-q"><h2 id="h-q">Questions and answers</h2>
${qs.length ? qs.map((q) => `<div class="card plain qa"><p class="q"><b>${esc(q.name || 'Someone asked')}:</b> ${esc(q.question)}</p>
<div class="a"><span class="muted">${esc(q.answered_by || 'The speaker')} answered</span>${md(q.answer)}</div></div>`).join('') : '<p class="muted">No answered questions yet. Be the first to ask.</p>'}
${open ? `<form class="card plain ask" id="ask" data-talk="${esc(t.slug)}">
<h3>Ask the speaker</h3>
<label>Your question <textarea name="question" required minlength="3" maxlength="2000" rows="3"></textarea></label>
<label>Name to show <small class="muted">optional; leave empty to ask anonymously</small><input name="name" maxlength="80" autocomplete="nickname"></label>
<div class="row"><button class="btn" type="submit">Send question</button><span class="muted" id="ask-status" role="status"></span></div>
<p class="muted small">Your question is shown here once the speaker has answered it. We do not ask for your email.</p></form>` : ''}</section>`;
  }

  function icsHref(t) {
    const f = (d) => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const end = new Date(new Date(t.starts_at).getTime() + (Number(t.minutes) || 60) * 60000);
    const clean = (s) => String(s || '').replace(/[\r\n]+/g, ' ').replace(/[,;\\]/g, (c) => '\\' + c);
    const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Living Lab//EN', 'BEGIN:VEVENT', `UID:${clean(t.slug)}@living-lab`,
      `DTSTAMP:${f(Date.now())}`, `DTSTART:${f(t.starts_at)}`, `DTEND:${f(end)}`, `SUMMARY:${clean(t.title)} (${clean(t.speaker_name)})`,
      `LOCATION:${clean(t.place || safeUrl(t.online_url))}`, `URL:${clean(location.href.split('#')[0] + '#talk/' + t.slug)}`, 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    return 'data:text/calendar;charset=utf-8,' + encodeURIComponent(ics);
  }

  function notesView() {
    return `<h1>Lab notes</h1><p class="lead">Updates, results we are confident in, and methods we are happy to share.</p>
<div class="grid">${D.posts.map(postCard).join('') || '<p class="muted">No lab notes yet.</p>'}</div>`;
  }

  function noteView(slug) {
    const p = D.posts.find((x) => x.slug === slug);
    if (!p) return notFound();
    const who = D.people.find((x) => x.id === p.author_id);
    return `<p><a href="#notes">← All lab notes</a></p><article class="card plain"><span class="chip">${esc(KIND[p.kind] || p.kind)}</span>
<h1>${esc(p.title)}</h1><p class="muted">${who ? esc(who.name) + ' · ' : ''}${esc(day(p.published_at))}</p>
${p.summary ? `<p class="lead">${esc(p.summary)}</p>` : ''}${md(p.body_md)}</article>`;
  }

  function peopleView() {
    return `<h1>People</h1><div class="grid">${D.people.map((x) => `<div class="card plain person"><span class="avatar" aria-hidden="true">${esc(x.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join(''))}</span>
<span class="title">${esc(x.name)}</span><span class="muted">${esc(x.role)}</span><p>${esc(x.bio)}</p>
${safeUrl(x.link) ? `<a href="${esc(safeUrl(x.link))}" rel="noopener">More →</a>` : ''}</div>`).join('') || '<p class="muted">Coming soon.</p>'}</div>`;
  }

  const notFound = () => '<h1>Not here</h1><p>That page is not (or no longer) public. <a href="#">Back to the start</a></p>';

  async function route() {
    const h = decodeURIComponent(location.hash.slice(1));
    const [what, slug] = h.split('/');
    document.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === what || (what === 'talk' && a.dataset.nav === 'talks') || (what === 'note' && a.dataset.nav === 'notes')));
    const view = $('#view');
    view.innerHTML = what === 'talks' ? talksView() : what === 'talk' ? await talkView(slug) : what === 'notes' ? notesView()
      : what === 'note' ? noteView(slug) : what === 'people' ? peopleView() : home();
    const title = $('#view h1');
    document.title = title && what ? `${title.textContent} · Living Lab` : 'Living Lab';
    if (what) $('#main').focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }

  document.addEventListener('submit', async (ev) => {
    const f = ev.target.closest('#ask');
    if (!f) return;
    ev.preventDefault();
    const t = D.talks.find((x) => x.slug === f.dataset.talk), st = $('#ask-status'), btn = f.querySelector('button');
    const fd = new FormData(f);
    btn.disabled = true; st.textContent = 'Sending…';
    try {
      await ask(t, String(fd.get('name') || '').trim(), String(fd.get('question') || '').trim());
      f.reset(); st.textContent = 'Thank you! Your question will appear here once it has been answered.';
    } catch (err) { st.textContent = err.message; } finally { btn.disabled = false; }
  });

  window.addEventListener('hashchange', route);
  (async () => {
    try { await load(); } catch (err) {
      $('#view').innerHTML = `<p class="notice">${esc(err.message)} Please try again later.</p>`; return;
    }
    if (!LIVE) { const n = $('#notice'); n.hidden = false; n.textContent = 'Example content: this page is not connected to the lab’s database yet.'; }
    route();
  })();

  // ---------- built-in example (the same as the example rows in supabase/living-lab.sql) ----------
  function example() {
    const d = (days, hours = 16) => { const x = new Date(); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() + days); x.setHours(hours); return x.toISOString(); };
    return {
      people: [
        { id: 1, name: 'Example Researcher', role: 'Principal investigator', bio: 'Studies the microbes that live in snail guts and soil. (Example person.)', link: '' },
        { id: 2, name: 'Example Student', role: 'PhD student', bio: 'Builds DNA sequencing workflows for field samples. (Example person.)', link: '' },
      ],
      posts: [
        { slug: 'a-gel-that-always-works', kind: 'method', title: 'An agarose gel that always works', author_id: 2, published_at: d(-1, 9),
          summary: 'The 1 % gel recipe we use for every colony PCR, and the three mistakes we stopped making.',
          body_md: '## Recipe\n\n1. 0.5 g agarose in 50 mL 1× TAE\n2. Microwave until fully clear\n3. Cool to hand-warm before adding the stain\n\n*Example content.*' },
        { slug: 'welcome-to-the-living-lab', kind: 'story', title: 'Welcome to the Living Lab', author_id: 1, published_at: d(-3, 9),
          summary: 'What this page is: our lab, working in the open, one note at a time.',
          body_md: 'We share what we are learning **while** we learn it: methods that work, results we are sure of, and talks anyone can join.\n\n- Lab notes appear here when they are ready to be public.\n- The seminar series never ends: ask questions, and the speaker answers.\n\n*This is example content.*' },
      ],
      talks: [
        { id: 1, slug: 'who-lives-in-a-snail', title: 'Who lives in a snail? Gut bacteria in 30 minutes', starts_at: d(9), minutes: 60, status: 'planned',
          abstract: 'A tour of the bacteria we find in garden snails, how we read their DNA, and what we still cannot explain. No biology background needed. (Example talk.)',
          place: 'Online and in the lab seminar room', speaker_name: 'Example Researcher', speaker_affiliation: 'Example University', online_url: '', slides_url: '', recording_url: '' },
        { id: 2, slug: 'sequencing-in-a-backpack', title: 'Sequencing in a backpack', starts_at: d(-12), minutes: 60, status: 'done',
          abstract: 'Taking a pocket-sized DNA sequencer to the field: what worked, what broke, and what we would pack next time. (Example talk.)',
          place: 'Online', speaker_name: 'Example Student', speaker_affiliation: 'Example University', online_url: '', slides_url: '', recording_url: '' },
      ],
      questions: [
        { talk_id: 2, name: 'A curious listener', question: 'How long does the battery last in the field?',
          answer: 'About six hours of sequencing on one power bank; we carried two. (Example answer.)', answered_by: 'Example Student', answered_at: d(-10) },
      ],
    };
  }
})();
