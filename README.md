# Dader Gezocht

Deductie- en mysteriespel van Ravotters voor 4 tot 10 spelers. Eén van jullie is de dader en mag liegen; de rest spreekt de waarheid. Verhoor de AI-getuigen, leg het bewijs naast de verklaringen en wijs samen de dader aan.

Live: https://dadergezocht.ravotters.nl

## Twee modi
- **Aan tafel**: per ronde komt er een bewijsstuk vrij, daarna de beschuldigingsronde.
- **In de stad**: het bewijs ligt op echte plekken op de kaart en komt vrij als iemand er is (binnen 40 meter).

## Opbouw
- `index.html`, `style.css`, `script.js`: het spel in de browser (geen build-stap).
- `api/game.js`: spelserver (Vercel-functie). Alle acties van spelers lopen hierlangs.
- `api/cleanup.js`: dagelijkse opruimtaak (dossiers ouder dan 48 uur).
- `lib/ai.js`: Claude API: zaak genereren en getuigen laten antwoorden.
- `lib/fallback-case.js`: de vaste zaak "De verdwenen kastelein" als de AI niet beschikbaar is.
- `lib/db.js`: Firebase Realtime Database via REST.
- `database.rules.json`: databaseregels.

## Geheimen
De openbare stand (`games/<code>`) kan iedereen met de dossiercode lezen. Wie de dader is, de personagekaarten, wat de getuigen weten en de stemmen staan in een kluis (`vault/<code>/<sleutel>`) waarvan alleen de server het pad kan berekenen. Een speler krijgt alleen zijn eigen kaart en eigen verhoren terug, op vertoon van een geheim token dat alleen op zijn toestel staat.

## Instellingen in Vercel (Environment Variables)
- `DG_SERVER_SECRET` (verplicht): willekeurige tekst waarmee de kluispaden berekend worden.
- `ANTHROPIC_API_KEY`: sleutel voor de Claude API. Zonder sleutel speelt het spel de vaste zaak.
- `CRON_SECRET`: beveiligt de opruimtaak.
- Optioneel: `DG_MODEL_CASE`, `DG_MODEL_WITNESS` (standaard `claude-opus-5-5`), `DG_MAX_AI_CASES_PER_DAY` (standaard 150).

## Lokaal testen
```bash
npm install
```
```bash
npm run dev
```
Daarna http://localhost:5174. De database wordt lokaal nagespeeld in het geheugen.
