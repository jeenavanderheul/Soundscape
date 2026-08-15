# House-dans in de menigte — wat er nodig is

Onderzoek van 2026-08-15. Dit document is voorbereiding, geen uitgevoerd werk:
er is niets gedownload achter een login en er is geen regel aan
`scripts/bake-mocap.mjs` veranderd.

---

## 1. CMU heeft geen house. Bewezen, niet aangenomen.

De aanname was dat house uit dezelfde bron komt als de rest van de menigte. Dat
klopt niet.

De volledige dansindex van CMU is opgehaald via
`http://mocap.cs.cmu.edu/search.php?subjectnumber=%&motion=dance` (2026-08-15).
Dit is *alles* wat CMU als dans indexeert:

| subject | wat het is |
|---|---|
| 5 | modern dance / ballet — 19 trials, jetes en arabesques |
| 15 | Egyptian walk, the Dive, the Twist, the Cabbage Patch (verstopt in clips van 20.000 frames) |
| 18/19/20/21 | chicken dance (twee personen) |
| 49 | modern dance, gymnastiek |
| 55 | "dance, whirl" en lambada |
| 60/61 | salsa (60 fps, terwijl de BVH 120 fps schrijft — onbruikbaar) |
| 85 | één trial "EndofBreakDance", de rest is handstands en kickflips |
| 90 | breakdance, russian dance, moonwalk — allemaal vloerwerk of wegglijdend |
| 93/103 | charleston, lindy hop |
| 111/113 | "Dance" (zwangere / postnatale proefpersoon) |
| 120 | Mickey Dance, Robot, Zombie |
| 141 | "Dance, Twist" |
| 143 | Chicken Dance, Macarena |

Geen house, geen techno, geen hiphop, geen club. Dat is ook logisch: de database
is tussen 2001 en 2010 opgenomen als bewegingsonderzoek — lopen, rennen,
springen, sport, interactie — met dans als bijvangst uit ballet en
gezelschapsdansen. Er is geen club-idioom in te vinden en er komt ook niets meer
bij; de database is bevroren.

**Conclusie: house moet van elders komen.** De vijf clips die vandaag zijn
toegevoegd (§spoor 1) halen eruit wat er te halen valt — charleston `93_03` is
qua tempo en beat het dichtst bij club dat CMU heeft — maar het blijft
gezelschapsdans uit een universiteitslab.

---

## 2. Mixamo: de licentie, geverifieerd bij de bron

Bron: <https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html>, opgehaald
2026-08-15. Letterlijk citaat:

> You can use both characters and animations royalty free for personal,
> commercial, and non-profit projects including:
>
> - Incorporate characters into illustrations and graphic art.
> - 3D print characters.
> - Create films.
> - **Create video games.**

en, op dezelfde pagina:

> Mixamo is available free for anyone with an Adobe ID and does not require a
> subscription to Creative Cloud.
>
> The following restrictions apply:
>
> - Mixamo is not available for Enterprise and Federated IDs.
> - Mixamo is not available for users who have a country code from China.

**Praktisch gevolg voor FREQUENCY:** gebruik in een commercieel spel is
uitdrukkelijk toegestaan en er hoeft niets betaald te worden. De enige
beperkingen zijn wie er mag downloaden (persoonlijke Adobe ID, niet Enterprise),
niet wat je met de data mag.

Dit corrigeert `assets/mocap/LICENSE.md` §5, waar staat dat Mixamo "geen vrij
hergebruik van de mocap-data toestaat". Die zin klopte niet en moet worden
vervangen zodra er daadwerkelijk Mixamo-data in het project komt. Wat wél waar
blijft en waarom Mixamo geen CMU is: de data is niet vrij *herdistribueerbaar*
als dataset — hetzelfde voorbehoud als CMU maakt — en het downloaden vereist een
account, wat betekent dat de herkomst niet met een publieke URL te bewijzen is
zoals bij de CMU-clips. Bewaar daarom de download-datum, het Adobe-account en de
exacte cliptitel in `LICENSE.md`.

**Niet geverifieerd, en dat kan ik niet oplossen:** de cataloguszoekfunctie
(`https://www.mixamo.com/api/v1/products?...`) geeft zonder login
`403 {"error_code":"403000","message":"Api Key is required"}`. De exacte titels
van de dansclips zijn dus niet door mij bevestigd — het stappenplan hieronder
laat de user de titels aflezen.

---

## 3. Conversieroute: FBX → BVH

Mixamo levert FBX (of Collada). `scripts/bake-mocap.mjs` leest BVH. Er is geen
losse CLI die dit betrouwbaar doet; elke bestaande tool (`fbx2bvh.py` in
`DeepMotionEditing/retargeting`, `video2bvh`) draait onder water Blender. Doe het
dus meteen zelf met Blender headless — dat is reproduceerbaar en scriptbaar.

Blender 4.x heeft zowel de FBX-import als de BVH-export ingebouwd. Als
`bpy.ops.export_anim.bvh` ontbreekt: Preferences → Add-ons → "Import-Export:
BioVision Motion Capture (BVH) format" aanzetten.

### Het conversiescript

Zet dit als `scripts/fbx-to-bvh.py` en draai
`blender --background --python scripts/fbx-to-bvh.py -- assets/mocap/fbx assets/mocap`.

```python
import bpy, sys, os, math
from pathlib import Path

src, dst = Path(sys.argv[-2]), Path(sys.argv[-1])
for fbx in sorted(src.glob('*.fbx')):
    bpy.ops.wm.read_factory_settings(use_empty=True)

    # DE ASSENSTELSELVAL. Blender is Z-up, BVH van CMU is Y-up, en de bake meet
    # de lichaamslengte langs Y. Importeer je met de standaardinstellingen, dan
    # rolt er een Z-up BVH uit en gooit de bake "skeleton has no height" — of
    # erger, hij bakt een liggend lichaam. use_manual_orientation houdt de
    # Y-up van de FBX intact.
    bpy.ops.import_scene.fbx(
        filepath=str(fbx),
        use_manual_orientation=True,
        axis_forward='-Z',
        axis_up='Y',
        automatic_bone_orientation=False,
    )

    arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
    bpy.context.view_layer.objects.active = arm
    arm.select_set(True)

    scene = bpy.context.scene
    scene.render.fps = 30            # moet overeenkomen met de Mixamo-export
    end = int(max(arm.animation_data.action.frame_range))

    bpy.ops.export_anim.bvh(
        filepath=str(dst / (fbx.stem.lower().replace(' ', '_') + '.bvh')),
        frame_start=scene.frame_start,
        frame_end=end,
        # root_transform_only schrijft positiekanalen alleen op de heup: 6
        # kanalen op de root, 3 op elke andere joint. Dat is precies de vorm
        # die parseBvh en poseAt verwachten; laat je hem uit, dan krijgt elke
        # joint 6 kanalen en klopt de forward kinematics niet meer.
        root_transform_only=True,
        rotate_mode='NATIVE',
        global_scale=1.0,
    )
```

Schaal maakt niet uit: `bakeClip` meet de lichaamslengte uit het skelet en
normaliseert naar 1,0 (`scale = 1 / rawHeight`). Centimeters of meters, beide
komen er hetzelfde uit.

### De rustpose-val — dit is de echte

`bakeClip` en `buildBodyFromMesh` gebruiken **frame 0 als rustpose**:
`poseAt(clip, 0)` levert de lichaamslengte waarmee genormaliseerd wordt én de
bindpose waartegen de MakeHuman-huid wordt gebonden. Bij CMU/cgspeed is frame 0
een kunstmatige T-pose die de conversie er expres voor heeft geplakt — vandaar
`TPOSE_FRAMES = 1`.

**Een Mixamo-clip heeft dat niet.** Frame 0 is de eerste danspose. Bind je de
A-pose-huid daartegen, dan zit de huid scheef op het skelet en is de
lichaamslengte gemeten uit een gebogen lichaam — de danser komt te groot uit de
bake.

Oplossing zonder codewijziging: download eenmalig de Mixamo-animatie **"T-Pose"**
en plak dat ene frame vooraan elke dansclip. In Blender: importeer de T-Pose-FBX,
kopieer frame 1 als keyframe, schuif de dansactie één frame op. Alternatief en
netter: geef `bakeClip` een `restFrame`-bron per clip. Beide moeten getest
worden op echte bestanden, wat nu niet kan.

---

## 4. Jointmapping mixamorig → onze CMU-conventie

Goed nieuws eerst: `classify()` in `bake-mocap.mjs` matcht op **substrings**,
kleine letters, en werkt daardoor ongewijzigd op `mixamorig:`-namen. De
volgordegevoelige gevallen zitten al goed (`forearm` vóór `arm`, `upleg` vóór
`leg`). Geen enkele regel in `REGIONS` hoeft aangepast:

| mixamorig-joint | valt in REGIONS-regel | CMU-tegenhanger |
|---|---|---|
| `mixamorig:Hips` | `hip`,`pelvis`,`root` | `Hips` |
| `mixamorig:Spine`, `Spine1`, `Spine2` | `spine` | `LowerBack`, `Spine`, `Spine1` |
| `mixamorig:Neck` | `neck` | `Neck`, `Neck1` |
| `mixamorig:Head` | `head` | `Head` |
| `mixamorig:HeadTop_End` | `head` | `Head_tip` (End Site) |
| `mixamorig:LeftShoulder` / `RightShoulder` | `shoulder` | `LeftShoulder` / `RightShoulder` |
| `mixamorig:LeftArm` / `RightArm` | `arm` | `LeftArm` / `RightArm` |
| `mixamorig:LeftForeArm` / `RightForeArm` | `forearm` | `LeftForeArm` / `RightForeArm` |
| `mixamorig:LeftHand` / `RightHand` | `hand` | `LeftHand` / `RightHand` |
| `mixamorig:LeftHand{Thumb,Index,Middle,Ring,Pinky}{1,2,3}` | `hand` (bevat "Hand") | `LeftFingerBase`, `LeftHandIndex1`, `LThumb` |
| `mixamorig:LeftUpLeg` / `RightUpLeg` | `upleg` | `LeftUpLeg` / `RightUpLeg` |
| `mixamorig:LeftLeg` / `RightLeg` | `leg` | `LeftLeg` / `RightLeg` |
| `mixamorig:LeftFoot` / `RightFoot` | `foot` | `LeftFoot` / `RightFoot` |
| `mixamorig:LeftToeBase` / `RightToeBase` | `toe` | `LeftToeBase` / `RightToeBase` |
| — | — | `LHipJoint` / `RHipJoint` (bestaat niet bij Mixamo; geen probleem, de hiërarchie is naam-gestuurd) |

Mixamo heeft 65 joints tegen CMU's 31, vrijwel allemaal vingers. Dat is geen
bezwaar: de bake telt geen joints, hij loopt de hiërarchie af.

### Wat er wél veranderd moet worden

Drie plekken gebruiken een **letterlijke** CMU-naam en breken op `mixamorig:`:

1. `LIMB_FIT` (regel ~420) — sleutels `LeftLeg`, `RightLeg`, `LeftFoot`,
   `RightFoot`. Bij Mixamo matcht geen enkele sleutel, dus `k = 1` en de
   beencorrectie valt stilletjes weg. Geen crash, wel een slechtere binding.
2. `bindingSkeleton()` — `clip.joints.findIndex(j => j.name === 'LeftArm')`.
   Vindt niets, `continue`, dus de armzwaai naar de A-pose van de huid gebeurt
   niet. Dat is precies de fout die §178 beschrijft: tien van de zevenentwintig
   botten krijgen dan geen enkel punt.
3. `buildBodyFromMesh()` — `const shoulder = clip.joints.findIndex(j => j.name === 'LeftArm')`
   gevolgd door `rest[shoulder][7]`. `findIndex` geeft `-1`, `rest[-1]` is
   `undefined`, en dit **crasht** de bake.

De minimale, niet-speculatieve oplossing is één resolver die een canonieke naam
uit een joint-naam haalt, plus die drie plekken erlangs. Uitgeschreven, klaar om
te plakken zodra er een Mixamo-BVH is om het tegen te testen:

```js
/**
 * Mixamo noemt de heup `mixamorig:Hips` en sommige FBX-importers maken daar
 * `mixamorig_Hips` van. Onder het voorvoegsel is het dezelfde naam als CMU
 * gebruikt, dus strip het voorvoegsel en vergelijk hoofdletterongevoelig.
 */
const canonical = (name) => name.replace(/^mixamorig[:_]/i, '');

// 1. LIMB_FIT opzoeken via canonical:
const k = LIMB_FIT[canonical(j.name)] ?? 1;

// 2 en 3. joint zoeken via canonical:
const findJoint = (clip, name) =>
  clip.joints.findIndex((j) => canonical(j.name).toLowerCase() === name.toLowerCase());
```

En in `buildBodyFromMesh` één regel erbij, omdat een ontbrekende schouder nu
stilletjes `undefined` oplevert in plaats van een leesbare fout:

```js
const shoulder = findJoint(clip, 'LeftArm');
if (shoulder < 0) throw new Error('bind: geen LeftArm in het skelet — onbekende jointconventie');
```

Dit is niet getest. Er is geen Mixamo-BVH om het tegen te draaien.

---

## 5. Stappenplan voor de user

Wat jij moet klikken. Ik kan dit niet doen: het vereist inloggen.

1. Ga naar <https://www.mixamo.com> en log in met een **persoonlijk** Adobe ID
   (gratis; een Enterprise- of Federated-ID werkt niet, zie §2).
2. Kies links een character. **Welke maakt niet uit** — het skelet is bij elke
   Mixamo-character identiek en we gebruiken de huid niet, die komt uit
   `assets/human/makehuman_base_body.obj`. "X Bot" is de standaard.
3. Tab **Animations**, zoek op deze termen en pak wat er is:
   - `House Dancing`
   - `Hip Hop Dancing`
   - `Snake Hip Hop Dance`, `Wave Hip Hop Dance`, `Robot Hip Hop Dance`
   - `Popping`
   - `Shuffling`
   - `Northern Soul Spin` (let op: draait, mogelijk te veel verplaatsing)
   - `Breakdance` — **overslaan**, dat is vloerwerk; zie waarom in
     `assets/mocap/LICENSE.md` §5.

   Neem er 4 tot 6, en let bij het voorbeeld in de viewer op hetzelfde criterium
   als bij CMU: blijft de danser op zijn plek, en herhaalt het?
4. In het rechterpaneel per clip:
   - **In Place: AAN** waar de optie er staat. Dit is de belangrijkste knop van
     het hele plan — zonder dat loopt de danser de formatie uit en ziet het er
     in het spel uit als een bug.
   - **Trim** gebruiken als de clip met stilstaan of inlopen begint. De bake
     leest alleen de eerste ~4,3 seconden.
   - Overdrive / Character Arm-Space: op standaard laten.
5. Knop **DOWNLOAD**, en dan exact deze instellingen:
   - Format: **FBX Binary (.fbx)**
   - Skin: **Without Skin** (we hebben alleen het skelet nodig)
   - Frames per Second: **30**
   - Keyframe Reduction: **none**
6. Doe stap 3-5 nog één keer voor de animatie **`T-Pose`**. Eén frame is genoeg.
   Dit bestand is niet optioneel — zie de rustpose-val in §3.
7. Zet alle `.fbx`-bestanden in `assets/mocap/fbx/` en geef door welke clips het
   zijn geworden en op welke datum je ze hebt gedownload. Dan volgt: het
   Blender-script draaien, de jointmapping uit §4 toepassen, elke clip meten met
   het spreidings-/energiecriterium uit `LICENSE.md` §6, en pas dan bakken.

Download niets van elders. Sketchfab, Turbosquid en "free mocap"-verzamelsites
staan vol met Mixamo-data die zonder recht is doorgeplaatst; dat is precies wat
zowel CMU als Adobe verbieden.
