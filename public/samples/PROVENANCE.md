# Where this kit came from

Vendored with `npm run sounds:vendor:used` and compressed with
`scripts/compress-samples.mjs`. 232 sound names, 850 files, 24 MB of Vorbis.

Everything here was fetched from
[felixroos/dough-samples](https://github.com/felixroos/dough-samples), which is
the sample index Strudel loads by default — the same files strudel.cc serves to
anyone who opens it.

## What is clear

**The instruments** — piano, organ, glockenspiel, vibraphone, marimba, harp,
harmonica, sax, timpani, tubular bells, cabasa, clavisynth — come from the
[Versilian Community Sample Library](https://github.com/sgossner/VCSL), which is
**CC0-1.0**. Public domain, no conditions.

## What is NOT clear, and you should know it

**The drum machines** — TR909, TR808, TR707, LinnDrum, LM-1, MPC60, XR10, HR16,
DMX, DDM-110, R8, RY30, SP-12, DPM48, Drumtracks, CompuRhythm — come through
`dough-samples`, which **carries no licence file**. Neither does
[Dirt-Samples](https://github.com/tidalcycles/Dirt-Samples), the TidalCycles
collection much of it descends from. Its README credits individual contributors
under CC-BY, CC-BY-SA and CC0, but the set as a whole has never been given a
single licence.

No licence means all rights reserved by default. In practice this material has
been shared, sampled and redistributed across the TidalCycles and Strudel
communities for over a decade, and strudel.cc itself serves it to every visitor
— but "everyone does it" is a description of the custom, not a grant of rights,
and this repository is public.

If that matters for how this gets used, the honest options are: ask the
maintainers of dough-samples and Dirt-Samples to state a licence, or replace the
drum kit with a set that already carries one. Until then this note is here so
that nobody, including a future me, mistakes silence for permission.

## Why they are committed at all

The deployed build has to serve the kit from its own origin. The alternative —
letting every visitor fetch drums from `raw.githubusercontent.com` — puts the
sound of the whole thing at the mercy of a URL nobody promises to keep up, and
when it fails the game falls back to synth voices with no instruments at all.
