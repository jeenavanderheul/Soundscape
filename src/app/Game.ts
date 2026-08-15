import { attachAudioAnalyser, AudioAnalyser } from '../audio/AudioAnalyser';
import { AudioEngine } from '../audio/AudioEngine';
import { ARRIVAL_LEVEL, nextMotionLevel } from '../audio/MotionGate';
import { performanceFrom } from '../music/Performance';
import { PlayerTone } from '../audio/PlayerTone';
import { ResonanceAudio } from '../audio/ResonanceAudio';
import { SpatialAudio } from '../audio/SpatialAudio';
import { StrudelEngine, type NoteKind } from '../audio/StrudelEngine';
import { Clock } from '../core/Clock';
import { createRng } from '../core/rng';
import { createEventBus, EventBus } from '../core/EventBus';
import { createStore, Store } from '../core/stores';
import { InputManager } from '../input/InputManager';
import { PointerLock, PointerLockEvents } from '../input/PointerLock';
import {
  createEmptyLayerGraph,
  diffLayerGraph,
  genreGrammar,
  regionBpm,
  throwStyleFor,
  voiceLabels,
  voiceSections,
} from '../audio/MusicalPrimitives';
import type { MusicalLayerGraph, ThrowStyle } from '../audio/MusicalPrimitives';
import { buildWorldLayerGraph, worldBankLabel } from '../audio/WorldLayerGraph';
import type { SectionStyle } from '../music/ArrangementEngine';
import { GenreAffinityEngine } from '../genres/GenreAffinityEngine';
import { dominantZone, zoneAffinity } from '../genres/GenreZones';
import { headingLabel, lookFor, placeName, NEUTRAL_LOOK } from '../genres/ZonePalette';
import type { GenreEvents } from '../genres/GenreAffinityEngine';
import { createInitialMusicState, MusicState } from '../music/MusicState';
import type { GenreAffinity } from '../music/MusicState';
import { MusicStateAnalyzer } from '../music/MusicStateAnalyzer';
import { RhythmDetector } from '../music/RhythmDetector';
import { TrackBuilder } from '../music/TrackBuilder';
import { createInitialTrackState, trackGrowth, TrackEvents, TrackState } from '../music/TrackState';
import type { TrackGenre, TrackLayerName } from '../music/TrackState';
import { SaveManager } from '../persistence/SaveManager';
import type { SerializableWorld, WorldSave } from '../persistence/WorldSerializer';
import { FrequencyController } from '../player/FrequencyController';
import {
  createInitialProgression,
  isComposerUnlocked,
  ProgressionState,
  recordGenre,
  recordPlayerResonator,
  recordResonance,
  recordStructure,
} from '../progression/ProgressionState';
import { createInitialFrequencyState, FrequencyState } from '../player/FrequencyState';
import { BeatSync } from '../rendering/BeatSync';
import type { BeatEvent } from '../rendering/BeatSync';
import { InterferenceVisuals } from '../rendering/InterferenceVisuals';
import { ForestRenderer, loadTreeSpecies } from '../rendering/ForestRenderer';
import { signalDrive } from '../rendering/signalLevel';
import { advanceScanner, SCANNER_START, type ScannerState } from '../rendering/domeScanner';
import type { Vec3Data } from '../player/FrequencyState';

/** §63: a note Strudel is about to play, and the moment it will sound. */
interface QueuedNote {
  kind: NoteKind;
  atMs: number;
  velocity: number;
}
import { CrowdField, loadCrowdPose } from '../rendering/CrowdField';
import { DomeLights } from '../rendering/DomeLights';
import { Haze } from '../rendering/Haze';
import { advanceSmoke, SMOKE_START, type SmokeState } from '../rendering/smokeState';
import {
  DEFAULT_VOLUME,
  loadVolume,
  quantizeVolume,
  saveVolume,
  stepVolume,
  volumeToGain,
} from '../audio/masterVolume';
import { VolumeReadout } from '../ui/VolumeReadout';
import { FLIGHT_CONFIG } from '../player/FrequencyController';
import { ResonatorMarkers } from '../rendering/ResonatorMarkers';
import { BeaconMarker } from '../rendering/BeaconMarker';
import {
  beaconAt,
  beaconIsStale,
  placeBeacon,
  type LayerBeacon,
} from '../world/LayerBeacons';
import { ParticleSystem } from '../rendering/ParticleSystem';
import { OrbTrail } from '../rendering/OrbTrail';
import { PlayerOrb } from '../rendering/PlayerOrb';
import { Renderer } from '../rendering/Renderer';
import { SpeedStreaks, altitudeBoost } from '../rendering/SpeedStreaks';
import { StructureRenderer } from '../rendering/StructureRenderer';
import { HarmonyBridges, MelodyTrail } from '../rendering/TrackVisuals';
import { WaveTerrain } from '../rendering/WaveTerrain';
import { ResonanceEngine } from '../resonance/ResonanceEngine';
import type { ResonanceEvents } from '../resonance/ResonanceEngine';
import type { ResonanceEvent } from '../resonance/ResonanceEvent';
import { CodeOverlay } from '../ui/CodeOverlay';
import { ExportOverlay } from '../ui/ExportOverlay';
import { exportTrack } from '../music/TrackExport';
import type { LayerPatterns } from '../audio/MusicalPrimitives';
import { Guide } from '../ui/Guide';
import { Hints } from '../ui/Hints';
import { LayerCue } from '../ui/LayerCue';
import { TrackStrip } from '../ui/TrackStrip';
import { scoreHeader } from '../ui/ScoreHeader';
import { HUD } from '../ui/HUD';
import { attachIntroHint } from '../ui/Intro';
import { PauseOverlay } from '../ui/PauseOverlay';
import { FormEmergence } from '../world/FormEmergence';
import { loadLandField } from '../world/LandField';
import type { StructureEvents } from '../world/FormEmergence';
import { createWorldStore, WorldState } from '../world/WorldState';
import { AUTOSAVE_DEBOUNCE_MS, AUTOSAVE_INTERVAL_MS, LOGIC_STEP_MS, WORLD_SEED } from './Config';
import { GameLoop, LogicInterval } from './GameLoop';

const WORLD_UP = { x: 0, y: 1, z: 0 } as const;

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

/**
 * How far behind and above the orb the chase camera sits (§52). Close in:
 * the orb is a small body at a single tone and grows to five times that, so
 * the camera has to start on top of it or the world reads as empty.
 */
/**
 * The camera sits BEHIND the orb and keeps it in view — never on top of it.
 * Both scale with the orb, because it grows to five times its starting size
 * with the track: a fixed distance would end up inside a finished one.
 */
// Nudged out from 3.4 (user, 15 aug: "nu te dichtbij, klein beetje terug").
// This is the resting distance every other camera term is expressed against,
// so raising it moves the whole range back without touching the framing
// correction or the throttle pull-back.
const CAMERA_DISTANCE = 4.8;
const CAMERA_DISTANCE_PER_RADIUS = 2.2;
/**
 * How much further back the camera sits at full throttle, on top of the framing
 * correction. 0.6 puts the orb at about 62% of its resting size — a circle you
 * are chasing rather than a body filling the frame.
 */
const CAMERA_TOP_SPEED_PULLBACK = 0.6;
const CAMERA_HEIGHT = 0.9;
const CAMERA_HEIGHT_PER_RADIUS = 0.7;
/**
 * The camera aims just past the orb rather than far down the path: a long aim
 * flattens the world into a horizon and you lose the overview. The orb flies
 * ahead of the anchor instead, which is where the parallax comes from.
 */
const CAMERA_LOOK_AHEAD = 4;
const CAMERA_LOOK_LIFT = 0.2;
/** How fast the camera swings in behind a turn (1/s); low is a lazy chase. */
const CAMERA_FOLLOW_RATE = 3.5;
/** The camera never goes below this above the landscape (§35). */
const CAMERA_GROUND_CLEARANCE = 1.4;
/** Radians/s that count as banking hard enough to throw a gesture (§33). */
const TURN_THROW_RATE = 1.8;
/** Turning must fall back below this before another throw is armed. */
const TURN_RELEASE_RATE = 0.6;
/** Floor between throws, so a shaky hand cannot machine-gun them. */
const TURN_THROW_GAP_MS = 1200;

/**
 * §60: the sound of a section ARRIVING. A build lifts on a riser, a drop lands
 * on an impact, a break exhales — so the word on screen has something under it.
 */
const SECTION_GESTURE: Record<SectionStyle, Partial<Record<TrackState['form'], ThrowStyle>>> = {
  // §84: DROP II is the payoff, so it hits harder than DROP I.
  driven: { build: 'riser', drop: 'impact', deep: 'sweep', break: 'sweep', return: 'impact' },
  // A swell announces itself with a bell, not with a slam.
  swell: { build: 'bell', drop: 'bell', deep: 'bell', break: 'sweep', return: 'bell' },
  // Jazz: a cymbal-ish shimmer going in, the band hitting on the drop.
  dynamic: { build: 'sweep', drop: 'impact', deep: 'sweep', break: 'bell', return: 'impact' },
  // Dub answers everything with echo.
  echo: { build: 'echo', drop: 'echo', deep: 'echo', break: 'sweep', return: 'echo' },
  mutant: { build: 'riser', drop: 'sweep', deep: 'impact', break: 'echo', return: 'sweep' },
};

/** How much of the track exists, for the HUD (§46). */
function countUnlocked(track: TrackState): number {
  return [
    track.drums.kick, track.drums.snare, track.drums.hats,
    track.bass, track.harmony, track.melody, track.texture,
  ].filter((layer) => layer.unlocked).length;
}

export type GameEvents = ResonanceEvents & StructureEvents & GenreEvents & TrackEvents & {
  /** Strudel-clock beat boundary (§20 M4); consumed by BeatSync. */
  'beat': BeatEvent;
  'audio:unlocked': null;
  'game:started': null;
  'game:suspended': null;
  'game:resumed': null;
};

/** What the startup load attempt found; exposed via the dev debug handle. */
export interface LoadInfo {
  loaded: boolean;
  seedMatch: boolean;
  savedAt: number | null;
  structures: number;
}

/** Dev-only inspection handle (M1 verifier follow-up); excluded from production via the DEV guard. */
interface FrequencyDebug {
  getFrequencyState(): Readonly<FrequencyState>;
  getWorldState(): Readonly<WorldState>;
  getLastResonanceEvents(): ResonanceEvent[];
  getStructures(): WorldState['structures'];
  getInterferenceActiveCount(): number;
  getMusicState(): Readonly<MusicState>;
  getStrudelInfo(): {
    playing: boolean;
    bpm: number;
    evaluations: number;
    samples: boolean;
    soundfonts: boolean;
    local: boolean;
    degraded: boolean;
  };
  getGenreSnapshot(): unknown;
  getProgression(): unknown;
  getAnalysis(): unknown;
  getTrackState(): unknown;
  getInputCounts(): unknown;
  saveNow(): { ok: boolean };
  loadInfo(): LoadInfo;
  resetWorld(): void;
  groundHeightAt(x: number, z: number): number;
  terrainVertexCount(): number;
  /** §146: what the terrain shader is actually being told about the dome. */
  beamUniforms(): Record<string, unknown>;
  forceBeam(intensity: number | null): void;
  teleport(x: number, z: number, y?: number): void;
  /** §176: how much crowd is actually being drawn, and how to force it there. */
  crowdStats(): Record<string, unknown>;
  forceCrowd(layers: number | null): void;
  showForest(on: boolean): void;
}

type DebugWindow = Window & { __FREQUENCY_DEBUG__?: FrequencyDebug };

export interface GameElements {
  container: HTMLElement;
  overlay: HTMLElement;
  unlockButton: HTMLButtonElement;
}

/**
 * Wires EventBus + AudioEngine + Renderer + GameLoop (spec §15, §16).
 * Constructed idle; the AudioContext is created only inside the unlock
 * button's click handler (user gesture, spec §12).
 */
export class Game {
  readonly events: EventBus<GameEvents> = createEventBus<GameEvents>();
  private readonly audioEngine = new AudioEngine();
  private readonly renderer: Renderer;
  private readonly loop: GameLoop;
  private readonly frequencyStore: Store<FrequencyState> = createStore(
    createInitialFrequencyState(),
  );
  private readonly input: InputManager;
  private readonly pointerLockBus: EventBus<PointerLockEvents> =
    createEventBus<PointerLockEvents>();
  private readonly pointerLock: PointerLock;
  private readonly controller: FrequencyController;
  private readonly particles: ParticleSystem;
  private readonly detachIntroHint: () => void;
  private readonly worldStore = createWorldStore(WORLD_SEED);
  private readonly resonanceEngine: ResonanceEngine;
  private readonly logicInterval = new LogicInterval(LOGIC_STEP_MS);
  private readonly interference: InterferenceVisuals;
  private readonly detachInterference: () => void;
  private readonly formEmergence: FormEmergence;
  private readonly structures: StructureRenderer;
  private readonly detachStructures: () => void;
  private readonly detachResonanceCapture: () => void;
  // M4 analysis→world sync (§12, §20): one depth-capped pulse across renderers.
  // Visual world (poster direction): scan-line terrain, player orb, HUD.
  private readonly terrain = new WaveTerrain(WORLD_SEED);
  private readonly orb = new PlayerOrb();
  private readonly orbTrail = new OrbTrail();
  private readonly hud = new HUD();
  private readonly forest = new ForestRenderer(WORLD_SEED);
  private readonly markers = new ResonatorMarkers(this.worldStore.getState().resonators);
  /** §86: the next layer, standing in the world where you can go and get it. */
  private readonly beaconMarker = new BeaconMarker();
  private beacon: LayerBeacon | null = null;
  private beaconSerial = 0;
  private readonly beaconRng = createRng(`beacons-${WORLD_SEED}`);
  private readonly melodyTrail = new MelodyTrail();
  private readonly streaks = new SpeedStreaks(WORLD_SEED);
  /** §45: the region the player is physically in — drives everything visual. */
  private placeGenre: TrackGenre = null;
  /** §33: the look of the region being flown through, eased so it never snaps. */
  private zoneLook = { ...NEUTRAL_LOOK, color: { ...NEUTRAL_LOOK.color } };
  private readonly harmonyBridges = new HarmonyBridges();
  private readonly hints = new Hints();
  /** §67: the optional read-out that says where and how high to fly. */
  private readonly guide = new Guide();
  private readonly codeOverlay = new CodeOverlay();
  private readonly exportOverlay = new ExportOverlay();
  /** Flight time so far, for the export header (§32). */
  private flightMs = 0;
  private worldPatterns: LayerPatterns = {};
  private readonly layerCue = new LayerCue(this.events);
  private readonly beatSync: BeatSync;
  private readonly detachBeatSync: () => void;
  // §11/§20 M4: Strudel shares our AudioContext; its beat boundaries feed the bus.
  private readonly strudelEngine = new StrudelEngine();
  private readonly detachStrudelBeat: () => void;
  private audioAnalyser: AudioAnalyser | null = null;
  // §20 M4 rhythm chain: pulses → RhythmDetector → MusicStore → Strudel graph.
  private readonly musicStore: Store<MusicState> = createStore(createInitialMusicState());
  private readonly rhythmDetector = new RhythmDetector();
  private readonly musicAnalyzer = new MusicStateAnalyzer(this.musicStore, this.rhythmDetector);
  /** Last graph handed to Strudel; setLayerGraph only on real changes (§11 diffs). */
  private lastLayerGraph: MusicalLayerGraph | null = null;
  /** §9/§20 M5: genre affinity evaluated in the logic loop, never per frame. */
  private readonly genreEngine = new GenreAffinityEngine(this.events);
  /** §29: what is actually IN the track; built by intent, saved, visualized. */
  private readonly trackStore: Store<TrackState> = createStore(createInitialTrackState());
  private readonly trackBuilder = new TrackBuilder(
    this.trackStore,
    this.events,
    undefined,
    WORLD_SEED,
  );
  /** Dev diagnostics: how often each pulse source fired this session. */
  private readonly inputCounts = { windReleased: 0, resonancePulse: 0 };
  /** How long the wind has been genuinely held; guards the clap intent. */
  private windHeldMs = 0;
  /** §17: discovered causal laws; unlocks the composer mechanic. */
  private readonly progressionStore: Store<ProgressionState> = createStore(
    createInitialProgression(),
  );
  private readonly detachProgression: Array<() => void> = [];
  /** Bus events buffered between logic steps; drained into FormEmergence.tick. */
  private readonly pendingResonanceEvents: ResonanceEvent[] = [];
  // §18 / MVP item 13: local save, load and reset of the serializable stores.
  private readonly saveManager = new SaveManager(window.localStorage);
  private readonly detachAutosave: () => void;
  /** Periodic flush while structures exist (§18); reuses the tested interval gate. */
  private readonly autosaveInterval = new LogicInterval(AUTOSAVE_INTERVAL_MS);
  private readonly pauseOverlay: PauseOverlay;
  private readonly detachPointerLockPause: () => void;
  private readonly startupLoadInfo: LoadInfo;
  /** §42 gate: starts closed, so a flight begins in silence. */
  private motionLevel = 0;
  /** Has the player flown at all yet? Arriving is not the same as stopping. */
  private hasFlown = false;
  /** Smoothed chase direction: the camera follows, it is never aimed. */
  private readonly camDir = { x: 0, y: 0, z: -1 };
  /** The grammar the last applied graph was written in (§60). */
  private lastGraphGenre: TrackGenre = null;
  /**
   * §63 ONE musical timeline: notes Strudel is about to play, each with the
   * wall-clock moment it sounds. The render loop fires their visuals then — so
   * a kick shockwave IS a kick, and a two-step flashes where the two-step is.
   */
  private noteQueue: QueuedNote[] = [];
  private hatSparkleUntil = 0;
  /** §60: the section word waits for the bar where the music turns. */
  private pendingSection: TrackState['form'] | null = null;
  /** §88: the last scheduler cycle seen, so a bar boundary can be detected. */
  private lastBar = -1;
  /** §93: the read-out that stays — the seven layer slots, no words. */
  private readonly trackStrip = new TrackStrip(document.body);
  /** §33 turn throws: one gesture per turn, never a stream. */
  private turnArmed = true;
  private lastThrowMs = -Infinity;
  private playerTone: PlayerTone | null = null;
  private spatialAudio: SpatialAudio | null = null;
  private resonanceAudio: ResonanceAudio | null = null;
  private unlocked = false;
  private paused = false;
  private disposed = false;
  /** §136: the last performance mapping, for the visual signal drive. */
  private lastPerformance: ReturnType<typeof performanceFrom> | null = null;
  private signalLevelAttribute = '';
  /** §146: the dome signal, advanced every tick from the music. */
  private scanner: ScannerState = SCANNER_START;
  /** §147: the fixtures themselves, hanging in rings around the player. */
  private readonly domeLights = new DomeLights();
  /** §154: the air the light is in, and when the jets fire. */
  private readonly haze = new Haze();
  /** §176: real mocap dancers, as signal. Empty until the track earns them. */
  private readonly crowd = new CrowdField();
  /** Dev only: pin the crowd to a layer count so it can be looked at. */
  private crowdOverride: number | null = null;
  private smoke: SmokeState = SMOKE_START;
  private layerEarnedFrame = false;
  private trackChangedFrame = false;
  private lastKickMs = -9999;
  private lastSnareMs = -9999;
  private signalInstability = 0;
  private signalIntensity = 0;
  /**
   * §161: the accessibility gate the render path did not have. The CSS and
   * four UI files honoured `prefers-reduced-motion`; the WORLD did not, so a
   * player who had asked their system for less motion still got the full
   * pulsing, flashing thing. One number, read once, applied to everything that
   * pulses — and §23 asks for exactly this.
   */
  private readonly motionScale = typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    ? 0.3
    : 1;
  /** §158: reused every frame; never reallocated. */
  private readonly bridgeEnds: Vec3Data[] = [];
  /** §145: what the player asked to hear, 0..1, remembered between flights. */
  private volumeLevel = loadVolume();
  private readonly volumeReadout = new VolumeReadout();
  private mutedFrom = DEFAULT_VOLUME;

  constructor(private readonly elements: GameElements) {
    this.renderer = new Renderer(elements.container);
    this.loop = new GameLoop(new Clock(), this.tick);
    this.input = new InputManager(elements.container, window);
    this.pointerLock = new PointerLock(elements.container, this.pointerLockBus);
    this.pointerLock.attach();
    this.controller = new FrequencyController(this.frequencyStore);
    // §35: the landscape is the floor. One height field, shared by the
    // shader that draws it and the collision that stops the orb.
    this.controller.setGroundSampler((x, z) => this.terrain.groundHeightAt(x, z));
    // §36: giants are solid too — you fly around them, never through them.
    // Hidden trees must not still push the orb aside, or the world lies.
    this.controller.setObstacleSource(() =>
      this.forest.group.visible ? this.forest.solidObstacles() : [],
    );
    this.forest.setGroundSampler((x, z) => this.terrain.groundHeightAt(x, z));
    // §132: the real ground arrives a moment after the void does. Until it
    // lands the world is the generated field; nothing waits on it.
    // §137: the baked tree clouds. Until they arrive the forest is empty, which
    // is a legitimate world.
    void loadTreeSpecies().then((species) => {
      if (species && !this.disposed) this.forest.setSpecies(species);
    });
    void loadLandField().then((land) => {
      if (land && !this.disposed) this.terrain.setLand(land);
    });
    // §176: five megabytes of recorded dance. Same rule as the trees — until
    // it lands there is simply nobody here, which is a world we already had.
    void loadCrowdPose().then((pose) => {
      if (pose && !this.disposed) this.crowd.setPose(pose.manifest, pose.buffers);
    });
    this.particles = new ParticleSystem(WORLD_SEED);
    this.renderer.scene.add(this.particles.points);
    this.detachIntroHint = attachIntroHint(this.events);
    // Resonance core (§8, P5): engine emits the one shared event on this.events.
    this.resonanceEngine = new ResonanceEngine(this.events);
    // Visuals subscribe once at startup; positions resolve from the stores (§15).
    this.interference = new InterferenceVisuals(WORLD_SEED);
    this.renderer.scene.add(this.interference.lines);
    this.detachInterference = this.interference.subscribe(this.events, (event) =>
      this.resolveEventPositions(event.targetId),
    );
    // M3 form emergence (§20): sustained resonance from the same shared bus (P5)
    // becomes persistent StructureData in the world store and meshes in the scene.
    this.formEmergence = new FormEmergence(this.events, this.worldStore, WORLD_SEED);
    this.detachResonanceCapture = this.events.on('resonance:event', (event) => {
      this.pendingResonanceEvents.push(event);
      // §29.5: resonance is track intent too.
      this.trackBuilder.onResonance(event);
      // Terrain grows where resonance happens (user decision, §3.8): the
      // engaged resonator's zone swells and slowly relaxes.
      const target = this.worldStore.getState().resonators.find((r) => r.id === event.targetId);
      if (target) {
        this.terrain.excite(target.id, target.position, target.baseHz, event.strength);
      }
    });
    // Born structures deform the field permanently (§3.8 duration = memory).
    this.detachProgression.push(
      this.events.on('structure:spawned', (structure) => {
        this.terrain.excite(`structure:${structure.id}`, structure.position, structure.hz, 0.8, true);
      }),
    );
    // §17: discovery listeners feed the progression record (never XP).
    const progressIfChanged = (next: (s: ProgressionState) => ProgressionState): void => {
      // Reducers return the SAME object when nothing new was discovered; the
      // store contract requires a fresh object, so identity means "skip".
      if (next(this.progressionStore.getState()) !== this.progressionStore.getState()) {
        this.progressionStore.setState(next);
      }
    };
    this.detachProgression.push(
      this.events.on('resonance:event', (event) => {
        progressIfChanged((s) => recordResonance(s, event));
      }),
      this.events.on('structure:spawned', (structure) => {
        this.progressionStore.setState((s) => recordStructure(s, structure.persistence));
      }),
      this.events.on('genre:snapshot', (snapshot) => {
        if (snapshot.dominant) {
          progressIfChanged((s) => recordGenre(s, snapshot.dominant));
        }
      }),
    );
    this.structures = new StructureRenderer();
    this.renderer.scene.add(this.structures.group);
    this.detachStructures = this.structures.subscribe(this.events);
    // §12 audio→visual bus: beat events + analyser onsets drive the renderers'
    // setPulse hooks through one shared, strobe-capped envelope (§23).
    this.renderer.scene.add(this.terrain.lines);
    this.renderer.scene.add(this.orb.mesh);
    this.renderer.scene.add(this.orbTrail.mesh);
    // User (15 aug): no forest for now, and the crowd fills the space instead.
    // One line to put it back — the ecology, the growth roles and the layer
    // visuals are all still here, they are simply not being drawn.
    this.forest.group.visible = false;
    this.renderer.scene.add(this.forest.group);
    this.renderer.scene.add(this.domeLights.points);
    this.renderer.scene.add(this.haze.points);
    for (const tier of this.crowd.tiers) this.renderer.scene.add(tier);
    this.renderer.scene.add(this.markers.mesh);
    this.renderer.scene.add(this.beaconMarker.group);
    this.renderer.scene.add(this.melodyTrail.line);
    this.renderer.scene.add(this.harmonyBridges.lines);
    this.renderer.scene.add(this.streaks.lines);
    this.beatSync = new BeatSync([
      this.particles,
      this.interference,
      this.structures,
      this.terrain,
      this.orb,
      this.forest,
      this.markers,
      // §147: the rig lifts on the beat like everything else does.
      this.domeLights,
    ]);
    this.detachBeatSync = this.beatSync.subscribe(this.events);
    // §20 M4 synchronized world behavior: the Strudel clock's beat boundaries
    // become 'beat' bus events, the strong pulse BeatSync locks visuals to.
    // §60: hold each new section until the bar where its mix takes effect.
    // §154: the two events the smoke answers to. A layer earned is a breath;
    // a new track clears the room.
    this.events.on('track:layer', () => {
      this.layerEarnedFrame = true;
    });
    this.events.on('track:new', () => {
      this.trackChangedFrame = true;
    });
    this.events.on('track:section', ({ section }) => {
      if (section !== 'none') this.pendingSection = section;
    });
    this.detachStrudelBeat = this.strudelEngine.onBeat((event) => {
      this.events.emit('beat', { atMs: event.atMs });
      // §88: a bar is a CYCLE of the scheduler, not every fourth beat of a
      // counter that started whenever the ticker did. The graph is applied on
      // the cycle boundary, so the word has to be read off the same clock or
      // it drifts up to three beats away from the sound it announces.
      const bar = Math.floor(event.cycle);
      const onBar = bar !== this.lastBar;
      this.lastBar = bar;
      // §84: the riser is a SOUND, not a word, so it is consumed on its own
      // bar rather than queuing behind the phase and layer words. Sharing that
      // chain meant a riser was swallowed whenever a phase word landed on the
      // same bar — which is every drop, the one place it has to be heard.
      if (onBar && this.trackBuilder.arrangement.takeRiser() && this.motionLevel > 0.25) {
        this.strudelEngine.schedule(
          { kind: 'throw', gain: 0.7 * this.motionLevel, style: 'riser' },
          'beat',
        );
      }
      // §60: the section word and its sound both land on the bar where the mix
      // actually changes — never before it, or the screen lies about the music.
      if (this.pendingSection !== null && onBar) {
        const section = this.pendingSection;
        this.pendingSection = null;
        // §90: the phase is no longer announced as a word that flashes and is
        // gone — the strip shows it continuously, alongside where in the arc
        // it sits. What still happens here is the SOUND of it arriving.
        const style = genreGrammar(this.trackStore.getState().genre).sectionStyle;
        const gesture = SECTION_GESTURE[style][section];
        if (gesture !== undefined && this.motionLevel > 0.25) {
          this.strudelEngine.schedule({ kind: 'throw', gain: 0.55 * this.motionLevel, style: gesture }, 'beat');
        }
      }
      if (onBar) this.refreshTrackStrip();
      // §63: the layer visuals no longer fire off the beat index — they come
      // from the notes Strudel is about to play, queued below.
      this.queueUpcomingNotes();
    });
    // §18: hydrate before the autosave subscription exists, so restoring a
    // save never immediately rewrites the snapshot it was loaded from.
    const save = this.saveManager.load();
    const seedMatch = save !== null && save.seed === WORLD_SEED;
    if (save && seedMatch) this.hydrate(save);
    this.startupLoadInfo = {
      loaded: seedMatch,
      seedMatch,
      savedAt: save?.savedAt ?? null,
      structures: seedMatch && save ? save.structures.length : 0,
    };
    this.detachAutosave = this.worldStore.subscribe(() => {
      this.saveManager.autosave(this.snapshotWorld(), AUTOSAVE_DEBOUNCE_MS);
    });
    // Esc pause (spec §5): losing pointer lock via Esc pauses; Esc outside
    // lock toggles. The overlay owns its DOM; the Game owns pause semantics.
    this.pauseOverlay = new PauseOverlay({
      onResume: () => this.resume(),
      onVolume: (level) => this.setVolume(level),
      volume: () => this.volumeLevel,
      onSaveTrack: () => {
        this.saveManager.save(this.snapshotWorld());
        return 'Track saved. It will be here when you come back.';
      },
      onExportTrack: () => {
        this.exportOverlay.show(this.exportedTrack());
        return 'Strudel code shown — E closes it.';
      },
      onNewJourney: () => this.resetWorld(),
    });
    this.detachPointerLockPause = this.pointerLockBus.on('pointerlock:released', () => {
      if (this.unlocked && !this.paused) this.pause();
    });
    window.addEventListener('keydown', this.onKeyDown);
    if (import.meta.env.DEV) window.addEventListener('keydown', this.onRegionKey);
    // Dev-only debug handle; the whole block is dropped from production builds.
    if (import.meta.env.DEV) {
      (window as DebugWindow).__FREQUENCY_DEBUG__ = {
        getFrequencyState: () => this.frequencyStore.getState(),
        getWorldState: () => this.worldStore.getState(),
        // Bounded copy: the engine history is already capped (§10).
        getLastResonanceEvents: () => [...this.resonanceEngine.history],
        getStructures: () => [...this.worldStore.getState().structures],
        getInterferenceActiveCount: () => this.interference.activeCount,
        getMusicState: () => this.musicStore.getState(),
        getStrudelInfo: () => this.strudelEngine.status,
        getAnalysis: () => (this.audioAnalyser ? { ...this.audioAnalyser.snapshot } : null),
        getTrackState: () => this.trackStore.getState(),
        getInputCounts: () => ({ ...this.inputCounts }),
        getGenreSnapshot: () => this.genreEngine.current,
        getProgression: () => ({
          ...this.progressionStore.getState(),
          composerUnlocked: isComposerUnlocked(this.progressionStore.getState()),
        }),
        saveNow: () => this.saveManager.save(this.snapshotWorld()),
        loadInfo: () => ({ ...this.startupLoadInfo }),
        resetWorld: () => this.resetWorld(),
        // Reaching a genre region means flying 150 units; this makes each
        // region reachable in a test without waiting for the trip.
        groundHeightAt: (x: number, z: number) => this.terrain.groundHeightAt(x, z),
        // §176: three times now a light system has been called invisible when
        // it was simply being told the wrong number. The crowd ships with the
        // measurement already attached.
        crowdStats: () => ({ ...this.crowd.stats(), ...this.crowd.uniformSnapshot() }),
        forceCrowd: (layers: number | null) => {
          this.crowdOverride = layers;
        },
        // §138: the LOD field's whole vertex cost, so the budget can be checked
        // from a browser rather than from a comment.
        terrainVertexCount: () => this.terrain.vertexCount,
        beamUniforms: () => this.terrain.beamUniforms(),
        forceBeam: (intensity: number | null) => this.terrain.forceBeam(intensity),
        // Look at the world without the forest in front of it.
        showForest: (on: boolean) => {
          this.forest.group.visible = on;
        },
        teleport: (x: number, z: number, y?: number) =>
          this.frequencyStore.setState((s) => ({
            ...s,
            position: { x, y: y ?? s.position.y, z },
          })),
      };
    }
    elements.container.addEventListener('click', this.onContainerClick);
    elements.unlockButton.addEventListener('click', this.onUnlockClick);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    this.elements.container.removeEventListener('click', this.onContainerClick);
    this.elements.unlockButton.removeEventListener('click', this.onUnlockClick);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keydown', this.onRegionKey);
    this.detachPointerLockPause();
    this.pauseOverlay.dispose();
    this.volumeReadout.dispose();
    this.loop.stop();
    this.pointerLock.exit();
    this.pointerLock.detach();
    this.input.detach();
    this.detachIntroHint();
    this.detachInterference();
    this.detachResonanceCapture();
    for (const off of this.detachProgression) off();
    this.detachStructures();
    this.detachBeatSync();
    this.detachStrudelBeat();
    this.strudelEngine.dispose();
    this.detachAutosave();
    // Flush the latest world before teardown; dispose cancels pending autosaves.
    if (this.unlocked) this.saveManager.save(this.snapshotWorld());
    this.saveManager.dispose();
    this.playerTone?.dispose();
    this.spatialAudio?.dispose();
    this.resonanceAudio?.dispose();
    this.renderer.scene.remove(this.particles.points);
    this.particles.dispose();
    this.renderer.scene.remove(this.interference.lines);
    this.interference.dispose();
    this.renderer.scene.remove(this.structures.group);
    this.structures.dispose();
    this.renderer.scene.remove(this.terrain.lines);
    this.terrain.dispose();
    this.renderer.scene.remove(this.forest.group);
    this.forest.dispose();
    this.renderer.scene.remove(this.domeLights.points);
    this.domeLights.dispose();
    this.renderer.scene.remove(this.haze.points);
    this.haze.dispose();
    for (const tier of this.crowd.tiers) this.renderer.scene.remove(tier);
    this.crowd.dispose();
    this.trackStrip.dispose();
    this.renderer.scene.remove(this.beaconMarker.group);
    this.beaconMarker.dispose();
    this.renderer.scene.remove(this.markers.mesh);
    this.markers.dispose();
    this.renderer.scene.remove(this.melodyTrail.line);
    this.melodyTrail.dispose();
    this.renderer.scene.remove(this.harmonyBridges.lines);
    this.harmonyBridges.dispose();
    this.hints.dispose();
    this.codeOverlay.dispose();
    this.exportOverlay.dispose();
    this.guide.dispose();
    this.streaks.dispose();
    this.layerCue.dispose();
    this.renderer.scene.remove(this.orb.mesh);
    this.orb.dispose();
    this.orbTrail.dispose();
    this.hud.dispose();
    this.renderer.dispose();
    if (import.meta.env.DEV) delete (window as DebugWindow).__FREQUENCY_DEBUG__;
    await this.audioEngine.dispose();
  }

  /** One frame: input snapshot → controller → store → audio + particles + camera (spec §15, §16). */
  private readonly tick = (deltaMs: number, elapsedMs: number): void => {
    const snapshot = this.input.snapshot();
    // The player has flown once they have ASKED to. Velocity was the obvious
    // signal and the wrong one: a restored save arrives already moving, so the
    // arrival was over before the visitor had touched anything.
    if (snapshot.axes.moveZ !== 0 || snapshot.axes.moveX !== 0 || snapshot.buttons.windHold) {
      this.hasFlown = true;
    }
    this.controller.update(snapshot, deltaMs);
    // §3.3: timed excitations (LMB release, Space) are the rhythm onsets.
    // §11: reveal the pattern the world wrote — read-only, never a REPL.
    if (snapshot.codeToggled) this.codeOverlay.toggle();
    if (snapshot.guideToggled) this.guide.toggle();
    this.flightMs += deltaMs;
    // §32: hand the finished track back as source.
    if (snapshot.trackExported) this.exportOverlay.toggle(this.exportedTrack());
    const deliberateRelease =
      snapshot.windReleased && !snapshot.resonancePulse && this.windHeldMs >= 400;
    this.windHeldMs = snapshot.buttons.windHold ? this.windHeldMs + deltaMs : 0;
    if (snapshot.windReleased || snapshot.resonancePulse) {
      if (snapshot.windReleased) this.inputCounts.windReleased += 1;
      if (snapshot.resonancePulse) this.inputCounts.resonancePulse += 1;
      this.rhythmDetector.onOnset(elapsedMs);
      // §29.5: the same action is TRACK INTENT — its register carries meaning.
      const acting = this.frequencyStore.getState();
      this.trackBuilder.onAction({
        atMs: elapsedMs,
        hz: acting.hz,
        amplitude: acting.amplitude,
        // A clap intent is a DELIBERATE wind release (§29.3): the wind was
        // genuinely held first — never a Space tap or an input glitch.
        release: deliberateRelease,
      });
    }
    // §17 composer reveal: once causal understanding is demonstrated, a
    // resonance pulse in empty space CREATES a resonator from the player's
    // current frequency — the world becomes intentionally composable.
    if (snapshot.resonancePulse && isComposerUnlocked(this.progressionStore.getState())) {
      this.tryCreatePlayerResonator();
    }
    const state = this.frequencyStore.getState();
    const dtSeconds = deltaMs / 1000;
    // Lower-frequency logical loop (§15): resonance never runs per render frame.
    if (this.logicInterval.shouldStep(deltaMs)) {
      const resonators = this.worldStore.getState().resonators;
      this.resonanceEngine.tick(elapsedMs, state, resonators);
      this.formEmergence.tick(elapsedMs, this.pendingResonanceEvents, resonators);
      // §3.6: dissonance flows from the same shared events (P5) into MusicState.
      const pending = this.pendingResonanceEvents;
      const eventDissonance =
        pending.length > 0
          ? pending.reduce((sum, event) => sum + event.dissonance, 0) / pending.length
          : null;
      this.pendingResonanceEvents.length = 0;
      // §10: analyzers run in this lower-frequency loop, never per render frame.
      this.musicAnalyzer.update(
        elapsedMs,
        state,
        this.audioAnalyser?.snapshot.lowBand ?? 0,
        eventDissonance,
      );
      // §29.5: WHERE you are is a genre too — every direction of the world
      // leans toward one attractor; behaviour and place carry equal weight.
      // §56: ONE source for both HUD lines and for the music. The heading the
      // player is flying decides the region; the distance from spawn still
      // gates it, so the start is neutral until a direction has been chosen.
      const zone = zoneAffinity(state.position, this.flightHeading(state));
      this.genreEngine.update(elapsedMs, this.musicStore.getState(), zone);
      const genre = this.genreEngine.current;
      // §29: the Track Builder interprets intent into layers. Flight speed is
      // the tempo; energy drives the arrangement (§29.7).
      this.trackBuilder.tick(
        elapsedMs,
        this.musicStore.getState(),
        {
          velocity: state.velocity,
          hz: state.hz,
          energy: clamp01(state.amplitude),
          altitude: state.position.y - this.terrain.groundHeightAt(state.position.x, state.position.z),
          // Climbing builds the track, diving out of the build is the drop.
          climb: this.controller.climbRate,
        },
        genre?.affinity,
      );
      const track = this.trackStore.getState();
      this.throwOnTurn(elapsedMs, track.genre);
      // §29.6: every layer has a visual system.
      // §63: the sparkle is a HAT, not a flag — it lights on the note and dies
      // with it, so particles never shimmer through a bar that has no hats.
      this.particles.setSparkle(performance.now() < this.hatSparkleUntil);
      this.terrain.setBass(track.bass.unlocked ? 1 : 0);
      // §136.6/§136.15: the picture has an intensity and it follows the music,
      // so the line quality of the whole field is decided here and nowhere
      // else. Speed and dissonance are what pull it apart.
      const drive = signalDrive({
        growth: trackGrowth(track),
        rms: this.audioAnalyser?.snapshot.rms ?? 0,
        section: track.form,
        speed01: clamp01(state.velocity / FLIGHT_CONFIG.maxSpeed),
        grit: this.lastPerformance?.grit ?? 0,
      });
      this.terrain.setSignal(drive.intensity, drive.instability * this.motionScale);
      // §160: the treatment pass takes the same two numbers the world does, so
      // the image and the geometry are answering one signal rather than two.
      //
      // Persistence is REVERB in §136.10's terms, and the closest thing this
      // game has to reverb is space: the more of the track is standing and the
      // higher you are, the longer the world remembers. Displacement is
      // instability, exactly as the terrain uses it. Grain is texture — the
      // layer whose whole job is fine detail. Clipping only at the top of the
      // range, so the whites blow on a drop and nowhere else.
      const post = this.renderer.post;
      post.setReducedMotion(this.motionScale < 1);
      post.setPersistence(0.25 + drive.intensity * 0.5);
      post.setEcho(2 + Math.round(drive.intensity * 6));
      post.setDisplacement(drive.instability);
      post.setGrain(0.18 + (track.texture.unlocked ? 0.3 : 0) * drive.intensity);
      post.setClipping(Math.max(0, drive.intensity - 0.65) * 2.4);
      this.signalInstability = drive.instability;
      this.signalIntensity = drive.intensity;
      // §143: the interface is part of the instrument. At the top of the range
      // the type comes out of register and the grain thickens; everywhere else
      // this is a no-op, and it only ever writes when the level changes.
      const level = String(Math.min(5, Math.round(drive.intensity * 5)));
      if (level !== this.signalLevelAttribute) {
        this.signalLevelAttribute = level;
        document.documentElement.dataset['signal'] = level;
      }
      this.melodyTrail.setLevel(track.melody.unlocked ? 1 : 0);
      this.harmonyBridges.setLevel(track.harmony.unlocked ? 1 : 0);
      // §9.1 world tendency: repetition organizes structures onto the grid.
      this.structures.setOrganization(genre?.affinity.techno ?? 0);
      // §9.2 world tendency: sustained space thickens the fog. §103 left two
      // worlds, so what thickens it is distance from the driven one.
      this.renderer.setAtmosphere(1 - (genre?.affinity.techno ?? 0));
      // §33: EVERY DIRECTION IS A PLACE. Colour, horizon and haze come from
      // the same affinities as the music, eased so crossing a border is a
      // journey rather than a switch.
      this.applyZoneLook(zone, dtSeconds);
      // §45: what you SEE follows where you ARE. The track's genre is smoothed
      // behaviour and can lag or stay null; the land must never lie about the
      // region you are standing in.
      // 0.2 claimed a region while the player was still drifting out of the
      // neutral middle, so spawn already read as Techno. 0.4 means you are
      // genuinely inside one before the world says so.
      this.placeGenre = dominantZone(zone, 0.4);
      // §9.5 world tendency: mutation destabilizes existing form. SUB PRESSURE
      // is the rougher of the two worlds, so it is the one that unsettles it.
      this.structures.setMutation(genre?.affinity['sub-pressure'] ?? 0);
      // §97/§109: the score, grouped by role and headed the way the presets
      // these worlds came from are headed — except every value in that header
      // is live. Read it top to bottom while flying and you can see the thing
      // working: which rungs you hold, where you are in the thirty-two, and
      // the three performance numbers being fed into the patterns below.
      const playingTrack = this.trackStore.getState();
      this.codeOverlay.update(
        this.strudelEngine.code,
        this.lastLayerGraph ? voiceLabels(this.lastLayerGraph) : [],
        scoreHeader({
          track: playingTrack,
          cycle: this.trackBuilder.arrangement.cycle,
          style: genreGrammar(playingTrack.genre).sectionStyle,
          trackNumber: this.trackBuilder.trackNumber,
          performance: this.lastLayerGraph?.performance,
          energy: clamp01(state.amplitude),
          bank: worldBankLabel(playingTrack),
        }),
        this.lastLayerGraph ? voiceSections(this.lastLayerGraph) : [],
      );
      // §41: the one line that makes "I hear no difference" checkable.
      const info = this.strudelEngine.status;
      const playing = this.trackStore.getState();
      this.codeOverlay.setStatus(
        `${info.samples ? (info.local ? 'local kit' : 'remote kit') : 'SYNTH FALLBACK — samples failed'} · ` +
          `${playing.genre ?? 'void'} · ${worldBankLabel(playing)} · ` +
          `${Math.round(playing.bpm)} bpm`,
      );
      // Context hints: whispered at the teachable moment, once each.
      this.hints.update({
        elapsedMs,
        state,
        music: this.musicStore.getState(),
        resonators: this.worldStore.getState().resonators,
      });
      this.updateStrudelGraph();
      if (this.audioAnalyser) {
        const stepSeconds = LOGIC_STEP_MS / 1000;
        this.audioAnalyser.update(stepSeconds);
        this.beatSync.update(this.audioAnalyser.snapshot, stepSeconds);
      }
    }
    // §18: periodic flush every ~15 s while persistent structures exist, so a
    // crash never loses more than one interval of a built world.
    if (
      this.autosaveInterval.shouldStep(deltaMs) &&
      this.worldStore.getState().structures.length > 0
    ) {
      this.saveManager.save(this.snapshotWorld());
    }
    // §42: one gate, read by the track, the tone and the drones alike.
    // The room is audible until the player first flies; after that, stopping is
    // silence exactly as §42 says.
    this.motionLevel = nextMotionLevel(
      this.motionLevel,
      state.velocity,
      dtSeconds,
      this.hasFlown ? 0 : ARRIVAL_LEVEL,
    );
    this.playerTone?.update(state, dtSeconds, this.motionLevel);
    this.spatialAudio?.setMotion(this.motionLevel);
    this.spatialAudio?.setListenerPose(state.position, state.direction, WORLD_UP);
    this.particles.update(state, dtSeconds);
    this.interference.update(dtSeconds);
    this.structures.update(dtSeconds);
    // Visual world: the player's wind excites the field directly — the first
    // cause-effect the eye gets, before any resonator is found.
    if (state.amplitude > 0.05) {
      this.terrain.excite('player', state.position, state.hz, state.amplitude * 0.12);
    }
    // §146: the dome turns EVERY FRAME. It used to be advanced inside the 10 Hz
    // logic loop while being handed the frame's delta, which made it turn six
    // times too slowly — one lap every two and a half minutes, which reads as
    // a shadow rather than as a light. A beam also has to move smoothly: at
    // 10 Hz it steps.
    const analysis = this.audioAnalyser?.snapshot;
    const scannerTrack = this.trackStore.getState();
    this.scanner = advanceScanner(
      this.scanner,
      {
        bpm: scannerTrack.bpm,
        section: scannerTrack.form,
        // §148: the world holding the light decides HOW it moves.
        genre: scannerTrack.genre,
        low: analysis?.lowBand ?? 0,
        mid: analysis?.midBand ?? 0,
        high: analysis?.highBand ?? 0,
        // Same clock the kick was stamped with: the tick's elapsedMs is the
        // game clock and performance.now() is not, and mixing them makes the
        // pulse fire at random.
        sinceKick: (performance.now() - this.lastKickMs) / 1000,
        sinceSnare: (performance.now() - this.lastSnareMs) / 1000,
        instability: this.signalInstability,
        // §175: five of seven standing turns the rig into one circle.
        layers: countUnlocked(scannerTrack),
      },
      dtSeconds,
    );
    // §161: the dome still turns under reduced motion — it is the clock of the
    // world — but it stops throwing hard light and hard deformation.
    this.terrain.setScanner(
      this.motionScale < 1
        ? { ...this.scanner, intensity: this.scanner.intensity * this.motionScale }
        : this.scanner,
      state.position,
    );
    this.domeLights.update(this.scanner, state.position, elapsedMs / 1000);
    // §154: the air follows the arc of the track, and the jets fire on the
    // beat — a blast between two beats reads as a fault, not as an effect.
    this.smoke = advanceSmoke(
      this.smoke,
      {
        section: scannerTrack.form,
        intensity: this.signalIntensity,
        sinceKick: (performance.now() - this.lastKickMs) / 1000,
        layerEarned: this.layerEarnedFrame,
        trackChanged: this.trackChangedFrame,
      },
      dtSeconds,
    );
    this.layerEarnedFrame = false;
    this.trackChangedFrame = false;
    this.haze.update(
      this.smoke.density,
      this.smoke.blast * this.motionScale,
      state.position,
      dtSeconds,
    );
    this.domeLights.setHaze(this.smoke.density);
    // §176: the crowd is not scenery, it is what the track has earned. It reads
    // the same beam the terrain does, so a dancer outside the sweep is almost
    // nothing and resolves out of the dark as the light comes round.
    this.crowd.setScanner(
      this.motionScale < 1
        ? { ...this.scanner, intensity: this.scanner.intensity * this.motionScale }
        : this.scanner,
      state.position,
    );
    this.crowd.setSignal(
      this.crowdOverride === null ? this.signalIntensity : 1,
      this.crowdOverride ?? countUnlocked(scannerTrack),
    );
    // The kick is an event, not a band: a transient that decays, stamped from
    // the same clock the dome uses so the crowd hits on the beat the light does.
    this.crowd.setDrums(
      Math.max(0, 1 - (performance.now() - this.lastKickMs) / 220),
      analysis?.lowBand ?? 0,
      analysis?.highBand ?? 0,
    );
    this.crowd.setReducedMotion(this.motionScale < 1);
    this.crowd.update(
      state.position,
      (x, z) => this.terrain.groundHeightAt(x, z),
      elapsedMs / 1000,
    );
    this.terrain.update(dtSeconds, elapsedMs / 1000, state.position);
    this.forest.setDepth(trackGrowth(this.trackStore.getState()));
    this.forest.update(
      state.position,
      this.placeGenre,
      this.trackStore.getState(),
      elapsedMs / 1000,
    );
    // Height above the land, not above zero: what matters is how far the ground
    // is, because the ground is what makes speed visible.
    const altitude =
      state.position.y - this.terrain.groundHeightAt(state.position.x, state.position.z);
    // §36: speed widens the lens, and widens it further where there is no
    // ground detail left to sell the speed.
    this.renderer.camera.setSpeedFactor(state.energy, altitudeBoost(altitude));
    this.markers.update(elapsedMs / 1000);
    this.beaconMarker.update(elapsedMs / 1000, this.renderer.camera.instance.position.y);
    this.updateBeacon(elapsedMs);
    this.melodyTrail.update(state.position, dtSeconds);
    // Bridges connect the sounding things: resonators plus born structures.
    // §158: filled into one scratch array rather than built out of two maps
    // and a spread — this runs every render frame, and three arrays a frame is
    // a steady drip of garbage for the collector to stop the world over.
    const world = this.worldStore.getState();
    this.bridgeEnds.length = 0;
    for (const resonator of world.resonators) this.bridgeEnds.push(resonator.position);
    for (const structure of world.structures) this.bridgeEnds.push(structure.position);
    this.harmonyBridges.update(this.bridgeEnds, state.position);
    // §63: every visual event is a real note, fired at the moment it sounds.
    this.fireDueNotes(performance.now(), state.position);
    // §29.6: the orb and the cloud around it ARE the track so far — and §42:
    // stand still and do nothing and it sinks back to its first form while the
    // music goes out. Nothing is lost: the layers stay earned, so moving again
    // grows the orb straight back to where the track is.
    const growth = trackGrowth(this.trackStore.getState()) * this.motionLevel;
    this.orb.setGrowth(growth);
    this.particles.setGrowth(growth);
    // §52: the shape of the orb is how it is being flown.
    this.orb.setFlight(this.controller.yawRate, this.controller.climbRate, dtSeconds);
    this.orb.update(state, this.audioAnalyser?.snapshot.rms ?? 0, dtSeconds, elapsedMs / 1000);
    // §35: what the orb clears grows with the orb — a small orb hugs the land.
    this.controller.setOrbRadius(this.orb.radius + 0.35);
    // §33: streaks rushing past the orb are what makes speed legible.
    this.streaks.update(
      state.position,
      {
        x: state.direction.x * state.velocity,
        y: state.direction.y * state.velocity,
        z: state.direction.z * state.velocity,
      },
      dtSeconds,
      altitude,
    );
    this.guide.update({
      genre: this.trackStore.getState().genre,
      heading: headingLabel(this.flightHeading(state)),
      energy: clamp01(state.amplitude),
      beacon: this.beaconBearing(state),
    });
    this.hud.update(state, {
      heading: headingLabel(this.flightHeading(state)),
      biome: placeName(this.placeGenre),
      speed: this.controller.throttleLevel,
      hyper: this.controller.hyper,
      track: this.trackBuilder.trackNumber,
      trackGenre: this.trackStore.getState().genre ?? 'forming',
      layers: countUnlocked(this.trackStore.getState()),
      maxLayers: 7,
    });
    // Chase camera (user decision): it sits behind the orb and follows it. The
    // player never aims the camera — they fly, and the camera comes along, so
    // it reads as flying BEHIND the orb rather than looking around from it.
    const camera = this.renderer.camera.instance;
    const { position, direction, velocity } = state;
    // Follow where the orb is actually going; at a standstill keep the last
    // heading so the camera never spins on the spot.
    const heading = velocity > 0.6 ? state.direction : direction;
    const follow = 1 - Math.exp(-CAMERA_FOLLOW_RATE * dtSeconds);
    this.camDir.x += (heading.x - this.camDir.x) * follow;
    this.camDir.y += (heading.y * 0.6 - this.camDir.y) * follow; // flatter than the flight
    this.camDir.z += (heading.z - this.camDir.z) * follow;
    const length = Math.hypot(this.camDir.x, this.camDir.y, this.camDir.z) || 1;
    const dirX = this.camDir.x / length;
    const dirY = this.camDir.y / length;
    const dirZ = this.camDir.z / length;
    // Back off as the orb grows, so it stays a body you are following. The
    // framing scale then cancels what the widening lens would have done to the
    // orb's size, so speed no longer decides how far away it looks — and on top
    // of that steady frame the throttle adds a deliberate, bounded pull-back,
    // user (15 aug): "in de snelste mode mag de camera nog iets verder naar
    // achter dat je de orb ziet als rondje". The floor keeps the camera off the
    // orb when the lens is at its widest.
    const back = Math.max(
      this.orb.radius * 1.9,
      (CAMERA_DISTANCE + this.orb.radius * CAMERA_DISTANCE_PER_RADIUS) *
        this.renderer.camera.framingScale() *
        (1 + Math.min(1, Math.max(0, state.energy)) * CAMERA_TOP_SPEED_PULLBACK),
    );
    const lift = CAMERA_HEIGHT + this.orb.radius * CAMERA_HEIGHT_PER_RADIUS;
    const camX = position.x - dirX * back;
    const camZ = position.z - dirZ * back;
    // The camera stays above the landscape too. Letting it dip under the grid
    // is what made the orb look like it was inside the terrain (§35).
    const camY = Math.max(
      position.y - dirY * back + lift,
      this.terrain.groundHeightAt(camX, camZ) + CAMERA_GROUND_CLEARANCE,
    );
    camera.position.set(camX, camY, camZ);
    // The camera stays where it is and aims further down the flight path, so
    // the orb sits forward and low in the frame with the world opening up
    // ahead of it — rather than dead centre with its own back filling the view.
    camera.lookAt(
      position.x + direction.x * CAMERA_LOOK_AHEAD,
      position.y + direction.y * CAMERA_LOOK_AHEAD + CAMERA_LOOK_LIFT + this.orb.radius * 0.3,
      position.z + direction.z * CAMERA_LOOK_AHEAD,
    );
    // §151: the trail is residue now, not a ribbon, so it no longer needs the
    // camera — there is no surface left that could face the wrong way.
    this.orbTrail.update(
      state.position,
      {
        x: state.direction.x * state.velocity,
        y: state.direction.y * state.velocity,
        z: state.direction.z * state.velocity,
      },
      this.controller.throttleLevel,
      growth,
      dtSeconds,
    );
    this.renderer.render();
  };

  /** §11: rebuild the layer graph from MusicState; hand Strudel only real diffs at bar boundaries. */
  private updateStrudelGraph(): void {
    if (!this.unlocked) return;
    const flight = this.frequencyStore.getState();
    // §3: the eleven elements as behaviour — altitude above the actual ground,
    // the wind in your hand, the register you are in and the dissonance you are
    // causing shape every voice, continuously.
    const performance = performanceFrom(this.musicStore.getState(), {
      altitude: flight.position.y - this.terrain.groundHeightAt(flight.position.x, flight.position.z),
      amplitude: flight.amplitude,
      velocity: flight.velocity,
    });
    const next = buildWorldLayerGraph({
      music: this.musicStore.getState(),
      affinity: this.genreEngine.current?.affinity,
      structures: this.worldStore.getState().structures,
      track: this.trackStore.getState(),
      patterns: this.worldPatterns,
      // §42: no movement, no music. The gate ramps up quickly and decays over
      // ~1.5s, so stopping fades the world out rather than switching it off.
      motion: this.motionLevel,
      // §87: energy is the WIND YOU ARE HOLDING, not how fast you are going.
      // Speed used to feed this, so flying hard subdivided the hats on top of
      // everything else speed already did — three accelerations stacked, and
      // the track sounded hurried. Speed now only decides how far into the
      // arc you get; what you do with your hand is what is heard.
      energy: clamp01(flight.amplitude),
      // §81: height and wind, for the grammars that write themselves from it.
      performance,
    });
    next.performance = performance;
    this.lastPerformance = performance;
    // §118: which reading of this world track N is.
    next.dna = this.trackBuilder.dna;
    // A world with no clock cannot make a sound: cpm 0 means no pattern ever
    // advances, and an arriving visitor who has not worked out that W exists
    // gets literal silence (measured: rms 0.005 after twenty seconds). Until
    // the first flight the region's own resting tempo runs the atmosphere.
    //
    // Deliberately here and NOT in TrackBuilder: giving the builder a clock
    // let a rung unlock before the kick, because time is what its patience is
    // made of. This touches what is HEARD, never what is earned.
    if (next.bpm <= 0 && !this.hasFlown) {
      next.bpm = regionBpm(genreGrammar(this.placeGenre));
    }
    // §91: nothing outside the world may touch the clock. Height is colour.
    // Endless journey: which variation each layer is playing right now.
    next.variations = this.trackBuilder.variations;
    if (this.lastLayerGraph && diffLayerGraph(this.lastLayerGraph, next).length === 0) return;
    // §60: arriving in another world lands on the next BEAT, not the next bar.
    // At 132 bpm a bar is 1.8s and a beat 0.45s, so a crossing is unmistakable
    // inside the three seconds the player is given to notice it.
    const worldChanged = this.trackStore.getState().genre !== this.lastGraphGenre;
    this.lastGraphGenre = this.trackStore.getState().genre;
    this.lastLayerGraph = next;
    this.strudelEngine.setLayerGraph(next, worldChanged ? 'beat' : 'bar');
  }

  /**
   * §91: where the beacon sits relative to the nose, so the crosshair can
   * point at it. Bearing is signed off the flight heading; rise is how far
   * above or below the orb it stands.
   */
  private beaconBearing(state: FrequencyState): {
    layer: TrackLayerName;
    bearing: number;
    rise: number;
    distance: number;
  } | null {
    const beacon = this.beacon;
    if (beacon === null) return null;
    const dx = beacon.position.x - state.position.x;
    const dz = beacon.position.z - state.position.z;
    const to = Math.atan2(dx, -dz);
    let bearing = to - this.flightHeading(state);
    while (bearing > Math.PI) bearing -= Math.PI * 2;
    while (bearing < -Math.PI) bearing += Math.PI * 2;
    return {
      layer: beacon.layer,
      bearing,
      rise: beacon.position.y - state.position.y,
      distance: Math.hypot(dx, dz),
    };
  }

  /** §90: redraw the read-out — arc position, phase, layers, what is on offer. */
  private refreshTrackStrip(): void {
    const track = this.trackStore.getState();
    this.trackStrip.update({
      track,
      cycle: this.trackBuilder.arrangement.cycle,
      style: genreGrammar(track.genre).sectionStyle,
      trackNumber: this.trackBuilder.trackNumber,
      beaconLayer: this.beacon?.layer ?? null,
    });
  }

  /**
   * §86: keep exactly one beacon standing — the next rung of this world's
   * ladder, somewhere you have to steer to. Fly through it and the layer is
   * yours on the spot; leave it far enough behind and the world puts the next
   * one somewhere else.
   */
  private updateBeacon(elapsedMs: number): void {
    const flight = this.frequencyStore.getState();
    if (this.beacon !== null) {
      const hit = beaconAt([this.beacon], flight.position);
      if (hit !== null) {
        // The ladder still decides the order, so a beacon that is no longer
        // next simply disappears instead of granting the wrong layer.
        this.trackBuilder.collectBeacon(hit.layer, elapsedMs);
        this.beacon = null;
      } else if (beaconIsStale(this.beacon, flight.position)) {
        this.beacon = null;
      }
    }
    if (this.beacon === null) {
      this.beaconSerial += 1;
      this.beacon = placeBeacon(
        this.trackBuilder.offeredLayer(),
        flight.position,
        Math.atan2(flight.direction.x, -flight.direction.z),
        this.beaconRng,
        this.beaconSerial,
      );
      this.beaconMarker.show(this.beacon);
    }
  }

  /**
   * Dev-only region jump: 1-8 drop the player into the heart of a compass
   * region, 9 climbs into Experimental, 0 dives into Dub. Verifying that a
   * direction really does rewrite the music takes seconds instead of a
   * two-minute flight. Dropped from production builds.
   */
  private readonly onRegionKey = (event: KeyboardEvent): void => {
    if (!this.unlocked || this.paused) return;
    const spots: Record<string, [number, number, number]> = {
      Digit1: [0, -140, 8],
      Digit2: [100, -100, 8],
      Digit3: [140, 0, 8],
      Digit4: [100, 100, 8],
      Digit5: [0, 140, 8],
      Digit6: [-100, 100, 8],
      Digit7: [-140, 0, 8],
      Digit8: [-100, -100, 8],
      Digit9: [0, 0, 65],
      Digit0: [0, 0, -2.5],
    };
    const spot = spots[event.code];
    if (!spot) return;
    const [x, z, y] = spot;
    this.frequencyStore.setState((state) => ({ ...state, position: { x, y, z } }));
  };

  private readonly onUnlockClick = (): void => {
    void this.unlock();
  };

  /** Re-acquire mouse look on canvas click after Esc released the lock (spec §5). */
  private readonly onContainerClick = (): void => {
    if (this.paused) return; // the mouse belongs to the pause menu
    if (this.unlocked && !this.pointerLock.locked) this.pointerLock.request();
  };

  /** Esc toggles pause when pointer lock isn't holding it (locked Esc arrives as lock release). */
  /**
   * §145: one number, eight steps, remembered. The readout is what makes it
   * playable — the mouse is captured in flight, so without feedback a keypress
   * is a guess.
   */
  private setVolume(level: number): void {
    this.volumeLevel = quantizeVolume(level);
    this.audioEngine.setVolume(volumeToGain(this.volumeLevel));
    saveVolume(this.volumeLevel);
    this.volumeReadout.show(this.volumeLevel);
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (this.unlocked) {
      // Everything else in this game is a letter or a click; the volume keeps
      // the keys every other application uses for it.
      if (event.key === '-' || event.key === '_') {
        this.setVolume(stepVolume(this.volumeLevel, -1));
        return;
      }
      if (event.key === '=' || event.key === '+') {
        this.setVolume(stepVolume(this.volumeLevel, 1));
        return;
      }
      if (event.key === 'm' || event.key === 'M') {
        // Mute remembers where you were, so unmuting is not a hunt.
        if (this.volumeLevel > 0) this.mutedFrom = this.volumeLevel;
        this.setVolume(this.volumeLevel > 0 ? 0 : this.mutedFrom);
        return;
      }
    }
    if (event.key !== 'Escape' || !this.unlocked) return;
    if (this.paused) this.resume();
    else this.pause();
  };

  /**
   * §33: banking hard throws one gesture into the track — a delay throw, a
   * riser, a sweep or a bell, whichever belongs to the grammar you are flying
   * through (user decision). It fires once per turn: the rate has to fall back
   * to level before another can go, and never within TURN_THROW_GAP_MS.
   */
  private throwOnTurn(nowMs: number, genre: TrackGenre): void {
    const rate = this.controller.yawRate;
    if (Math.abs(rate) < TURN_RELEASE_RATE) this.turnArmed = true;
    if (
      !this.turnArmed ||
      Math.abs(rate) < TURN_THROW_RATE ||
      nowMs - this.lastThrowMs < TURN_THROW_GAP_MS ||
      this.motionLevel < 0.25 // §42: a still world stays still
    ) {
      return;
    }
    this.turnArmed = false;
    this.lastThrowMs = nowMs;
    this.strudelEngine.schedule(
      {
        kind: 'throw',
        gain: 0.5 * this.motionLevel,
        style: throwStyleFor(genre, rate > 0 ? 'left' : 'right'),
      },
      'beat',
    );
  }

  /**
   * §56: the one heading everything reads — the direction the orb is actually
   * travelling, or where it is looking while it is standing still, so the
   * world never spins around a motionless player.
   */
  private flightHeading(state: Readonly<FrequencyState>): number {
    const dir = state.velocity > 0.6 ? this.camDir : state.direction;
    return Math.atan2(dir.x, -dir.z);
  }

  /** §63: read the next beat's worth of notes off the live pattern. */
  private queueUpcomingNotes(): void {
    const now = performance.now();
    // Drop anything stale, then take the next window. Beats arrive every
    // 60/bpm seconds, so one second of look-ahead always covers the gap.
    dropBefore(this.noteQueue, now);
    for (const note of this.strudelEngine.upcomingNotes(1)) {
      const atMs = now + note.inSeconds * 1000;
      // Only what is genuinely ahead, and never the same note twice.
      if (atMs <= now + 4) continue;
      if (this.noteQueue.some((q) => q.kind === note.kind && Math.abs(q.atMs - atMs) < 12)) continue;
      this.noteQueue.push({ kind: note.kind, atMs, velocity: note.velocity });
    }
  }

  /** §63: fire each note's visual at the moment it sounds. */
  private fireDueNotes(nowMs: number, position: Readonly<FrequencyState>['position']): void {
    if (this.noteQueue.length === 0) return;
    // §158: fire in place and compact what survives. Two filters a frame
    // allocated two arrays a frame for a list that is usually empty — but do
    // NOT assume the queue is sorted: notes are appended as the engine
    // discovers them, and a later look-ahead can hand back an earlier note.
    let keep = 0;
    for (let i = 0; i < this.noteQueue.length; i++) {
      const queued = this.noteQueue[i]!;
      if (queued.atMs > nowMs) {
        this.noteQueue[keep++] = queued;
        continue;
      }
      this.fireNote(queued, position);
    }
    this.noteQueue.length = keep;
  }

  private fireNote(note: QueuedNote, position: Readonly<FrequencyState>['position']): void {
    switch (note.kind) {
        // §17: kick = a low shockwave through the ground under the player.
        case 'kick':
          this.lastKickMs = performance.now();
          this.terrain.excite('note-kick', position, 55, 0.22 + note.velocity * 0.22);
          break;
        // Snare and clap = a sharp flash across the field.
        case 'snare':
          this.lastSnareMs = performance.now();
          this.terrain.clapFlash();
          // §160: a snare is a cut. The frame tears on the hit and nowhere
          // else — it is an event, never a running effect (§136.6).
          this.renderer.post.triggerSlice(0.35 + note.velocity * 0.5);
          break;
        // Hats = high, fine sparkle in the particles.
        case 'hat':
          this.hatSparkleUntil = performance.now() + 130;
          break;
        case 'perc':
          this.terrain.excite('note-perc', position, 900, 0.1 + note.velocity * 0.1);
          break;
        // Bass = a wide, slow deformation.
        case 'bass':
          this.terrain.excite('note-bass', position, 80, 0.18 + note.velocity * 0.2);
          break;
      default:
        break;
    }
  }

  /** §32: the flight so far as Strudel source — from E and from the pause menu. */
  private exportedTrack(): string {
    return exportTrack({
      graph: this.lastLayerGraph ?? createEmptyLayerGraph(),
      genre: this.trackStore.getState().genre,
      flownSeconds: this.flightMs / 1000,
      journey: WORLD_SEED,
      shape: this.trackBuilder.shape,
    });
  }

  /** Spec §5 Esc pause: freeze the loop, quiet the audio, flush the save, show the overlay. */
  private pause(): void {
    if (!this.unlocked || this.paused) return;
    this.paused = true;
    this.saveManager.save(this.snapshotWorld());
    this.loop.stop();
    void this.audioEngine.suspend().catch(reportAudioLifecycleError);
    this.pauseOverlay.show();
    this.events.emit('game:suspended', null);
  }

  private resume(): void {
    if (!this.paused) return;
    this.paused = false;
    this.pauseOverlay.hide();
    void this.audioEngine.resume().catch(reportAudioLifecycleError);
    this.loop.start();
    // Button click / Esc keydown is a user gesture, so mouse look may re-lock.
    this.pointerLock.request();
    this.events.emit('game:resumed', null);
  }

  private async unlock(): Promise<void> {
    if (this.unlocked) return;
    const { overlay, unlockButton } = this.elements;
    unlockButton.disabled = true;
    try {
      await this.audioEngine.initialize();
      // §145: the knob outlives the flight, so the context inherits it rather
      // than starting at full and jumping.
      this.audioEngine.setVolume(volumeToGain(this.volumeLevel));
    } catch (error) {
      unlockButton.disabled = false;
      showOverlayError(overlay, error);
      return;
    }
    this.unlocked = true;
    overlay.hidden = true;
    const output = this.audioEngine.getOutputNode();
    this.playerTone = new PlayerTone(this.audioEngine.context, output);
    this.playerTone.start(this.frequencyStore.getState());
    this.spatialAudio = new SpatialAudio(this.audioEngine.context, output);
    for (const resonator of this.worldStore.getState().resonators) {
      if (resonator.active) this.spatialAudio.addResonator(resonator);
    }
    // Audible consequence of the same shared event the visuals react to (P5).
    // Subscribes to this.events in its constructor; needs the unlocked context.
    this.resonanceAudio = new ResonanceAudio(this.audioEngine.context, output, this.events);
    // §12: tap the master output for the audio→visual analysis bus.
    this.audioAnalyser = attachAudioAnalyser(this.audioEngine);
    // §11/§16: Strudel adopts our AudioContext and routes through the master
    // chain; a failure here degrades to no generative layers, never a crash.
    try {
      await this.strudelEngine.initialize(this.audioEngine.context);
      this.strudelEngine.getOutputNode().connect(output);
      await this.strudelEngine.start();
    } catch (error) {
      console.error('FREQUENCY: Strudel engine failed to start', error);
    }
    this.hud.show();
    this.guide.show();
    // User (15 aug): nothing stands between the click and the flight. A form
    // asking a visitor for an API key was the first thing this world said to
    // them; now the world is the first thing. Pause is the only overlay left.
    this.pointerLock.request();
    this.input.attach();
    this.loop.start();
    this.events.emit('audio:unlocked', null);
    this.events.emit('game:started', null);
  }

  /** §17: place a resonator carrying the player's current sound in empty space. */
  private tryCreatePlayerResonator(): void {
    if (!this.unlocked) return;
    const state = this.frequencyStore.getState();
    if (state.amplitude < 0.2) return; // intent requires wind, not a idle tap
    const world = this.worldStore.getState();
    const clearance = 12;
    const tooClose = world.resonators.some((r) => {
      const dx = r.position.x - state.position.x;
      const dy = r.position.y - state.position.y;
      const dz = r.position.z - state.position.z;
      return Math.hypot(dx, dy, dz) < clearance;
    });
    if (tooClose) return; // near an existing sound, Space stays a pulse (§5)
    const progression = this.progressionStore.getState();
    const resonator = {
      id: `player-resonator-${progression.playerResonatorsCreated + 1}`,
      position: { ...state.position },
      baseHz: state.hz,
      waveform: state.waveform,
      amplitude: 0.5,
      interactionRadius: 6,
      audibleRadius: 60,
      persistenceThreshold: 4,
      materialProfile: 'player',
      spatialProfile: 'point',
      active: true,
    };
    this.worldStore.setState((s) => ({ ...s, resonators: [...s.resonators, resonator] }));
    this.spatialAudio?.addResonator(resonator);
    this.markers.add(resonator);
    this.progressionStore.setState((s) => recordPlayerResonator(s));
  }

  /** MVP item 13: clear persistent forms and the local save; the void returns. */
  /**
   * §33: ease toward the look of the region under the player. The music
   * blends between grammars; so does the world it happens in.
   */
  private applyZoneLook(zone: GenreAffinity, dtSeconds: number): void {
    const target = lookFor(zone);
    // ~1.5 s to cross a border: fast enough to feel caused, slow enough to
    // read as travelling rather than as a switch being flipped.
    const k = Math.min(1, dtSeconds * 0.7);
    const look = this.zoneLook;
    look.color.r += (target.color.r - look.color.r) * k;
    look.color.g += (target.color.g - look.color.g) * k;
    look.color.b += (target.color.b - look.color.b) * k;
    look.relief += (target.relief - look.relief) * k;
    this.renderer.setZoneColor(look.color);
    this.terrain.setZone(look.color, look.relief);
    this.orb.setTint(look.color);
    this.orbTrail.setColor(look.color);
    this.streaks.setColor(look.color);
    this.forest.setTint(look.color);
    this.domeLights.setTint(look.color);
    this.haze.setTint(look.color);
    this.crowd.setColor(look.color);
  }

  resetWorld(): void {
    const removed = this.worldStore.getState().structures;
    this.worldStore.setState((state) => ({ ...state, structures: [] }));
    // The void returns COMPLETELY: player back at spawn, tone at rest (§17).
    this.frequencyStore.setState(() => createInitialFrequencyState());
    this.trackStore.setState(() => createInitialTrackState());
    this.trackBuilder.reset();
    this.melodyTrail.reset();
    this.controller.resetOrientation();
    for (const structure of removed) this.events.emit('structure:removed', structure);
    // Runs last: also cancels the autosave the store change just scheduled.
    this.saveManager.reset();
  }

  /** Reload → reconstruct world (§18): stores first, then replayed spawn events rebuild geometry. */
  private hydrate(save: WorldSave): void {
    this.frequencyStore.setState(() => ({ ...save.frequencyState }));
    this.worldStore.setState((state) => ({
      ...state,
      resonators: save.resonators.length > 0 ? save.resonators : [...state.resonators],
      structures: save.structures,
    }));
    this.progressionStore.setState(() => ({ ...save.progression }));
    // §32: the WORLD is restored, the TRACK is not. A track is what a flight
    // builds; handing back a finished one would mean every session starts on
    // a full arrangement instead of a single tone.
    this.trackStore.setState(() => createInitialTrackState());
    // Resume spawn counters so post-load spawns never reuse a saved structure's id.
    this.formEmergence.rehydrate(save.structures);
    for (const structure of save.structures) this.events.emit('structure:spawned', structure);
  }

  /** The serializable world snapshot handed to SaveManager (spec §18). */
  private snapshotWorld(): SerializableWorld {
    const world = this.worldStore.getState();
    return {
      seed: WORLD_SEED,
      frequencyState: this.frequencyStore.getState(),
      musicState: this.musicStore.getState(),
      resonators: [...world.resonators],
      structures: [...world.structures],
      genreHistory: [...this.genreEngine.history],
      progression: this.progressionStore.getState(),
      trackState: this.trackStore.getState(),
    };
  }

  /** Stores own the positions (§16): resolve event ids to current world/player positions. */
  private resolveEventPositions(
    targetId: string,
  ): { source: FrequencyState['position']; target: FrequencyState['position'] } | null {
    const resonator = this.worldStore.getState().resonators.find((r) => r.id === targetId);
    if (!resonator) return null;
    return { source: this.frequencyStore.getState().position, target: resonator.position };
  }

  private readonly onVisibilityChange = (): void => {
    if (!this.unlocked) return;
    if (document.hidden) {
      // Spec §22: pause rendering when hidden; suspend audio. Flush the save
      // immediately — a backgrounded tab may never come back (§18).
      this.saveManager.save(this.snapshotWorld());
      this.loop.stop();
      void this.audioEngine.suspend().catch(reportAudioLifecycleError);
      this.events.emit('game:suspended', null);
    } else if (this.paused) {
      // The player paused deliberately: stay paused when the tab returns.
    } else {
      // The core Clock clamps the delta, so restarting never causes a jump (§15).
      void this.audioEngine.resume().catch(reportAudioLifecycleError);
      this.loop.start();
      this.events.emit('game:resumed', null);
    }
  };
}

function showOverlayError(overlay: HTMLElement, error: unknown): void {
  const message = error instanceof Error ? error.message : 'Audio could not be started.';
  let errorElement = overlay.querySelector<HTMLElement>('[data-unlock-error]');
  if (!errorElement) {
    errorElement = document.createElement('p');
    errorElement.setAttribute('data-unlock-error', '');
    errorElement.setAttribute('role', 'alert');
    overlay.appendChild(errorElement);
  }
  errorElement.textContent = message;
}

function reportAudioLifecycleError(error: unknown): void {
  console.error('FREQUENCY: audio lifecycle error', error);
}

/**
 * §158: drops everything already past, in place. The note queue is in arrival
 * order, so this is a splice at the front rather than a new array — it runs
 * every frame, and a frame is not a place to allocate.
 */
function dropBefore(queue: { atMs: number }[], nowMs: number): void {
  let count = 0;
  while (count < queue.length && queue[count]!.atMs <= nowMs) count++;
  if (count > 0) queue.splice(0, count);
}
