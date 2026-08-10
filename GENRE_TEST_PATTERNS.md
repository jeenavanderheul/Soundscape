# FREQUENCY — genre patterns to paste into strudel.cc

Exactly what the engine generates for a fully earned track in each region.
Paste one block at a time into https://strudel.cc and press play.

## NORTH — TECHNO (machine forest)

```javascript
setcpm(140/4)

stack(
  s("bd*4").bank("RolandTR909").gain("0.95 0.89 0.95 0.91").shape(0.25),
  stack(s("[~ oh]*4").bank("RolandTR909").gain(0.35),
        s("[~ hh]*8").bank("RolandTR909").gain(0.14)),
  s("hh*32").bank("RolandTR909").hpf(9500).gain("0.048 0.12 0.036 0.144"),
  s("<rim [~ rim] rim [rim ~]>").bank("RolandTR808").fast(2).pan("<.25 .75 .4 .65>").gain("0.24 0.36 0.168 0.312"),
  s("~ cp ~ cp").bank("RolandTR909").room(.2).gain(0.82),
  s("~ sd ~ sd").bank("RolandTR808").late(.01).gain(0.31),
  note("<a2 a2 c3 e3>").s("sawtooth").lpf(420).lpq(8).shape(0.25).gain(0.6),
  note("<a1 ~ a1 ~ c2 ~ [a1 e2] ~>").s("sine").gain(0.54),
  note("[a3,c4,e4]").s("sawtooth").slow(4).lpf("<900 1600 1100 2200>").shape(0.25).room(.18).gain(0.24),
  note("a4 c5 e5 g5").s("square").slow(2).lpf("<500 900 650 1300>").shape(0.25).decay(.18).sustain(0).gain(0.21),
  s("hh*16").bank("RolandTR909").hpf(9000).gain("0.036 0.09 0.027 0.09")
)
```

## SOUTH — AMBIENT (cloud forest)

```javascript
setcpm(90/4)

stack(
  s("bd ~ ~ ~").bank("RolandTR909").gain(0.30),
  s("~ ~ oh ~").bank("RolandTR909").gain(0.12),
  s("[~ cp ~ cp]").bank("RolandTR909").degradeBy(.4).gain(0.12),
  note("<a2 a2 ~ c3>").s("sawtooth").lpf("<180 240 150 320>").lpq(10).gain(0.4),
  note("<a1 ~ a1 ~ c2 ~ [a1 e2] ~>").s("sine").gain(0.36),
  note("[a3,c4,e4]").s("triangle").slow(8).lpf(1300).attack(.8).release(2).room(.9).gain(0.24),
  note("a4 c5 e5 g5").s("sine").slow(8).attack(1).release(3).delay(.35).room(.9).gain(0.21),
  s("hh*8").bank("RolandTR909").hpf(9000).slow(4).room(.9).gain("0.06 0.15 0.045 0.105"),
  note("a2").s("sine").slow(4).attack(2).release(4).room(.85).gain(0.14)
)
```

## NORTH-EAST — UK GARAGE (skip forest)

```javascript
setcpm(134/4)

stack(
  s("bd ~ ~ [~ bd]").bank("RolandTR909").shape(0.12).gain(0.9),
  stack(s("hh*8").bank("RolandTR909").late("<0 .02 .01 .03>").gain("0.34 0.17 0.29 0.14"),
        s("~ ~ oh ~").bank("RolandTR909").gain(0.24)),
  s("~ cp ~ cp").bank("RolandTR909").room(.2).gain(0.72),
  note("<a1 ~ [~ c2] ~ e2 ~ ~ [a1 ~]>").s("sine").decay(.16).sustain(0).gain(0.72),
  note("[a3,c4,e4]").s("sawtooth").slow(2).lpf("<900 1600 1100 2200>").shape(0.12).room(.18).gain(0.24),
  note("a4 c5 e5").s("triangle").slow(2).chop(4).decay(.2).sustain(.05).delay(.25).room(.3).gain(0.21)
)
```

## NORTH-WEST — TRAP (weight forest)

```javascript
setcpm(140/4)

stack(
  s("bd ~ ~ ~ ~ ~ [~ bd] ~").bank("RolandTR808").lpf(120).shape(0.2).gain(0.95),
  s("hh*8 [hh*16] hh*8 [hh*32]").bank("RolandTR808").gain("0.26 0.156"),
  s("~ ~ rim ~").bank("RolandTR808").room(.25).gain(0.8),
  note("<a1 ~ e2 ~>").s("sine").slide(1).decay(.9).sustain(.3).lpf(180).gain(0.9),
  note("[a3,c4,e4]").s("sawtooth").slow(4).lpf("<900 1600 1100 2200>").shape(0.2).room(.18).gain(0.24),
  note("a5 c6 e6").s("glockenspiel").slow(2).room(.45).gain(0.21)
)
```

## LOW ALTITUDE — DUB (echo forest)

```javascript
setcpm(120/4)

stack(
  s("bd ~ ~ ~").bank("RolandTR909").room(.4).lpf(180).gain(0.85),
  s("~ ~ rim ~").bank("RolandTR808").room(.25).gain(0.5),
  note("<a1 ~ ~ [c2 ~] ~ ~ e2 ~>").s("sine").decay(.5).sustain(.2).room(.3).gain(0.85),
  note("[a3,c4,e4]").s("triangle").struct("~ x ~ x").decay(.14).sustain(0).delay(.5).delayfeedback(.6).room(.5).gain(0.24),
  note("a4 c5 e5").s("harmonica").slow(4).delay(.6).delayfeedback(.65).room(.5).gain(0.21),
  s("brown").slow(6).lpf(900).room(.7).gain(0.2)
)
```

## SOUTH-WEST — CLASSICAL (hall forest, no drum machine)

```javascript
setcpm(96/4)

stack(
  s("timpani ~ ~ ~").room(.6).gain(0.55),
  note("<a1 ~ e2 ~>").s("triangle").attack(.4).release(1.2).room(.5).gain(0.5),
  note("[a3,c4,e4]").s("piano").slow(4).room(.3).gain(0.24),
  note("a5 c6 e6 g6").s("glockenspiel").slow(4).room(.45).gain(0.21),
  s("brown").slow(6).lpf(900).room(.7).gain(0.18)
)
```
