/* ══════════════════════════════════════════════════════════════
   DADER GEZOCHT — spelserver (Vercel-functie)
   Alle acties van spelers lopen hierlangs: POST /api/game  { action, ... }

   De telefoons lezen de openbare stand (games/<code>) rechtstreeks uit
   Firebase. Alles wat geheim is (dader, kaarten, getuigenkennis, stemmen)
   staat in de kluis en komt alleen via deze functie naar buiten, en dan
   alleen het deel dat voor die ene speler bedoeld is.
   ══════════════════════════════════════════════════════════════ */

const db = require('../lib/db');
const ai = require('../lib/ai');
const { fallbackCase } = require('../lib/fallback-case');

const MIN_PLAYERS = 4, MAX_PLAYERS = 10;
const STUCK_MS = 6 * 60 * 1000;   // generating for longer than this: interrupted, may start again
const MAX_AI_CASES_PER_DAY = Number(process.env.DG_MAX_AI_CASES_PER_DAY || 150);
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

class Oops extends Error { constructor(msg, status = 400) { super(msg); this.status = status; } }
const need = (cond, msg, status) => { if (!cond) throw new Oops(msg, status); };

const cleanName = s => String(s ?? '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 16);
const cleanCode = s => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
const validToken = t => typeof t === 'string' && /^[a-f0-9]{32,64}$/.test(t);
const today = () => new Date().toISOString().slice(0, 10);

function genCode() {
  let c = '';
  for (let i = 0; i < 6; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return c;
}
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// Spel + kluis + wie er vraagt
async function load(body, { member = true } = {}) {
  const code = cleanCode(body.code);
  need(code.length === 6, 'Die dossiercode klopt niet.');
  need(validToken(body.token), 'Sessie ongeldig. Herlaad de pagina.');
  const pid = db.pidOf(body.token);
  const [game, vault] = await Promise.all([db.get(`games/${code}`), db.get(db.vaultPath(code))]);
  need(game && vault, 'Dit dossier bestaat niet (meer).', 404);
  if (member) need(game.players?.[pid], 'Je doet niet mee aan deze zaak.', 403);
  return { code, pid, game, vault, isHost: vault.hostPid === pid };
}

const publicCase = k => ({
  title: k.title, intro: k.intro, ai: k.source === 'ai',
  chars: k.characters.map(c => ({ name: c.name, role: c.role, blurb: c.blurb })),
  witnesses: k.witnesses.map(w => ({ name: w.name, role: w.role, blurb: w.blurb })),
});

function cardFor(vault, pid) {
  const idx = vault.assign?.[pid];
  if (idx === undefined || !vault.case) return null;
  const c = vault.case.characters[idx];
  const culprit = idx === vault.case.culpritIndex;
  return culprit
    ? { idx, name: c.name, role: c.role, culprit: true, truth: vault.case.culpritTruth, cover: vault.case.coverStory }
    : { idx, name: c.name, role: c.role, culprit: false, secret: c.secret, knows: c.knows || [] };
}

// ── Acties ────────────────────────────────────────────────────────
const actions = {
  async create(body) {
    need(validToken(body.token), 'Sessie ongeldig. Herlaad de pagina.');
    const name = cleanName(body.name);
    need(name, 'Vul een naam in.');
    const mode = body.mode === 'stad' ? 'stad' : 'tafel';
    const questions = Math.min(3, Math.max(1, Math.round(Number(body.questions) || 2)));
    let rounds = Math.min(5, Math.max(3, Math.round(Number(body.rounds) || 5)));
    let locations = null;
    if (mode === 'stad') {
      const locs = Array.isArray(body.locations) ? body.locations : [];
      need(locs.length >= 3 && locs.length <= 5, 'Zet 3 tot 5 plekken op de kaart.');
      locations = locs.map(l => ({ lat: Number(l.lat), lng: Number(l.lng) }));
      need(locations.every(l => Math.abs(l.lat) <= 90 && Math.abs(l.lng) <= 180 && (l.lat || l.lng)), 'Een van de plekken klopt niet.');
      rounds = locations.length;
    }
    const pid = db.pidOf(body.token);
    let code = '';
    for (let i = 0; i < 8; i++) {
      code = genCode();
      if (!(await db.get(`games/${code}/createdAt`))) break;
      code = '';
    }
    need(code, 'Kon geen dossiercode maken. Probeer het opnieuw.', 500);
    const now = Date.now();
    const game = {
      createdAt: now, status: 'lobby', mode, config: { rounds, questions }, hostId: pid, round: 0,
      nr: String(Math.floor(1000 + Math.random() * 9000)),
      players: { [pid]: { name, at: now } },
    };
    if (locations) game.locations = locations;
    await db.put(db.vaultPath(code), { createdAt: now, hostPid: pid, theme: String(body.theme ?? '').replace(/["<>\n\r]/g, ' ').trim().slice(0, 60) });
    await db.put(`games/${code}`, game);
    await db.patch(db.indexPath(), { [`codes/${code}`]: now }).catch(() => {});
    return { code, pid };
  },

  async join(body) {
    const { code, pid, game } = await load(body, { member: false });
    if (game.players?.[pid]) return { code, pid };   // was er al: gewoon terug naar binnen
    need(game.status === 'lobby', 'Deze zaak is al begonnen.');
    const name = cleanName(body.name);
    need(name, 'Vul een naam in.');
    const others = Object.values(game.players || {});
    need(others.length < MAX_PLAYERS, `Deze zaak zit vol (${MAX_PLAYERS} spelers).`);
    need(!others.some(p => p.name.toLowerCase() === name.toLowerCase()), 'Die naam is al bezet. Kies een andere.');
    await db.put(`games/${code}/players/${pid}`, { name, at: Date.now() });
    return { code, pid };
  },

  async leave(body) {
    const { code, pid, game, isHost } = await load(body);
    need(game.status === 'lobby', 'De zaak loopt al.');
    need(!isHost, 'De host kan de lobby niet verlaten.');
    await db.del(`games/${code}/players/${pid}`);
    return {};
  },

  async start(body) {
    const { code, game, vault, isHost } = await load(body);
    need(isHost, 'Alleen de host kan de zaak openen.', 403);
    const stuck = game.status === 'generating' && Date.now() - (Number(game.genAt) || 0) > STUCK_MS;
    need(game.status === 'lobby' || stuck, game.status === 'generating' ? 'Het dossier wordt al samengesteld.' : 'De zaak is al geopend.');
    const pids = Object.keys(game.players || {});
    need(pids.length >= MIN_PLAYERS, `Je hebt minstens ${MIN_PLAYERS} spelers nodig.`);
    need(pids.length <= MAX_PLAYERS, `Maximaal ${MAX_PLAYERS} spelers.`);
    await db.patch(`games/${code}`, { status: 'generating', genAt: Date.now() });

    const rounds = game.config.rounds;
    let kase = null, why = '';
    try {
      if (!ai.hasAI()) why = 'geen sleutel';
      else {
        const used = Number(await db.get(`${db.indexPath()}/daily/${today()}`)) || 0;
        if (used >= MAX_AI_CASES_PER_DAY) why = 'daglimiet';
        else {
          await db.patch(db.indexPath(), { [`daily/${today()}`]: used + 1 }).catch(() => {});
          kase = await ai.generateCase({ n: pids.length, rounds, theme: vault.theme, mode: game.mode });
        }
      }
    } catch (e) { why = e.message; console.error('zaak genereren mislukt:', e.message); }
    if (!kase) kase = fallbackCase(pids.length, rounds);

    try {
      const order = shuffle(kase.characters.map((_, i) => i));
      const assign = {};
      shuffle(pids).forEach((pid, i) => { assign[pid] = order[i]; });
      const table = game.mode === 'tafel';
      const now = Date.now();
      await db.patch(db.vaultPath(code), { case: kase, assign, startedAt: now, fallbackReason: why || null });
      await db.patch(`games/${code}`, {
        status: 'playing', startedAt: now, case: publicCase(kase), assign,
        round: table ? 1 : 0,
        evidence: table ? { 0: { ...kase.evidence[0], at: now } } : null,
      });
    } catch (e) {
      await db.patch(`games/${code}`, { status: 'lobby' }).catch(() => {});
      throw e;
    }
    return { ai: kase.source === 'ai' };
  },

  // Alles wat alleen voor deze speler is: zijn kaart, zijn verhoren, zijn vragen
  async state(body) {
    const { pid, game, vault, isHost } = await load(body);
    const round = game.round || 0;
    return {
      pid, isHost,
      card: cardFor(vault, pid),
      chats: vault.chats?.[pid] || {},
      asked: Number(vault.asked?.[pid]?.[`r${round}`]) || 0,
      voted: vault.votes?.[pid] || null,
    };
  },

  // Tafelmodus: volgende ronde, volgend bewijsstuk
  async next(body) {
    const { code, game, vault, isHost } = await load(body);
    need(isHost, 'Alleen de host kan naar de volgende ronde.', 403);
    need(game.status === 'playing' && game.mode === 'tafel', 'Dat kan nu niet.');
    const round = game.round || 1;
    need(round < game.config.rounds, 'Dit was de laatste ronde.');
    await db.patch(`games/${code}`, { round: round + 1, [`evidence/${round}`]: { ...vault.case.evidence[round], at: Date.now() } });
    return { round: round + 1 };
  },

  // Stadsmodus: een speler staat op een plek (of de host geeft het bewijs toch vrij)
  async unlock(body) {
    const { code, pid, game, vault } = await load(body);
    need(game.status === 'playing' && game.mode === 'stad', 'Dat kan nu niet.');
    const idx = Math.round(Number(body.idx));
    need(idx >= 0 && idx < game.config.rounds, 'Die plek bestaat niet.');
    if (game.evidence?.[idx]) return { already: true };
    const found = Object.keys(game.evidence || {}).length;
    await db.patch(`games/${code}`, {
      round: found + 1,
      [`evidence/${idx}`]: { ...vault.case.evidence[idx], at: Date.now(), by: game.players[pid].name },
    });
    return { round: found + 1 };
  },

  async accuse(body) {
    const { code, game, isHost } = await load(body);
    need(isHost, 'Alleen de host kan de beschuldigingsronde starten.', 403);
    need(game.status === 'playing', 'Dat kan nu niet.');
    if (game.mode === 'tafel') need((game.round || 0) >= game.config.rounds, 'Speel eerst alle rondes.');
    await db.patch(`games/${code}`, { status: 'accusing' });
    return {};
  },

  async vote(body) {
    const { code, pid, game } = await load(body);
    need(game.status === 'accusing', 'De beschuldigingsronde is niet open.');
    const target = String(body.target || '');
    need(game.players?.[target], 'Kies een verdachte.');
    need(target !== pid, 'Je kunt jezelf niet beschuldigen.');
    await db.put(`${db.vaultPath(code)}/votes/${pid}`, target);
    await db.put(`games/${code}/voted/${pid}`, true);
    return {};
  },

  async reveal(body) {
    const { code, game, vault, isHost } = await load(body);
    need(isHost, 'Alleen de host kan de onthulling starten.', 403);
    need(game.status === 'accusing', 'Dat kan nu niet.');
    const kase = vault.case, assign = vault.assign || {}, votes = vault.votes || {};
    const culpritPid = Object.keys(assign).find(p => assign[p] === kase.culpritIndex);
    const detectives = Object.keys(game.players).filter(p => p !== culpritPid);
    const correct = {};
    for (const p of Object.keys(game.players)) correct[p] = votes[p] === culpritPid;
    const right = detectives.filter(p => correct[p]).length;
    const needed = Math.floor(detectives.length / 2) + 1;   // meer dan de helft
    await db.patch(`games/${code}`, {
      status: 'revealed', endedAt: Date.now(),
      reveal: {
        culpritPid, culpritIdx: kase.culpritIndex, votes, correct, right, needed,
        detectives: detectives.length, caught: right >= needed,
        solution: kase.solution,
        secrets: kase.characters.map((c, i) => i === kase.culpritIndex ? kase.culpritTruth : c.secret),
      },
    });
    return {};
  },

  async ask(body) {
    const { code, pid, game, vault } = await load(body);
    need(game.status === 'playing', 'Verhoren kan alleen tijdens het onderzoek.');
    const wid = Math.round(Number(body.wid));
    const witness = vault.case?.witnesses?.[wid];
    need(witness, 'Die getuige bestaat niet.');
    const question = String(body.question ?? '').replace(/\s+/g, ' ').trim().slice(0, 200);
    need(question.length >= 2, 'Typ eerst een vraag.');
    const round = game.round || 0, key = `r${round}`;
    const asked = Number(vault.asked?.[pid]?.[key]) || 0;
    need(asked < game.config.questions, 'Je vragen voor deze ronde zijn op.');
    const history = Object.values(vault.chats?.[pid]?.[`w${wid}`] || {});
    // Eerst afschrijven, dan pas antwoorden: dubbel tikken levert geen gratis vraag op
    await db.put(`${db.vaultPath(code)}/asked/${pid}/${key}`, asked + 1);
    let answer = '';
    try {
      if (ai.hasAI()) answer = await ai.witnessAnswer(vault.case, witness, history, question);
    } catch (e) { console.error('getuige mislukt:', e.message); }
    if (!answer) answer = ai.scriptedAnswer(witness, history, question);
    const n = String(history.length).padStart(3, '0');
    await db.put(`${db.vaultPath(code)}/chats/${pid}/w${wid}/m${n}`, { q: question, a: answer, r: round });
    return { answer, left: game.config.questions - asked - 1 };
  },
};

async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Alleen POST' });
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = null; } }
  const fn = body && Object.prototype.hasOwnProperty.call(actions, body.action) ? actions[body.action] : null;
  if (!fn) return res.status(400).json({ ok: false, error: 'Onbekende actie' });
  try {
    const out = await fn(body);
    return res.status(200).json({ ok: true, ...out });
  } catch (e) {
    if (e instanceof Oops) return res.status(e.status).json({ ok: false, error: e.message });
    console.error(`actie ${body.action} mislukt:`, e.message);
    return res.status(500).json({ ok: false, error: 'Er ging iets mis op de server. Probeer het opnieuw.' });
  }
}

module.exports = handler;
module.exports.actions = actions;
