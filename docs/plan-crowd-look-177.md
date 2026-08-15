# §177 — De danser naar referentieniveau: analyse + opties

Referentie: de close-up van één danser, heldere doorlopende contour, ijle stippen
binnenin, herkenbare anatomie, het grid stopt bij het lichaam.

## 1. Wat de referentie feitelijk laat zien

| eigenschap | referentie | wat wij nu doen |
|---|---|---|
| verdeling van de punten | op de HUID | in het VOLUME (`Math.cbrt(random) * radius`) |
| contour | fel, doorlopend, dichter dan de binnenkant | even dicht als de rest → geen contour |
| anatomie | schouders, kuiten, handen, taille | capsules om botten = buizen van gelijke dikte |
| puntdichtheid dichtbij | grofweg 3.000–6.000 | 1.024 |
| punt zelf | scherpe kern met halo | zachte bol (`exp(-r2*8)`) → blob |
| uitval/flikker | vrijwel niets, het lichaam staat stil en vast | 66–92% aanwezig, ruist |
| grid achter het lichaam | stopt op de romp, schemert door de benen | schijnt overal dwars doorheen |

## 2. De belangrijkste vondst

**Puntjes op een OPPERVLAK produceren de heldere contour vanzelf.** Dat is meetkunde,
geen effect: kijk je naar een cilinder, dan zie je het oppervlak in het midden frontaal
en aan de randen scherend. Scherend oppervlak projecteert veel meer punten op dezelfde
schermruimte, dus de rand wordt automatisch dichter en dus feller.

Wij bemonsteren nu het volume (`cbrt` verdeelt punten gelijkmatig door de bol heen).
Dat is precies de verdeling die GEEN contour heeft: overal even dicht, dus een wolk in
plaats van een lichaam. Eén regel in de bake staat tussen ons en de rand uit de
referentie — en dat kost niets: geen extra punten, geen extra bytes, geen normalen.

Dit is ook waarom ik géén normaalvector-texture voorstel. Die zou het geheugen
verdubbelen om een randlicht te berekenen dat we gratis krijgen door de punten op de
juiste plek te zetten.

## 3. Opties, van goedkoop naar duur

### A — Schil in plaats van volume (+ taps toelopende ledematen)
Bake-wijziging. Punten op het capsule-oppervlak; straal loopt langs het bot van dik
naar dun, zodat een kuit een kuit is en geen buis. Levert de contour, de anatomie en
de silhouetleesbaarheid. **Kost: niets.** Zelfde bestandsgrootte, zelfde framekosten.

### B — Renderregels aanscherpen
Scherpere puntkern met halo in plaats van een zachte bol; flikker terug van ~30% naar
~8% zodat het lichaam stáát; dieptebuffer schrijven zodat de romp het grid afdekt.
**Kost: niets.** Wel: diepte schrijven vecht met additief mengen — moet gemeten worden,
niet aangenomen.

### C — Meer punten
1.024 → 2.048 of 3.072 voor de nabije danser. Lineair in download én geheugen:
2.048 punten × 5 clips = 10 MB in plaats van 5. Terug te brengen door 4 clips te
houden of 96 frames in plaats van 128.
**Kost: download.** Pas zinvol NA A — met een schil telt elk punt dubbel zo hard mee.

### D — Een echt mensmodel als bron
Een CC0/MIT gerigd mensmesh, en dan de échte huid bemonsteren met botgewichten in
plaats van capsules. Geeft schouderbladen, een taille, handen met vingers — alles wat
capsules per definitie niet hebben. **Kost: een asset met de juiste licentie, plus een
retarget-laag van dat skelet naar het CMU-skelet.** Dit is het plafond van wat haalbaar
is, en het is ook het enige punt waarop we opnieuw een licentiekeuze maken.

## 4. Voorstel

A en B eerst, want ze zijn gratis en A is de eigenlijke oorzaak. Meten. Dan pas C,
want meer punten op een verkeerde verdeling is geld uitgeven aan hetzelfde probleem.
D is een aparte ronde met een eigen licentievraag.

Volgorde binnen A/B, elk met een zichtbaar resultaat:
1. schil in plaats van volume → contour verschijnt
2. taps toelopende botten → ledematen krijgen vorm
3. puntkern scherper → stippen in plaats van blobs
4. flikker omlaag → het lichaam staat vast
5. diepte meten → grid stopt of niet, en wat het kost
