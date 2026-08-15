# §176 — MOCAP CROWD: analyse + plan

Referentie: het frame met ~60 puntwolk-dansers rond de orb, wit op rood, handen omhoog,
op het grid, LED-rig erboven. Dat is het einddoel.

## 1. Wat er niet klopt aan de aangeleverde pipeline

De prompt vraagt (§05, §10, §11): per danser een **SkinnedMesh die je niet rendert**, en
daar per frame de **oppervlakte van samplen** om de puntwolk te maken.

Dat werkt voor ÉÉN danser en breekt bij twintig:
- de gedeformeerde vertexpositie bestaat alleen op de GPU. Hem terughalen naar de CPU om
  punten te samplen is een readback per frame per danser — dat is de duurste operatie die
  WebGL kent.
- 300 skeletten = 300 × ~60 botmatrices per frame op de CPU, plus 300 draw calls.
- het is bovendien werk dat elke frame IDENTIEK is: dezelfde clip, dezelfde punten,
  dezelfde 128 frames. Je herberekent 60 keer per seconde iets wat nooit verandert.

## 2. Wat dit project er in plaats daarvan voor heeft

Twee keer eerder is precies dit probleem opgelost: `scripts/bake-land.mjs` en
`scripts/bake-trees.mjs`. **Zwaar werk offline, binair bestand erbij, dom en snel inlezen.**
Het bos is al puntwolken uit echte 3D-modellen. De danser is hetzelfde probleem met één
extra as: tijd.

### VAT — vertex animation texture

Offline (`npm run mocap:bake`):
1. laad de GLB met skeletanimatie
2. sample het lichaamsoppervlak ÉÉN keer → N punten met botgewichten
3. loop over de clip; evalueer per frame het skelet en schrijf de wereldposities weg
4. output: een texture van N breed × F hoog, plus een manifest

Runtime:
- één `InstancedBufferGeometry` van punten, één draw call voor het hele veld
- de vertex shader leest `texture(uPose, vec2(puntId, frame))` — nul CPU-skinning
- **faseverschil per danser is een rij-offset in de texture.** Gratis. Dat is precies wat
  §18 vraagt (dezelfde clip, niet synchroon) en het kost niets.
- **de trail (§15) is ook gratis**: sample frame −2, −4, −8 uit dezelfde texture. Geen
  history-buffer, geen extra state. Fysiek juiste bewegingsnaslag.
- LOD (§21) is een stride over de puntas: 1024 / 256 / 32 punten uit dezelfde data.

Kosten: 1024 punten × 128 frames × RGB16F ≈ 0,8 MB per clip. Vier clips ≈ 3 MB.

## 3. Harde regels die dit erft

- **Dansers staan op de grond.** Zelfde regel als de bomen: voeten op `groundHeightAt()`,
  nooit zwevend. Het terrein beweegt (beam lift, terrainMotion) dus dit is per frame.
- **Kleur komt uit de wereld**, niet uit de danser. Wit/grijs signaal, getint door
  `ZonePalette` — geen eigen palet (§03).
- **Zwart blijft dominant.** De menigte mag de negatieve ruimte niet opvullen (§29 van de
  prompt, §136 van onze AD).
- **§35 geldt niet** — de menigte vervormt het hoogteveld niet, hij leest het alleen.
- Geen backtick in GLSL-commentaar; `half` en `flat` zijn gereserveerd. Zie foutenboek.

## 4. Het voorstel dat dit een FREQUENCY-systeem maakt

De menigte is geen decor dat er altijd staat. **De menigte IS de muziek.**

| verdiende lagen | wat je ziet |
|---|---|
| 0–1 | leeg. Een paar verre stippen op kophoogte, nauwelijks te onderscheiden van ruis |
| 2–3 | losse figuren in de verte, alleen leesbaar als de dome-bundel er langs strijkt |
| 4 | een echte groep op middenafstand, handen komen omhoog op de snare |
| 5+ (ORBIT) | het referentiebeeld: je staat in het midden, de ring draait, iedereen in fase |
| break | ze verdwijnen bijna volledig — het gat in het arrangement is een gat in de menigte |

`CROWD_COHERENCE` (§25) is dan geen losse knop maar leest gewoon `signalDrive.intensity`,
net als het terrein, de post-pass en de UI. Eén bron, vijfde afnemer.

En de dome-koppeling (§27/§28) is het sterkste stuk: `beamStrengthAt()` bestaat al en geeft
per wereldpositie de bundelsterkte. Een danser die niet in de bundel staat is bijna zwart;
de bundel strijkt langs en hij lost op uit het donker. Dat is exact de bestaande
lichtarchitectuur, alleen met mensen erin.

## 5. Volgorde (elke stap heeft een zichtbaar resultaat)

| # | stap | af als |
|---|---|---|
| 1 | mocap-bron kiezen + licentie vastleggen | clip in `assets/mocap/`, licentie in het manifest |
| 2 | `scripts/bake-mocap.mjs` | VAT + manifest op schijf, tests op de bake |
| 3 | `CrowdField.ts` — één danser, VAT-lezende puntshader | één herkenbaar dansend mens in beeld |
| 4 | FREQUENCY-behandeling: flikker, uitval, korrel | leesbaar maar instabiel, ~70% zichtbaar |
| 5 | bewegingsnaslag uit dezelfde VAT | handen en hoofd laten sporen na |
| 6 | instancing + clusters + grondkoppeling | 60 dansers op het terrein, niet in een raster |
| 7 | audio: kick/bass/mid/high op rendering, niet op beweging | de menigte ademt met de track |
| 8 | LOD + veld op afstand | honderden gevoeld, tientallen getekend |
| 9 | dome-koppeling + lagenkoppeling | de tabel hierboven klopt in beeld |
| 10 | meting: fps, frametijd, draw calls, punten | budget gehaald of aantallen bijgesteld |

## 6. Orkestratie

Stap 1–3 doe ik zelf op de hoofdlijn: dat is de risicovolle kern (formaat, retargeting,
shader-conventies) en die wil ik niet blind uitbesteden. Vanaf stap 4 lopen drie sporen
parallel in eigen worktrees — behandeling/naslag, plaatsing/LOD, audio/dome — omdat ze
verschillende bestanden raken. Daarna één merge en één meetronde.

Zie de vragen in de sessie; zonder antwoord op de licentievraag begint stap 1 niet.
