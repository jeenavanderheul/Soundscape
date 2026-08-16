# The Loop

A world you fly through, and the flight is the music. Six worlds sit on a
compass; the direction you travel decides the grammar you are inside, and what
you do while you are there — speed, height, the wind you hold — writes the
track layer by layer. Nothing is a menu. You do not choose techno; you fly north
and techno is what is there.

Built on [Strudel](https://strudel.cc) for the sound and three.js for the
picture. There is no server: everything happens in the browser.

## Running it

    npm install
    npm run sounds:vendor:used     # the drum machines and instruments, ~24 MB
    npm run dev

`npm run dev -- --host` serves it on the local network, which is how you play it
on a phone (one thumb flies, the right half of the screen is the wind).

Two optional bakes, both with fallbacks so the game runs without them:

    npm run land:bake -- --span 10000 --size 2048   # real terrain
    npm run trees:bake                              # the forest
    npm run mocap:bake                              # the crowd

## Licence

**AGPL-3.0-or-later.** Not a preference — Strudel is AGPL, this ships a copy of
it to every visitor, and the licence follows. If you serve this to anyone, you
owe them the source of the whole thing; that is what the `source` link on the
title screen is for.

The mocap crowd comes from the CMU Motion Capture Database (free for any use,
provenance in `assets/mocap/LICENSE.md`). The body mesh is CC0.

The sample kit in `public/samples` is vendored from
[dough-samples](https://github.com/felixroos/dough-samples) — the same index
strudel.cc loads. The instruments are CC0 (VCSL); the drum machines come from a
collection that **states no licence at all**, which is written down honestly in
`public/samples/PROVENANCE.md` rather than left for someone to discover.
