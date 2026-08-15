# §178 — Optie D onderzocht: een echt mensmesh als bron

## 1. De verwachte blokkade bestaat niet

De reden dat D "de lange weg" leek, is **retargeting**: een gerigd model heeft zijn
eigen skelet, met eigen botnamen, eigen bindpose en eigen verhoudingen, en dat moet
je afbeelden op het CMU-skelet. Dat is echt werk en het gaat vaak mis.

Maar wij hebben dat skelet helemaal niet nodig. **Wij hebben alleen de huid nodig.**

Onze bake produceert per punt precies drie dingen:
```
{ joint, local: [x, y, z], region }
```
— aan welk bot het punt hangt, waar het zit in de lokale ruimte van dat bot, en welk
lichaamsdeel het is. Meer niet. De capsule is slechts de manier waarop we die punten
nu *verzinnen*.

Vervang die manier en de rest van de pijplijn blijft byte voor byte hetzelfde:
bemonster het oppervlak van een echt mesh, en bind elk punt aan het dichtstbijzijnde
CMU-botsegment in de rustpose. Geen skelet van het model nodig, geen skinning-weights,
geen bindpose-conversie. **De invoer mag een statisch, ongerigd mensmesh zijn.**

Dat verandert de kosten van D volledig: het is één functie in de bake, niet een nieuw
subsysteem.

## 2. Waarom dit meetkundig kán

Gemeten aan de CMU-rustpose (frame 0, de T-pose):

| maat | CMU-skelet | mens |
|---|---|---|
| spanwijdte / lengte | **0,99** | ~1,00 (Vitruvius) |
| schouderhoogte / lengte | **0,82** | ~0,82 |
| aantal joints | 38 | — |

Het is een echte anatomische T-pose met menselijke verhoudingen. Een T-posed mensmesh
laat zich daar dus op uitlijnen, en "dichtstbijzijnde bot" is een betrouwbare toewijzing
in plaats van een gok.

## 3. De binding

Per bemonsterd oppervlaktepunt:
1. zoek het botsegment (ouder → kind) waarvan het punt de kleinste loodrechte afstand heeft
2. bereken `t` = waar langs dat bot, **genormaliseerd 0..1**
3. bereken de loodrechte offset in het botframe
4. sla op als `{ joint, local, region }` — precies het bestaande formaat

Stap 2 is het belangrijkste detail: door `t` te normaliseren volgt het punt automatisch
de lengte van het CMU-bot, ook als het model andere ledemaatverhoudingen heeft. De
offset blijft absoluut (geschaald op lichaamslengte), want een korte arm hoort niet
dunner te worden.

`region` volgt uit het bot waaraan het punt hangt, dus de flikker-regels per lichaamsdeel
blijven werken zonder aanpassing.

## 4. Wat het oplevert dat capsules niet kúnnen

Vandaag is de romp één buis van `LowerBack` tot `Spine1`. Een buis heeft geen taille,
geen ribbenkast, geen schouderbladen. Wat capsules principieel niet kunnen geven:
- een taille (romp smaller in het midden dan bij borst en heup)
- schouders als massa in plaats van als een stok naar buiten
- kuitspieren die aan de achterkant zitten en niet rondom
- voeten met een lengterichting; nu zijn het worstjes
- handen met een vorm; nu een bolletje van 2,6 cm

Dat zijn precies de dingen die in de referentiefoto het silhouet dragen.

Bijkomend: het lapmiddel dat we nu nodig hebben — een tabel met per bot een
gegokte straal — verdwijnt. Twee bugs die vandaag gevonden zijn (scheen gebouwd als dij,
schouder gebouwd als arm) waren allebei fouten in díé tabel. Met een echt mesh bestaat
de tabel niet meer.

## 5. GEMETEN — de proef, en waar sectie 1 te optimistisch was

Model gevonden: **MakeHuman hm08 basismesh, CC0**, 13.380 vertices / 26.756 driehoeken,
1,666 m, spiegelsymmetrisch, +Y omhoog, voeten op nul, gezicht naar +Z. Ongerigd, precies
zoals gevraagd. Skelet en model delen dezelfde asconventie (+X links, gezicht +Z), dus er
hoeft niets gespiegeld te worden.

De proef (`scratchpad/probe-bind.mjs`) bemonstert het oppervlak oppervlaktegewogen en bindt
elk monster aan het dichtstbijzijnde botsegment. Uitkomst in drie stappen:

| stap | gemiddelde afstand tot bot | lege botten |
|---|---|---|
| naïef (skelet in T, mesh in A) | 0,110 lengte | **10 van 27** — geen enkel armbot |
| skeletarmen naar A-pose gedraaid | 0,085 | 6 van 27 (alleen vingers/tenen) |
| *doel* (orde ledemaatstraal) | ~0,05 | 0 |

**Bevinding 1 — de A-pose is niet optioneel maar fataal.** Het mesh houdt de armen op
−46,7°, het skelet op −8°. Een armvertex ligt dan dichter bij de romp dan bij de arm, en
tien botten krijgen letterlijk nul punten. Eén rotatie van de armketen lost het op.

**Bevinding 2 — de rest zit niet in de binding maar in de VERHOUDINGEN.** Per bot:
romp 0,75× en hoofd 0,80× van de aangenomen straal (het mesh past er netjes in), maar
voeten 3,9×, handen 3,0× en schenen 2,1×. Dat is geen te krappe straal — dat is oppervlak
dat aan het verkeerde bot bindt. De oorzaak, gemeten tegen antropometrische standaarden:

| landmark | CMU-skelet | mens | verschil |
|---|---|---|---|
| heupgewricht | 0,586 | 0,530 | +5,6% van de lengte |
| knie | 0,321 | 0,285 | +3,6% |
| schoudergewricht | 0,881 | 0,820 | +6,1% |
| schedelbasis | 0,940 | 0,870 | +7,0% |
| enkel | 0,025 | 0,039 | −1,4% |

Het CMU-skelet staat systematisch 4 tot 7% van de lichaamslengte te HOOG boven de enkel —
8 tot 12 cm op dit model. Daardoor reiken de beenbotten tot in het bekken van het mesh en
bindt bekkenhuid aan een beenbot.

**Wat dat betekent voor sectie 1.** Mijn claim dat D "één functie in de bake" is, was te
optimistisch: het klopt dat we het skelet van het model niet nodig hebben, maar er is wél
een uitlijnstap nodig die ik niet had voorzien. Die is te doen — en niet als retargeting,
maar omgekeerd: **bouw een BINDPOSE-skelet op antropometrische hoogtes, bind daartegen, en
laat het punt op runtime op het echte CMU-bot rijden via de genormaliseerde `t`.** De
binding hoeft alleen te beslissen wélk bot een punt bezit; de verhoudingen van de danser
komen daarna gewoon van de mocap.

Zo blijft de kern van sectie 1 overeind (geen skinning-weights, geen bindpose-conversie,
ongerigd mesh volstaat), maar de eerlijke omvang is drie stappen in plaats van één:
armketen naar A-pose, bindpose op menselijke hoogtes, en vinger-/teenbotten opvangen.

## 6. Risico's

- **Uitlijning.** Model en skelet moeten in dezelfde pose staan (beide T) en op dezelfde
  hoogte geschaald. Meetbaar: gemiddelde afstand van elk oppervlaktepunt tot zijn bot
  moet in de orde van een ledemaatstraal liggen, niet van een lichaamslengte.
- **A-pose versus T-pose.** Veel modellen staan in A-pose (armen 45° omlaag). Dan wijst
  "dichtstbijzijnde bot" bij de oksel naar de verkeerde kant. Oplossing: armen in de
  bake naar T draaien vóór de binding, of een A-posed skeletvariant gebruiken voor de
  toewijzing.
- **Kleding en haar.** Een gekleed model geeft een gekleed silhouet. Voor deze wereld
  waarschijnlijk prima tot goed, maar het is een keuze.
- **Één lichaamstype.** Alle dansers krijgen hetzelfde lichaam. Nu varieert alleen de
  schaal. Te verzachten met per-danser verhoudingsruis, of met meerdere meshes.
