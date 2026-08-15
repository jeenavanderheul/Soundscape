# Onderzoek: ImperialDance-Dataset als bron voor de dansende menigte

Datum van onderzoek en verificatie: **2026-08-15**.
Onderzocht op verzoek: kan <https://github.com/YunZhongNikki/ImperialDance-Dataset>
de menigte in FREQUENCY laten dansen, met club/rave-materiaal (geen ballet)?

**Uitkomst in één zin: NEE — de dataset heeft geen enkele licentie, dus er is geen
gebruiksrecht verleend; bovendien past het dataformaat niet op onze BVH-pijplijn.**

---

## 1. Licentie — de poort

### 1.1 Er is geen licentie. Punt.

De repository bevat **geen LICENSE-bestand**. GitHub's eigen licentiedetectie geeft
`null`:

```
$ gh repo view YunZhongNikki/ImperialDance-Dataset --json licenseInfo
{"licenseInfo": null, ...}
```

De volledige inhoud van de repo is vier bestanden — er is geen juridische tekst,
geen EULA, geen terms-of-use:

```
$ gh api repos/YunZhongNikki/ImperialDance-Dataset/contents
README.md
dataset_sample.png
new_frameworkk_large-1.png
new_frameworkk_large.pdf
```

De README (bron: <https://github.com/YunZhongNikki/ImperialDance-Dataset/blob/main/README.md>,
opgehaald 2026-08-15) bevat **nul** woorden over licentie, gebruiksvoorwaarden,
commercieel gebruik of afgeleide werken. De enige juridisch relevante zin is een
verzoek om te citeren:

> ## Citation
> ```
> @inproceedings{zhong2024dancemvp, ... }
> ```

Ook de datasetpagina zelf is er niet: de download is een kale Google Drive-map
(<https://drive.google.com/drive/folders/1kSndi7ZIljpue_EzYXOpxZenHi52nujL>) zonder
formulier, zonder aanvaardingsstap, zonder voorwaarden.

De AAAI-paperpagina (<https://ojs.aaai.org/index.php/AAAI/article/view/28893>,
opgehaald 2026-08-15) draagt alleen de standaard voettekst:

> Copyright © 2024, Association for the Advancement of Artificial Intelligence

Dat is de copyright op het *artikel*, niet een licentie op de *data*.

### 1.2 Wat "geen licentie" betekent

Geen licentie is niet hetzelfde als vrij. Onder auteursrecht (en onder GitHub's
eigen Terms of Service, sectie D.5–D.7) geldt: zonder expliciete licentie behouden
de makers **alle rechten**. Je krijgt het recht om de repo te bekijken en te forken
binnen GitHub, en verder niets. Geen recht op reproductie, geen recht op
distributie, en met name **geen recht om afgeleide werken te maken**.

Een VAT-bake is onmiskenbaar een afgeleid werk: `scripts/bake-mocap.mjs` neemt de
brondata, sampleert die en herpubliceert het resultaat als `public/mocap/*.vat` in
een gedistribueerde webapplicatie. Dat is precies het recht dat hier niet verleend
is.

Dit is juridisch **slechter** dan CC-BY-NC of research-only. Bij een non-commercial
licentie weet je tenminste waar je aan toe bent en kun je om toestemming vragen op
basis van bekende voorwaarden. Hier is er niets om je op te beroepen.

### 1.3 Twee extra lagen die het ook bij toestemming problematisch houden

Zelfs als de auteurs morgen een CC0 op de repo zetten, blijven er twee lagen liggen
die zíj niet kunnen weggeven:

**(a) De choreografieën zijn andermans werk.** De README noemt per clip de exacte
bron waarvan de choreografie is nagedanst — YouTube- en Bilibili-ID's van
commerciële muziekvideo's, inclusief tijdcodes. Voorbeelden uit de README:

> K-Pop Choreography 0 (k_ch0): Youtube ID: WhHEQ-W3x5Y, music/choreography from 0:40 to 0:55.
> Urban Choreography 0 (u_ch0): Youtube ID: 96Xd1lzbfLk, music/choreography from 0:40 to 0:55.
> Hip-Hop Choreography 0 (h_ch0): Bilibili ID: BV1sa411F7JZ - 《time goes by》, from 0:00 to 0:15.

Choreografie is in het VK (waar Imperial College zit), de VS en de EU een zelfstandig
beschermd werk. De mocap is een vastlegging van andermans beschermde choreografie.
De dataset-auteurs hebben die rechten niet en kunnen ze dus niet doorgeven. Precies
de clips die voor ons interessant zouden zijn (hiphop, urban, K-pop) zijn de clips
met de sterkste externe rechtenclaim, omdat ze het meest herkenbaar en het meest
recent commercieel zijn.

**(b) Persoonsgegevens.** Het gaat om OptiTrack-opnames van vijf met naam
onderscheiden proefpersonen op drie vaardigheidsniveaus, verzameld voor
wetenschappelijk onderzoek. Er is geen publieke toestemmingsverklaring die
commerciële herpublicatie van hun bewegingsdata dekt. Onder de AVG is
bewegingsdata van identificeerbare personen persoonsgegeven, en
onderzoeksgrondslag dekt geen commercieel product.

### 1.4 Conclusie van de poort

**De poort is dicht.** De rest van dit document is vergelijkingsmateriaal, geen
implementatieplan.

---

## 2. Wat zit er werkelijk in (voor de volledigheid)

Alles hieronder komt uit de README; er is niets gedownload, conform de opdracht om
niets binnen te halen voordat de licentie duidelijk is.

| Eigenschap | ImperialDance | Onze huidige CMU-bron |
|---|---|---|
| Formaat | NumPy `.npy` arrays | BVH (cgspeed-conversie) |
| Datatype | **3D-posities** per gewricht | **rotaties** + hiërarchie + offsets |
| Skelet | 21 OptiTrack-segmenten, **platte lijst zonder hiërarchie** | 38 joints, echte boomstructuur |
| Framerate | 100 fps | 120 fps |
| Cliplengte | exact 10 s, genormaliseerd | 9–18 s |
| Omvang op papier | 69.300 s | 5 clips |
| In de repo? | **Nee** — Google Drive-link | ja, in `assets/mocap/` |

Arrayvorm per bestand, letterlijk uit de README:

> the format of the array is (100,3,1000,21) (samples, coordinates, 10seconds*100fps, joints)

De 21 segmentnamen, letterlijk uit de README:

> Skeleton_Name = [RShin, RToe, RThigh, LThigh, LFoot, RShoulder, LHand, RHand,
> LFArm, LShoulder, RFoot, Neck, LShin, Chest, Head, LToe, Ab, RUArm, LUArm, Hip, RFArm]

### 2.1 De 69.300 seconden zijn misleidend

Dit is de belangrijkste inhoudelijke observatie. De dataset bevat **100 herhalingen
van dezelfde choreografie** per (genre, choreografie, niveau). De README is daar
open over en presenteert het als een feature:

> we provide 100 repeating samples for each class (per music, genre, choreography, and expertise level)

Het unieke bewegingsmateriaal is dus niet 69.300 seconden, maar:

**20 choreografieën × ~10–20 s ≈ 5 minuten totaal.**

Voor een menigte die er gevarieerd uit moet zien is herhaling van dezelfde
choreografie waardeloos — sterker nog, het is het tegenovergestelde van wat we nodig
hebben. De dataset is ontworpen om *verschillen in uitvoeringskwaliteit van dezelfde
pasjes* te meten, niet om bewegingsvariatie te leveren.

---

## 3. Welke stijlen zouden bruikbaar zijn

Vijf genres, met per genre het aantal unieke choreografieën uit de README:

| Genre | Choreografieën | Clubwereld? |
|---|---|---|
| Ballet | 5 (b_ch0–ch4) | **nee** — expliciet afgewezen door user |
| K-pop | 5 (k_ch0–ch4) | nee — strak unisono podiumwerk |
| Jazz | 4 (j_ch0–ch3) | nee — podiumjazz, niet vintage/lindy |
| **Hip-Hop** | **2** (h_ch0–ch1) | ja, in principe |
| **Urban** | **4** (u_ch0–ch3) | ja, in principe |

Het bruikbare deel is dus **6 van de 20 choreografieën**, samen ongeveer
**anderhalve minuut** uniek materiaal.

En zelfs dat is niet wat we zoeken. Het zijn allemaal **aangeleerde, uitgeschreven
choreografieën die synchroon op één specifieke track worden uitgevoerd**, inclusief
uitvoeringen door beginners die de pasjes verkeerd doen. Dat is podiumdans in een
studio, geen freeform clubdans. Een menigte in FREQUENCY moet er losjes en
individueel uitzien; een veld van dansers die allemaal exact dezelfde aangeleerde
K-pop-routine doen leest als een videoclip, niet als een rave. Ook geen enkele clip
bevat popping, locking, krumping, house of breaking als losse stijl.

De dataset bevat geen enkele opname met meerdere personen tegelijk — alle sequenties
zijn solo.

---

## 4. Pijplijn-analyse: wat zou het kosten

Ook los van de licentie is de mismatch structureel, niet cosmetisch.

`scripts/bake-mocap.mjs` (764 regels) verwacht harde eigenschappen die ImperialDance
geen van alle heeft:

1. Het parst een `HIERARCHY`-blok en bouwt een ouder-kindboom
   (`if (next() !== 'HIERARCHY') throw ...`).
2. Het leest **rotatiekanalen** per joint en doet forward kinematics
   (`function ... world matrix per joint`).
3. Het bouwt botten uit **parent→child offsets** met een vaste botlengte:
   `bones.push({ joint: j, offset, length, ...info })`.
4. Het herkent lichaamsdelen aan **CMU-naamconventies** — de code zoekt letterlijk
   naar `'LeftArm'` (`clip.joints.findIndex((j) => j.name === 'LeftArm')`) en
   classificeert regio's op naam.

ImperialDance levert alleen puntenwolken van 21 posities per frame. Om dat door onze
bake te krijgen is nodig:

- **Hiërarchie verzinnen.** De 21 segmentnamen zijn OptiTrack-bonesegmenten zonder
  gepubliceerde ouder-kindrelatie. Die moet je zelf afleiden en valideren.
- **Botlengtes afleiden en stabiliseren.** Uit posities alleen; met marker-ruis
  variëren die per frame, dus je moet middelen en dan afdwingen.
- **Rotaties reconstrueren via inverse kinematics.** Dit is de dure stap: van
  wereldposities naar stabiele lokale Euler-rotaties per frame, zonder flippen of
  jitter. Dit is een op zichzelf staand project, geen scriptje.
- **Hernoemen naar CMU-conventie**, inclusief de ontbrekende joints. Er is geen
  aparte pols, geen aparte enkel, geen spine-keten (alleen `Ab`, `Chest`, `Neck`,
  `Head`), en geen linker/rechter heup. Het skelet is grover dan onze 38 joints;
  onze botclassificatie en regio-indeling zouden armer worden, niet rijker.
- **Resamplen van 100 fps naar onze 128-frames-op-4,3-s bake.**

Eerlijke schatting: dit is **dagen werk aan een IK-solver plus afstelling**, met een
reële kans dat het resultaat er slechter uitziet dan de huidige CMU-clips omdat je
met 21 grove posities een armer skelet reconstrueert dan de 38 joints die we nu al
hebben. En dat alles voor anderhalve minuut aan podiumchoreografie waar we geen recht
op hebben.

---

## 5. Vergelijking met wat we nu hebben

Nu in `assets/mocap/`: vijf CMU-clips (05-02, 05-12, 143-35, 49-09, 55-02), 38 joints,
gebakken naar 2048 punten × 128 frames per clip.

Wat ImperialDance zou **toevoegen**: eerlijk gezegd bijna niets.

- **Variatie**: negatief. 100× herhaling van dezelfde routine; 6 bruikbare unieke
  choreografieën.
- **Echte clubdans**: nee. Het is aangeleerde studiochoreografie op één track.
- **Langere clips**: nee. 10 s, korter dan wat we al hebben.
- **Meerdere personen tegelijk**: nee. Uitsluitend solo.
- **Skeletkwaliteit**: negatief. 21 posities tegenover 38 joints met rotaties.

De enige echte winst zou "het is expliciet als dans opgenomen" zijn, en juist die
winst is elders goedkoper en legaal te halen.

---

## 6. Aanbeveling

**Niet gebruiken. Niet downloaden. Niet bakken.**

De reden is in de eerste plaats juridisch: er is geen licentie, dus er is geen
gebruiksrecht, en een VAT-bake is precies het afgeleide werk waarvoor toestemming
ontbreekt. Dit project heeft in `assets/mocap/LICENSE.md` een bewijsstandaard gezet
waarbij elk bestand een letterlijk geciteerde, commercieel toegestane herkomst heeft.
ImperialDance haalt die standaard niet en kan die ook niet halen, omdat de
onderliggende choreografieën van derden zijn.

Zelfs als de licentie morgen goed geregeld werd, zou ik het nog steeds afraden: het
materiaal is podiumchoreografie in plaats van clubdans, het unieke bewegingsmateriaal
is anderhalve minuut, en de dataconversie kost dagen IK-werk om een armer skelet op
te leveren dan we nu al hebben.

### 6.1 Alternatieven

Ik heb drie voor de hand liggende alternatieven op licentie gecontroleerd. Twee
vallen om dezelfde reden af — noteer ze zodat ze niet nog eens onderzocht worden:

- **AIST++ / AIST Dance DB** — 1.408 dansmotion-sequenties, 10 streetdance-genres,
  precies wat we zoeken qua inhoud. Maar de onderliggende database is
  academisch-only. Bron: <https://aistdancedb.ongaaccel.jp/terms_of_use/>, letterlijk:
  > AIST Dance DB may not be used for any purpose other than academic research. …
  > Use for commercial purposes is not permitted without prior written consent from AIST.
  > Unauthorized redistribution of any content of the database is prohibited.

  **Afgevallen** (tenzij iemand AIST aanschrijft en schriftelijke toestemming krijgt).

- **Motorica Dance Dataset** — technisch de perfecte match: 6 uur mocap, **BVH**,
  120 fps, alles geretarget naar één skelet, en de stijlen zijn exact clubdans
  (krumping, hiphop, popping, casual dancing). Maar bron:
  <https://github.com/simonalexanderson/MotoricaDanceDataset>, sectie TERMS OF USE:
  > Use for commercial purposes is not permitted without prior written consent. This
  > includes, without limitation, incorporation in a commercial product…

  **Afgevallen als het commercieel wordt** — maar dit is de enige waar het aanschrijven
  van de rechthebbende (simonal@kth.se) de moeite waard is, omdat het formaat al klopt
  en er geen conversiewerk overblijft.

Twee die **wel** deugen en waar ik mee verder zou gaan:

**(A) CMU zelf — de goedkoopste, meest zekere winst.** We gebruiken 5 clips uit een
database die 109 subjects telt en die we juridisch al hebben afgedekt in
`assets/mocap/LICENSE.md`. Er staat aanzienlijk meer dansmateriaal in dan we
gebruiken. Uit de subjectindex (<http://mocap.cs.cmu.edu/subjects.php>, opgehaald
2026-08-15):

| Subject | Sessiebeschrijving | Trials |
|---|---|---|
| 15 | various everyday behaviors, **dance moves** | 14 |
| 85 | **jumps; flips; breakdance** | 15 |
| 90 | cartwheels; acrobatics; **dances** | 36 |
| 131 | **Michael Jackson Styled Motions** | 14 |
| 60, 61 | salsa | 15 + 15 |
| 93, 103 | Charleston Dance | 8 + 8 |
| 94 | indian dance | 16 |
| 5, 49 | modern dance (al deels in gebruik) | 20, 22 |

Subject **85** (breakdance) en **131** (Michael Jackson styled) zijn de directe
club/urban-treffers. Samen met 15 en 90 is dat ruim 70 extra trials. Kosten: BVH
downloaden en door het bestaande `bake-mocap.mjs` halen — **nul** conversiewerk, nul
juridisch werk, want de licentietekst in `assets/mocap/LICENSE.md` dekt het al.

**(B) Mixamo (Adobe) — als er meer nodig is.** Bevat expliciet benoemde clubdans
(Hip Hop Dancing, House Dancing, Breakdance, Popping en varianten). Licentie, bron
<https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html>, letterlijk:

> You can use both characters and animations royalty free for personal, commercial,
> and non-profit projects including: … Create video games.

Gratis met een Adobe ID. Het levert FBX in plaats van BVH; conversie naar BVH via
Blender is een bekende, gescripte stap en veel goedkoper dan een IK-solver bouwen.
Het skelet is één consistente humanoid rig, dus de joint-classificatie in
`bake-mocap.mjs` moet één keer een naamtabel voor de Mixamo-conventie krijgen.

**Voorgestelde volgorde:** eerst (A), omdat het vandaag kan en niets kost. Pas als
de menigte dan nog te weinig clubgevoel heeft, (B) erbij.

---

## 7. Bronnen

Alle URL's opgehaald op 2026-08-15.

- ImperialDance repo en README: <https://github.com/YunZhongNikki/ImperialDance-Dataset>
- Licentiestatus via GitHub API: `gh repo view YunZhongNikki/ImperialDance-Dataset --json licenseInfo` → `null`
- Repo-inhoud via GitHub API: 4 bestanden, geen LICENSE
- DanceMVP paper (AAAI 2024): <https://ojs.aaai.org/index.php/AAAI/article/view/28893>
- Downloadlocatie (niet benaderd): Google Drive-map genoemd in de README
- AIST Dance DB voorwaarden: <https://aistdancedb.ongaaccel.jp/terms_of_use/>
- AIST++ downloadpagina: <https://google.github.io/aistplusplus_dataset/download.html>
- Motorica Dance Dataset: <https://github.com/simonalexanderson/MotoricaDanceDataset>
- Mixamo FAQ (licentie): <https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html>
- CMU subjectindex: <http://mocap.cs.cmu.edu/subjects.php>
