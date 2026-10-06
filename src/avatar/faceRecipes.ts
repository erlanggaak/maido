import type { Emotion, Face, Manpu } from '../types';

/**
 * Anime face library. Each face mixes a VRoid model's separate brow / eye / mouth / fang
 * morph targets (Fcl_BRW_*, Fcl_EYE_*, Fcl_MTH_*, Fcl_HA_*), which gives far more range
 * than the five VRM presets. Models without those morphs fall back to preset weights.
 *
 *  - eyes:  how closed the eyes already are (0..1), so blinking doesn't fight the face
 *  - mouth: how much the mouth is already shaped (0..1), so lip-sync scales down
 *  - fx:    anime manga symbols (manpu) drawn around the head while the face shows
 */
export interface FaceRecipe {
  morphs: Record<string, number>;
  fallback: Record<string, number>;
  eyes?: number;
  mouth?: number;
  fx?: Manpu[];
}

export const FACES: Record<Face, FaceRecipe> = {
  neutral: { morphs: {}, fallback: {} },
  smile: { morphs: { Fcl_BRW_Fun: 0.5, Fcl_EYE_Fun: 0.25, Fcl_MTH_Fun: 0.65 }, fallback: { happy: 0.45 }, mouth: 0.3 },
  joy: { morphs: { Fcl_BRW_Joy: 0.8, Fcl_EYE_Joy: 1, Fcl_MTH_Joy: 0.85 }, fallback: { happy: 1 }, eyes: 1, mouth: 0.6, fx: ['sparkle'] },
  grin: { morphs: { Fcl_BRW_Fun: 0.6, Fcl_EYE_Fun: 0.35, Fcl_MTH_Joy: 0.6, Fcl_HA_Fung1: 1 }, fallback: { happy: 0.8 }, mouth: 0.5 },
  smug: { morphs: { Fcl_BRW_Fun: 0.6, Fcl_BRW_Angry: 0.25, Fcl_EYE_Joy: 0.45, Fcl_MTH_Fun: 0.45, Fcl_MTH_SkinFung_R: 0.8 }, fallback: { happy: 0.4, relaxed: 0.3 }, eyes: 0.45, mouth: 0.3 },
  wink: { morphs: { Fcl_BRW_Fun: 0.5, Fcl_EYE_Close_R: 1, Fcl_MTH_Joy: 0.55 }, fallback: { happy: 0.6, blinkRight: 1 }, eyes: 1, mouth: 0.4, fx: ['sparkle'] },
  pout: { morphs: { Fcl_BRW_Angry: 0.55, Fcl_EYE_Angry: 0.2, Fcl_MTH_Small: 0.9, Fcl_MTH_Up: 0.5 }, fallback: { angry: 0.4 }, mouth: 0.8, fx: ['vein'] },
  annoyed: { morphs: { Fcl_BRW_Angry: 0.8, Fcl_EYE_Angry: 0.55, Fcl_MTH_Angry: 0.5 }, fallback: { angry: 0.7 }, mouth: 0.4, fx: ['vein'] },
  furious: { morphs: { Fcl_BRW_Angry: 1, Fcl_EYE_Angry: 1, Fcl_MTH_Angry: 0.8, Fcl_MTH_Large: 0.6, Fcl_HA_Fung2: 1 }, fallback: { angry: 1 }, mouth: 0.8, fx: ['vein', 'gloom'] },
  sad: { morphs: { Fcl_BRW_Sorrow: 1, Fcl_EYE_Sorrow: 0.65, Fcl_MTH_Sorrow: 0.55 }, fallback: { sad: 0.85 }, eyes: 0.3, mouth: 0.4 },
  crying: { morphs: { Fcl_BRW_Sorrow: 1, Fcl_EYE_Joy: 0.85, Fcl_MTH_Sorrow: 0.7, Fcl_MTH_Large: 0.3 }, fallback: { sad: 1 }, eyes: 0.9, mouth: 0.7, fx: ['tears', 'gloom'] },
  surprised: { morphs: { Fcl_BRW_Surprised: 1, Fcl_EYE_Surprised: 0.8, Fcl_MTH_Surprised: 0.75 }, fallback: { surprised: 0.9 }, mouth: 0.7, fx: ['exclaim'] },
  shocked: { morphs: { Fcl_BRW_Surprised: 1, Fcl_EYE_Spread: 1, Fcl_MTH_Small: 0.6, Fcl_MTH_Surprised: 0.3 }, fallback: { surprised: 1 }, mouth: 0.7, fx: ['exclaim', 'sweat'] },
  blank: { morphs: { Fcl_EYE_Highlight_Hide: 1, Fcl_EYE_Spread: 0.5, Fcl_MTH_Small: 0.5, Fcl_MTH_Down: 0.3 }, fallback: { surprised: 0.3 }, mouth: 0.3, fx: ['dots'] },
  sleepy: { morphs: { Fcl_EYE_Close: 0.55, Fcl_BRW_Sorrow: 0.35, Fcl_MTH_Small: 0.3 }, fallback: { relaxed: 0.8 }, eyes: 0.6, mouth: 0.2, fx: ['zzz'] },
  thinking: { morphs: { Fcl_BRW_Angry: 0.2, Fcl_BRW_Sorrow: 0.25, Fcl_EYE_Fun: 0.15, Fcl_MTH_Small: 0.4 }, fallback: { relaxed: 0.2, sad: 0.08 }, mouth: 0.3, fx: ['question'] },
  embarrassed: { morphs: { Fcl_BRW_Sorrow: 0.6, Fcl_EYE_Joy: 0.35, Fcl_MTH_Small: 0.55, Fcl_MTH_Fun: 0.2 }, fallback: { happy: 0.35, relaxed: 0.35 }, eyes: 0.35, mouth: 0.5, fx: ['blush', 'sweat'] },
  excited: { morphs: { Fcl_BRW_Surprised: 0.6, Fcl_EYE_Spread: 0.35, Fcl_MTH_Joy: 1 }, fallback: { happy: 0.9, surprised: 0.25 }, mouth: 0.7, fx: ['sparkle'] },
  determined: { morphs: { Fcl_BRW_Angry: 0.6, Fcl_EYE_Fun: 0.15, Fcl_MTH_Fun: 0.45 }, fallback: { angry: 0.25, happy: 0.3 }, mouth: 0.3, fx: ['sparkle'] },
  content: { morphs: { Fcl_BRW_Fun: 0.3, Fcl_EYE_Joy: 0.4, Fcl_MTH_Fun: 0.4 }, fallback: { relaxed: 0.7 }, eyes: 0.4, mouth: 0.25, fx: ['notes'] },
  love: { morphs: { Fcl_BRW_Joy: 0.6, Fcl_EYE_Joy: 0.7, Fcl_MTH_Fun: 0.6 }, fallback: { happy: 0.8 }, eyes: 0.7, mouth: 0.4, fx: ['blush', 'hearts'] },
  nervous: { morphs: { Fcl_BRW_Sorrow: 0.7, Fcl_EYE_Fun: 0.1, Fcl_MTH_Fun: 0.3, Fcl_MTH_Small: 0.3 }, fallback: { sad: 0.3, happy: 0.3 }, mouth: 0.4, fx: ['sweat'] },
};

/** The face each emotion shows unless the brain asks for a specific one. */
export const DEFAULT_FACE: Record<Emotion, Face> = {
  neutral: 'neutral', happy: 'smile', excited: 'excited', sad: 'sad', angry: 'annoyed',
  surprised: 'surprised', relaxed: 'content', thinking: 'thinking', shy: 'embarrassed',
};
