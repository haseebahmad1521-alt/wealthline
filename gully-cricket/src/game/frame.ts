import type { BallOutcome, Delivery, Quality, ShotType } from './engine';
import { CONTACT_PROGRESS } from './engine';
import { deliveryPosition, hitPlan, hitPosition, type WorldPos } from './flight';
import { BOWLER_RELEASE, BOWLER_START_Z, STUMPS_Z, clamp01, lerp } from './perspective';

export type Phase = 'intro' | 'waiting' | 'runup' | 'flight' | 'hit' | 'result' | 'done';

/** Mutable per-ball state shared by the game loop and the 3D scene. */
export interface Live {
  phase: Phase;
  t0: number;
  delivery: Delivery;
  swing?: { at: number; shot: ShotType; quality: Quality };
  missedAt?: number;
  outcome?: BallOutcome;
  contact?: WorldPos;
  hint?: string;
}

export const RUNUP_MS = 1050;
export const WAIT_MS = 650;
export const INTRO_MS = 1500;
export const RESULT_MS = 1900;
export const SWING_MS = 240;

export interface FrameState {
  bowlerZ: number;
  /** Running cycle phase in radians (0 when standing). */
  runCycle: number;
  /** 0..1 bowling-arm action, -1 when not bowling. */
  bowlAction: number;
  ball: WorldPos | null;
  ring: { pos: WorldPos; opacity: number } | null;
  /** 0..1 backlift as the ball approaches. */
  backlift: number;
  swing: { t: number; shot: ShotType } | null;
  knock: number;
  outcome?: BallOutcome;
  /** ms since the ball was hit or resolved. */
  outcomeMs: number;
  heroCam: boolean;
  crash: WorldPos | null;
}

export function computeFrame(L: Live, now: number): FrameState {
  const el = now - L.t0;
  const fs: FrameState = {
    bowlerZ: BOWLER_START_Z,
    runCycle: 0,
    bowlAction: -1,
    ball: null,
    ring: null,
    backlift: 0,
    swing: null,
    knock: 0,
    outcomeMs: 0,
    heroCam: false,
    crash: null,
  };

  if (L.phase === 'runup') {
    const t = clamp01(el / RUNUP_MS);
    fs.bowlerZ = lerp(BOWLER_START_Z, BOWLER_RELEASE.z, t);
    fs.runCycle = t * 22;
    fs.bowlAction = t > 0.62 ? (t - 0.62) / 0.38 : -1;
  } else if (L.phase === 'flight' || L.phase === 'hit' || L.phase === 'result') {
    fs.bowlerZ = BOWLER_RELEASE.z;
    fs.bowlAction = L.phase === 'flight' ? Math.min(1.6, 1 + el / 700) : 1.6;
  }

  if (L.phase === 'flight') {
    const p = el / (L.delivery.duration * 1000);
    fs.ball = deliveryPosition(L.delivery, Math.min(p, 1));
    fs.backlift = clamp01((p - 0.2) / 0.45);
    if (!L.swing && p > 0.3) {
      fs.ring = { pos: deliveryPosition(L.delivery, CONTACT_PROGRESS), opacity: clamp01((p - 0.3) / 0.4) };
    }
  }

  if (L.swing) {
    fs.swing = { t: clamp01((now - L.swing.at) / SWING_MS), shot: L.swing.shot };
    fs.backlift = 1;
  }

  if ((L.phase === 'hit' || L.phase === 'result') && L.outcome) {
    fs.outcome = L.outcome;
    fs.outcomeMs = L.phase === 'hit' ? el : el + (L.contact ? hitPlan(L.outcome, L.contact).duration * 1000 : 0);
    if (L.contact) {
      const plan = hitPlan(L.outcome, L.contact);
      const t = clamp01(fs.outcomeMs / (plan.duration * 1000));
      const gone = t >= 1 && (L.outcome.path === 'six' || L.outcome.path === 'house');
      fs.ball = gone ? null : hitPosition(L.contact, plan, t, L.outcome.path);
      fs.heroCam = L.outcome.path === 'six' || L.outcome.path === 'four';
      if (L.outcome.path === 'house' && t > 0.85) fs.crash = plan.dest;
    } else if (L.outcome.wicket === 'bowled') {
      fs.ball = { ...deliveryPosition(L.delivery, 1), h: 0.04 };
      fs.knock = clamp01(el / 280);
    } else {
      const p = 1 + el / (L.delivery.duration * 1000);
      fs.ball = p < 1.3 ? { ...deliveryPosition(L.delivery, 1), z: lerp(STUMPS_Z, -1.2, (p - 1) / 0.3) } : null;
    }
  }
  return fs;
}
