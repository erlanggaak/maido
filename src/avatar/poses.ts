import type { Emotion, Gesture } from '../types';

/**
 * Body language library. Everything is procedural, in VRM *normalized* bone space:
 * the avatar faces +Z, T-pose arms point along ±X. Euler [x, y, z] radians.
 *  - upperArm z: left −/right + lowers the arm; x − swings it forward.
 *  - lowerArm y: left −/right + bends the elbow forward.
 *  - head/neck/spine x +: look down / lean forward; y: turn; z: tilt.
 */
const FINGERS = ['Thumb', 'Index', 'Middle', 'Ring', 'Little'] as const;
type FingerBone =
  `${'left' | 'right'}${(typeof FINGERS)[number]}${'Metacarpal' | 'Proximal' | 'Intermediate' | 'Distal'}`;
export type Bone =
  | 'hips'
  | 'spine'
  | 'chest'
  | 'upperChest'
  | 'neck'
  | 'head'
  | 'leftShoulder'
  | 'rightShoulder'
  | 'leftUpperArm'
  | 'rightUpperArm'
  | 'leftLowerArm'
  | 'rightLowerArm'
  | 'leftHand'
  | 'rightHand'
  | FingerBone;
export type Euler3 = [number, number, number];
export type Pose = Partial<Record<Bone, Euler3>>;

/**
 * A relaxed hand: fingers curl a little, more toward the little finger, thumb tucked
 * slightly toward the palm. Without this, any bone a clip doesn't animate sits in the bind
 * pose, and VRoid's bind pose has stiff, straight fingers.
 */
function relaxedHand(side: 'left' | 'right'): Pose {
  const s = side === 'left' ? -1 : 1; // curling toward the palm is −Z on the left, +Z on the right
  const pose: Pose = {};
  FINGERS.slice(1).forEach((finger, i) => {
    const curl = 0.18 + i * 0.07;
    pose[`${side}${finger}Proximal`] = [0, 0, s * curl];
    pose[`${side}${finger}Intermediate`] = [0, 0, s * (curl + 0.15)];
    pose[`${side}${finger}Distal`] = [0, 0, s * (curl + 0.05)];
  });
  pose[`${side}ThumbMetacarpal`] = [0, s * -0.25, s * 0.1];
  pose[`${side}ThumbProximal`] = [0, s * -0.15, s * 0.15];
  pose[`${side}ThumbDistal`] = [0, 0, s * 0.2];
  return pose;
}

const HAND_BONES = Object.keys({ ...relaxedHand('left'), ...relaxedHand('right') }) as Bone[];
export const BONES: Bone[] = [
  'hips',
  'spine',
  'chest',
  'upperChest',
  'neck',
  'head',
  'leftShoulder',
  'rightShoulder',
  'leftUpperArm',
  'rightUpperArm',
  'leftLowerArm',
  'rightLowerArm',
  'leftHand',
  'rightHand',
  ...HAND_BONES,
];

/** Relaxed standing pose every other pose is expressed relative to. */
export const REST: Pose = {
  leftUpperArm: [0.05, 0, -1.22],
  rightUpperArm: [0.05, 0, 1.22],
  leftLowerArm: [0, -0.18, 0],
  rightLowerArm: [0, 0.18, 0],
  leftHand: [0, 0, -0.1],
  rightHand: [0, 0, 0.1],
  ...relaxedHand('left'),
  ...relaxedHand('right'),
};

/** Posture deltas from REST. Blended by each emotion's current weight. */
export const POSTURE: Record<Emotion, Pose> = {
  neutral: {},
  happy: {
    chest: [-0.05, 0, 0],
    head: [-0.05, 0, 0.04],
    leftUpperArm: [0, 0, 0.1],
    rightUpperArm: [0, 0, -0.1],
  },
  excited: {
    chest: [-0.08, 0, 0],
    head: [-0.08, 0, 0],
    leftUpperArm: [-0.15, 0, 0.3],
    rightUpperArm: [-0.15, 0, -0.3],
    leftLowerArm: [0, -0.6, 0],
    rightLowerArm: [0, 0.6, 0],
  },
  sad: {
    spine: [0.1, 0, 0],
    chest: [0.08, 0, 0],
    neck: [0.1, 0, 0],
    head: [0.22, 0, 0],
    leftShoulder: [0, 0, -0.08],
    rightShoulder: [0, 0, 0.08],
    leftUpperArm: [-0.08, 0, -0.1],
    rightUpperArm: [-0.08, 0, 0.1],
  },
  angry: {
    spine: [0.08, 0, 0],
    head: [0.14, 0, 0],
    leftShoulder: [0, 0, 0.1],
    rightShoulder: [0, 0, -0.1],
    leftUpperArm: [0.1, 0, 0.28],
    rightUpperArm: [0.1, 0, -0.28],
    leftLowerArm: [0, -0.5, 0],
    rightLowerArm: [0, 0.5, 0],
    leftHand: [0, 0, -0.4],
    rightHand: [0, 0, 0.4],
  },
  surprised: {
    spine: [-0.06, 0, 0],
    head: [-0.12, 0, 0],
    leftUpperArm: [-0.5, -0.45, 0.2],
    rightUpperArm: [-0.5, 0.45, -0.2],
    leftLowerArm: [0, -1.4, 0],
    rightLowerArm: [0, 1.4, 0],
  },
  relaxed: { spine: [-0.02, 0, 0], head: [0, 0, 0.06] },
  thinking: {
    head: [-0.08, 0.12, 0.12],
    rightUpperArm: [-1.15, 0.45, 0.05],
    rightLowerArm: [0, 2.35, 0],
    rightHand: [0, 0, -0.4],
    leftUpperArm: [-0.3, -0.35, 0],
    leftLowerArm: [0, -1.3, 0],
  },
  shy: {
    spine: [0.04, 0, 0],
    head: [0.18, -0.05, 0.12],
    leftUpperArm: [-0.2, -0.75, -0.05],
    rightUpperArm: [-0.2, 0.75, 0.05],
    leftLowerArm: [0, -1.0, 0],
    rightLowerArm: [0, 1.0, 0],
  },
};

/**
 * Masculine body language where the default reads as feminine-coded: a shy guy scratches
 * the back of his head instead of clasping his hands, excitement is a fist pump, surprise
 * opens the arms instead of bringing hands to the chest. Other emotions share POSTURE.
 */
export const POSTURE_MASCULINE: Partial<Record<Emotion, Pose>> = {
  shy: {
    head: [0.12, 0.1, -0.1],
    rightUpperArm: [-0.35, 0.3, -2.25],
    rightLowerArm: [0, 2.3, 0],
    rightHand: [0, 0, 0.3],
    leftUpperArm: [0.05, 0, 0.05],
  },
  excited: {
    chest: [-0.08, 0, 0],
    head: [-0.08, 0, 0],
    rightUpperArm: [-0.4, 0.2, 0.05],
    rightLowerArm: [0, 1.75, 0],
    rightHand: [0, 0, -0.2],
    leftUpperArm: [0, 0, 0.12],
  },
  surprised: {
    spine: [-0.08, 0, 0],
    head: [-0.12, 0, 0],
    leftUpperArm: [-0.25, 0, 0.35],
    rightUpperArm: [-0.25, 0, -0.35],
    leftLowerArm: [0, -0.5, 0],
    rightLowerArm: [0, 0.5, 0],
  },
  happy: {
    chest: [-0.06, 0, 0],
    head: [-0.04, 0, 0],
    leftUpperArm: [0, 0, 0.05],
    rightUpperArm: [0, 0, -0.05],
  },
};
export type BodyStyle = 'feminine' | 'masculine';
export const postureFor = (emotion: Emotion, style: BodyStyle) =>
  (style === 'masculine' ? POSTURE_MASCULINE[emotion] : undefined) ?? POSTURE[emotion];

/** How lively the idle layer is for each emotion: breathing rate, sway, and bounce. */
export const ENERGY: Record<Emotion, { breath: number; sway: number; bounce: number }> = {
  neutral: { breath: 1, sway: 1, bounce: 0 },
  happy: { breath: 1.2, sway: 1.4, bounce: 0.012 },
  excited: { breath: 1.6, sway: 1.6, bounce: 0.025 },
  sad: { breath: 0.7, sway: 0.5, bounce: 0 },
  angry: { breath: 1.5, sway: 0.4, bounce: 0 },
  surprised: { breath: 1.4, sway: 0.3, bounce: 0 },
  relaxed: { breath: 0.8, sway: 1.3, bounce: 0 },
  thinking: { breath: 0.9, sway: 0.6, bounce: 0 },
  shy: { breath: 1.1, sway: 1.2, bounce: 0 },
};

export interface GestureFrame {
  /** Deltas from REST that *replace* the emotion posture on those bones (arms). */
  set?: Pose;
  /** Deltas added on top of everything (head nods, bows). */
  add?: Pose;
  rootY?: number;
}
interface GestureSpec {
  duration: number;
  frame: (p: number, t: number) => GestureFrame;
}

const pulse = (p: number, count: number) => Math.max(0, Math.sin(p * Math.PI * 2 * count));

export const GESTURE_LIBRARY: Record<Exclude<Gesture, 'none'>, GestureSpec> = {
  wave: {
    duration: 2.4,
    frame: (_p, t) => ({
      set: {
        rightUpperArm: [-0.1, 0, -1.9],
        rightLowerArm: [0, 0.2, -0.9 + Math.sin(t * 9) * 0.35],
        rightHand: [0, 0, -0.1],
      },
      add: { head: [0, 0, 0.06] },
    }),
  },
  nod: {
    duration: 1.1,
    frame: (p) => ({ add: { head: [pulse(p, 2) * 0.2, 0, 0], neck: [pulse(p, 2) * 0.08, 0, 0] } }),
  },
  shake: {
    duration: 1.3,
    frame: (p) => ({ add: { head: [0.04, Math.sin(p * Math.PI * 5) * 0.28 * (1 - p * 0.6), 0] } }),
  },
  think: {
    duration: 2.6,
    frame: () => ({ set: POSTURE.thinking, add: { head: [-0.06, 0.1, 0.12] } }),
  },
  shrug: {
    duration: 1.5,
    frame: () => ({
      set: {
        leftUpperArm: [-0.25, 0, 0.3],
        rightUpperArm: [-0.25, 0, -0.3],
        leftLowerArm: [0, -1.0, 0.2],
        rightLowerArm: [0, 1.0, -0.2],
        leftHand: [-0.6, 0, 0],
        rightHand: [-0.6, 0, 0],
      },
      add: { leftShoulder: [0, 0, 0.18], rightShoulder: [0, 0, -0.18], head: [0, 0, 0.15] },
    }),
  },
  cheer: {
    duration: 1.9,
    frame: (p, t) => ({
      set: {
        leftUpperArm: [0, 0, 2.2 + Math.sin(t * 8) * 0.12],
        rightUpperArm: [0, 0, -2.2 - Math.sin(t * 8) * 0.12],
        leftLowerArm: [0, 0, 0.2],
        rightLowerArm: [0, 0, -0.2],
      },
      add: { head: [-0.12, 0, 0] },
      rootY: pulse(p, 3) * 0.05,
    }),
  },
  bow: {
    duration: 2.2,
    frame: () => ({
      set: {
        leftUpperArm: [-0.2, 0, 0.12],
        rightUpperArm: [-0.2, 0, -0.12],
        leftLowerArm: [0, -0.5, 0],
        rightLowerArm: [0, 0.5, 0],
      },
      add: { spine: [0.35, 0, 0], chest: [0.15, 0, 0], head: [0.25, 0, 0] },
    }),
  },
  tilt: { duration: 1.8, frame: () => ({ add: { head: [-0.02, 0.06, 0.24] } }) },
};

/** Eases a gesture in and out so it never snaps. */
export function envelope(p: number, duration: number) {
  const smooth = (x: number) => x * x * (3 - 2 * x);
  const fadeIn = Math.min(1, (p * duration) / 0.35);
  // Ease out over up to 0.9 s (but never longer than 40% of a short gesture like a nod).
  const fadeOut = Math.min(1, ((1 - p) * duration) / Math.min(0.9, duration * 0.4));
  return smooth(Math.max(0, Math.min(fadeIn, fadeOut)));
}

/** Mouth shape (VRM viseme) for a written character, used for text-driven lip-sync. */
export function visemeFor(char: string): string | null {
  switch (char.toLowerCase()) {
    case 'a':
      return 'aa';
    case 'i':
    case 'y':
      return 'ih';
    case 'u':
    case 'w':
      return 'ou';
    case 'e':
      return 'ee';
    case 'o':
      return 'oh';
    default:
      return /[\p{L}\p{N}]/u.test(char) ? 'consonant' : null;
  }
}

// Live objects (director, mixer, spring state) outlive a hot update and would mix old and new
// code, e.g. stale clip weights leaving the body in its bind pose. Reload the page instead.
import.meta.hot?.accept(() => location.reload());
