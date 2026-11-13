/* ══════════════════════════════════════════════════════════════
   DADER GEZOCHT — de vaste zaak "De verdwenen kastelein"
   Terugval als de AI niet bereikbaar is of er geen sleutel is ingesteld.

   Opbouw: de eerste vier personages doen altijd mee (de dader zit daarbij);
   bij meer spelers komen de volgende erbij. Het bewijs verwijst alleen naar
   de eerste vier, dus de zaak klopt bij elk aantal spelers.
   ══════════════════════════════════════════════════════════════ */

const CHARACTERS = [
  {
    name: 'Mila', role: 'De barvrouw', portrait: 'barvrouw',
    blurb: 'Staat al drie jaar achter de tap van De Gouden Tap. Had gisteravond de late dienst.',
    secret: 'Je pakt al maanden kleine bedragen uit de kassa.',
    knows: [],
  },
  {
    name: 'Joris', role: 'De bierleverancier',
    blurb: 'Levert elke week de fusten. Kwam gisteravond laat nog even langs.',
    secret: 'Ruud is je nog 2.400 euro schuldig. Om 23:30 kwam je dat geld eisen en jullie kregen knallende ruzie. Je hebt geroepen dat hij er spijt van zou krijgen.',
    knows: [
      'Om 23:50 reed je kwaad weg met je bestelbus. Ruud en Mila stonden toen samen bij de kassa te tellen, en Ruud keek daar niet vrolijk bij.',
      'De reservesleutels hingen toen gewoon op hun haakje achter de bar.',
    ],
  },
  {
    name: 'Sanne', role: 'De stamgast',
    blurb: 'Zit vaker aan de bar dan thuis op de bank. Was gisteren de laatste gast.',
    secret: 'Je hebt 380 euro op de lat staan. Gisteravond heb je stiekem je eigen bladzijden uit het poefschrift gescheurd toen niemand keek.',
    knows: [
      'Om 00:10 ging je als laatste gast weg, lopend. Ruud en Mila waren toen nog allebei binnen.',
      'Mila zei bij je vertrek dat zij zou afsluiten.',
    ],
  },
  {
    name: 'Bram', role: 'De buurman',
    blurb: 'Woont naast het café en slaapt slecht. Klaagt al jaren over de herrie.',
    secret: 'Om 00:35 stond je in je badjas voor het café en schoof je een dreigbriefje onder de voordeur. Je hebt ook hard op het raam gebonsd.',
    knows: [
      'Om 00:35 brandde er nog licht in het café. Je hoorde de achterdeur dichtslaan en daarna iets plonzen in de gracht.',
      'Vlak daarna fietste er iemand weg door de steeg, zonder licht. Wie het was kon je niet zien.',
    ],
  },
  {
    name: 'Fenna', role: 'De kok', portrait: 'kok-vrouw',
    blurb: 'Runt in haar eentje de keuken. Die ging gisteren om 22:00 dicht.',
    secret: 'Je solliciteert bij de concurrent aan de overkant. Gisteravond heb je het receptenboek van Ruud mee naar huis genomen om het te kopiëren.',
    knows: [
      'Om 22:00 sloot je de keuken en ging je naar huis. Je bent niet meer teruggeweest.',
      'De kassacode is alleen bekend bij Ruud, Mila en jou.',
    ],
  },
  {
    name: 'Kees', role: 'De quizmaster',
    blurb: 'Presenteert elke week de pubquiz. Gisteren was het weer quizavond.',
    secret: 'Je hebt 150 euro uit de quizpot "geleend" en nog niet teruggelegd.',
    knows: [
      'Om 23:00 rekende je af en ging je naar huis.',
      'Ruud mompelde bij het afrekenen dat de kas al weken niet klopt, en dat hij daar morgen werk van ging maken.',
    ],
  },
  {
    name: 'Lotte', role: 'De afwashulp',
    blurb: 'Studente met een bijbaan in de spoelkeuken.',
    secret: 'Je geeft je vrienden al maanden gratis drankjes als Ruud niet kijkt.',
    knows: [
      'Om 23:15 was je klaar en ben je naar huis gefietst.',
      'Ruud haalt zelf nooit een fust zonder de kelderdeur open te laten staan: die deur kan alleen van buitenaf op slot.',
    ],
  },
  {
    name: 'Wim', role: 'De huisbaas',
    blurb: 'Eigenaar van het pand. Komt alleen langs als er iets te halen valt.',
    secret: 'Je wilt het pand verkopen aan een projectontwikkelaar. Gistermiddag heb je Ruud de huur opgezegd en dat liep uit op geschreeuw.',
    knows: [
      'Je was alleen gistermiddag in het café. Vanaf 20:00 zat je thuis.',
      'Ruud zei gistermiddag tegen je dat hij iemand van zijn eigen personeel niet meer vertrouwde.',
    ],
  },
  {
    name: 'Noor', role: 'De ex van Ruud',
    blurb: 'Was vier jaar samen met de kastelein. Ze delen nog een hond, en veel ruzie.',
    secret: 'Je hebt Ruud gisteravond veertien boze appjes gestuurd over de hond. Rond half één liep je langs het café om verhaal te halen, maar je durfde niet naar binnen.',
    knows: [
      'Om 00:32 keek je door het raam: er stond één persoon achter de bar, bij de kassa. Het was niet Ruud.',
      'Die persoon had een schort voor.',
    ],
  },
  {
    name: 'Tim', role: 'De pizzabezorger',
    blurb: 'Bezorgt in de buurt, ook na middernacht.',
    secret: 'Je hebt gisteravond bij het keren een deuk in de bestelbus van Joris gereden en bent doorgereden.',
    knows: [
      'Om 00:05 bezorgde je een pizza bij het café. Mila nam hem aan en betaalde uit de kassa.',
      'Sanne zat toen nog aan de bar. Ruud stond met een schrift vol cijfers bij de kassa.',
    ],
  },
];

const EVIDENCE = [
  { title: 'Lege kassalade', text: 'De dagopbrengst van 1.870 euro is weg. Geen braaksporen: de kassa is gewoon met de code geopend.' },
  { title: 'Gescheurd poefschrift', text: 'Uit het schrift met openstaande rekeningen zijn drie bladzijden gescheurd.' },
  { title: 'Natte sleutelbos', text: 'Opgevist uit de gracht achter het café: de reservesleutels die normaal op een haakje achter de bar hangen. De keldersleutel zit eraan.' },
  { title: 'Dreigbriefje', text: 'Lag onder de voordeur: "Nog één keer herrie na middernacht en ik neem maatregelen."' },
  { title: 'Notitie van Ruud', text: 'Gevonden in zijn jaszak: een lijstje kasverschillen, elke week op dinsdag en vrijdag. Eronder: "Morgen naar de politie."' },
];

const WITNESSES = [
  {
    name: 'Ruud', role: 'De kastelein', portrait: 'kastelein',
    blurb: 'Vanochtend bevrijd uit zijn eigen bierkelder. Koud, boos, maar ongedeerd.',
    facts: [
      'Om 00:30 ging ik de kelder in voor een nieuw fust. De deur sloeg achter me dicht en werd van buiten op slot gedraaid. Ik heb niemand gezien.',
      'Na sluitingstijd telde ik de kas, zoals altijd. Mila stond erbij, zij had de late dienst.',
      'De kas klopt al weken niet. Dat heb ik gisteravond hardop gezegd, en ook dat ik ermee naar de politie zou gaan.',
      'De kassacode kennen alleen Fenna, Mila en ik. Fenna ging om 22:00 naar huis.',
      'Joris kwam om 23:30 klagen over een rekening. Hij vertrok kwaad, een minuut of twintig later.',
      'De kelderdeur kan alleen van buitenaf op slot. De reservesleutel hangt achter de bar.',
    ],
  },
  {
    name: 'Henk', role: 'De taxichauffeur',
    blurb: 'Stond van kwart voor twaalf tot kwart voor één met zijn taxi voor de deur.',
    facts: [
      'Om 00:10 kwam Sanne naar buiten. Ze liep in haar eentje naar huis.',
      'Na Sanne is er niemand meer door de voordeur naar buiten gekomen. Ook Ruud niet.',
      'Rond 00:35 fietste er iemand weg uit de steeg bij de achterdeur, zonder licht.',
      'Die fietser had nog een zwart schort voor en een volle tas over de schouder.',
      'De bestelbus van Joris reed om tien voor twaalf weg.',
      'Rond 00:35 stond er een man in badjas bij de voordeur. Hij schoof iets onder de deur en ging meteen weer naar binnen bij de buren.',
    ],
  },
  {
    name: 'Greet', role: 'De overbuurvrouw',
    blurb: 'Woont aan de overkant en ziet vanuit haar stoel bij het raam alles.',
    facts: [
      'Het licht achter de bar ging pas rond 00:35 uit.',
      'Mila werkt elke dinsdag en vrijdag. Op de andere avonden staat Ruud er alleen.',
      'Rond 00:35 hoorde ik iets plonzen in de gracht achter het café.',
      'Bram van hiernaast heb ik in zijn badjas bij de voordeur gezien. Hij is niet binnen geweest.',
      'Fenna, de kok, zag ik om tien uur al naar huis fietsen met een dik boek onder haar arm.',
      'Gisteren was het vrijdag.',
    ],
  },
];

// Welke bewijsstukken bij minder rondes: het beslissende stuk komt altijd als laatste.
const EVIDENCE_PICK = { 3: [0, 2, 4], 4: [0, 1, 2, 4], 5: [0, 1, 2, 3, 4] };

function fallbackCase(n, rounds) {
  const count = Math.max(4, Math.min(CHARACTERS.length, n));
  return {
    source: 'vast',
    title: 'De verdwenen kastelein',
    intro: 'Kastelein Ruud van café De Gouden Tap is vanochtend gevonden in zijn eigen bierkelder: opgesloten, onderkoeld, maar ongedeerd. De dagopbrengst is weg. Iemand draaide gisternacht die kelderdeur op slot. Wie?',
    characters: CHARACTERS.slice(0, count).map(c => ({ ...c, knows: [...c.knows] })),
    culpritIndex: 0,
    culpritTruth: 'Ruud ontdekte bij het tellen dat jij al maanden uit de kassa pakt, en zei dat hij naar de politie zou gaan. Toen hij om 00:30 de kelder in ging voor een fust, draaide jij de deur achter hem op slot met de reservesleutel. Je nam de dagopbrengst mee, glipte via de achterdeur weg en gooide de sleutelbos in de gracht.',
    coverStory: 'Je kunt zeggen dat je om kwart over twaalf naar huis bent gefietst en dat Ruud toen zelf nog aan het tellen was. Schuif de aandacht naar Joris (ruzie over geld) of Bram (de boze buurman).',
    solution: 'Mila pakte al maanden geld uit de kassa, steeds op haar eigen werkdagen: dinsdag en vrijdag. Ruud kwam erachter en wilde naar de politie. Toen hij om 00:30 de kelder in ging, sloot zij hem op met de reservesleutel van achter de bar, nam de dagopbrengst mee en verdween via de achterdeur. De sleutels gooide ze in de gracht.',
    evidence: (EVIDENCE_PICK[rounds] || EVIDENCE_PICK[5]).map(i => ({ ...EVIDENCE[i] })),
    witnesses: WITNESSES.map(w => ({ ...w, facts: [...w.facts] })),
  };
}

module.exports = { fallbackCase };
