// Pure game rules for a tape-ball gully cricket chase. No React, no timers:
// the match screen feeds it timings and it decides what happened.

export type Rng = () => number;

/** Small seeded PRNG so tests (and replays) are deterministic. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = <T>(rng: Rng, xs: readonly T[]): T => xs[Math.floor(rng() * xs.length)];

export type DeliveryKind = 'yorker' | 'full' | 'good' | 'short' | 'bouncer';
export type ShotType = 'ground' | 'lofted';
export type Quality = 'perfect' | 'good' | 'ok' | 'poor' | 'miss';
export type Dismissal = 'bowled' | 'caught' | 'uncle-house' | 'one-tip';

export interface Delivery {
  kind: DeliveryKind;
  /** Seconds from release until the ball reaches the stumps. */
  duration: number;
  /** Lateral position when it reaches the batter (-1..1, 0 = stumps). */
  line: number;
  /** Fraction of the flight at which the ball pitches. */
  bounceAt: number;
  /** How high it kicks up after pitching (world units). */
  bounceRise: number;
  isWide: boolean;
  onStumps: boolean;
  /** Timing windows are multiplied by this (yorkers are harder). */
  windowScale: number;
}

/** Fraction of the flight at which the ball is in the batter's hitting zone. */
export const CONTACT_PROGRESS = 0.88;

/** Half-widths of each timing band, in milliseconds either side of perfect. */
export const TIMING_BANDS_MS: Record<Exclude<Quality, 'miss'>, number> = {
  perfect: 45,
  good: 95,
  ok: 150,
  poor: 230,
};

export interface Difficulty {
  level: 1 | 2 | 3;
}

const KIND_SHAPE: Record<DeliveryKind, { bounceAt: number; rise: number; window: number }> = {
  yorker: { bounceAt: 0.9, rise: 0.08, window: 0.8 },
  full: { bounceAt: 0.74, rise: 0.2, window: 1.0 },
  good: { bounceAt: 0.6, rise: 0.28, window: 1.0 },
  short: { bounceAt: 0.45, rise: 0.42, window: 1.1 },
  bouncer: { bounceAt: 0.35, rise: 0.7, window: 0.9 },
};

export function makeDelivery(rng: Rng, difficulty: Difficulty): Delivery {
  const lvl = difficulty.level;
  const kindRoll = rng();
  const kind: DeliveryKind =
    kindRoll < 0.08 + lvl * 0.03
      ? 'yorker'
      : kindRoll < 0.35
        ? 'full'
        : kindRoll < 0.72
          ? 'good'
          : kindRoll < 0.92
            ? 'short'
            : 'bouncer';

  const isWide = rng() < 0.07;
  const side = rng() < 0.5 ? -1 : 1;
  const line = isWide ? side * (0.6 + rng() * 0.2) : (rng() * 2 - 1) * 0.32;

  // Faster bowling in harder galis. Tape ball is quick off the pitch!
  const base = 1.25 - lvl * 0.1;
  const duration = Math.max(0.72, base + (rng() * 0.3 - 0.15) - (kind === 'yorker' ? 0.05 : 0));

  const shape = KIND_SHAPE[kind];
  const onStumps = !isWide && Math.abs(line) < 0.14 && kind !== 'bouncer' && kind !== 'short';
  const windowScale = shape.window * (lvl === 1 ? 1.15 : lvl === 3 ? 0.88 : 1);

  return {
    kind,
    duration,
    line,
    bounceAt: shape.bounceAt,
    bounceRise: shape.rise,
    isWide,
    onStumps,
    windowScale,
  };
}

/** Grade a swing made at `progress` (0 = release, 1 = ball at stumps). */
export function timingQuality(progress: number, delivery: Delivery): Quality {
  const offMs = Math.abs(progress - CONTACT_PROGRESS) * delivery.duration * 1000;
  const s = delivery.windowScale;
  if (offMs <= TIMING_BANDS_MS.perfect * s) return 'perfect';
  if (offMs <= TIMING_BANDS_MS.good * s) return 'good';
  if (offMs <= TIMING_BANDS_MS.ok * s) return 'ok';
  if (offMs <= TIMING_BANDS_MS.poor * s) return 'poor';
  return 'miss';
}

/** "Early!" / "Late!" hint for the player. */
export function timingHint(progress: number): 'early' | 'late' {
  return progress < CONTACT_PROGRESS ? 'early' : 'late';
}

export type FlightPath = 'six' | 'four' | 'wall' | 'dribble' | 'skier' | 'house' | 'edge' | 'none';

export interface BallOutcome {
  runs: number;
  /** Runs for wides (do not count as a legal ball). */
  extras: number;
  legal: boolean;
  wicket: Dismissal | null;
  label: string;
  commentary: string;
  path: FlightPath;
  /** -1 (left side of the gully) .. 1 (right side), for the hit animation. */
  direction: number;
  quality?: Quality;
  shot?: ShotType;
}

const LINES = {
  six: [
    'Chakka! Seedha chhat ke upar!',
    'Kya maara hai! Ball doosri gali mein!',
    'Wah bhai wah, ye toh stadium se bahar!',
    'Over the wires — full pakka chakka!',
  ],
  four: [
    'Chauka! Gali ke end tak gayi!',
    'Zabardast! Seedha nali ke paas!',
    'Shot! Fielder dekhta reh gaya.',
  ],
  runs: ['Bhaag, bhaag! Run le lo!', 'Deewar se takra ke wapas.', 'Achha touch, aaram se.'],
  dot: ['Kuch nahi hua.', 'Dot ball, focus kar yaar!', 'Arre, ball dekh ke khel!'],
  bowled: ['Bowled! Crate gir gaya!', 'Udd gaya! Chal, bahar nikal.', 'Seedha stumps — out hai bhai!'],
  caught: ['Caught! Chhat se pakad liya!', 'Ooper maara, neeche pakda gaya.', 'Kaatch! Chal nikal.'],
  house: [
    'Ball Uncle ke ghar! OUT — aur ball bhi gayi!',
    'Aunty ki khidki! Out hai, aur ab daant bhi padegi.',
    'Ghar mein gayi — gully rule, OUT!',
  ],
  oneTip: ['One tip, one hand — OUT!', 'Deewar se tip, ek haath — gully rule, out!'],
  wide: ['Wide hai! Ek run free.', 'Itna bahar? Wide, ek extra.'],
} as const;

const mk = (o: Omit<BallOutcome, 'extras' | 'legal'> & Partial<BallOutcome>): BallOutcome => ({
  extras: 0,
  legal: true,
  ...o,
});

/** The batter connected. Decide what the ball did. */
export function resolveShot(rng: Rng, delivery: Delivery, shot: ShotType, quality: Quality): BallOutcome {
  const direction = rng() * 2 - 1;
  const base = { direction, quality, shot };

  if (quality === 'miss') return resolveLeave(rng, delivery, true);

  // A wide that you still go after: you get the extra plus whatever you hit.
  const extras = delivery.isWide ? 1 : 0;
  const legal = !delivery.isWide;

  if (shot === 'ground') {
    switch (quality) {
      case 'perfect':
        return mk({ ...base, extras, legal, runs: 4, wicket: null, label: 'CHAUKA!', path: 'four', commentary: pick(rng, LINES.four) });
      case 'good': {
        const runs = rng() < 0.45 ? 4 : 2;
        return mk({
          ...base, extras, legal, runs, wicket: null,
          label: runs === 4 ? 'CHAUKA!' : '2 RUNS',
          path: runs === 4 ? 'four' : 'wall',
          commentary: pick(rng, runs === 4 ? LINES.four : LINES.runs),
        });
      }
      case 'ok': {
        const runs = rng() < 0.55 ? 1 : 2;
        return mk({ ...base, extras, legal, runs, wicket: null, label: `${runs} RUN${runs > 1 ? 'S' : ''}`, path: 'wall', commentary: pick(rng, LINES.runs) });
      }
      default: {
        if (rng() < 0.15) {
          return mk({ ...base, extras, legal, runs: 0, wicket: 'one-tip', label: 'OUT!', path: 'edge', commentary: pick(rng, LINES.oneTip) });
        }
        const runs = rng() < 0.5 ? 1 : 0;
        return mk({ ...base, extras, legal, runs, wicket: null, label: runs ? '1 RUN' : 'DOT', path: 'dribble', commentary: pick(rng, runs ? LINES.runs : LINES.dot) });
      }
    }
  }

  // Lofted: big reward, big risk.
  switch (quality) {
    case 'perfect':
      return mk({ ...base, extras, legal, runs: 6, wicket: null, label: 'CHAKKA!', path: 'six', commentary: pick(rng, LINES.six) });
    case 'good': {
      const r = rng();
      if (r < 0.12) return caught(rng, base, extras, legal);
      const runs = r < 0.62 ? 6 : 4;
      return mk({
        ...base, extras, legal, runs, wicket: null,
        label: runs === 6 ? 'CHAKKA!' : 'CHAUKA!',
        path: runs === 6 ? 'six' : 'four',
        commentary: pick(rng, runs === 6 ? LINES.six : LINES.four),
      });
    }
    case 'ok': {
      const r = rng();
      if (r < 0.3) return caught(rng, base, extras, legal);
      if (r < 0.5) {
        return mk({ ...base, extras, legal, runs: 0, wicket: 'uncle-house', label: 'OUT!', path: 'house', commentary: pick(rng, LINES.house) });
      }
      const runs = r < 0.8 ? 2 : 1;
      return mk({ ...base, extras, legal, runs, wicket: null, label: `${runs} RUN${runs > 1 ? 'S' : ''}`, path: 'wall', commentary: pick(rng, LINES.runs) });
    }
    default: {
      if (rng() < 0.5) return caught(rng, base, extras, legal);
      return mk({ ...base, extras, legal, runs: 0, wicket: null, label: 'DOT', path: 'dribble', commentary: pick(rng, LINES.dot) });
    }
  }
}

function caught(rng: Rng, base: Pick<BallOutcome, 'direction' | 'quality' | 'shot'>, extras: number, legal: boolean): BallOutcome {
  return mk({ ...base, extras, legal, runs: 0, wicket: 'caught', label: 'OUT!', path: 'skier', commentary: pick(rng, LINES.caught) });
}

/** Ball reached the stumps without the batter connecting. */
export function resolveLeave(rng: Rng, delivery: Delivery, swungAndMissed = false): BallOutcome {
  if (delivery.isWide) {
    return { runs: 0, extras: 1, legal: false, wicket: null, label: 'WIDE', path: 'none', direction: 0, commentary: pick(rng, LINES.wide) };
  }
  if (delivery.onStumps) {
    return { runs: 0, extras: 0, legal: true, wicket: 'bowled', label: 'BOWLED!', path: 'none', direction: 0, commentary: pick(rng, LINES.bowled) };
  }
  return {
    runs: 0, extras: 0, legal: true, wicket: null, label: swungAndMissed ? 'MISSED' : 'DOT',
    path: 'none', direction: 0, commentary: pick(rng, LINES.dot),
  };
}

export interface MatchState {
  target: number;
  ballsTotal: number;
  wicketsTotal: number;
  runs: number;
  wickets: number;
  legalBalls: number;
  fours: number;
  sixes: number;
  log: BallOutcome[];
  status: 'playing' | 'won' | 'lost';
}

export function newMatch(target: number, overs: number, wickets: number): MatchState {
  return {
    target,
    ballsTotal: overs * 6,
    wicketsTotal: wickets,
    runs: 0,
    wickets: 0,
    legalBalls: 0,
    fours: 0,
    sixes: 0,
    log: [],
    status: 'playing',
  };
}

export function applyOutcome(state: MatchState, o: BallOutcome): MatchState {
  if (state.status !== 'playing') return state;
  const runs = state.runs + o.runs + o.extras;
  const wickets = state.wickets + (o.wicket ? 1 : 0);
  const legalBalls = state.legalBalls + (o.legal ? 1 : 0);
  const status: MatchState['status'] =
    runs >= state.target
      ? 'won'
      : wickets >= state.wicketsTotal || legalBalls >= state.ballsTotal
        ? 'lost'
        : 'playing';
  return {
    ...state,
    runs,
    wickets,
    legalBalls,
    fours: state.fours + (o.runs === 4 ? 1 : 0),
    sixes: state.sixes + (o.runs === 6 ? 1 : 0),
    log: [...state.log, o],
    status,
  };
}

export const runsNeeded = (s: MatchState) => Math.max(0, s.target - s.runs);
export const ballsLeft = (s: MatchState) => s.ballsTotal - s.legalBalls;
export const overText = (balls: number) => `${Math.floor(balls / 6)}.${balls % 6}`;

/** Did the last ball finish an over (and the match is still on)? */
export const overJustEnded = (s: MatchState) =>
  s.status === 'playing' && s.legalBalls > 0 && s.legalBalls % 6 === 0 && (s.log.at(-1)?.legal ?? false);

/** Short symbol for the over-tracker dots. */
export function ballSymbol(o: BallOutcome): string {
  if (o.wicket) return 'W';
  if (!o.legal) return 'wd';
  return o.runs === 0 ? '•' : String(o.runs);
}
