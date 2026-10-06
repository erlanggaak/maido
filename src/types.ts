export type Provider = 'openai' | 'anthropic' | 'compatible';
export interface Config {
  provider: Provider;
  model: string;
  baseUrl: string;
  configured: boolean;
  hasKey: boolean;
}

// Keep in sync with EMOTIONS / BUILTIN_GESTURES in server/providers.mjs.
export const EMOTIONS = ['neutral', 'happy', 'excited', 'sad', 'angry', 'surprised', 'relaxed', 'thinking', 'shy'] as const;
export const BUILTIN_GESTURES = ['wave', 'nod', 'shake', 'think', 'shrug', 'cheer', 'bow', 'tilt'] as const;
// Keep in sync with FACES in server/providers.mjs; recipes live in src/avatar/faces.ts.
export const FACES = ['neutral', 'smile', 'joy', 'grin', 'smug', 'wink', 'pout', 'annoyed', 'furious', 'sad', 'crying', 'surprised', 'shocked', 'blank', 'sleepy', 'thinking', 'embarrassed', 'excited', 'determined', 'content', 'love', 'nervous'] as const;
export type Face = typeof FACES[number];
/** Anime manga symbols drawn around the head. */
export type Manpu = 'blush' | 'sweat' | 'vein' | 'sparkle' | 'exclaim' | 'question' | 'zzz' | 'hearts' | 'tears' | 'gloom' | 'dots' | 'notes';
export type Emotion = typeof EMOTIONS[number];
export type BuiltinGesture = typeof BUILTIN_GESTURES[number];
/** 'none', a built-in procedural gesture, or any gesture.<key>.vrma clip found in animations/. */
export type Gesture = string;
/** A body cue the brain attaches to a position (character index) in its reply. */
export interface Beat { at: number; emotion: Emotion; intensity: number; gesture: Gesture; face?: Face }

export interface Message { role: 'user' | 'assistant'; content: string; beats?: Beat[]; at?: string }
export interface AvatarAsset { name: string; url: string; size: number }
export interface ModelCatalog { models: AvatarAsset[]; defaultModel: string | null; warning?: string }

/** A .vrma file from animations/, classified by its <kind>.<key>[.<variant>].vrma name. */
export interface ClipAsset { name: string; url: string; size: number; kind: 'idle' | 'talk' | 'react' | 'gesture' | 'intro' | 'extra'; key: string }

/** A character card (characters/<id>.json). Her history and memories live in memory/<id>/. */
export const GENDERS = ['female', 'male'] as const;
export type Gender = typeof GENDERS[number];
export interface Character {
  id: string;
  name: string;
  gender: Gender;
  nameNative: string;
  tagline: string;
  model: string;
  restingMood: Emotion;
  restingFace: Face | '';
  greeting: string;
  selfDescription: string;
  background: string;
  personality: string;
  speakingStyle: string;
  likes: string;
  dislikes: string;
  relationship: string;
}
/** Something a character chose to remember about the user. */
export interface Memory { id: string; text: string; at: string }
/** The user's own profile (memory/you.json): what every character knows about who they're talking with. */
export interface UserProfile {
  name: string;
  callMe: string;
  gender: Gender | '';
  age: string;
  location: string;
  languages: string;
  occupation: string;
  about: string;
  personality: string;
  interests: string;
  goals: string;
  preferences: string;
  avoid: string;
}
