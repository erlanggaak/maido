import type { PhysicsStyle } from './avatar/physics';
import type { Message, Provider } from './types';

const CHAT_KEY = 'maido.chat.v1';
export function readChat(): Message[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(CHAT_KEY) || '[]');
    if (!Array.isArray(value)) return [];
    const valid =
      value.length <= 100 &&
      value.every(
        (m, i) =>
          m &&
          m.role === (i % 2 ? 'assistant' : 'user') &&
          typeof m.content === 'string' &&
          m.content.length <= 12000,
      );
    // Store completed turns only, so a reload never leaves an orphan request.
    return valid ? value.slice(0, value.length - (value.length % 2)) : [];
  } catch {
    return [];
  }
}
export function saveChat(messages: Message[]) {
  localStorage.setItem(CHAT_KEY, JSON.stringify(messages.slice(-100)));
}

const MODEL_KEY = 'maido.model.v1';
export function readModelChoice(): string | null {
  try {
    return localStorage.getItem(MODEL_KEY);
  } catch {
    return null;
  }
}
export function saveModelChoice(name: string) {
  localStorage.setItem(MODEL_KEY, name);
}

export interface Prefs {
  autoEmotion: boolean;
  idleLife: boolean;
  background: string;
  physics: PhysicsStyle;
  wind: boolean;
  fps: 30 | 60;
  manpu: boolean;
  lighting: 'faithful' | 'studio';
}
const PREFS_KEY = 'maido.prefs.v1';
export const DEFAULT_BACKGROUND = '#ece4f3';
const DEFAULT_PREFS: Prefs = {
  autoEmotion: true,
  idleLife: true,
  background: DEFAULT_BACKGROUND,
  physics: 'soft',
  wind: true,
  fps: 60,
  manpu: true,
  lighting: 'faithful',
};
export function readPrefs(): Prefs {
  try {
    const value = { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') };
    return {
      autoEmotion: value.autoEmotion !== false,
      idleLife: value.idleLife !== false,
      background: /^#[0-9a-f]{6}$/i.test(value.background) ? value.background : DEFAULT_BACKGROUND,
      physics: ['model', 'soft', 'bouncy'].includes(value.physics) ? value.physics : 'soft',
      wind: value.wind !== false,
      fps: value.fps === 30 ? 30 : 60,
      manpu: value.manpu !== false,
      lighting: value.lighting === 'studio' ? 'studio' : 'faithful',
    };
  } catch {
    return DEFAULT_PREFS;
  }
}
export function savePrefs(prefs: Prefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* Session only. */
  }
}

/**
 * BYOK for this browser session: provider, model, base URL and key, per provider. Kept in
 * sessionStorage, so it survives reloads and local server restarts (the server only holds
 * keys in memory) but is gone when the tab closes. Plain text in this tab's storage, readable
 * by this page only; use .env for a permanent setup.
 */
export interface BrainEntry {
  model: string;
  baseUrl: string;
  apiKey: string;
}
interface BrainSession {
  active: Provider | null;
  entries: Partial<Record<Provider, BrainEntry>>;
}
const BRAIN_KEY = 'maido.byok.session.v1';
export function readBrainSession(): BrainSession {
  try {
    const value = JSON.parse(sessionStorage.getItem(BRAIN_KEY) || '{}');
    return {
      active: value.active ?? null,
      entries: value.entries && typeof value.entries === 'object' ? value.entries : {},
    };
  } catch {
    return { active: null, entries: {} };
  }
}
export function saveBrainEntry(provider: Provider, entry: BrainEntry) {
  const session = readBrainSession();
  session.entries[provider] = entry;
  session.active = provider;
  try {
    sessionStorage.setItem(BRAIN_KEY, JSON.stringify(session));
  } catch {
    /* Storage unavailable: the server still has the key until it stops. */
  }
}
export function forgetBrain(provider: Provider) {
  const session = readBrainSession();
  delete session.entries[provider];
  if (session.active === provider) session.active = null;
  try {
    sessionStorage.setItem(BRAIN_KEY, JSON.stringify(session));
  } catch {
    /* Nothing to forget. */
  }
}
