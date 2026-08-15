# Licenties — assets/human

Vastgelegd op 2026-08-15 (Europe/Amsterdam). Licenties zijn geverifieerd bij de BRON
(de MakeHuman-repository zelf), niet bij een doorverkoper of aggregator.

---

## 1. `makehuman_base.obj` — MakeHuman hm08 base mesh (ongewijzigd)

- **Bron-URL (bestand):** https://github.com/makehumancommunity/makehuman/blob/master/makehuman/data/3dobjs/base.obj
- **Raw download:** https://raw.githubusercontent.com/makehumancommunity/makehuman/master/makehuman/data/3dobjs/base.obj
- **Commit van dit bestand:** `3c701a8e52f09e69922e8b598d23be2d7dfc49e3`
- **SHA256:** `8e761e6624b8f54536409135d1636da63b32486a90d4897f84e121d144f6fb4c`
- **Gedownload op:** 2026-08-15
- **Auteur / rechthebbenden** (letterlijk uit de header van het OBJ-bestand zelf):

  > \# This asset was explicitly released as CC0 in september 2020. The license
  > \# text for CC0 can be found in the root of this repository.
  > \#
  > \# The copyright holders at the point of the release to CC0 were:
  > \#
  > \# Copyright (C) 2020 Data Collection AB, https://www.datacollection.se
  > \# Copyright (C) 2020 Joel Palmius
  > \# Copyright (C) 2020 Jonas Hauquier
  > \#
  > \# The primary legal contact for MakeHuman is Data Collection AB.

- **Licentie:** Creative Commons CC0 1.0 Universal (publiek domein-afstandsverklaring).

### Letterlijk citaat uit `LICENSE.md` van de bron-repository, sectie C

Bron: https://github.com/makehumancommunity/makehuman/blob/master/LICENSE.md

> C. The license for the bundled assets
> --------------------------------------
>
> The assets are defined as any data contributing to the graphical output of
> MakeHuman. This includes:
>
> * The base mesh and proxies
> * Targets and modifiers
> * Textures
> * Clothes (any MHCLO-based asset)
> * Poses and expressions
>
> These assets have been released under CC0 1.0 Universal. In summary this means
> that to the fullest extent possible, it is the intention of the MakeHuman
> project that anyone can do whatever they want with it.
>
> For the full text of the legal statement regarding the assets, see
> [LICENSE.ASSETS.md](LICENSE.ASSETS.md)

En over de output van het programma, uit dezelfde `LICENSE.md`, sectie D:

> It is the opinion of the MakeHuman project that no output from MakeHuman
> contains any trace of program logic. [...] As the assets have been released
> under CC0, there is no limitation on what you can do with this combined output.

### Letterlijk citaat uit `LICENSE.ASSETS.md` van de bron-repository

Bron: https://github.com/makehumancommunity/makehuman/blob/master/LICENSE.ASSETS.md
(dit is de integrale CC0 1.0 Universal-tekst; de twee bepalende alinea's:)

> \# Creative Commons CC0 1.0 Universal

> 2. __Waiver.__ To the greatest extent permitted by, but not in contravention of,
> applicable law, Affirmer hereby overtly, fully, permanently, irrevocably and
> unconditionally waives, abandons, and surrenders all of Affirmer's Copyright and
> Related Rights and associated claims and causes of action, whether now known or
> unknown (including existing as well as future claims and causes of action), in the
> Work (i) in all territories worldwide, (ii) for the maximum duration provided by
> applicable law or treaty (including future time extensions), (iii) in any current
> or future medium and for any number of copies, and (iv) for any purpose whatsoever,
> including without limitation commercial, advertising or promotional purposes (the
> "Waiver").

> 3. __Public License Fallback.__ Should any part of the Waiver for any reason be
> judged legally invalid or ineffective under applicable law, then the Waiver shall
> be preserved to the maximum extent permitted taking into account Affirmer's express
> Statement of Purpose. In addition, to the extent the Waiver is so judged Affirmer
> hereby grants to each affected person a royalty-free, non transferable, non
> sublicensable, non exclusive, irrevocable and unconditional license to exercise
> Affirmer's Copyright and Related Rights in the Work (i) in all territories
> worldwide, [...] and (iv) for any purpose whatsoever, including without limitation
> commercial, advertising or promotional purposes (the "License").

**Gevolg voor FREQUENCY:** commercieel gebruik toegestaan, geen attributieplicht in
de app, geen share-alike, geen NC-clausule. Merk- en octrooirechten worden door CC0
niet gewaiveerd (art. 4a) — gebruik dus niet de naam of het logo "MakeHuman" als
merk in de app. Vermelding van de auteurs in dit bestand is vrijwillig, niet vereist.

---

## 2. `makehuman_base_body.obj` — afgeleide (alleen de huid)

Zelfde licentie: **CC0 1.0 Universal**. Dit is een afgeleid werk dat door dit project
is gemaakt uit `makehuman_base.obj`. CC0 legt geen enkele beperking op afgeleide
werken op.

- **SHA256:** `a7994000d80b1eedc2409c4acd3063e66c07eee35d28e998546f5ccb6d13583e`
- **Bewerkingen:**
  1. Alleen de OBJ-groep `body` behouden. Alle 138 `helper-*`- en `joint-*`-groepen
     (helper-tights, helper-skirt, helper-hair, oogbollen, tanden, wimpers, en 100+
     kubusjes die gewrichten markeren) zijn verwijderd — samen 5.108 quads die géén
     huid zijn en die bij naïef renderen als losse blokken in beeld zouden staan.
  2. Vertices opnieuw geïndexeerd.
  3. Quads getrianguleerd (13.378 quads → 26.756 driehoeken).
  4. Eenheden omgerekend van decimeter naar meter (×0,1).
  5. Verplaatst zodat de voeten op y=0 staan en het model gecentreerd is in x en z.

---

## Overwogen en AFGEWEZEN bronnen

- **Blender Studio "Human Base Meshes Bundle v1.4.1"** — licentie geverifieerd bij de
  bron (https://www.blender.org/download/demo-files/ vermeldt letterlijk "49 MB – CC0").
  Juridisch dus prima. **Niet gebruikt** omdat de bundel uitsluitend als `.blend`
  wordt geleverd en er op deze machine geen Blender staat (geen `blender`-binary, geen
  `bpy`-module), zodat conversie naar OBJ/GLB niet verifieerbaar uitvoerbaar was.
- **Mixamo / Adobe** — niet gebruikt (licentie staat redistributie van de mesh niet toe).
- **SMPL / SMPL-X** — niet gebruikt (research-only licentie).
- **Sketchfab / CGTrader / Free3D / Meshy** — niet gebruikt: per model afwijkende,
  vaak onduidelijke of NC-/editorial-clausules, en de licentie is daar niet bij een
  controleerbare bron vast te leggen.
- **OpenGameArt "Human Basemeshes"** (CC0) — afgewezen op kwaliteit: ~1.150 driehoeken,
  ver onder de ondergrens van 5.000, en alleen als `.blend`.
- **Quaternius** (CC0) — afgewezen op kwaliteit: gestileerd low-poly, geen realistische
  anatomie.
