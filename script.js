/* ══════════════════════════════════════════════════════════════
   DADER GEZOCHT — het spel in de browser
   - De openbare stand (lobby, ronde, vrijgegeven bewijs) lezen we elke
     2 seconden rechtstreeks uit Firebase.
   - Alles wat een speler doet gaat via de server (/api/game). Geheimen
     (jouw kaart, jouw verhoren) komen ook alleen daar vandaan.
   ══════════════════════════════════════════════════════════════ */

const IS_DEV = ['localhost', '127.0.0.1'].includes(window.location.hostname);
// Lokaal draait dev-server.js een nagespeelde database op /__db
const DB_URL = IS_DEV ? '/__db' : 'https://dader-gezocht-default-rtdb.europe-west1.firebasedatabase.app';

const POLL_MS = 2000;
const FIND_RADIUS = 40;          // meter: zo dichtbij moet je zijn om bewijs te vinden
const MIN_PLAYERS = 4;
const NL_CENTER = [52.1, 5.1];
const SESSION_KEY = 'dg.session', LAST_KEY = 'dg.last';
const RESUME_MAX_MS = 24 * 60 * 60 * 1000;
const SUGGESTIONS = ['Wat heb je zelf gezien?', 'Hoe laat was dat?', 'Wie was er nog meer?'];

// ── Stand ─────────────────────────────────────────────────────────
let me = { token: '', pid: '', name: '' };
let code = '';
let game = null;                 // openbare stand
let priv = null;                 // alleen van mij: { card, chats, asked, voted }
let privRound = -1;
let pollTimer = null, pollBusy = false;
let tab = 'dossier';
let cardOpen = false;
let chatWid = null, chatPending = null;
let pick = '', voteEdit = false;
let seenEvidence = null;         // welke bewijsstukken ik al gezien heb (voor de melding)
let homeMode = 'tafel';
let setup = { mode: 'tafel', rounds: 5, questions: 2, places: [] };
let placesMap = null, placesLayer = null;
let gameMap = null, pinLayer = null, meMarker = null, geoWatch = null, myPos = null, geoError = '';
let unlocking = new Set();
let resumeOffer = null;

// ── Hulpjes ───────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ico = (id, cls = 'ico') => `<svg class="${cls}" aria-hidden="true"><use href="#${id}"/></svg>`;
// Alleen opnieuw opbouwen als de inhoud echt verandert (anders valt een tik soms weg)
function setHtml(el, html) {
  if (typeof el === 'string') el = $(el);
  if (el && el._html !== html) { el.innerHTML = html; el._html = html; }
}
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.toggle('screen--active', s.id === id));
  window.scrollTo(0, 0);
}
let toastTimer = null;
function toast(msg, bad) {
  const t = $('toast');
  t.textContent = msg;
  t.className = 'toast' + (bad ? ' bad' : '');
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 3200);
}
function showError(id, msg) { const e = $(id); e.textContent = msg || ''; e.hidden = !msg; }
function genToken() {
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  return [...a].map(b => b.toString(16).padStart(2, '0')).join('');
}
function haversine(a, b) {
  const R = 6371000, rad = d => d * Math.PI / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
const meters = m => m >= 1000 ? `${(m / 1000).toFixed(1).replace('.', ',')} km` : `${Math.round(m / 10) * 10} m`;

async function fbGet(path) {
  const r = await fetch(`${DB_URL}/${path}.json`, { cache: 'no-store' });
  if (!r.ok) throw new Error(`Database leesfout (${r.status})`);
  return r.json();
}
async function api(action, data = {}) {
  let r, j = null;
  try {
    r = await fetch('/api/game', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, code, token: me.token, ...data }),
    });
    j = await r.json();
  } catch (e) { throw new Error('Geen verbinding. Probeer het opnieuw.'); }
  if (!r.ok || !j || !j.ok) throw new Error((j && j.error) || 'Er ging iets mis. Probeer het opnieuw.');
  return j;
}
// Knop even op slot tijdens een actie, en fouten netjes tonen
async function busy(btn, fn) {
  if (btn && btn.disabled) return;
  if (btn) btn.disabled = true;
  try { await fn(); }
  catch (e) { toast(e.message, true); }
  finally { if (btn) btn.disabled = false; }
}

const isHost = () => !!game && game.hostId === me.pid;
const players = () => Object.entries(game?.players || {}).sort((a, b) => a[1].at - b[1].at);
const charOf = pid => game?.case?.chars?.[game.assign?.[pid]];
const evidenceList = () => Object.entries(game?.evidence || {}).map(([i, e]) => ({ idx: Number(i), ...e })).sort((a, b) => a.at - b.at);
const questionsLeft = () => Math.max(0, (game?.config?.questions || 0) - (priv?.asked || 0));

// ── Startscherm: de getypte ondertitel ────────────────────────────
// Zelfde timing als het ontwerp: elke letter 45 ms, met een meelopend blokje.
function buildTagline() {
  const lines = ['Eén van jullie liegt.', 'Verhoor de getuigen en ontmasker de dader.'];
  const STEP = 0.045, LINE_PAUSE = 0.255;
  const fmt = n => `${Math.round(n * 1000) / 1000}s`;
  const all = [];
  let t = 2.045;
  lines.forEach((line, li) => {
    line.split(' ').forEach(word => { all.push({ word, start: t - STEP, first: t, line: li }); t += word.length * STEP + STEP; });
    t += LINE_PAUSE;
  });
  let html = '';
  all.forEach((w, i) => {
    const next = all[i + 1], last = !next;
    if (i > 0 && all[i - 1].line !== w.line) html += '<br>';
    const letters = [...w.word].map((ch, k) => `<span class="ty-l" style="animation-duration:${fmt(w.first + k * STEP)}">${esc(ch)}</span>`).join('');
    const from = i === 0 ? 1.85 : w.start;
    const visible = last ? w.word.length * STEP : next.start - from;
    const cursor = `<span aria-hidden="true" class="ty-c" style="animation:ty-pos ${fmt(w.word.length * STEP)} steps(${w.word.length},end) ${fmt(w.start)} both, ty-zicht ${fmt(visible)} linear ${fmt(from)}"><span class="ty-cursor"></span></span>`;
    const end = last ? `<span aria-hidden="true" class="ty-c ty-eind" style="animation-duration:${fmt(w.first + (w.word.length - 1) * STEP)}"><span class="ty-cursor"></span></span>` : '';
    html += `<span class="ty-w" aria-hidden="true">${letters}${cursor}${end}</span> `;
  });
  $('tagline').innerHTML = html;
}

// ── Sessie onthouden (terugkomen na herladen) ─────────────────────
function store(kind) { try { return kind === 'tab' ? window.sessionStorage : window.localStorage; } catch (e) { return null; } }
function storeGet(kind, key) { try { return JSON.parse(store(kind).getItem(key) || 'null'); } catch (e) { return null; } }
function storeSet(kind, key, val) { try { if (val === null) store(kind).removeItem(key); else store(kind).setItem(key, JSON.stringify(val)); } catch (e) { /* geen opslag: spel werkt gewoon */ } }
const validSession = s => !!s && typeof s.code === 'string' && s.code.length === 6 && typeof s.token === 'string' && Date.now() - (s.at || 0) < RESUME_MAX_MS;
function saveSession() {
  if (!code || !me.token) return;
  const s = { code, token: me.token, pid: me.pid, name: me.name, at: Date.now() };
  storeSet('tab', SESSION_KEY, s);
  storeSet('device', LAST_KEY, s);
}
function forgetSession() {
  storeSet('tab', SESSION_KEY, null);
  const last = storeGet('device', LAST_KEY);
  if (last && last.code === code) storeSet('device', LAST_KEY, null);
}
function renderResumeOffer() {
  $('resume-box').hidden = !resumeOffer;
  if (resumeOffer) $('resume-what').textContent = `Dossier ${resumeOffer.code} · als ${resumeOffer.name}`;
}
async function resume(s) {
  try {
    const g = await fbGet(`games/${s.code}`);
    if (!g || !g.players || !g.players[s.pid]) throw new Error('weg');
    me = { token: s.token, pid: s.pid, name: s.name };
    code = s.code; game = g;
    resumeOffer = null; renderResumeOffer();
    saveSession();
    startPolling();
    await route(true);
    return true;
  } catch (e) {
    if (e.message === 'weg') {
      storeSet('tab', SESSION_KEY, null);
      const last = storeGet('device', LAST_KEY);
      if (last && last.code === s.code) storeSet('device', LAST_KEY, null);
      resumeOffer = null; renderResumeOffer();
      toast('Dat dossier bestaat niet meer.', true);
    } else toast('Geen verbinding. Probeer het zo nog eens.', true);
    return false;
  }
}

// ── Verbinding met het spel ───────────────────────────────────────
function startPolling() {
  stopPolling();
  pollTimer = setInterval(poll, POLL_MS);
}
function stopPolling() { clearInterval(pollTimer); pollTimer = null; }
async function poll() {
  if (pollBusy || !code) return;
  pollBusy = true;
  try {
    const g = await fbGet(`games/${code}`);
    if (!code) return;
    if (!g) { toast('Dit dossier bestaat niet meer.', true); leaveToHome(); return; }
    if (g.status === 'lobby' && !g.players?.[me.pid]) { toast('Je zit niet meer in deze lobby.', true); leaveToHome(); return; }
    game = g;
    await route(false);
  } catch (e) { /* even geen verbinding: volgende poging komt vanzelf */ }
  finally { pollBusy = false; }
}
async function loadPrivate() {
  const s = await api('state');
  priv = { card: s.card, chats: s.chats || {}, asked: s.asked || 0, voted: s.voted || null };
  privRound = game.round || 0;
  if (priv.voted) pick = priv.voted;
}

// Welk scherm hoort bij de stand van het spel?
let lastStatus = '';
async function route(fresh) {
  const st = game.status;
  const changed = fresh || st !== lastStatus;
  lastStatus = st;
  if (st === 'lobby') { if (changed) showScreen('s-lobby'); renderLobby(); return; }
  if (st === 'generating') { if (changed) showScreen('s-gen'); return; }
  if (st === 'revealed') { if (changed) { stopGeo(); showScreen('s-reveal'); } renderReveal(); return; }
  // playing of accusing
  if (!priv || changed) {
    try { await loadPrivate(); } catch (e) { if (!priv) { toast(e.message, true); return; } }
  }
  if ((game.round || 0) !== privRound) { privRound = game.round || 0; if (priv) priv.asked = 0; }   // nieuwe ronde, nieuwe vragen
  if (changed) {
    showScreen('s-game');
    if (st === 'accusing') { setTab('beschuldig'); toast('De beschuldigingsronde is begonnen.'); }
    else if (fresh || $('s-game')._first !== code) { $('s-game')._first = code; cardOpen = false; setTab('dossier'); }
    if (game.mode === 'stad' && st === 'playing') startGeo(); else stopGeo();
  }
  noticeEvidence();
  renderGame();
}

function leaveToHome() {
  stopPolling(); stopGeo();
  forgetSession();
  code = ''; game = null; priv = null; lastStatus = ''; seenEvidence = null; chatWid = null; pick = ''; voteEdit = false;
  if (gameMap) { gameMap.remove(); gameMap = null; pinLayer = null; meMarker = null; }
  showScreen('s-home');
}

// ── Lobby ─────────────────────────────────────────────────────────
function renderLobby() {
  $('lobby-code').textContent = code;
  const list = players(), c = game.config;
  setHtml('lobby-tags',
    `<span class="tag tag--blue">${game.mode === 'stad' ? 'In de stad' : 'Aan tafel'}</span>` +
    `<span class="tag">${game.mode === 'stad' ? `${c.rounds} plekken` : `${c.rounds} rondes`}</span>` +
    `<span class="tag">${c.questions} ${c.questions === 1 ? 'vraag' : 'vragen'} per ronde</span>`);
  $('lobby-count').textContent = `SPELERS (${list.length})`;
  const rows = list.map(([pid, p]) =>
    `<li><span>${esc(p.name)}</span><small>${pid === game.hostId ? 'HOST' : ''}${pid === me.pid ? (pid === game.hostId ? ' · JIJ' : 'JIJ') : ''}</small></li>`);
  const missing = Math.max(0, MIN_PLAYERS - list.length);
  if (missing) rows.push(`<li class="roster--empty">Nog ${missing} ${missing === 1 ? 'speler' : 'spelers'} nodig om te beginnen</li>`);
  setHtml('lobby-players', rows.join(''));
  const host = isHost();
  $('btn-start').hidden = !host;
  $('btn-start').disabled = !!missing || $('btn-start')._busy;
  $('lobby-wait').hidden = host;
  $('btn-leave').hidden = host;
}

// ── Het spel ──────────────────────────────────────────────────────
function setTab(name) {
  tab = name;
  document.querySelectorAll('#gnav button').forEach(b => {
    if (b.dataset.tab === name) { b.setAttribute('aria-current', 'page'); b.classList.remove('gnav--dot'); }
    else b.removeAttribute('aria-current');
  });
  document.querySelectorAll('.panel').forEach(p => p.classList.toggle('panel--active', p.id === `p-${name}`));
  if (name === 'kaart') initGameMap();
  if (game) renderGame();
}

// Melding als er nieuw bewijs is
function noticeEvidence() {
  const now = new Set(Object.keys(game.evidence || {}));
  if (seenEvidence === null) { seenEvidence = now; return; }
  const fresh = [...now].filter(k => !seenEvidence.has(k));
  seenEvidence = now;
  if (!fresh.length) return;
  const e = game.evidence[fresh[0]];
  toast(`Nieuw bewijsstuk: ${e.title}${e.by ? ` (gevonden door ${e.by})` : ''}`);
  if (tab !== 'dossier') document.querySelector('#gnav [data-tab="dossier"]').classList.add('gnav--dot');
  $('d-evidence')._fresh = fresh[0];
}

function renderGame() {
  const c = game.config, stad = game.mode === 'stad', found = Object.keys(game.evidence || {}).length;
  $('g-nr').textContent = `DOSSIER NR. ${game.nr || '0000'}`;
  $('g-title').textContent = game.case?.title || '';
  $('g-round').textContent = game.status === 'accusing' ? 'BESCHULDIGING' : stad ? `BEWIJS ${found}/${c.rounds}` : `RONDE ${game.round}/${c.rounds}`;
  $('nav-kaart').hidden = !stad;
  if (tab === 'dossier') renderDossier();
  else if (tab === 'verhoor') renderVerhoor();
  else if (tab === 'verdachten') renderSuspects();
  else if (tab === 'beschuldig') renderAccuse();
  else if (tab === 'kaart') renderMap();
}

function renderDossier() {
  const c = game.config, stad = game.mode === 'stad', card = priv?.card;
  // Jouw personage: standaard dicht, zodat niemand meekijkt
  let h = '';
  if (card && !cardOpen) {
    h = `<button class="cardhide" data-act="card-open">${ico('i-oog', 'ico ico--28')}<span><b>Jouw personage</b><span>Tik om je geheime kaart te bekijken</span></span></button>`;
  } else if (card) {
    const body = card.culprit
      ? `<div class="typed"><b>Jij bent de dader.</b> ${esc(card.truth)}</div>
         <div class="typed"><b>Jouw dekmantel:</b> ${esc(card.cover)}</div>
         <div class="warn">Jij mag liegen. Houd je telefoon voor jezelf.</div>`
      : `<div class="typed"><b>Jij bent onschuldig.</b> ${esc(card.secret)}</div>
         ${card.knows.length ? `<div class="label">Wat jij weet</div><ul class="knows">${card.knows.map(k => `<li>${esc(k)}</li>`).join('')}</ul>` : ''}
         <div class="warn">Je mag niet liegen over wat hier staat. Houd je telefoon voor jezelf.</div>`;
    h = `<div class="paper paper--tilt">
      <div class="paper__head"><div class="label">Jouw personage</div><div class="stamp">GEHEIM</div></div>
      <div class="paper__naam">${esc(card.name)}, ${esc(card.role)}</div>
      ${body}
      <button class="linkbtn geheim" data-act="card-close">Verberg kaart</button>
    </div>`;
  }
  setHtml('d-card', h);
  setHtml('d-intro', `<div class="paper paper--small paper--tilt2"><div class="label">De zaak</div><div class="typed">${esc(game.case?.intro)}</div></div>`);

  const list = evidenceList(), fresh = $('d-evidence')._fresh;
  $('d-evlabel').textContent = `BEWIJS (${list.length} VAN ${c.rounds})`;
  let ev = list.map((e, i) => `<div class="paper paper--small ev${i % 2 ? ' paper--tilt2' : ''}${String(e.idx) === fresh ? ' new' : ''}">
      <div class="num">${e.idx + 1}</div>
      <div class="ev__body"><div class="paper__sub">${esc(e.title)}</div><div class="typed">${esc(e.text)}</div>${e.by ? `<div class="ev__by">Gevonden door ${esc(e.by)}</div>` : ''}</div>
    </div>`).join('');
  for (let i = 0; i < c.rounds; i++) {
    if (game.evidence?.[i]) continue;
    ev += `<div class="locked">${ico('i-slot', 'ico ico--28')}<div><b>Bewijsstuk ${i + 1}</b><span>${stad ? `Ligt op plek ${i + 1} op de kaart` : `Komt vrij in ronde ${i + 1}`}</span></div></div>`;
  }
  setHtml('d-evidence', ev);

  let host = '';
  if (game.status === 'playing') {
    if (stad) host = `<p class="typed typed--center">Loop naar de plekken op de kaart om bewijs te vinden.</p>`;
    else if (isHost()) host = game.round < c.rounds
      ? `<div class="block"><button class="btn btn--blue" data-act="next">VOLGENDE RONDE</button><p class="hint">Uitgepraat? Dan komt bewijsstuk ${game.round + 1} vrij en krijgt iedereen nieuwe vragen.</p></div>`
      : `<div class="block"><button class="btn btn--red" data-act="go-accuse">NAAR DE BESCHULDIGING</button><p class="hint">Dit was de laatste ronde.</p></div>`;
    else host = `<p class="typed typed--center">${game.round < c.rounds ? 'De host start de volgende ronde.' : 'Laatste ronde. Daarna volgt de beschuldiging.'}</p>`;
  }
  setHtml('d-host', host);
}

function renderVerhoor() {
  const ws = game.case?.witnesses || [], left = questionsLeft(), open = game.status === 'playing';
  const inChat = chatWid !== null && ws[chatWid];
  $('p-verhoor').classList.toggle('panel--chat', !!inChat);
  $('v-chat').hidden = !inChat;
  $('v-list').hidden = !!inChat;
  if (!inChat) {
    const info = open
      ? `Je hebt deze ronde nog <b>${left}</b> ${left === 1 ? 'vraag' : 'vragen'}. Wat je overhoudt vervalt.`
      : 'Het verhoor is gesloten. Je kunt je gesprekken nog teruglezen.';
    setHtml('v-list', `<div class="stack">
      <div class="label">${game.case?.ai ? 'Getuigen · gespeeld door AI' : 'Getuigen'}</div>
      ${ws.map((w, i) => {
        const n = Object.keys(priv?.chats?.[`w${i}`] || {}).length;
        return `<button class="witness" data-act="chat" data-wid="${i}">
          <span class="avatar" aria-hidden="true">${esc(w.name[0])}</span>
          <span class="witness__tekst"><span class="witness__naam">${esc(w.name)}</span><span class="witness__rol">${esc(w.role)}${n ? ` · ${n} ${n === 1 ? 'vraag' : 'vragen'} gesteld` : ''}</span><span class="witness__blurb">${esc(w.blurb)}</span></span>
          ${ico('i-pijl')}
        </button>`;
      }).join('')}
      <div class="dash">${ico('i-chat', 'ico ico--28')}<div class="typed">${info}</div></div>
      <p class="hint">Getuigen liegen nooit, maar antwoorden alleen op wat je vraagt. Alleen jij ziet je eigen verhoor.</p>
    </div>`);
    return;
  }
  const w = ws[chatWid];
  $('v-avatar').textContent = w.name[0];
  $('v-kind').textContent = game.case?.ai ? 'GETUIGE · GESPEELD DOOR AI' : 'GETUIGE';
  $('v-name').textContent = `${w.name}, ${w.role}`;
  $('v-left').textContent = open ? `${left} ${left === 1 ? 'VRAAG' : 'VRAGEN'}` : 'GESLOTEN';
  const msgs = Object.entries(priv?.chats?.[`w${chatWid}`] || {}).sort((a, b) => a[0].localeCompare(b[0])).map(x => x[1]);
  let log = msgs.map(m => `<div class="msg msg--q">${esc(m.q)}</div><div class="msg msg--a">${esc(m.a)}</div>`).join('');
  if (chatPending && chatPending.wid === chatWid) log += `<div class="msg msg--q">${esc(chatPending.q)}</div><div class="msg msg--a msg--wait">${esc(w.name)} denkt na<span class="dots"></span></div>`;
  if (!log) log = `<p class="chat__leeg">${esc(w.blurb)} Stel een gerichte vraag: wat zag of hoorde deze getuige, en hoe laat?</p>`;
  const el = $('v-log'), before = el._html;
  setHtml(el, log);
  if (before !== log) el.scrollTop = el.scrollHeight;
  const can = open && left > 0 && !chatPending;
  setHtml('v-sugg', can && !msgs.length ? SUGGESTIONS.map(s => `<button type="button" data-act="suggest">${esc(s)}</button>`).join('') : '');
  $('vraag').disabled = !can;
  $('vraag').placeholder = !open ? 'Het verhoor is gesloten' : left > 0 ? 'Stel je vraag...' : 'Je vragen zijn op tot de volgende ronde';
  document.querySelector('#v-form .sendbtn').disabled = !can;
}

function renderSuspects() {
  setHtml('s-list', players().map(([pid, p], i) => {
    const ch = charOf(pid);
    if (!ch) return '';
    return `<div class="paper paper--small suspect${i % 2 ? ' paper--tilt2' : ''}">
      <div class="suspect__top"><span class="suspect__naam">${esc(ch.name)}</span><span class="suspect__speler">${esc(p.name)}${pid === me.pid ? ' (jij)' : ''}</span></div>
      <div class="suspect__rol">${esc(ch.role)}</div>
      <div class="suspect__blurb">${esc(ch.blurb)}</div>
    </div>`;
  }).join('') + `<p class="hint">Eén van hen is de dader en mag liegen. De rest spreekt de waarheid over wat op zijn kaart staat.</p>`);
}

function renderAccuse() {
  const c = game.config, stad = game.mode === 'stad', found = Object.keys(game.evidence || {}).length;
  const slok = `<div class="dash">${ico('i-glas', 'ico ico--28')}<div class="typed">Tafelregel: zit je fout, dan neem je een slok.</div></div>`;
  let h = '';
  if (game.status === 'playing') {
    const ready = stad ? found >= c.rounds : game.round >= c.rounds;
    h = `<div class="block"><div class="label label--ink">Beschuldigingsronde</div><h2 class="kop">NOG NIET</h2>
      <p class="uitleg">${stad ? `Zoek eerst het bewijs (${found} van ${c.rounds} gevonden).` : `De beschuldiging komt na ronde ${c.rounds}. Jullie zitten in ronde ${game.round}.`} Daarna kiest iedereen tegelijk en geheim een verdachte.</p></div>${slok}`;
    if (isHost()) {
      if (ready) h += `<div class="bottom"><button class="btn btn--red btn--big" data-act="accuse">START DE BESCHULDIGING</button></div>`;
      else if (stad) h += `<div class="bottom"><button class="btn btn--paper" data-act="accuse-early">TOCH NU BESCHULDIGEN</button><p class="hint">Kan een plek niet bereikt worden? Dan kun je eerder beginnen.</p></div>`;
    } else if (ready) h += `<p class="typed typed--center">De host start de beschuldiging.</p>`;
  } else {
    const list = players(), votedCount = Object.keys(game.voted || {}).length;
    const mine = priv?.voted;
    const count = `<div class="typed typed--center">${votedCount} van ${list.length} spelers hebben gekozen</div>`;
    if (mine && !voteEdit) {
      const ch = charOf(mine);
      h = `<div class="block"><div class="label label--ink">Beschuldigingsronde</div><h2 class="kop">JE HEBT GEKOZEN</h2></div>
        <div class="paper paper--tilt"><div class="paper__head"><div class="label">Jij beschuldigt</div><div class="stamp">VERDACHT</div></div>
        <div class="paper__naam">${esc(ch?.name)}</div><div class="typed">${esc(ch?.role)} · gespeeld door ${esc(game.players[mine]?.name)}</div>
        <button class="linkbtn geheim" data-act="vote-edit">Toch iemand anders kiezen</button></div>
        <p class="uitleg">Je keuze blijft geheim tot de onthulling.</p>${count}`;
    } else {
      const picked = pick && game.players[pick] ? charOf(pick) : null;
      h = `<div class="block"><div class="label label--ink">Beschuldigingsronde</div><h2 class="kop">WIE IS DE DADER?</h2>
        <p class="uitleg">Iedereen kiest tegelijk. Je keuze blijft geheim tot de onthulling.</p></div>
        <fieldset class="choices"><legend class="sr">Kies een verdachte</legend>
        ${list.map(([pid, p]) => {
          const ch = charOf(pid), self = pid === me.pid;
          return `<label class="choice${self ? ' choice--zelf' : ''}">
            <input type="radio" name="dader" value="${pid}"${pick === pid ? ' checked' : ''}${self ? ' disabled' : ''}>
            <span class="choice__tekst"><span class="choice__naam">${esc(ch?.name)}</span><span class="choice__rol">${esc(ch?.role)} · ${self ? 'dat ben jij' : esc(p.name)}</span></span>
            <span class="stamp">VERDACHT</span>
          </label>`;
        }).join('')}</fieldset>
        ${game.mode === 'tafel' ? slok : ''}
        <div class="bottom"><button class="btn btn--red btn--big" data-act="vote"${picked ? '' : ' disabled'}>${picked ? `BESCHULDIG ${esc(picked.name)}` : 'KIES EEN VERDACHTE'}</button>${count}</div>`;
    }
    if (isHost()) h += `<div class="block"><button class="btn btn--blue" data-act="reveal">ONTHUL DE DADER</button><p class="hint">${votedCount < list.length ? 'Nog niet iedereen heeft gekozen.' : 'Iedereen heeft gekozen.'}</p></div>`;
  }
  setHtml('b-body', `<div class="stack" style="gap:20px;min-height:100%">${h}</div>`);
}

// ── Onthulling ────────────────────────────────────────────────────
function renderReveal() {
  const r = game.reveal;
  if (!r) return;
  const ch = game.case.chars[r.culpritIdx], cp = game.players[r.culpritPid];
  const rows = players().map(([pid, p]) => {
    const culprit = pid === r.culpritPid, target = r.votes?.[pid], tch = target ? charOf(target) : null;
    const mark = culprit ? `<span class="votes__mark votes__mark--dader">${ico('i-let-op')}</span>`
      : r.correct?.[pid] ? `<span class="votes__mark">${ico('i-vink')}</span>` : `<span class="votes__mark votes__mark--fout">${ico('i-kruis')}</span>`;
    const said = tch ? `beschuldigde ${esc(tch.name)}` : 'koos niemand';
    const sub = culprit ? `de dader · ${said}` : r.correct?.[pid] ? `${said} · goed gezien` : `${said} · fout${game.mode === 'tafel' ? ', neemt een slok' : ''}`;
    return `<li>${mark}<span class="votes__tekst"><span class="votes__naam">${esc(p.name)}${pid === me.pid ? ' (jij)' : ''}</span><span class="votes__sub">${sub}</span></span></li>`;
  }).join('');
  const secrets = players().map(([pid, p]) => {
    const idx = game.assign[pid], c = game.case.chars[idx];
    return `<div class="paper paper--small"><div class="suspect__top"><span class="suspect__naam">${esc(c.name)}</span><span class="suspect__speler">${esc(p.name)}</span></div><div class="typed">${esc(r.secrets?.[idx])}</div></div>`;
  }).join('');
  setHtml('reveal-body', `
    <div class="verdict"><div class="label label--ink">Onthulling · dossier ${esc(game.nr || '')}</div>
      <h2 class="kop">${r.caught ? 'DE DADER IS GEPAKT' : 'DE DADER ONTSNAPT'}</h2>
      <p class="uitleg">${r.right} van de ${r.detectives} speurders wezen de dader aan. Nodig: ${r.needed}.</p></div>
    <div class="paper paper--tilt reveal-card">
      <div class="stamp stamp--big reveal-stamp">DADER</div>
      <div class="paper__naam">${esc(ch.name)}, ${esc(ch.role)}</div>
      <div class="typed">Gespeeld door <b>${esc(cp?.name)}</b></div>
      <div class="typed">${esc(r.solution)}</div>
    </div>
    <div class="block"><div class="label">Wie koos wie</div><ul class="votes">${rows}</ul></div>
    <div class="block"><div class="label">Alle geheimen</div><div class="secrets">${secrets}</div></div>
    <button class="btn btn--blue btn--big" data-act="again">NIEUWE ZAAK</button>`);
}

// ── Kaart (stadsmodus) ────────────────────────────────────────────
function pinIcon(n, cls = '') {
  return L.divIcon({ className: 'pinicon', html: `<div class="pin ${cls}">${n}</div>`, iconSize: [34, 34], iconAnchor: [17, 17] });
}
function tiles(map) {
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(map);
}
function initPlacesMap() {
  if (!placesMap) {
    placesMap = L.map('places-map', { zoomControl: true }).setView(NL_CENTER, 7);
    tiles(placesMap);
    placesLayer = L.layerGroup().addTo(placesMap);
    placesMap.on('click', e => {
      if (setup.places.length >= 5) { toast('Maximaal 5 plekken.', true); return; }
      setup.places.push({ lat: e.latlng.lat, lng: e.latlng.lng });
      renderPlaces();
    });
    locateOnce(p => placesMap.setView([p.lat, p.lng], 16), () => {});
  }
  setTimeout(() => placesMap.invalidateSize(), 50);
  renderPlaces();
}
function locateOnce(ok, fail) {
  if (!navigator.geolocation) { fail(); return; }
  navigator.geolocation.getCurrentPosition(p => ok({ lat: p.coords.latitude, lng: p.coords.longitude }), fail, { enableHighAccuracy: true, timeout: 8000 });
}
function renderPlaces() {
  placesLayer.clearLayers();
  setup.places.forEach((p, i) => L.marker([p.lat, p.lng], { icon: pinIcon(i + 1) }).addTo(placesLayer));
  setHtml('places-list', setup.places.map((p, i) => `<span class="chip"><span class="num">${i + 1}</span>Plek ${i + 1}<button type="button" data-act="place-del" data-i="${i}" aria-label="Plek ${i + 1} weghalen">${ico('i-kruis')}</button></span>`).join(''));
  const n = setup.places.length;
  $('btn-places-go').disabled = n < 3;
  $('btn-places-go').textContent = n < 3 ? `NOG ${3 - n} ${3 - n === 1 ? 'PLEK' : 'PLEKKEN'}` : 'OPEN DOSSIER';
}

function initGameMap() {
  if (!gameMap) {
    const locs = game.locations || [];
    gameMap = L.map('game-map', { zoomControl: false });
    tiles(gameMap);
    pinLayer = L.layerGroup().addTo(gameMap);
    if (locs.length) gameMap.fitBounds(L.latLngBounds(locs.map(l => [l.lat, l.lng])).pad(0.3));
    else gameMap.setView(NL_CENTER, 7);
  }
  setTimeout(() => gameMap.invalidateSize(), 50);
}
function nearestOpen() {
  let best = null;
  (game.locations || []).forEach((l, i) => {
    if (game.evidence?.[i] || !myPos) return;
    const d = haversine(myPos, l);
    if (!best || d < best.d) best = { i, d };
  });
  return best;
}
function renderMap() {
  if (!gameMap) return;
  const locs = game.locations || [], near = nearestOpen();
  const key = JSON.stringify([Object.keys(game.evidence || {}), near && near.d <= FIND_RADIUS ? near.i : -1]);
  if (pinLayer._key !== key) {
    pinLayer._key = key;
    pinLayer.clearLayers();
    locs.forEach((l, i) => {
      const found = !!game.evidence?.[i];
      const m = L.marker([l.lat, l.lng], { icon: pinIcon(i + 1, found ? 'pin--found' : near && near.i === i && near.d <= FIND_RADIUS ? 'pin--near' : '') }).addTo(pinLayer);
      m.on('click', () => onPinClick(i));
    });
  }
  if (myPos) {
    if (!meMarker) meMarker = L.marker([myPos.lat, myPos.lng], { icon: L.divIcon({ className: 'pinicon', html: '<div class="medot"></div>', iconSize: [18, 18], iconAnchor: [9, 9] }), interactive: false }).addTo(gameMap);
    else meMarker.setLatLng([myPos.lat, myPos.lng]);
  }
  const left = locs.filter((l, i) => !game.evidence?.[i]).length;
  let info;
  if (game.status !== 'playing') info = 'Het onderzoek is afgerond.';
  else if (!left) info = 'Al het bewijs is gevonden. Op naar de beschuldiging.';
  else if (!myPos) info = geoError || 'Je locatie wordt gezocht...';
  else info = `Dichtstbijzijnde bewijs: <b>plek ${near.i + 1}</b>, nog ${meters(near.d)}. Kom binnen ${FIND_RADIUS} meter.`;
  if (isHost() && left && game.status === 'playing') info += ' <br>Host: tik op een plek om het bewijs toch vrij te geven.';
  setHtml('k-info', `<div class="paper"><div class="typed">${info}</div></div>`);
}
function onPinClick(i) {
  if (game.evidence?.[i]) { toast(`Bewijsstuk ${i + 1} is al gevonden.`); return; }
  if (!isHost()) { toast(`Plek ${i + 1}: loop ernaartoe om het bewijs te vinden.`); return; }
  if (window.confirm(`Bewijsstuk ${i + 1} vrijgeven zonder dat er iemand op de plek staat?`)) unlock(i);
}
async function unlock(i) {
  if (unlocking.has(i) || game.evidence?.[i]) return;
  unlocking.add(i);
  try { await api('unlock', { idx: i }); await poll(); }
  catch (e) { toast(e.message, true); }
  finally { setTimeout(() => unlocking.delete(i), 5000); }
}
function startGeo() {
  if (geoWatch !== null) return;
  if (!navigator.geolocation) { geoError = 'Dit toestel geeft geen locatie door. Laat de host het bewijs vrijgeven.'; return; }
  geoWatch = navigator.geolocation.watchPosition(p => {
    myPos = { lat: p.coords.latitude, lng: p.coords.longitude };
    geoError = '';
    if (game && game.status === 'playing') {
      const near = nearestOpen();
      if (near && near.d <= FIND_RADIUS) unlock(near.i);
      if (tab === 'kaart') renderMap();
    }
  }, () => {
    geoError = 'Geen locatie. Zet locatie aan voor deze site, of laat de host het bewijs vrijgeven.';
    if (tab === 'kaart' && game) renderMap();
  }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 });
}
function stopGeo() {
  if (geoWatch !== null && navigator.geolocation) navigator.geolocation.clearWatch(geoWatch);
  geoWatch = null;
}

// ── Acties ────────────────────────────────────────────────────────
const acts = {
  'card-open'() { cardOpen = true; renderDossier(); },
  'card-close'() { cardOpen = false; renderDossier(); },
  next(btn) {
    if (!window.confirm(`Ronde ${game.round + 1} starten? Vragen die nog over zijn vervallen.`)) return;
    busy(btn, async () => { await api('next'); await poll(); });
  },
  'go-accuse'() { setTab('beschuldig'); },
  accuse(btn) { busy(btn, async () => { await api('accuse'); await poll(); }); },
  'accuse-early'(btn) {
    if (!window.confirm('Nog niet al het bewijs is gevonden. Toch nu beschuldigen?')) return;
    busy(btn, async () => { await api('accuse'); await poll(); });
  },
  chat(btn) { chatWid = Number(btn.dataset.wid); renderVerhoor(); },
  suggest(btn) { $('vraag').value = btn.textContent; $('vraag').focus(); },
  vote(btn) {
    if (!pick) return;
    busy(btn, async () => { await api('vote', { target: pick }); priv.voted = pick; voteEdit = false; await poll(); renderAccuse(); });
  },
  'vote-edit'() { voteEdit = true; renderAccuse(); },
  reveal(btn) {
    const total = players().length, n = Object.keys(game.voted || {}).length;
    if (n < total && !window.confirm(`Nog maar ${n} van de ${total} spelers hebben gekozen. Toch onthullen?`)) return;
    busy(btn, async () => { await api('reveal'); await poll(); });
  },
  again() { leaveToHome(); },
  'place-del'(btn) { setup.places.splice(Number(btn.dataset.i), 1); renderPlaces(); },
};

async function sendQuestion(q) {
  if (chatPending || chatWid === null) return;
  q = q.replace(/\s+/g, ' ').trim();
  if (q.length < 2) return;
  const wid = chatWid;
  chatPending = { wid, q };
  $('vraag').value = '';
  renderVerhoor();
  try {
    const r = await api('ask', { wid, question: q });
    const key = `w${wid}`;
    priv.chats[key] = priv.chats[key] || {};
    priv.chats[key][`m${String(Object.keys(priv.chats[key]).length).padStart(3, '0')}`] = { q, a: r.answer };
    priv.asked = game.config.questions - r.left;
  } catch (e) {
    toast(e.message, true);
    $('vraag').value = q;
    loadPrivate().then(renderVerhoor).catch(() => {});   // de vraag kan toch afgeschreven zijn
  } finally {
    chatPending = null;
    if (game) renderVerhoor();
  }
}

function setMode(where, mode) {
  if (where === 'home') homeMode = mode; else setup.mode = mode;
  document.querySelectorAll(`#${where}-modes .mode`).forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
  if (where === 'setup') {
    $('rounds-block').hidden = mode === 'stad';
    $('btn-setup-go').textContent = mode === 'stad' ? 'KIES DE PLEKKEN' : 'OPEN DOSSIER';
  }
}
function setSeg(id, v) {
  document.querySelectorAll(`#${id} button`).forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.v) === v)));
}
function openRules() { $('rules').hidden = false; }

async function createGame(btn) {
  await busy(btn, async () => {
    me = { token: genToken(), pid: '', name: $('host-name').value.trim() };
    code = '';
    const r = await api('create', {
      name: me.name, mode: setup.mode, rounds: setup.rounds, questions: setup.questions,
      theme: $('theme').value.trim(), locations: setup.mode === 'stad' ? setup.places : undefined,
    });
    code = r.code; me.pid = r.pid;
    game = await fbGet(`games/${code}`);
    saveSession();
    startPolling();
    await route(true);
  });
}

function bind() {
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-act]');
    if (el && acts[el.dataset.act]) { acts[el.dataset.act](el); return; }
    const go = e.target.closest('[data-go]');
    if (go) showScreen(go.dataset.go);
  });
  document.addEventListener('change', e => {
    if (e.target.name === 'dader') { pick = e.target.value; renderAccuse(); }
  });

  // Start
  document.querySelectorAll('#home-modes .mode').forEach(b => b.addEventListener('click', () => setMode('home', b.dataset.mode)));
  $('code').addEventListener('input', e => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); showError('home-error', ''); });
  $('join-form').addEventListener('submit', async e => {
    e.preventDefault();
    const c = $('code').value.trim().toUpperCase();
    if (c.length !== 6) { showError('home-error', 'Een dossiercode heeft 6 tekens.'); return; }
    const btn = e.target.querySelector('button[type=submit]');
    await busy(btn, async () => {
      let g;
      try { g = await fbGet(`games/${c}/status`); } catch (err) { showError('home-error', 'Geen verbinding. Probeer het opnieuw.'); return; }
      if (!g) { showError('home-error', 'Dit dossier bestaat niet. Klopt de code?'); return; }
      const last = storeGet('device', LAST_KEY);
      if (validSession(last) && last.code === c && await resume(last)) return;   // je deed al mee: gewoon verder
      if (g !== 'lobby') { showError('home-error', 'Deze zaak is al begonnen.'); return; }
      code = c;
      $('name-code').textContent = c;
      showError('name-error', '');
      showScreen('s-name');
      $('name').focus();
    });
  });
  $('name-form').addEventListener('submit', async e => {
    e.preventDefault();
    const name = $('name').value.trim();
    if (!name) { showError('name-error', 'Vul een naam in.'); return; }
    const btn = e.target.querySelector('button[type=submit]');
    if (btn.disabled) return;
    btn.disabled = true;
    try {
      me = { token: genToken(), pid: '', name };
      const r = await api('join', { name });
      me.pid = r.pid;
      game = await fbGet(`games/${code}`);
      saveSession();
      startPolling();
      await route(true);
    } catch (err) { showError('name-error', err.message); }
    finally { btn.disabled = false; }
  });
  $('btn-new').addEventListener('click', () => { setMode('setup', homeMode); showError('setup-error', ''); showScreen('s-setup'); });
  $('btn-resume').addEventListener('click', e => { if (resumeOffer) busy(e.currentTarget, () => resume(resumeOffer)); });
  $('btn-resume-forget').addEventListener('click', () => { storeSet('device', LAST_KEY, null); resumeOffer = null; renderResumeOffer(); });

  // Nieuwe zaak
  document.querySelectorAll('#setup-modes .mode').forEach(b => b.addEventListener('click', () => setMode('setup', b.dataset.mode)));
  document.querySelectorAll('#seg-rounds button').forEach(b => b.addEventListener('click', () => { setup.rounds = Number(b.dataset.v); setSeg('seg-rounds', setup.rounds); }));
  document.querySelectorAll('#seg-questions button').forEach(b => b.addEventListener('click', () => { setup.questions = Number(b.dataset.v); setSeg('seg-questions', setup.questions); }));
  $('setup-form').addEventListener('submit', e => {
    e.preventDefault();
    if (!$('host-name').value.trim()) { showError('setup-error', 'Vul je naam in.'); return; }
    showError('setup-error', '');
    if (setup.mode === 'stad') { showScreen('s-places'); initPlacesMap(); }
    else createGame($('btn-setup-go'));
  });
  $('btn-places-go').addEventListener('click', e => createGame(e.currentTarget));
  $('btn-places-me').addEventListener('click', () => locateOnce(p => placesMap.setView([p.lat, p.lng], 17), () => toast('Je locatie is niet beschikbaar. Zoom zelf in op de kaart.', true)));

  // Lobby
  $('btn-start').addEventListener('click', async e => {
    const btn = e.currentTarget;
    if (btn._busy) return;
    btn._busy = true; btn.disabled = true;
    showError('lobby-error', '');
    showScreen('s-gen'); lastStatus = 'generating';
    try { await api('start'); await poll(); }
    catch (err) { await poll(); showError('lobby-error', err.message); }
    finally { btn._busy = false; }
  });
  $('btn-leave').addEventListener('click', async () => {
    if (!window.confirm('De lobby verlaten?')) return;
    try { await api('leave'); } catch (e) { /* dan maar zo */ }
    leaveToHome();
  });
  $('btn-share').addEventListener('click', async () => {
    const url = `${window.location.origin}/?code=${code}`;
    const text = `Doe mee met Dader Gezocht. Dossiercode: ${code}`;
    try {
      if (navigator.share) await navigator.share({ title: 'Dader Gezocht', text, url });
      else { await navigator.clipboard.writeText(`${text} ${url}`); toast('Link gekopieerd.'); }
    } catch (e) { /* delen afgebroken */ }
  });

  // Spel
  document.querySelectorAll('#gnav button').forEach(b => b.addEventListener('click', () => {
    if (b.dataset.tab === 'verhoor' && tab === 'verhoor') chatWid = null;   // nog eens tikken: terug naar de getuigen
    setTab(b.dataset.tab);
  }));
  $('btn-chat-back').addEventListener('click', () => { chatWid = null; renderVerhoor(); });
  $('v-form').addEventListener('submit', e => { e.preventDefault(); sendQuestion($('vraag').value); });

  // Spelregels
  ['btn-rules-home', 'btn-rules-lobby', 'btn-rules-game'].forEach(id => $(id).addEventListener('click', openRules));
  $('btn-rules-close').addEventListener('click', () => { $('rules').hidden = true; });
  $('rules').addEventListener('click', e => { if (e.target.id === 'rules') $('rules').hidden = true; });

  document.addEventListener('visibilitychange', () => { if (document.hidden) saveSession(); else if (code) poll(); });
  window.addEventListener('pagehide', saveSession);
}

function init() {
  buildTagline();
  bind();
  const fromUrl = (new URLSearchParams(window.location.search).get('code') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  if (fromUrl) $('code').value = fromUrl;
  const own = storeGet('tab', SESSION_KEY);
  if (validSession(own)) { resume(own); return; }
  const last = storeGet('device', LAST_KEY);
  resumeOffer = validSession(last) ? last : null;
  renderResumeOffer();
}
init();
