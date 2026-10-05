# 🍻 SKÅL — live drikke-scoreboard med minigames

SKÅL er en web-app til festen: Opret et event, lad vennerne scanne QR-koden, og alle registrerer
øl, shots, drinks og Jägerbombs fra deres egen telefon. Stillingen opdateres live, lykkehjul popper
op, når man tager føringen eller kommer bagud, og breakers (minigames for alle) holder gang i
festen undervejs.

Appen ligger i [`skaal/`](skaal/) og er en ren statisk side — ingen server, ingen build-trin.

<p>
  <img src="docs/screenshots/1-start.jpg" width="190" alt="Startside" />
  <img src="docs/screenshots/2-drik.jpg" width="190" alt="Registrér drinks" />
  <img src="docs/screenshots/3-lykkehjul.jpg" width="190" alt="Kongehjulet" />
  <img src="docs/screenshots/4-stilling.jpg" width="190" alt="Live stilling" />
</p>
<p>
  <img src="docs/screenshots/5-quiz.jpg" width="190" alt="Quiz-breaker" />
  <img src="docs/screenshots/6-resultat.jpg" width="190" alt="Minigame-resultat" />
  <img src="docs/screenshots/7-feed.jpg" width="190" alt="Feed med reaktioner" />
</p>
<p>
  <img src="docs/screenshots/11-del-ud.jpg" width="190" alt="Del slurke ud ved at trykke på dem, der skal drikke" />
  <img src="docs/screenshots/12-pop-up.jpg" width="190" alt="Pop-up hos den, der skal drikke" />
  <img src="docs/screenshots/13-faellesskaal.jpg" width="190" alt="Fællesskål på alles telefoner" />
</p>
<p>
  <img src="docs/screenshots/9-tour-troeje.jpg" width="190" alt="Tour de France: føreren i den gule trøje" />
  <img src="docs/screenshots/10-tour-ansigt.jpg" width="190" alt="Tour de France: et ansigt dukker op ved 21 drinks" />
</p>
<p><img src="docs/screenshots/8-storskaerm.jpg" width="780" alt="Storskærm" /></p>

## Funktioner

- **Events med QR-invitation** — opret et event, del link/QR/kode (fx `K7F2-QXRM`), og alle
  deltager fra deres egen telefon. Kan også fortsættes på en ny telefon ("Fortsæt som dig selv").
- **Profil med navn og billede** — tag et billede eller vælg fra kamerarullen, beskær og zoom.
- **Drink-tracker** — Øl, Shot, Drink og Jägerbomb (+ Vand, og Vin/Cider kan slås til). Point pr.
  drik kan ændres af værten. Fortryd med det samme eller ret fejl i historikken.
- **Live stilling** — podie, rangliste med bevægelsespile, filtre (point, pr. drik, tempo, slurke)
  og en graf over udviklingen. Tryk på en spiller for detaljer.
- **Lykkehjul** — 👑 *Kongehjulet* når du tager føringen, 🔥 *Comeback-hjulet* når du er langt bagud,
  🎡 *Lykkehjulet* ved hver 5. drink. Udfald som "giv 4 slurke ud", "føreren drikker 3", "en anden
  skylder dig en drink", bonuspoint, skjolde og nye regler.
- **Del slurke ud med et tryk** — vinder du slurke at dele ud, trykker du bare på dem, der skal
  drikke (tryk igen for at give en af dem flere; resten fordeles ligeligt). De udvalgte får med det
  samme en pop-up på telefonen med dit billede og antallet af slurke.
- **Fællesskål** — når hjulet siger "alle drikker", dukker skålen op på alles telefoner (også din
  egen) og på storskærmen med 3-2-1-nedtælling, og alle kan se, hvem der har skålet.
- **11 minigames** — Quiz, Mest tilbøjelig til…, Hurtigste finger, Jeg har aldrig…, Duel (sten,
  saks, papir), Hvem drikker?, Sandhed eller konsekvens, Kategorier, Skål-runde, Happy Hour
  (dobbelt point) og Ny regel. De kører som automatiske *breakers* (fx hver 15. minut) på alles
  telefoner samtidig, eller startes manuelt fra fanen "Spil".
- **Tour de France-tilstand** — føreren bærer den gule trøje (hjelm og racerbriller på sit billede),
  og når en rytter når 21 drinks, dukker Henning Primdahl, Bobby eller Pimm op på alles telefoner —
  hver med sin egen effekt — mens Tour-sangen spiller. Se [Tour de France](#tour-de-france).
- **Straffe og skjolde** — slurke du får tildelt, popper op med hvem de er fra og hvorfor, plus
  "Skål — drukket ✓". Et skjold kan bruges til at slippe, og "Senere" gemmer dem på Drik-fanen.
- **Feed med reaktioner**, **storskærm** (`#/tv/<kode>`) til tv'et, **slutresultat** med podie og
  priser, **pause-tilstand**, lyd og vibration, og installérbar som app (PWA).
- **Ansvarlig** — vand tæller med, pause tager dig ud af minigames, og alle straffe er frivillige.

## Kom i gang (GitHub Pages)

1. Gå til repoets **Settings → Pages**.
2. Vælg *Deploy from a branch*, vælg den branch, koden ligger på, og mappen `/ (root)`.
3. Efter et minut ligger appen på `https://<dit-brugernavn>.github.io/Games/skaal/`.
4. Åbn linket på telefonen → **Opret event** → del QR-koden. Tip: "Føj til hjemmeskærm" giver
   app-oplevelsen i fuld skærm.

Alle andre statiske hosts virker også (Netlify, Vercel, Cloudflare Pages …). Appen kræver https,
fordi den krypterer alt.

## Tour de France

Slå *Tour de France* til, når du opretter eventet, eller senere under **Mig → Event-indstillinger**.

- **Den gule trøje:** Den, der fører, får en gul ring samt gul hjelm og racerbriller over sit
  billede — overalt i appen og på storskærmen — så alle kan se, hvem der fører. Værten kan uploade
  sin egen maske (fx en Vingegaard-maske som PNG med gennemsigtig baggrund), som så lægges over
  førerens billede i stedet.
- **21 etaper = 21 drinks:** Drinks-kortet viser, hvor langt man er i Touren. Når en rytter når 21
  drinks, ruller et ansigt frem på alles telefoner (og storskærmen), og ansigtet bestemmer, hvad
  der sker:

  | Ansigt | Effekt |
  | --- | --- |
  | **Henning Primdahl** — *Massestart!* | Hele feltet skåler for rytteren: alle drikker 2 slurke. |
  | **Bobby** — *Baghjul!* | De to nærmeste ryttere i stillingen skal have baghjul: 3 slurke hver. |
  | **Pimm** — *Udbrud!* | Rytteren får 3 point i tidsbonus, og den nærmeste rival drikker 3 slurke. |

  De ramte kan drikke direkte fra pop-up'en (eller bruge et skjold). Det sker én gang pr. rytter;
  fortryder rytteren den 21. drink, forsvinder øjeblikket igen.
- **Billeder af ansigterne:** Appen har tegnede versioner af Henning, Bobby og Pimm. Værten kan
  uploade jeres egne billeder under *Ansigterne ved 21 drinks* — de deles krypteret med alle
  telefoner med det samme. (Appen leverer ingen fotos af rigtige personer; brug billeder, I har lov
  til at bruge.)

### Tour-sangen

“De skal have baghjul (nede i Touren)” med Drengene fra Angora er ophavsretligt beskyttet og
følger derfor ikke med appen. I vælger selv, hvor sangen kommer fra:

1. **Lydfil på denne enhed** (anbefalet): Vælg mp3-filen under *Tour-sangen* på den telefon eller
   computer, der er koblet til højttaleren. Filen bliver på enheden og spilles der ved hvert
   Tour-øjeblik.
2. **Link til en lydfil** (fx `https://…/baghjul.mp3`): Spiller automatisk i baggrunden på
   rytterens telefon og på storskærmen — eller på alle telefoner, hvis *Spil sangen på alle
   telefoner* er slået til. Serveren skal tillade CORS, ellers afspilles filen via et almindeligt
   lydelement (virker de fleste steder).
3. **Spotify- eller YouTube-link:** Kan ikke spille i baggrunden, så pop-up'en får en
   *Spil Tour-sangen*-knap, der åbner linket.

Uden sang spiller appen en kort cykelklokke-fanfare. Mens sangen spiller, kan den stoppes med
knappen med de små lydbjælker i toppen.
Browsere spiller først lyd, når man har trykket på siden én gang — på storskærmen er der en
*Slå lyd til*-knap.

## Sådan virker synkroniseringen

Der er ingen server at drive. Telefonerne taler sammen via offentlige **MQTT-brokere** (HiveMQ,
EMQX og Eclipse) over WebSocket, og appen forbinder til alle tre på én gang, så festen fortsætter,
selv hvis én er nede eller blokeret på netværket.

- **End-to-end krypteret:** Eventkoden er hemmeligheden. Broker-emnet er en hash af koden, og alt
  indhold krypteres med AES-GCM med en nøgle afledt af koden (PBKDF2). Koden står kun i linkets
  `#`-del, som browsere aldrig sender til en server — brokerne ser kun krypterede bytes.
- **Konfliktfri data:** Hver spiller skriver kun i sin egen log (drinks, svar, spins …), og logs
  flettes som mængder. Derfor bliver alle telefoner enige, uanset rækkefølge og netværksudfald.
- **Offline først:** Alt gemmes lokalt på telefonen. Drinks registreret uden net sendes, når
  forbindelsen kommer igen, og hvis en broker mister data, genskaber telefonerne det automatisk.
- **Deterministiske breakers:** Alle telefoner beregner selv, hvilket minigame der kommer hvornår
  (ud fra eventkoden), så de popper op samtidig uden en central koordinator.

Vil du have fuld kontrol (anbefalet til store events), så opret en privat broker — fx en gratis
HiveMQ Cloud-cluster eller din egen Mosquitto med WebSocket — og sæt den ind i
[`skaal/js/config.js`](skaal/js/config.js):

```js
brokers: [{ id: 'mine', url: 'wss://<cluster>.hivemq.cloud:8884/mqtt', username: '…', password: '…' }],
```

## Udvid spillet

Appen er bygget, så nye ting kan tilføjes uden at røre resten af koden.

### Ny drik

Tilføj en linje i [`skaal/js/game/drinks.js`](skaal/js/game/drinks.js):

```js
{ id: 'gt', name: 'Gin & tonic', phrase: 'en gin & tonic', plural: 'gin & tonics', emoji: '🍸',
  points: 2, alcoholic: true, color: '#7CC6FF', defaultOn: true },
```

Den dukker op som knap, i stillingen, i statistik og i værtens indstillinger. Vil du have en
tegnet illustration i stedet for emoji, så tilføj en funktion i
[`skaal/js/ui/drinkArt.js`](skaal/js/ui/drinkArt.js).

### Nyt minigame

1. Kopiér fx [`skaal/js/minigames/neverHave.js`](skaal/js/minigames/neverHave.js) til en ny fil.
2. Udfyld `id`, `name`, `emoji`, `tagline`, `duration`, `setup()` (vælger spørgsmål o.l.),
   `resolve()` (hvem drikker / får bonus) og de to visninger `Play` og `Result`.
3. Tilføj den til listen i [`skaal/js/minigames/index.js`](skaal/js/minigames/index.js) — feltet
   for hvert spil er dokumenteret øverst i filen.

Spillet kommer automatisk med i breaker-rotationen, under "Spil" og i værtens indstillinger.

### Tour de France: ansigter og effekter

Navne, tekster og effekter for ansigterne står i [`skaal/js/game/tour.js`](skaal/js/game/tour.js)
(`TOUR_FACES`). En effekt er en liste af log-indslag — `all`, `self`, `pen`, `bon` og så videre — som
i lykkehjulene, og `tourContext()` giver rytterens nærmeste konkurrenter. Tegningerne ligger i
[`skaal/js/ui/tourArt.js`](skaal/js/ui/tourArt.js).

### Mere indhold

Spørgsmål, "Jeg har aldrig…", regler, sandheder og konsekvenser ligger som almindelige lister i
[`skaal/js/game/content/`](skaal/js/game/content/). Tilføj linjer — spillene vælger ubrugte først.

### Nyt lykkehjul eller nye udfald

Se [`skaal/js/game/wheels.js`](skaal/js/game/wheels.js). Et udfald er en tekst plus en effekt
(`give`, `all`, `target`, `self`, `bonus`, `shield`, `owe`, `rule`, `fun`).

## Udvikling

Kræver Node 22+ (kun til udvikling og tests — appen selv kører direkte i browseren).

```bash
npm install          # kun testværktøjer — appen selv har ingen afhængigheder
npm run dev          # lokal server + lokal MQTT-broker → åbn den viste URL i flere faner
npm test             # unit-tests: kryptering, MQTT-protokol, synk, point, minigames, ydelse
npm run test:e2e     # browser-tests: flere "telefoner" spiller et helt event mod en lokal broker
npm run screenshots  # genskaber billederne i docs/screenshots/
```

Lokalt kan appen pege på en anden broker med `?broker=ws://127.0.0.1:9001` (kun på localhost).
`?dev` giver adgang til `window.__skaal` til fejlfinding.

### Struktur

```
skaal/
  index.html, manifest.webmanifest, sw.js   app-skal, PWA og offline-cache
  css/app.css                               design-system og komponenter
  js/config.js                              brokere og spil-konstanter
  js/core/                                  kryptering, id'er, ur, seeded random, storage
  js/sync/                                  MQTT-klient og synkronisering (Room)
  js/game/                                  drinks, indstillinger, point/afledt state, hjul, tidsplan, Tour
  js/minigames/                             ét modul pr. minigame + registry
  js/ui/                                    komponenter, skærme, lyd, grafik
tests/unit, tests/e2e                       automatiske tests
```

## Drik med omtanke

SKÅL er lavet for sjov og fællesskab. Kend din grænse, drik vand undervejs, brug pausefunktionen
frit, og kør aldrig bil efter at have drukket.

## Licenser

Tredjepartskode (Preact, htm, qrcode-generator, Lucide-ikoner, skrifttyperne Inter og Bricolage
Grotesque) er beskrevet i [`skaal/LICENSES.md`](skaal/LICENSES.md).
