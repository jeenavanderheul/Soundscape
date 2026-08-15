# Mocap clips — herkomst en licentie

Datum van verzamelen en verificatie: **2026-08-15**.

Alle vijf de `.bvh`-bestanden in deze map komen uit de **CMU Graphics Lab Motion
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

De CMU-omschrijvingen zijn letterlijk overgenomen van
`http://mocap.cs.cmu.edu/search.php?subjectnumber=%&motion=dance` (opgehaald
2026-08-15).

## 5. Uitdrukkelijk NIET gebruikt

- Mixamo / Adobe (licentie staat geen vrij hergebruik van de mocap-data toe).
- Bronnen onder CC BY-NC.
- CMU subjects 60 en 61 (salsa). Die zijn wél vrij van licentie, maar CMU
  vermeldt voor die trials een framerate van 60 fps terwijl de cgspeed-conversie
  in élk bestand `Frame Time: .0083333` (120 fps) schrijft — zie READMEFIRST,
  sectie "Playback speed". Die clips zouden dus op dubbele snelheid afspelen.
  De vijf gekozen clips staan bij CMU allemaal genoteerd als 120 fps en komen
  dus wél overeen met de Frame Time in het bestand.
