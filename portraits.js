/* ══════════════════════════════════════════════════════════════
   DADER GEZOCHT — getekende portretjes (politiefoto-polaroids)
   Elk personage en elke getuige krijgt een silhouet in inkt op
   politieblauw, met lengte-streepjes op de achtergrond, net als de
   "WIE?"-foto op het startscherm. Wat iemand draagt hangt af van zijn
   rol (koksmuts, pet, schort, bril, stropdas...); kapsel en details
   hangen af van de naam. Zelfde naam + rol = altijd hetzelfde plaatje.
   Geen externe plaatjes, geen extra kosten: alles is inline SVG.
   ══════════════════════════════════════════════════════════════ */

const PORTRAIT_COLORS = { inkt: '#1C1A17', papier: '#FBF6E9', blauw: '#173A63', streep: '#2C5384', rood: '#B3201B' };

// Rol → wat de figuur draagt. Eerste treffer wint; sleutelwoorden in kleine letters.
const PORTRAIT_ROLES = [
  { words: ['kok', 'chef', 'bakker', 'patissier', 'friet', 'snackbar'], hat: 'koksmuts', cloth: 'schort' },
  { words: ['politie', 'agent', 'inspecteur', 'rechercheur', 'beveilig', 'portier', 'bewaker', 'conducteur', 'douane'], hat: 'politiepet', cloth: 'kraag' },
  { words: ['taxi', 'chauffeur', 'schipper', 'kapitein', 'veerman', 'machinist', 'piloot'], hat: 'pet', cloth: 'kraag' },
  { words: ['bezorg', 'koerier', 'postbode', 'leverancier', 'pakket', 'monteur', 'loodgieter', 'klusjes', 'conciërge', 'concierge', 'terreinknecht'], hat: 'pet', cloth: 'tas' },
  { words: ['bar', 'ober', 'serveer', 'kastelein', 'kroeg', 'afwas', 'tapper', 'cateraar', 'kantine'], cloth: 'schort' },
  { words: ['boer', 'tuin', 'hovenier', 'imker', 'visser', 'jager', 'boswachter'], hat: 'strohoed', cloth: 'kraag' },
  { words: ['schoonma', 'poets', 'werkster'], hat: 'bandana', cloth: 'schort' },
  { words: ['dokter', 'arts', 'verpleeg', 'apotheker', 'dierenarts', 'tandarts'], cloth: 'stethoscoop' },
  { words: ['scheidsrechter', 'trainer', 'coach', 'keeper', 'speler', 'sporter', 'badmeester', 'gym'], hat: 'pet', cloth: 'fluitje' },
  { words: ['dj', 'muzikant', 'zanger', 'band', 'drummer', 'gitarist', 'geluid'], hat: 'koptelefoon', cloth: 'kraag' },
  { words: ['fotograaf', 'journalist', 'verslaggever', 'filmer', 'vlogger'], hat: 'hoed', cloth: 'camera' },
  { words: ['detective', 'privé', 'prive', 'speurder'], hat: 'hoed', cloth: 'revers' },
  { words: ['quiz', 'professor', 'leraar', 'docent', 'juf', 'meester', 'boekhoud', 'penning', 'notaris', 'accountant', 'secretaris', 'bibliothec', 'student', 'wetenschap'], face: 'bril', cloth: 'kraag' },
  { words: ['voorzitter', 'directeur', 'huisbaas', 'eigenaar', 'burgemeester', 'manager', 'baas', 'wethouder', 'makelaar', 'advocaat', 'bankier', 'veilingmeester', 'organisator'], cloth: 'stropdas' },
];

const PORTRAIT_HAIR = ['kort', 'lang', 'knot', 'staart', 'krullen', 'kaal', 'stekels'];
const PORTRAIT_EXTRAS = ['', 'bril', 'oorbellen', 'sjaal', '', 'snor'];

function portraitHash(s) {
  let h = 2166136261;
  for (const ch of String(s)) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function portraitLook(name, role) {
  const r = String(role || '').toLowerCase();
  const match = PORTRAIT_ROLES.find(x => x.words.some(w => r.includes(w))) || {};
  const h = portraitHash(`${String(name || '').toLowerCase()}|${r}`);
  let hair = PORTRAIT_HAIR[h % PORTRAIT_HAIR.length];
  // Onder een hoed of pet past geen knot of stekels
  if (match.hat && (hair === 'knot' || hair === 'stekels' || hair === 'krullen')) hair = (h >> 3) % 2 ? 'lang' : 'kort';
  let face = match.face || '';
  let cloth = match.cloth || '';
  let extra = PORTRAIT_EXTRAS[(h >> 5) % PORTRAIT_EXTRAS.length];
  if (extra === 'bril' && !face) face = 'bril';
  if (extra === 'sjaal' && !cloth) cloth = 'sjaal';
  if (!cloth) cloth = ['kraag', 'trui', 'revers'][(h >> 9) % 3];
  return { hat: match.hat || '', hair, face, cloth, oorbellen: extra === 'oorbellen', snor: extra === 'snor' };
}

function portraitSvg(name, role) {
  const C = PORTRAIT_COLORS, L = portraitLook(name, role);
  const ink = C.inkt, pap = C.papier;
  const line = (d, w = 1.6) => `<path d="${d}" fill="none" stroke="${pap}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
  let back = '', front = '';

  // Achtergrond: politieblauw met lengte-streepjes
  let s = `<rect width="64" height="72" fill="${C.blauw}"/>`;
  for (let y = 8; y < 72; y += 8) s += `<path d="M0 ${y}h${y % 16 ? 6 : 10}M64 ${y}h-${y % 16 ? 6 : 10}" stroke="${C.streep}" stroke-width="1.2"/>`;

  // Kapsel (achter het hoofd)
  if (L.hair === 'lang') back += `<path d="M18 28a14 14 0 0 1 28 0v19h-6v-15h-16v15h-6z" fill="${ink}"/>`;
  if (L.hair === 'knot') back += `<circle cx="32" cy="12" r="5.5" fill="${ink}"/>`;
  if (L.hair === 'staart') back += `<path d="M42 22c8 2 9 12 5 20c-2-6-4-10-7-13z" fill="${ink}"/>`;
  if (L.hair === 'krullen') back += [[21, 22], [24, 15], [31, 12], [38, 13], [43, 18], [45, 25], [19, 28]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="5" fill="${ink}"/>`).join('');
  if (L.hair === 'stekels') back += `<path d="M20 24l1-9 4 5 2-8 4 6 3-8 3 7 4-6 1 8 3-3-1 9z" fill="${ink}"/>`;

  // Lichaam en hoofd
  s += back;
  s += `<path d="M5 72c0-15 11-24 27-24s27 9 27 24z" fill="${ink}"/>`;
  s += `<rect x="27" y="36" width="10" height="14" fill="${ink}"/>`;
  s += `<circle cx="32" cy="${L.hair === 'kaal' ? 29 : 28}" r="${L.hair === 'kaal' ? 12 : 13}" fill="${ink}"/>`;
  if (L.hair === 'kaal') front += line('M24 22a10 10 0 0 1 7-4', 1.2);

  // Kleding
  const cl = {
    kraag: line('M25 50l7 6 7-6'),
    trui: line('M24 51c4 4 12 4 16 0'),
    revers: line('M25 49l7 11 7-11') + line('M18 58l7 3M46 58l-7 3', 1.2),
    stropdas: line('M25 49l7 9 7-9') + `<path d="M32 51l-2.5 3 2.5 13 2.5-13z" fill="${pap}"/>`,
    schort: line('M23 56h18v16M23 56v16') + line('M23 56l4-7M41 56l-4-7'),
    sjaal: `<path d="M22 47h20v6h-20z" fill="${C.rood}"/><path d="M36 52h5l1 12h-5z" fill="${C.rood}"/>`,
    tas: `<path d="M20 50l26 22" stroke="${pap}" stroke-width="3" stroke-linecap="round"/>`,
    stethoscoop: line('M25 50c-1 12 15 12 14 0') + `<circle cx="32" cy="61" r="2.5" fill="none" stroke="${pap}" stroke-width="1.6"/>`,
    fluitje: line('M28 50l4 9 4-9', 1.2) + `<rect x="30" y="59" width="5" height="3" fill="${pap}"/>`,
    camera: line('M24 50l-2 8M40 50l2 8', 1.2) + `<rect x="25" y="57" width="14" height="9" fill="none" stroke="${pap}" stroke-width="1.6"/><circle cx="32" cy="61.5" r="2.2" fill="${pap}"/>`,
  };
  front += cl[L.cloth] || '';

  // Gezicht
  if (L.face === 'bril') front += `<circle cx="27" cy="29" r="3.6" fill="none" stroke="${pap}" stroke-width="1.5"/><circle cx="37" cy="29" r="3.6" fill="none" stroke="${pap}" stroke-width="1.5"/>` + line('M30.6 29h2.8', 1.3);
  if (L.oorbellen) front += `<circle cx="19.5" cy="33" r="1.6" fill="${pap}"/><circle cx="44.5" cy="33" r="1.6" fill="${pap}"/>`;
  if (L.snor) front += line('M27.5 35c2-1.5 3.5-1.5 4.5 0c1-1.5 2.5-1.5 4.5 0', 1.6);

  // Hoofddeksels (boven op het hoofd)
  const hats = {
    koksmuts: `<path d="M22 22v-9h20v9z" fill="${pap}" stroke="${ink}" stroke-width="1.5"/>` + [[24, 11], [32, 7], [40, 11]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="6.5" fill="${pap}" stroke="${ink}" stroke-width="1.5"/>`).join('') + `<path d="M22.8 13h18.4v8.2h-18.4z" fill="${pap}"/>`,
    pet: `<path d="M19 24a13 12 0 0 1 26 0z" fill="${ink}"/><path d="M40 22.5h11a2 2 0 0 1 0 3.5h-11z" fill="${ink}"/>` + line('M19.5 23.5h25', 1.3),
    politiepet: `<path d="M16 20l4-9h24l4 9z" fill="${ink}"/><path d="M19 20h26v4h-26z" fill="${ink}"/>` + line('M19 21.5h26', 1.3) + `<circle cx="32" cy="15" r="2.3" fill="${pap}"/>`,
    strohoed: `<ellipse cx="32" cy="18" rx="20" ry="3.5" fill="${ink}"/><path d="M23 18v-8a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v8z" fill="${ink}"/>` + line('M23 15h18', 1.6),
    hoed: `<ellipse cx="32" cy="18" rx="17" ry="3" fill="${ink}"/><path d="M24 18l1-9c3-2 11-2 14 0l1 9z" fill="${ink}"/>` + line('M24.5 15.5h15', 1.8),
    bandana: `<path d="M19 25a13 13 0 0 1 26 0z" fill="${C.rood}"/><path d="M44 23l6-3-2 6z" fill="${C.rood}"/>`,
    koptelefoon: `<path d="M17 30a15 15 0 0 1 30 0" fill="none" stroke="${pap}" stroke-width="2"/><rect x="15" y="26" width="5" height="9" rx="1.5" fill="${pap}"/><rect x="44" y="26" width="5" height="9" rx="1.5" fill="${pap}"/>`,
  };
  front += hats[L.hat] || '';

  return `<svg class="mug__svg" viewBox="0 0 64 72" aria-hidden="true" focusable="false">${s}${front}</svg>`;
}

// Polaroid met portret; size: 'sm' | 'md' | 'lg'
function mugshot(name, role, size = 'md', label = '') {
  return `<span class="mug mug--${size}" aria-hidden="true">${portraitSvg(name, role)}${label ? `<span class="mug__label">${label}</span>` : ''}</span>`;
}
