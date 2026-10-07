# 🍻 SKÅL — live drikke-scoreboard med minigames

SKÅL er en web-app til festen: Opret et event, lad vennerne scanne QR-koden, og alle registrerer
øl, shots, drinks og Jägerbombs fra deres egen telefon. Stillingen opdateres live, lykkehjul popper
op, når man tager føringen eller kommer bagud, og breakers (minigames for alle) holder gang i
festen undervejs. Skal I på barrunde, så vælg [pub golf](#pub-golf): hold, en dommer, straf- og
bonusslag og konkurrencer med podie. Og med [kameraet i appen](#fotos-fra-aftenen) tager I billeder
fra aftenen, som kun gæsterne kan se — de dukker op i feedet mellem drinks og lykkehjul.

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
<p>
  <img src="docs/screenshots/20-kamera.jpg" width="190" alt="Kameraet i appen" />
  <img src="docs/screenshots/21-feed-fotos.jpg" width="190" alt="Billeder og kommentarer i feedet mellem drinks" />
  <img src="docs/screenshots/22-fotos.jpg" width="190" alt="Alle aftenens billeder" />
</p>
<p>
  <img src="docs/screenshots/23-billede.jpg" width="190" alt="Et billede i fuld størrelse" />
  <img src="docs/screenshots/24-kommentarer.jpg" width="190" alt="Kommentarer på et billede" />
</p>
<p>
  <img src="docs/screenshots/25-engangskamera.jpg" width="190" alt="Engangskameraet: ingen ser, hvad de tager billeder af" />
  <img src="docs/screenshots/26-fremkaldt.jpg" width="190" alt="Billederne fra engangskameraet fremkaldes for alle et døgn efter" />
</p>
<p>
  <img src="docs/screenshots/14-pubgolf-bane.jpg" width="190" alt="Pub golf: hullet, dine slag og dit hold" />
  <img src="docs/screenshots/15-pubgolf-dommer.jpg" width="190" alt="Pub golf: dommerpanelet" />
  <img src="docs/screenshots/16-pubgolf-stilling.jpg" width="190" alt="Pub golf: holdstillingen" />
</p>
<p>
  <img src="docs/screenshots/17-pubgolf-podie.jpg" width="190" alt="Pub golf: podiet i fotokonkurrencen popper op hos alle" />
  <img src="docs/screenshots/18-pubgolf-fotos.jpg" width="190" alt="Pub golf: fotos, som alle kan se" />
</p>
<p><img src="docs/screenshots/19-pubgolf-storskaerm.jpg" width="780" alt="Pub golf på storskærmen" /></p>

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
- **Fotos fra aftenen** — tag billeder med kameraet direkte i appen. De gemmes kun i eventet,
  alle gæster kan se dem i feedet og på storskærmen, og ingen andre kan — de er krypteret, så
  hverken servere eller fremmede kan se dem, og de kan ikke downloades fra appen. Slå
  **engangskameraet** til, og ingen ser, hvad de tager billeder af: 23 billeder hver, som først
  fremkaldes 24 timer efter. Se [Fotos fra aftenen](#fotos-fra-aftenen).
- **Pub golf** — barerne er hullerne, og slurkene er slagene. Spil i hold med én dommer, der
  noterer slag, giver straf- og bonusslag, sender udfordringer og sætter podiet i konkurrencerne
  (bl.a. en fotokonkurrence). Se [Pub golf](#pub-golf).
- **Straffe og skjolde** — slurke du får tildelt, popper op med hvem de er fra og hvorfor, plus
  "Skål — drukket ✓". Et skjold kan bruges til at slippe, og "Senere" gemmer dem på Drik-fanen.
- **Feed med reaktioner**, **storskærm** (`#/tv/<kode>`) til tv'et, **slutresultat** med podie og
  priser, **pause-tilstand**, lyd og vibration, og installérbar som app (PWA).
- **Overdrag værtsrollen** — går værten tidligt hjem, giver *Mig → Overdrag værtsrollen* en anden
  værtens rettigheder (og værten kan derefter forlade eventet). Det, den tidligere vært gjorde som
  vært — skjulte billeder, startede minigames, afgjorde konkurrencer — gælder stadig.
- **Ansvarlig** — vand tæller med, pause tager dig ud af minigames, og alle straffe er frivillige.
  Efter fire drinks uden vand imellem kommer en stille påmindelse (højst hver 45. minut) med en
  knap, der registrerer et glas vand.

## Kom i gang (GitHub Pages)

1. Gå til repoets **Settings → Pages**.
2. Vælg *Deploy from a branch*, vælg den branch, koden ligger på, og mappen `/ (root)`.
3. Efter et minut ligger appen på `https://<dit-brugernavn>.github.io/Games/skaal/`.
4. Åbn linket på telefonen → **Opret event** → del QR-koden. Tip: "Føj til hjemmeskærm" giver
   app-oplevelsen i fuld skærm.

Alle andre statiske hosts virker også (Netlify, Vercel, Cloudflare Pages …). Appen kræver https,
fordi den krypterer alt.

## Fotos fra aftenen

Tryk på **kameraet** i toppen (eller *Tag et billede* i feedet). Kameraet åbner direkte i appen
med bag- og selfiekamera, blitz, zoom (knib eller tryk på *1×* for 2×) og selvudløser (3 eller 10
sekunder) til gruppebilleder. Skriv en tekst, hvis du vil, og tryk *Del med alle*. Fra
kamerarullen kan du vælge op til 10 billeder ad gangen og dele dem samlet. Vælg **Fotoautomat**
over udløseren, så tager kameraet fire billeder i træk med nedtælling (3-2-1) og samler dem to og
to på ét ark — som en stribe fra en fotoautomat.

- **I feedet:** Billedet dukker op i feedet mellem drinks, førerskifte og lykkehjul, så man kan
  følge aftenen — og alle får en lille besked med en *Se*-knap. Under *Fotos* i feedet ligger alle
  aftenens billeder samlet, og storskærmen viser de nyeste som et lysbilledshow med bløde
  overgange. Tryk på et billede for at se det i fuld størrelse: stryg til siden for det næste,
  dobbelttryk eller knib for at zoome (på en computer: piletaster, dobbeltklik, + / − / 0 og Esc).
  Når værten afslutter eventet, viser slutskærmen *Aftenens billede* — det med flest ❤️.
- **Afspil aftenen:** Under *Fotos* (og på slutskærmen) afspiller *Afspil aftenen* alle billederne
  som et lysbilledshow i den rækkefølge, de blev taget — med klokkeslæt og en bjælke, der viser
  tiden. Hold fingeren på billedet for at holde pause, og stryg for at springe frem eller tilbage.
  Øverst under *Fotos* kan du vælge én persons billeder — så viser, bladrer og afspiller du dem.
  Indtil det første billede er taget, minder storskærmen gæsterne om, at de kan tage billeder.
- **Kommentarer:** Skriv under et billede (💬 i billedet eller i feedet). De nyeste kommentarer står
  under billedet i feedet og på storskærmen, og den, der tog billedet, får besked med en
  *Svar*-knap. Man kan slette sine egne kommentarer, og værten (i pub golf også dommeren) kan skjule
  andres.
- **Tekst bagefter:** Tryk på teksten under dit eget billede (eller *Skriv en tekst …*) for at
  skrive eller rette den — også på billeder fra engangskameraet, når de er fremkaldt.
- **Like, slet og skjul:** Alle kan give et ❤️. Man kan slette sine egne billeder, og værten — i
  pub golf også dommeren — kan skjule andres. Begge dele fjerner billedet fra alles telefoner og fra
  serverne. Under **Mig → Fotos** kan værten slå fotos fra og slette alle aftenens billeder på én
  gang (fx dagen derpå).
- **Uden net:** Et billede taget uden forbindelse står med *Sendes …*, indtil det er ude, og sendes
  af sig selv, når forbindelsen kommer — også hvis appen lukkes imens.
- **Kun for gæsterne:** Billederne krypteres på telefonen med eventets nøgle, før de sendes, og
  ligger kun krypteret på serverne. Kun telefoner med eventets kode kan se dem.
- **Kan ikke downloades:** Appen har ingen download-knap, og billederne vises på en måde, hvor
  browseren ikke tilbyder "Gem billede", langt tryk eller træk. Billeder taget i appen havner ikke
  i telefonens kamerarulle, og GPS-position og andre metadata fjernes, før billedet deles. (Ingen
  app kan forhindre skærmbilleder — men ingen kan hente billedet ud af appen.)
- **Hurtigt og sparsomt:** Hvert billede ligger som en lille miniature og en udgave i fuld
  størrelse, som telefonerne først henter, når billedet kommer frem på skærmen — og det samme
  gælder profilbillederne. Billeder, der er hentet én gang, gemmes (krypteret) på telefonen. Så
  når en telefon vågner og forbinder igen — hvad telefoner gør hele aftenen — skal den ikke hente
  aftenens billeder igen: Med 20 gæster og 80 billeder koster en genforbindelse omkring 250 KB i
  stedet for flere MB.
- **Gemt sikkert:** Billederne ligger på flere servere på én gang. Mister en server dem, lægger
  telefonen, der tog billedet, dem tilbage (den gemmer sin egen kopi — også krypteret). Den holder
  øje med en lille krypteret kvittering ved hvert billede i stedet for at hente billederne igen.
  *Slet eventet* fjerner alle billeder fra serverne, og *Forlad eventet* fjerner telefonens egne
  kopier.

Fotos kræver et event med en kode på 12 tegn (alle nye events). Ældre events med 8 tegn kan stadig
åbnes, men har ikke fotos, fordi deres kode er for kort til at beskytte billeder godt nok.

### Engangskamera

Slå **🎞️ Engangskamera** til, når eventet oprettes (fest eller pub golf), eller når som helst under
**Mig → Fotos**. Så virker kameraet som et engangskamera:

- **I blinde:** Kameraet viser ikke, hvad det ser — man sigter og skyder. Der er ingen zoom, intet
  andet kig på billedet og ingen kamerarulle; billedet deles i samme øjeblik, det tages. Blitz,
  selfiekamera og selvudløser virker som ellers.
- **23 billeder hver:** Tælleren og filmstrimlen viser, hvor mange billeder man har tilbage. Et
  billede, der slettes senere, giver ikke billedet tilbage — filmen er brugt. Alle telefoner holder
  grænsen: Et 24. billede vises aldrig.
- **Fremkaldes efter 24 timer:** Ingen kan se billederne, før de er fremkaldt — heller ikke den,
  der tog dem. Feedet, *Fotos* og storskærmen viser, hvor mange billeder der ligger til
  fremkaldelse, og hvornår det næste er klar. Når et billede fremkaldes, dukker det op i feedet hos
  alle ("Anna fik fremkaldt 5 billeder fra engangskameraet"), og alle får besked.
- **Kan slås fra igen:** Så deles billeder med det samme igen. Billeder, der allerede er taget med
  engangskameraet, fremkaldes stadig 24 timer efter, de blev taget.
- **Pub golf:** Fotokonkurrencen skydes med engangskameraet, og dommeren kårer de bedste, når
  billederne er fremkaldt — også efter runden er afsluttet.

## Pub golf

Vælg **Pub golf** øverst, når du opretter eventet. Hver bar er et hul: Alle drikker hullets drik,
og antallet af slurke er ens slag — som i golf vinder den laveste score.

- **Banen:** 9 huller som standard (op til 18), hver med bar, drik, par (de slurke, drikken bør
  tage) og eventuelt en adresse, der åbner kortet. Tilføj, fjern og ret hullerne, når eventet
  oprettes, eller senere under **Mig → Bane, hold og konkurrencer**.
- **Hold:** Spillerne vælger hold, når de deltager (det mindste hold er foreslået), og kan skifte
  under *Mig*. Værten kan låse holdene, og værten eller dommeren kan blande dem. Holdets score er
  summen af spillernes — eller gennemsnittet, hvis holdene er forskellige store — plus holdets egne
  straf- og bonusslag. Stillingen viser både hold og enkeltspillere.
- **Dommeren:** Der er altid præcis én dommer: værten, indtil værten udpeger en anden under *Mig*.
  Dommeren kan godt spille med på et hold og får et dommerpanel på *Bane* med alles slag på hullet,
  straf og bonus til spillere og hold, *Videre til næste hul* (alle telefoner skifter med) og
  udfordringer. Udpeges en ny dommer, mister den forrige sine rettigheder, men det, vedkommende
  nåede at notere som dommer, står ved magt.
- **Slag:** Spillerne noterer selv deres slurke (kan slås fra), men dommeren har sidste ord: En
  score, dommeren har sat, kan spilleren ikke ændre. *Opgiv hullet* giver par + 4.
- **Straf og bonus:** Strafslag lægges til (fx spildt, toiletbesøg eller drak ikke ud), og bonusslag
  trækkes fra (fx stilpoint eller godt holdspil). Vælg et forslag, eller skriv selv årsag og antal.
- **Underholdning undervejs:** Dommeren trækker en udfordring (eller skriver sin egen), og den
  popper op på alle telefoner og storskærmen. Vinderen kåres direkte fra pop-up'en eller senere
  under *Konkurrencer* og får 1–3 slag i bonus. Minigames fra fest-tilstanden kan også startes der.
- **Konkurrencer med podie:** Fotokonkurrence, bedste outfit, bedste holdsang og bedste holdånd
  som standard; I kan tilføje jeres egne. Dommeren sætter 1.-, 2.- og 3.-pladsen, podiet popper op
  hos alle og står under *Konkurrencer*, og pladserne giver holdet bonusslag (3, 2 og 1 som
  standard, kan ændres).
- **Hemmelige konkurrencer:** Dommeren vælger, om spillerne kan se konkurrencerne på forhånd
  (kontakten øverst under *Konkurrencer*, eller *Hemmelige konkurrencer*, når runden oprettes). Er
  de hemmelige, ser spillerne først en konkurrence, når dommeren trykker *Start* — så popper den op
  på alles telefoner og storskærmen. Dommeren kan også starte konkurrencerne, når de ikke er
  hemmelige, så alle får besked, når det går løs.
- **Fotos:** Billederne fra kameraet i appen (se [Fotos fra aftenen](#fotos-fra-aftenen)) ligger
  også under *Fotos*, med holdets farve. Dommeren sætter fotokonkurrencens podie direkte fra et
  billede i fuld størrelse — eller under *Konkurrencer*. Med [engangskameraet](#engangskamera)
  afgøres fotokonkurrencen, når billederne er fremkaldt, også efter runden.
- **Scorekort og storskærm:** Scorekortet viser alle huller for alle spillere. Storskærmen viser
  hullet, holdene, de bedste spillere, de seneste billeder og konkurrencevinderne, og *Afslut
  runden* fryser stillingen og kårer vinderholdet.

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

- **End-to-end krypteret:** Eventkoden (12 tegn) er hemmeligheden. Både broker-emnet og nøglen
  udledes af koden med én langsom PBKDF2-beregning (600.000 runder), og alt indhold — også
  billederne — krypteres med AES-GCM. Den, der opsnapper de krypterede data fra en offentlig
  broker, skal betale den beregning for hvert gæt; at gætte en kode ville tage omkring en million
  års GPU-tid. Koden står kun i linkets `#`-del, som browsere aldrig sender til en server —
  brokerne ser kun krypterede bytes. (Ældre events med 8 tegn bruger den oprindelige, hurtigere
  udledning og har derfor ikke fotos.)
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

### Pub golf: udfordringer, straffe og konkurrencer

Standardbanen (drik og par pr. hul), forslagene til straf og bonus, udfordringerne og
standardkonkurrencerne er almindelige lister øverst i
[`skaal/js/game/pubgolf.js`](skaal/js/game/pubgolf.js) (`COURSE_TEMPLATE`, `PENALTIES`, `BONUSES`,
`CHALLENGES` og `DEFAULT_COMPS`). Skærmene ligger i [`skaal/js/ui/pubgolf/`](skaal/js/ui/pubgolf/).

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
npm test             # unit-tests: kryptering, MQTT-protokol, synk, fotos, point, minigames, pub golf, ydelse
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
  js/app/                                   handlinger, sessionen og fotos (tag, gem, hent)
  js/game/                                  drinks, indstillinger, point/afledt state, hjul, tidsplan,
                                            Tour, pub golf, fotos
  js/minigames/                             ét modul pr. minigame + registry
  js/ui/                                    komponenter, skærme, lyd, grafik (pub golf i js/ui/pubgolf/,
                                            kamera og billedfremviser i js/ui/photos/)
tests/unit, tests/e2e                       automatiske tests
```

## Drik med omtanke

SKÅL er lavet for sjov og fællesskab. Kend din grænse, drik vand undervejs, brug pausefunktionen
frit, og kør aldrig bil efter at have drukket.

## Licenser

Tredjepartskode (Preact, htm, qrcode-generator, Lucide-ikoner, skrifttyperne Inter og Bricolage
Grotesque) er beskrevet i [`skaal/LICENSES.md`](skaal/LICENSES.md).
