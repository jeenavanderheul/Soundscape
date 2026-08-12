# FREQUENCY — the sound palette

What the engine can actually utter. Every name here exists in the sample maps
we load (`npm run sounds:audit` regenerates the inventory); a name that is NOT
here produces **silence, not an error** (§38), so write patterns against this
list and nothing else.

## Drum machines — use with `.bank("Name")`

28 machines are allowed. `s("bd sd hh")` picks the part, `.bank()` picks the box.

| machine | parts it has |
|---|---|
| AkaiMPC60 | bd cp cr hh ht lt misc mt oh perc rd rim sd |
| AkaiXR10 | bd cb cp cr hh ht lt misc mt oh perc rd rim sd sh tb |
| AlesisHR16 | bd cp hh ht lt oh perc rim sd sh |
| AlesisSR16 | bd cb cp cr hh misc oh perc rd rim sd sh tb |
| BossDR550 | bd cb cp cr hh ht lt misc mt oh perc rd rim sd sh tb |
| EmuDrumulator | bd cb cp cr hh ht lt mt oh perc rim sd |
| EmuSP12 | bd cb cp cr hh ht lt misc mt oh perc rd rim sd |
| KorgDDM110 | bd cp cr hh ht lt oh rim sd |
| KorgM1 | bd cb cp cr hh ht misc mt oh perc rd rim sd sh tb |
| KorgT3 | bd cp hh misc oh perc rim sd sh |
| LinnDrum | bd cb cp cr hh ht lt mt oh perc rd rim sd sh tb |
| LinnLM1 | bd cb cp hh ht lt oh perc rim sd sh tb |
| LinnLM2 | bd cb cp cr hh ht lt mt oh rd rim sd sh tb |
| OberheimDMX |  bd cp cr hh ht lt mt oh rd rim sd sh tb |
| RolandCompuRhythm1000 | bd cb cp cr hh ht lt mt oh perc rd rim sd |
| RolandCompuRhythm8000 | bd cb cp cr hh ht lt mt oh perc rim sd |
| RolandD70 | bd cb cp cr hh lt mt oh perc rd rim sd sh |
| RolandMC303 | bd cb cp fx hh ht lt misc mt oh perc rd rim sd sh tb |
| RolandMT32 | bd cb cp cr hh ht lt mt oh perc rd rim sd sh tb |
| RolandR8 | bd cb cp cr hh ht lt mt oh perc rd rim sd sh tb |
| RolandTR505 | bd cb cp cr hh ht lt mt oh perc rd rim sd |
| RolandTR626 | bd cb cp cr hh ht lt mt oh perc rd rim sd sh tb |
| RolandTR707 | bd cb cp cr hh ht lt mt oh rim sd tb |
| RolandTR808 | bd cb cp cr hh ht lt mt oh perc rim sd sh |
| RolandTR909 | bd cp cr hh ht lt mt oh rd rim sd |
| SakataDPM48 | bd cp cr hh ht lt mt oh perc rd rim sd sh |
| SequentialCircuitsDrumtracks | bd cb cp cr hh ht oh rd rim sd sh tb |
| YamahaRY30 | bd cb cp cr hh ht lt misc mt oh perc rd rim sd sh tb |

Common parts: `bd` kick · `sd` snare · `cp` clap · `hh` closed hat · `oh` open hat ·
`rim` rimshot · `cr` crash · `rd` ride · `ht/mt/lt` toms · `cb` cowbell · `sh` shaker ·
`tb` tambourine · `perc` · `misc` · `fx`. Not every machine has every part —
check the row before you use it.

## Melodic instruments the grammars may name

These are the `VOICE_SOUNDS` allowlist: what `bassVoice`, `chordVoice` and
`leadVoice` can be set to, and what `.s(...)` may say on a `note(...)`.

    sine triangle square sawtooth
    piano organ_full glockenspiel vibraphone marimba harp
    harmonica sax timpani tubularbells

## General MIDI instruments (§75) — `@strudel/soundfonts`

The families the sample maps do not have. Registered at start-up, network-backed,
so like the drum machines every template that names one keeps a fallback.

    gm_piano gm_epiano1 gm_harpsichord gm_celesta
    gm_violin gm_cello gm_string_ensemble_1 gm_synth_strings_1
    gm_pizzicato_strings gm_orchestral_harp gm_choir_aahs
    gm_acoustic_bass gm_electric_bass_finger gm_fretless_bass
    gm_electric_guitar_jazz gm_electric_guitar_clean gm_overdriven_guitar
    gm_trumpet gm_trombone gm_french_horn gm_brass_section
    gm_soprano_sax gm_tenor_sax gm_flute gm_clarinet gm_oboe
    gm_church_organ gm_drawbar_organ gm_accordion
    gm_lead_1_square gm_lead_2_sawtooth gm_pad_warm gm_pad_choir gm_pad_halo
    gm_fx_brightness gm_marimba gm_vibraphone gm_kalimba

The package registers ~129 of these; the list above is the deliberate subset a
grammar may name, and `tests/unit/soundfonts.test.ts` checks every one against
the registry the package actually ships. Two names in my first draft
(`gm_pad_2_warm`, `gm_pad_4_choir`) did not exist — that test caught them.

## More instruments in the maps (not yet on the allowlist)

Available as samples, but a grammar cannot name them until they are added to
`VOICE_SOUNDS`:

    steinway pipeorgan_loud_pedal folkharp kalimba balafon xylophone_*
    recorder_* ocarina saxello psaltery_spiccato dantranh strumstick
    gong belltree handbells handchimes marktrees tubularbells2 timpani2
    conga bongo cajon darbuka framedrum slitdrum oceandrum agogo cabasa
    clave guiro woodblock tambourine cowbell fingercymbal vibraslap
    sleighbells triangles anvil brakedrum ratchet slapstick siren wind
    didgeridoo trainwhistle crow insect wineglass

## Synths and noise — always available, no samples needed

    sine triangle square sawtooth pulse supersaw fmpiano clavisynth casio
    sbd (synth kick)  white pink brown crackle  bytebeat numbers

These are the offline fallback: every drum template has a synth version so the
world still sounds with no network and no local kit (§30.5).

## Writing patterns we can use

- `s("bd ~ ~ bd").bank("RolandTR909")` — a kit part, on a named box
- `note("c2 ~ eb2").s("sine")` — a pitched voice from VOICE_SOUNDS
- Effects the guard allows: `gain postgain clip lpf hpf bpf lpq shape distort
  crush coarse room size delay delaytime delayfeedback orbit duckorbit
  duckdepth duckattack pan jux attack decay sustain release penv pdec vib
  phaser dry compressor ftype vowel`
- Structure the guard allows: `fast slow ply off late early rev palindrome
  iter chunk every when sometimes sometimesBy often rarely degrade degradeBy
  struct euclid euclidLegato mask segment range superimpose stack`
- Anything else — an unknown function, an assignment, a template literal — is
  rejected before it can reach the engine (§30.2).
