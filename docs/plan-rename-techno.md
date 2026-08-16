# Plan — `techno` hernoemen naar een wereldnaam

Onderzoeksdocument. **Er is geen code gewijzigd.** Dit is de inventarisatie, de
naamvoorstellen, het migratieplan en de risico's; de uitvoering is één aparte slag.

---

## 1. Inventarisatie

Totaal: **392 treffers op `techno` (case-insensitive) in 66 bestanden**
(`src/` 122 · `tests/` 181 · docs+scripts+public 89). Het `glEEWaFw5RDheBD-lgnRD/ssr/`-
mapje is een build/cache-artefact en telt niet mee.

Er zijn twee verschillende naamruimtes die allebei het woord dragen. Ze moeten
uit elkaar gehouden worden, anders wordt de klus twee keer zo groot als nodig:

- **A. de WERELD** — waarde van `TrackGenre` / `ActiveWorldGenre`, sleutel in alle
  wereld-tabellen. Dit is wat hernoemd moet worden.
- **B. een KLANK** — `hatStyle: 'techno'`, de textuur-naam in `StrudelEngine`,
  laag-id's als `techno-machine-room`. Dit zijn geen werelden maar drumstijl- en
  laagnamen die toevallig hetzelfde woord gebruiken.

### A1 — het type zelf (de bron van waarheid)

| Bestand | Wat |
|---|---|
| `src/music/MusicState.ts:36-49` | `GenreAffinity.techno` + **`GENRE_NAMES`** — de lijst waar alle validatie uit leest |
| `src/music/TrackState.ts:26-33` | `TrackGenre` union |
| `src/genres/ActiveWorlds.ts:3-6` | `ACTIVE_WORLD_GENRES` + `isActiveWorldGenre` |

Drie afzonderlijke literals voor dezelfde zes namen. Dat is nu al bijna een tweede
bron van waarheid (§56) — zie risico R4.

### A2 — tabellen met `techno` als sleutel

| Bestand | Regel(s) | Tabel |
|---|---|---|
| `src/music/GenreLadder.ts` | 72 (+ const `TECHNO`, 80) | `GENRE_CURVES`, en `curveFor()` valt bij `null` terug op `TECHNO` |
| `src/music/TrackForm.ts` | 49 | `WORLD_PACE` |
| `src/rendering/ForestEcology.ts` | 111 | `ECOLOGIES.techno` → `name: 'MACHINE FOREST'` |
| `src/genres/ZonePalette.ts` | 47 | kleur/relief/haze (rood, relief 0.85) |
| `src/genres/GenreZones.ts` | 96, 125 | `SECTORS` (compasvolgorde) + nul-affinity |
| `src/genres/GenreAffinityEngine.ts` | 32, 46, 81 | nul-record, `BEHAVIOURAL`-set, `scoreTechno()` |
| `src/music/FlightExport.ts` | 53 | `ZERO_AFFINITY` |
| `src/rendering/domeScanner.ts` | 92, 142 | scan-rate-tabel + `'quarters'` |
| `src/audio/MusicalPrimitives.ts` | 149, 282, 308, 574, 880, 1176-1194 | `GRAMMARS`, `PROGRESSIONS`, drumbank/`hatStyle`, laag-id's |
| `src/audio/WorldLayerGraph.ts` | 40 | `if (track.genre === 'techno') → buildTechnoGraph` |
| `src/app/Game.ts` | 873, 876 | `genre?.affinity.techno` stuurt `setOrganization` en `setAtmosphere` |
| `src/lab/genreLabWorlds.ts` | 4, 9, 21-22 | lab-presets + `isTrackGenrePreset` |
| `src/lab/genreLab.ts` | 62, 113 | nul-record + default-preset |

### A3 — aparte bestanden/symbolen met de naam erin

| Bestand | Symbolen |
|---|---|
| `src/audio/TechnoPreset.ts` (253 r.) | `buildTechnoGraph`, `TechnoPresetControls` |
| `src/genres/TechnoProfile.ts` (57 r.) | `scoreTechno`, `TECHNO_WEIGHTS`, `TechnoProfileWeights` |

### A4 — zichtbare tekst

Alle zichtbare tekst wordt **direct uit de code-sleutel afgeleid**; er is nergens
een aparte labeltabel. Hernoemen verandert dus meteen wat de speler leest:

- `src/genres/ZonePalette.ts` → `placeName(region) { return region ?? 'the void' }`
  → HUD `here:   techno` (`src/ui/HUD.ts:63`)
- `headingLabel()` → HUD `flying: N · techno`
- `src/ui/ScoreHeader.ts:62,89` → `(track.genre ?? 'the void').toUpperCase()` in de kopregel
- `src/music/FlightExport.ts:168` → `// TECHNO — 132 bpm` bovenaan de geëxporteerde Strudel-code

Let op: `ForestEcology.name` ('MACHINE FOREST') is een tweede, mooiere naam die
alléén in de bosdata staat en nergens in de HUD komt.

### A5 — gebakken data (public/ + scripts/)

- `scripts/bake-trees.mjs:56` → `world: 'techno'`, soort-id's `techno-sapling|half|full`
- `public/trees/trees.json` → 6 treffers (3 × `"world":"techno"`, 3 × id)
- `public/trees/techno-{sapling,half,full}.bin` → 3 binaire bestanden

`ForestRenderer.loadTreeSpecies()` matcht `species.world` tegen de genre-sleutel en
zegt in zijn eigen commentaar: *"Null is a valid world: no trees."* Een niet-gematchte
wereld verliest dus **stil** zijn bos.

### A6 — persistentie (het grootste risico)

- `src/persistence/WorldSerializer.ts:9` → `SCHEMA_VERSION = 4`
- `:236` → `genre: isActiveWorldGenre(r.genre) ? r.genre : null`
- `:174` → `techno: num(a.techno, 0, 0, 1)` in `genreSnapshot`
- `:181` → `dominant: isActiveWorldGenre(raw.dominant) ? raw.dominant : null`
- `:269` → `genresSeen: strings(...)` — vrije strings, geen validatie
- `src/persistence/migrations.ts` → registry met 1→2, 2→3, 3→4; `migrate()` weigert
  een versie waarvoor geen stap bestaat (geen stille sprong — goed)
- `src/persistence/SaveManager.ts:86` → enige aanroeper van `migrate()`

### A7 — tests

**26 testbestanden, 181 treffers.** Zwaartepunten: `zonePalette` (25), `worldTravel` (17),
`trackDna` (17), `technoProfile` (14, bestandsnaam!), `genreGrammar` (12), `trackDepth` (11),
`trackForm` (10). Verder: `forestEcology`, `audioChain.integration`, `trackBuilder`,
`layerBeacons`, `genreZonesArrangement`, `domeScanner`, `genreLab`, `flightExport`,
`everyVoiceSounds`, `everyWorldBuilds`, `activeWorlds`, `forestGrounded`, `forestSpread`,
`scoreHeader`, `codeSections`, `audibilityFloor`, `noArrangementMasks`, `worldArrival`,
`worldSerializer`.

### A8 — docs en spec

- `FREQUENCY_GAME_BUILD_SPEC.md` — 25 treffers (o.a. §297 affinity-shape, §1235 HUD-voorbeeld
  `N · techno`, §1318 bostabel, §1802 grammaticatabel, §1919 dome-scan)
- `FREQUENCY_ALL_GENRES_STRUDEL.md` (2) · `GENRE_TEST_PATTERNS.md` (1)
- `docs/TRACK-MODEL.md` (2) · `docs/plan-house-mocap.md` (1)
- `docs/plans/2026-08-12-*` (4 bestanden, 50 treffers) — **historische plannen, niet aanraken**

---

## 2. Naamvoorstellen

Toon van de buren: `sub-pressure`, `heavy-signal`, `broken-machine`, `percussion-riot`,
`void-crusher` — allemaal *kwaliteit/materiaal + ding*, twee woorden, kebab-case.
Deze wereld: rood, TR909, 4/4 met de hardste drive, hoogste reliëf, perfect rechte
pilaren, structuren die naar een RASTER toe snappen (`StructureRenderer` §9.1),
en de referentiecurve waar de andere vijf tegen afgelezen worden.

| # | Naam | Sleutel | Waarom |
|---|---|---|---|
| 1 | **IRON GRID** | `iron-grid` | Het raster is hier letterlijk code: dit is de enige wereld waarvan de structuren naar rasterlijnen toe lerpen, met perfect rechte pilaren en rood ijzer eromheen. |
| 2 | STRAIGHT DRIVE | `straight-drive` | Zegt de muzikale én de visuele waarheid in één: de rechtste 4/4 met de hardste drive, en de rechtste bomen. |
| 3 | FULL CURRENT | `full-current` | "Nothing is hurried and nothing is withheld" — de wereld die alles tegelijk geeft, en stroom is meteen het rood en de machine. |
| 4 | FIRST MACHINE | `first-machine` | Dit is de referentiewereld waar de andere vijf tegen gelezen worden, en `broken-machine` wordt daarmee hoorbaar zijn kapotte broer. |
| 5 | HARD PULSE | `hard-pulse` | De metronoomwereld: de puls is het onderwerp, niet de versiering. |
| 6 | RED ENGINE | `red-engine` | Kleur plus motor; sluit aan op het 'machine room'-vocabulaire dat `MusicalPrimitives` al gebruikt. |
| 7 | STEEL DRIVE | `steel-drive` | Materiaal + drive, exact het rijm van `void-crusher`. |

**Mijn favoriet: `iron-grid`.** Het is de enige naam die iets benoemt wat alleen
in déze wereld waar is en ook echt in de code staat (de rasterorganisatie van
structuren, de rechte pilaren), het is grammaticaal identiek aan de vijf buren, en
het botst niet met `broken-machine`. Nummer 4 (`first-machine`) is inhoudelijk het
sterkst maar leest te dicht op `broken-machine` — in een `switch` of een save is
één woord verschil te weinig. `straight-drive` is de veilige tweede keus.

Hieronder heet de nieuwe sleutel `<new>`; vervang door de gekozen naam.

---

## 3. Migratieplan

### Fase 0 — afbakening (eerst beslissen, kost niets)

Beslis expliciet dat naamruimte **B** (`hatStyle: 'techno'`, de textuurnaam in
`StrudelEngine:330`, laag-id's `techno-machine-room` / `techno-machine-rise`)
**mee gaat of niet**. Aanbeveling: **wel mee, maar in een tweede commit**. De HUD
en de export tonen laag-id's; als die `techno-` blijven heten, is het woord niet
weg. De drumstijl `hatStyle` is een eigen union met eigen `case`-takken en eigen
tests, dus dat is een aparte, kleine slag met eigen groene testrun.

### Fase 1 — de bron van waarheid (één commit, breekt de build tot fase 3 klaar is)

1. `src/music/MusicState.ts` — `GenreAffinity` sleutel + `GENRE_NAMES`
2. `src/music/TrackState.ts` — `TrackGenre` union
3. `src/genres/ActiveWorlds.ts` — `ACTIVE_WORLD_GENRES`

Laat `tsc` daarna de rest aanwijzen: elke `Record<Exclude<TrackGenre, null>, X>`
wordt nu een compilerfout. Dat is de goedkoopste checklist die er is — werk hem af
in plaats van te grep-vervangen.

### Fase 2 — de tabellen (volg de compiler)

`GenreLadder` (incl. const `TECHNO` → `IRON_GRID` en de `null`-terugval in `curveFor`) ·
`TrackForm` · `ForestEcology` · `ZonePalette` · `GenreZones` · `GenreAffinityEngine` ·
`FlightExport` · `domeScanner` · `MusicalPrimitives` · `WorldLayerGraph` ·
`Game.ts:873,876` · `lab/genreLabWorlds.ts` · `lab/genreLab.ts` ·
`StructureRenderer`/`DomeLights` (alleen commentaar).

### Fase 3 — bestands- en symboolhernoemingen

- `src/genres/TechnoProfile.ts` → `IronGridProfile.ts`; `scoreTechno` → `scoreIronGrid`,
  `TECHNO_WEIGHTS` → `IRON_GRID_WEIGHTS`, `TechnoProfileWeights` → `IronGridProfileWeights`
- `src/audio/TechnoPreset.ts` → `IronGridPreset.ts`; `buildTechnoGraph` → `buildIronGridGraph`,
  `TechnoPresetControls` → `IronGridPresetControls`
- Gebruik `git mv` zodat de geschiedenis van beide bestanden blijft staan.

### Fase 4 — gebakken data (NIET met de hand)

1. `scripts/bake-trees.mjs:56` — `world` en de drie soort-id's
2. `npm run trees:bake` draaien
3. `git rm public/trees/techno-{sapling,half,full}.bin` — de oude blobs worden
   niet overschreven, alleen niet meer geproduceerd, dus ze blijven anders liggen
4. Controleren dat `public/trees/trees.json` nu drie `<new>-*`-soorten heeft

### Fase 5 — de save-migratie (de kern)

**`SCHEMA_VERSION` 4 → 5** in `WorldSerializer.ts:9`, en in `migrations.ts` een stap
`4:` die vier plekken herschrijft:

| Pad in de save | Type | Wat er moet gebeuren |
|---|---|---|
| `trackState.genre` | `string \| null` | `'techno'` → `'<new>'` |
| `genreHistory[].affinity.techno` | objectsleutel | sleutel hernoemen, waarde behouden |
| `genreHistory[].dominant` | `string \| null` | `'techno'` → `'<new>'` |
| `progression.genresSeen[]` | `string[]` | elk element `'techno'` → `'<new>'` |

De stap moet dezelfde vorm hebben als de bestaande stappen: puur, nooit gooiend,
defensief tegen ontbrekende/verkeerd getypeerde velden (`genreHistory` kan geen array zijn).

Plaats: **alleen** `migrations.ts` mag de oude naam nog kennen. Zet er een
commentaarregel bij die dat vastlegt, zodat de string later niet "opgeruimd" wordt.

### Fase 6 — tests

- `tests/unit/technoProfile.test.ts` → hernoemen naar `ironGridProfile.test.ts` (`git mv`)
- De 26 bestaande testbestanden meenemen (zie A7)
- **Nieuw, in `tests/unit/migrations.test.ts`** (of het bestaande equivalent):
  een v4-save met `"techno"` in alle vier de velden → na `migrate()` staat overal
  `<new>` en is `schemaVersion` 5
- **Nieuw, regressie**: een v4-save met `"techno"` mag na migratie + `validate()`
  géén `genre: null` opleveren. Dit is precies de fout die het plan voorkomt.
- **Nieuw, hygiëne**: een test die de repo scant en faalt als `techno` nog ergens in
  `src/` staat, behalve in `migrations.ts`. Voorkomt dat de oude naam terugsluipt.
- Volledige suite draaien; verwacht ~804 tests groen.

### Fase 7 — docs en spec

`FREQUENCY_GAME_BUILD_SPEC.md` (25), `FREQUENCY_ALL_GENRES_STRUDEL.md`,
`GENRE_TEST_PATTERNS.md`, `docs/TRACK-MODEL.md`, `docs/plan-house-mocap.md`.
**`docs/plans/2026-08-12-*` met rust laten** — dat zijn afgesloten historische plannen;
die herschrijven vervalst het verslag.

Voeg een nieuw amendement toe dat de hernoeming vastlegt, met de oude naam erin
genoemd, zodat de spec de enige plek buiten `migrations.ts` is waar `techno` nog staat.

---

## 4. Risico's

**R1 — de save valt stil terug (grootste risico).**
`WorldSerializer:236` doet `isActiveWorldGenre(r.genre) ? r.genre : null`. Een
bestaande save met `"techno"` wordt zonder migratie **niet afgekeurd** maar stil
op `null` gezet: de speler komt terug in de neutrale void, met een track die zijn
grammatica kwijt is. Hetzelfde geldt voor `genreSnapshot` (`affinity.techno` → 0)
en `dominant` (→ null). Geen foutmelding, geen log. Daarom is de migratie in fase 5
**verplicht**, niet optioneel.

**R2 — het bos verdwijnt stil.**
`ForestRenderer.loadTreeSpecies()` matcht op `species.world` en behandelt "geen
match" als geldig ("Null is a valid world: no trees"). Als fase 4 wordt overgeslagen
staat de machinewereld leeg zonder dat iets klaagt. Zet dit in dezelfde commit als
fase 1-3.

**R3 — stille defaults in de code.**
`curveFor()` valt bij `null` terug op de `TECHNO`-curve, en
`PROGRESSIONS[genre ?? 'techno']` (`MusicalPrimitives:308`) doet hetzelfde met
akkoorden. Dat zijn bedoelde neutrale-void-terugvallen, geen fouten — maar ze
maken een verkeerd gespelde genre-naam onzichtbaar. Bij het hernoemen: laat ze
door de compiler afdwingen (`Exclude<TrackGenre, null>`), en verzin nergens een
nieuwe `?? '<new>'` op een string die van buiten komt.

**R4 — drie lijsten voor één waarheid (§56).**
De zes namen staan nu drie keer los: `GenreAffinity`-sleutels, `GENRE_NAMES`, en
`ACTIVE_WORLD_GENRES`. Ze kunnen uit elkaar lopen. Dit is het natuurlijke moment
om `GENRE_NAMES` af te leiden uit `ACTIVE_WORLD_GENRES` (of andersom) zodat er één
literal overblijft — maar doe dat **in een aparte commit vóór de hernoeming**, niet
tegelijk, anders is niet meer te zien welke wijziging welk gevolg had.

**R5 — twee naamruimtes door elkaar.**
Een blinde `sed -i s/techno/<new>/g` raakt ook `hatStyle`, de textuurnaam en de
laag-id's, plus 50 treffers in afgesloten plandocumenten. Doe het per fase en laat
de compiler leiden.

**R6 — botsende werkkopie.**
`GenreLadder.ts`, `TrackBuilder.ts`, `ScoreHeader.ts`, `LayerBeacons.ts` en `Game.ts`
zijn op dit moment in bewerking. Fase 1-2 raken `GenreLadder.ts`, `Game.ts` en
(via de zichtbare tekst) `ScoreHeader.ts`. Voer de hernoeming pas uit als dat werk
is vastgelegd.

**R7 — de naam staat in geëxporteerde tracks.**
`FlightExport` schrijft `// TECHNO — 132 bpm` in de Strudel-code die spelers
opslaan of delen. Al geëxporteerde bestanden blijven de oude naam dragen. Dat is
geen bug, maar wel iets om te weten voordat iemand vraagt waarom oude exports
anders heten.
