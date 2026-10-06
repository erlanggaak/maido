import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { EMOTIONS, FACES } from './providers.mjs';

/**
 * Characters: one JSON "card" per character in characters/, and a private memory folder per
 * character in memory/<id>/ (conversation history + long-term memories she wrote herself).
 * Switching characters switches body, personality, history, and memories together.
 */

export const ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,31}$/;
const TEXT_FIELDS = {
  name: 40, nameNative: 40, tagline: 140, greeting: 500, selfDescription: 2500, background: 3500,
  personality: 2000, speakingStyle: 1500, likes: 800, dislikes: 800, relationship: 1200,
};
export const GENDERS = ['female', 'male'];
const MAX_HISTORY = 400;
const MAX_MEMORIES = 200;

export function validateCard(input, id) {
  if (!input || typeof input !== 'object') throw new Error('Invalid character.');
  const card = { id };
  for (const [field, max] of Object.entries(TEXT_FIELDS)) {
    const value = input[field] ?? '';
    if (typeof value !== 'string' || value.length > max) throw new Error(`"${field}" must be text of at most ${max} characters.`);
    card[field] = value.trim();
  }
  if (!card.name) throw new Error('Give your character a name.');
  if (typeof input.model !== 'string' || input.model.length > 200 || (input.model && (path.basename(input.model) !== input.model || !input.model.toLowerCase().endsWith('.vrm')))) {
    throw new Error('Choose a .vrm file from models/.');
  }
  card.model = input.model;
  card.gender = GENDERS.includes(input.gender) ? input.gender : 'female';
  card.restingMood = EMOTIONS.includes(input.restingMood) ? input.restingMood : 'neutral';
  card.restingFace = Object.hasOwn(FACES, input.restingFace ?? '') ? input.restingFace : '';
  return card;
}

/** The user's own profile, shared by every character: what they should know about you. */
const PROFILE_FIELDS = {
  name: 60, callMe: 60, age: 40, location: 120, languages: 200, occupation: 300,
  about: 3000, personality: 2000, interests: 1500, goals: 1500, preferences: 1500, avoid: 1000,
};
export function validateProfile(input) {
  if (!input || typeof input !== 'object') throw new Error('Invalid profile.');
  const profile = {};
  for (const [field, max] of Object.entries(PROFILE_FIELDS)) {
    const value = input[field] ?? '';
    if (typeof value !== 'string' || value.length > max) throw new Error(`"${field}" must be text of at most ${max} characters.`);
    profile[field] = value.trim();
  }
  profile.gender = GENDERS.includes(input.gender) ? input.gender : '';
  return profile;
}

export function slugify(name) {
  const slug = name.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').replace(/-+/g, '-').slice(0, 24);
  return ID_PATTERN.test(slug) ? slug : `character-${randomUUID().slice(0, 6)}`;
}

async function writeJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  await writeFile(temp, JSON.stringify(value, null, 2));
  await rename(temp, file); // atomic: a crash never leaves half a file
}
async function readJson(file, fallback) {
  try { return JSON.parse(await readFile(file, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return fallback; throw error; }
}

export function createStore(root) {
  const cardsDir = path.join(root, 'characters');
  const memoryDir = path.join(root, 'memory');
  const cardFile = id => path.join(cardsDir, `${id}.json`);
  const historyFile = id => path.join(memoryDir, id, 'history.json');
  const memoriesFile = id => path.join(memoryDir, id, 'memories.json');
  const check = id => { if (!ID_PATTERN.test(id)) throw Object.assign(new Error('Character not found.'), { status: 404 }); };

  const profileFile = path.join(memoryDir, 'you.json');
  const store = {
    async profile() { return validateProfile(await readJson(profileFile, {})); },
    async saveProfile(input) { const profile = validateProfile(input); await writeJson(profileFile, profile); return profile; },
    async init() { await mkdir(cardsDir, { recursive: true }); await mkdir(memoryDir, { recursive: true }); },
    async list() {
      const files = (await readdir(cardsDir, { withFileTypes: true })).filter(entry => entry.isFile() && entry.name.endsWith('.json') && !entry.name.startsWith('.'));
      const cards = [];
      for (const file of files) {
        const id = file.name.slice(0, -5);
        if (!ID_PATTERN.test(id)) continue;
        try { cards.push(validateCard(await readJson(cardFile(id)), id)); } catch { /* Skip a broken card rather than hide the rest. */ }
      }
      return cards.sort((a, b) => a.name.localeCompare(b.name));
    },
    async get(id) {
      check(id);
      const raw = await readJson(cardFile(id), null);
      if (!raw) throw Object.assign(new Error('Character not found.'), { status: 404 });
      return validateCard(raw, id);
    },
    async save(id, input) {
      check(id);
      const card = validateCard(input, id);
      const { id: _id, ...stored } = card;
      await writeJson(cardFile(id), stored);
      return card;
    },
    async create(input) {
      const base = slugify(String(input?.name ?? ''));
      let id = base, n = 2;
      while (await readJson(cardFile(id), null)) id = `${base.slice(0, 28)}-${n++}`;
      return store.save(id, input);
    },
    /** Removes the card and, separately on request, its memory folder. */
    async remove(id, { forgetMemory }) {
      check(id);
      await rm(cardFile(id), { force: true });
      if (forgetMemory) await rm(path.join(memoryDir, id), { recursive: true, force: true });
    },

    async history(id) { check(id); return readJson(historyFile(id), []); },
    async appendHistory(id, messages) {
      const history = [...await store.history(id), ...messages].slice(-MAX_HISTORY);
      await writeJson(historyFile(id), history);
      return history;
    },
    async clearHistory(id) { check(id); await rm(historyFile(id), { force: true }); },

    async memories(id) { check(id); return readJson(memoriesFile(id), []); },
    async addMemories(id, texts) {
      if (!texts.length) return [];
      const memories = await store.memories(id);
      const known = new Set(memories.map(memory => memory.text.toLowerCase()));
      const added = texts.filter(text => !known.has(text.toLowerCase())).map(text => ({ id: randomUUID(), text, at: new Date().toISOString() }));
      await writeJson(memoriesFile(id), [...memories, ...added].slice(-MAX_MEMORIES));
      return added;
    },
    async forgetMemory(id, memoryId) {
      const memories = await store.memories(id);
      await writeJson(memoriesFile(id), memories.filter(memory => memory.id !== memoryId));
    },
    async clearMemories(id) { check(id); await rm(memoriesFile(id), { force: true }); },
  };
  return store;
}

/** Most recent completed turns that fit the budget, oldest first, as provider messages. */
export function contextFromHistory(history, question, { maxTurns = 19, maxChars = 55000 } = {}) {
  const selected = [];
  let size = question.length;
  // Walk back over complete user→assistant pairs only.
  for (let i = history.length - 1; i > 0 && selected.length < maxTurns * 2; i--) {
    const reply = history[i], ask = history[i - 1];
    if (reply.role !== 'assistant' || ask.role !== 'user') continue;
    const cost = reply.content.length + ask.content.length + 80;
    if (size + cost > maxChars) break;
    selected.unshift({ role: 'user', content: ask.content }, { role: 'assistant', content: reply.content, beats: reply.beats });
    size += cost; i--;
  }
  return [...selected, { role: 'user', content: question }];
}
