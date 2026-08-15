# Mocap clips — herkomst en licentie

Datum van verzamelen en verificatie: **2026-08-15**.

Uitgebreid met vijf extra clips op **2026-08-15** (zie §4 en §6).

Alle `.bvh`-bestanden in deze map komen uit de **CMU Graphics Lab Motion
Capture Database** (Carnegie Mellon University), in de BVH-conversie van
**Bruce Hahne (cgspeed)**, 2010 "MotionBuilder-friendly" release. Beide lagen —
de originele data én de conversie — staan commercieel gebruik toe.

## 1. Licentie van de originele data (CMU)

Bron van de tekst: <http://mocap.cs.cmu.edu/> (homepage, opgehaald 2026-08-15).
Letterlijk citaat:

> Welcome to the Carnegie Mellon University Motion Capture Database! This
> dataset of motions is free for all uses.

en, verderop op dezelfde pagina:

> This data is free for use in research projects. You may include this data in
> commercially-sold products, but you may not resell this data directly, even in
> converted form.
>
> If you publish results obtained using this data, we would appreciate it if you
> would send the citation to your published paper to jkh+mocap@cs.cmu.edu, and
> also would add this text to your acknowledgments section:
>
> "The data used in this project was obtained from mocap.cs.cmu.edu. The
> database was created with funding from NSF EIA-0196217."

Praktisch gevolg voor dit project: gebruik ín een commercieel product mag; de
data doorverkopen als dataset mag niet.

## 2. Licentie van de BVH-conversie (cgspeed / Bruce Hahne)

Bron van de tekst: `READMEFIRST.txt` (v1.1, 26 juni 2010) uit de conversie-release,
opgehaald via
<https://raw.githubusercontent.com/una-dinosauria/cmu-mocap/master/READMEFIRST.txt>
(2026-08-15). Letterlijk citaat, sectie "USAGE RIGHTS":

> CMU places no restrictions on the use of the original dataset, and I (Bruce)
> place no additional restrictions on the use of this particular BVH conversion.
>
> Here's the relevant paragraph from mocap.cs.cmu.edu:
>
>   Use this data!  This data is free for use in research and commercial
>   projects worldwide.  If you publish results obtained using this data, we
>   would appreciate it if you would send the citation to your published paper
>   to jkh+mocap@cs.cmu.edu, and also would add this text to your
>   acknowledgments section: "The data used in this project was obtained from
>   mocap.cs.cmu.edu.  The database was created with funding from NSF
>   EIA-0196217."

De originele cgspeed-downloadpagina
(`https://sites.google.com/a/cgspeed.com/cgspeed/motion-capture/cmu-bvh-conversion`)
gaf op 2026-08-15 een HTTP 404 — Google Sites classic bestaat niet meer. De
release is daarom betrokken van de GitHub-spiegel `una-dinosauria/cmu-mocap`,
die in zijn README expliciet stelt: "This is a copy of the CMU mocap dataset in
bvh format, as ported by Bruce Hahne and made available at
https://sites.google.com/a/cgspeed.com/cgspeed/motion-capture/cmu-bvh-conversion".
Die spiegel voegt zelf geen licentievoorwaarden toe (de repo bevat geen
LICENSE-bestand en claimt geen rechten); de van toepassing zijnde voorwaarden
zijn die van CMU en Hahne hierboven.

CMU verwijst zelf naar deze conversie als officieel aanbevolen alternatieve
indeling, zie <http://mocap.cs.cmu.edu/resources.php>:

> Bruce Hahn has converted our data into MotionBuilder-friendly bvh, and
> 3dsMax-friendly bvh; they are hosted at cgspeed.

## 3. Verplichte vermelding

Neem in de credits van FREQUENCY op:

> The data used in this project was obtained from mocap.cs.cmu.edu.
> The database was created with funding from NSF EIA-0196217.

## 4. Per bestand

| bestand | CMU subject | CMU trial | CMU-omschrijving | bron-URL |
|---|---|---|---|---|
| `05_02.bvh` | 5 (modern dance) | 2 | "dance - expressive arms, pirouette" | https://raw.githubusercontent.com/una-dinosauria/cmu-mocap/master/data/005/05_02.bvh |
| `05_12.bvh` | 5 (modern dance) | 12 | "dance - arms held high, pointe tendue a terre, upper body rotation" | https://raw.githubusercontent.com/una-dinosauria/cmu-mocap/master/data/005/05_12.bvh |
| `49_09.bvh` | 49 (modern dance, gymnastics) | 9 | "dance - arms held high, side arabesque" | https://raw.githubusercontent.com/una-dinosauria/cmu-mocap/master/data/049/49_09.bvh |
| `55_02.bvh` | 55 (animal behaviors, pantomime — human subject) | 2 | "lambada dance" | https://raw.githubusercontent.com/una-dinosauria/cmu-mocap/master/data/055/55_02.bvh |
| `143_35.bvh` | 143 (General Subject Capture) | 35 | "Macarena Dance" | https://raw.githubusercontent.com/una-dinosauria/cmu-mocap/master/data/143/143_35.bvh |
| `05_10.bvh` | 5 (modern dance) | 10 | "dance - glissade devant, glissade derriere, attitude/arabesque" | https://raw.githubusercontent.com/una-dinosauria/cmu-mocap/master/data/005/05_10.bvh |
| `05_20.bvh` | 5 (modern dance) | 20 | "dance - attitude/arabesque, jete en tourant, bending back" | https://raw.githubusercontent.com/una-dinosauria/cmu-mocap/master/data/005/05_20.bvh |
| `49_22.bvh` | 49 (modern dance, gymnastics) | 22 | "dance - lean back on bent leg, balance, bend elbow by ear" | https://raw.githubusercontent.com/una-dinosauria/cmu-mocap/master/data/049/49_22.bvh |
| `93_03.bvh` | 93 (Charleston Dance) | 3 | "charleston_01" | https://raw.githubusercontent.com/una-dinosauria/cmu-mocap/master/data/093/93_03.bvh |
| `143_34.bvh` | 143 (General Subject Capture) | 34 | "Chicken Dance" | https://raw.githubusercontent.com/una-dinosauria/cmu-mocap/master/data/143/143_34.bvh |

De CMU-omschrijvingen zijn letterlijk overgenomen van
`http://mocap.cs.cmu.edu/search.php?subjectnumber=%&motion=dance` (opgehaald
2026-08-15).

## 5. Uitdrukkelijk NIET gebruikt

- Mixamo / Adobe. **Correctie 2026-08-15:** hier stond dat de licentie geen vrij
  hergebruik toestaat. Dat klopt niet — Adobe's eigen FAQ zegt letterlijk "You
  can use both characters and animations royalty free for personal, commercial,
  and non-profit projects including: ... Create video games."
  (<https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html>, opgehaald
  2026-08-15). De reden dat er nog geen Mixamo-data in staat is praktisch, niet
  juridisch: downloaden vereist een Adobe-login en de bestanden zijn FBX terwijl
  de bake BVH leest. Zie `docs/plan-house-mocap.md` voor de route.
- Bronnen onder CC BY-NC.
- CMU subjects 60 en 61 (salsa). Die zijn wél vrij van licentie, maar CMU
  vermeldt voor die trials een framerate van 60 fps terwijl de cgspeed-conversie
  in élk bestand `Frame Time: .0083333` (120 fps) schrijft — zie READMEFIRST,
  sectie "Playback speed". Die clips zouden dus op dubbele snelheid afspelen.
  Dit is op 2026-08-15 opnieuw nagemeten: `60_01`, `60_05`, `61_01` en `61_05`
  schrijven alle vier `Frame Time: .0083333` terwijl CMU's eigen tabel voor
  subject 60 en 61 "60" fps noteert. De afwijzing blijft dus staan. Boven op de
  framerate lopen ze ook flink weg (0,73 tot 1,03 lichaamslengte spreiding over
  het venster dat de bake gebruikt) — een salsa is een danspaar dat de vloer
  over reist en dat is precies wat een statische formatie niet aankan.
  Alle tien de gekozen clips staan bij CMU genoteerd als 120 fps en komen
  dus wél overeen met de Frame Time in het bestand.
- CMU subject **85** (jumps; flips; breakdance) en subject **90** (cartwheels;
  acrobatics; dances). Vrij van licentie, maar inhoudelijk onbruikbaar: bij 85
  is `85_10 "EndofBreakDance"` de enige trial die CMU als dans indexeert, de
  rest is handstands, kickflips en vallen. Van 90 zijn `90_30`/`90_31`
  ("russian dance") gemeten op een heuphoogte van 0,23-0,26 lichaamslengte —
  een volledige hurkzit; en `90_32` ("moonwalk") verplaatst 1,72 lichaamslengte.
  In een vaste formatie leest zakken naar de vloer of wegglijden als een bug.
- CMU subject **131**. De opdracht noemde dit "Michael Jackson styled motions",
  maar CMU's eigen index geeft voor 131 uitsluitend "Start Walk Stop", "Start
  Hop Stop", "Jump Stop" en "Start Walk Left/Right" — geen dans. Niet gebruikt.
- CMU subject **103** (Charelston Dancing). Dezelfde opnamesessie als 93; de
  BVH's meten identiek (spreiding 0,25, pad 0,8, energie 3,02). Eén ervan is
  genoeg — `93_03` is gekozen.
- CMU subject **15** (`15_04`, `15_05`, `15_12`, "dance - Egyptian walk, the
  Dive, the Twist, the Cabbage Patch"). De bestanden zijn 9.000 tot 23.000
  frames lang en de bake leest alleen de eerste ~4,8 s; daar wordt in die clips
  ramen gelapt, niet gedanst (bewegingsenergie 0,1 tegen 0,4-3,0 bij de
  gekozen clips). Bruikbaar zou een offset-parameter in de bake vergen.
- `49_15` ("static dance pose"). Precies wat het zegt: bewegingsenergie 0,17,
  onder elke andere clip. Een stilstaand beeld in een dansende menigte.
- `120_21` ("Robot") en `120_22` ("Zombie"). Club-passend op papier, maar 120_21
  meet 0,23 energie (te stil) en 120_22 verplaatst 0,97 lichaamslengte.

## 6. Meetmethode voor de selectie

Elke kandidaat is beoordeeld op de eerste ~572 frames — precies het venster dat
`scripts/bake-mocap.mjs` gebruikt (`usable = min(frames-1, 4.3/frameTime)`,
uitgelezen tot `(FRAMES+STITCH)/FRAMES`) — en niet op zijn titel:

- **spreiding**: diagonaal van de bounding box van de heup in het grondvlak,
  gedeeld door de lichaamslengte. De reeds geaccepteerde set zit op 0,06-0,45;
  0,45 (lambada) is de bovengrens die het beeld verdraagt.
- **bewegingsenergie**: som van de verplaatsing van alle joints ten opzichte van
  de heup, gedeeld door de lichaamslengte. Vangt clips die stilstaan zonder weg
  te lopen. De geaccepteerde set zit op 0,46-3,02.
- **heuphoogte**: laagste heup gedeeld door lichaamslengte. Onder ~0,4 is het
  vloerwerk.

Meetwaarden van de vijf nieuwe clips (spreiding / energie / laagste heup):
`143_34` 0,08 / 1,45 / 0,47 · `93_03` 0,25 / 3,02 / 0,63 ·
`05_10` 0,31 / 2,22 / 0,59 · `05_20` 0,30 / 0,79 / 0,62 ·
`49_22` 0,32 / 0,46 / 0,57.
