import express from 'express';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { mkdir, readdir, stat, realpath } from 'node:fs/promises';
import { EMOTIONS, GESTURE_PATTERN, generatePerformance, validateConfig, validateMessages } from './providers.mjs';
import { contextFromHistory, createStore } from './characters.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const port = Number(process.env.PORT || 4317);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('PORT must be between 1024 and 65535.');
const app = express();
app.disable('x-powered-by');
const server = createServer(app);
const hosts = new Set([`localhost:${port}`, `127.0.0.1:${port}`]);
const origins = new Set([...hosts].map(host => `http://${host}`));

app.use((req, res, next) => {
  if (!hosts.has(req.headers.host)) return res.status(403).json({ error: 'Invalid local host.' });
  if (req.headers.origin && !origins.has(req.headers.origin)) return res.status(403).json({ error: 'Cross-origin requests are not allowed.' });
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
  next();
});
app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  if ((req.method === 'POST' || req.method === 'PUT') && !req.is('application/json')) return res.status(415).json({ error: 'JSON required.' });
  next();
});
app.use(express.json({ limit: '128kb' }));

let config = { provider: 'openai', model: 'gpt-4.1-mini', apiKey: '', baseUrl: '' };
let configured = false;
if (process.env.MAIDO_API_KEY || process.env.MAIDO_BASE_URL) {
  config = validateConfig({
    provider: process.env.MAIDO_PROVIDER || 'openai',
    model: process.env.MAIDO_MODEL || 'gpt-4.1-mini',
    apiKey: process.env.MAIDO_API_KEY || '',
    baseUrl: process.env.MAIDO_BASE_URL || '',
  }, config);
  configured = true;
}
const publicConfig = () => ({ provider: config.provider, model: config.model, baseUrl: config.baseUrl, configured, hasKey: Boolean(config.apiKey) });
const modelsDirectory = path.join(root, 'models');
const animationsDirectory = path.join(root, 'animations');
await mkdir(modelsDirectory, { recursive: true });
await mkdir(animationsDirectory, { recursive: true });
/** Lists plain, non-hidden files with an extension directly inside a folder (no subfolders or symlinks). */
async function listFiles(directory, extension, maxBytes, route) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith(extension) || entry.name.startsWith('.')) continue;
    try {
      const file = await stat(path.join(directory, entry.name));
      if (file.size > 0 && file.size <= maxBytes) files.push({ name: entry.name, size: file.size, url: `${route}/${encodeURIComponent(entry.name)}` });
    } catch { /* A file may have been moved while the folder was being scanned. */ }
  }
  return files.sort((a, b) => a.name.localeCompare(b.name));
}
const listModels = () => listFiles(modelsDirectory, '.vrm', 150 * 1024 * 1024, '/api/models');

const CLIP_KINDS = ['idle', 'talk', 'react', 'gesture', 'intro'];
/**
 * animations/<kind>.<key>[.<variant>].vrma — e.g. idle.happy.sway.vrma, gesture.clap.vrma.
 * idle/talk/react/intro keys are emotions (or "any"); gesture keys are free slugs the LLM may use.
 */
function classifyClip(name) {
  const [kind, key, ...rest] = name.slice(0, -'.vrma'.length).toLowerCase().split('.');
  if (CLIP_KINDS.includes(kind) && key && rest.length <= 1) {
    if (kind === 'gesture' ? GESTURE_PATTERN.test(key) : key === 'any' || EMOTIONS.includes(key)) return { kind, key };
  }
  return { kind: 'extra', key: name };
}
async function listAnimations() {
  return (await listFiles(animationsDirectory, '.vrma', 20 * 1024 * 1024, '/api/animations')).map(file => ({ ...file, ...classifyClip(file.name) }));
}
async function sendFrom(directory, list, req, res, type) {
  const name = req.params.name;
  try {
    if (path.basename(name) !== name || !(await list()).some(file => file.name === name)) return res.status(404).json({ error: 'File not found.' });
    const resolved = await realpath(path.join(directory, name));
    if (path.dirname(resolved) !== await realpath(directory)) return res.status(404).json({ error: 'File not found.' });
    res.type(type).sendFile(resolved);
  } catch { if (!res.headersSent) res.status(404).json({ error: 'File is no longer available. Refresh the list.' }); }
}
app.get('/api/animations', async (_req, res) => {
  try { res.json({ animations: await listAnimations() }); }
  catch { res.status(500).json({ error: 'Could not read the animations folder.' }); }
});
app.get('/api/animations/:name', (req, res) => sendFrom(animationsDirectory, listAnimations, req, res, 'model/gltf-binary'));
app.get('/api/models', async (_req, res) => {
  try {
    const models = await listModels();
    const preferred = process.env.MAIDO_DEFAULT_MODEL;
    const found = models.find(model => model.name === preferred);
    res.json({ models, defaultModel: found?.name || models[0]?.name || null, ...(preferred && !found ? { warning: `Default model "${preferred}" was not found in models/.` } : {}) });
  } catch { res.status(500).json({ error: 'Could not read the models folder.' }); }
});
app.get('/api/models/:name', (req, res) => sendFrom(modelsDirectory, listModels, req, res, 'model/gltf-binary'));
app.get('/api/config', (_req, res) => res.json(publicConfig()));
app.post('/api/config', (req, res) => {
  try { config = validateConfig(req.body, config); configured = true; res.json(publicConfig()); }
  catch (error) { res.status(400).json({ error: error.message }); }
});
app.post('/api/disconnect', (_req, res) => {
  config = { ...config, apiKey: '' }; configured = false; res.json(publicConfig());
});

// MAIDO_DATA_DIR lets tests (or a second profile) use their own characters/ and memory/.
const store = createStore(process.env.MAIDO_DATA_DIR ? path.resolve(process.env.MAIDO_DATA_DIR) : root);
await store.init();
const fail = (res, error) => res.status(error.status ?? 400).json({ error: error.message });
const route = handler => async (req, res) => { try { await handler(req, res); } catch (error) { if (!res.headersSent) fail(res, error); } };

app.get('/api/profile', route(async (_req, res) => res.json(await store.profile())));
app.put('/api/profile', route(async (req, res) => res.json(await store.saveProfile(req.body))));
app.get('/api/characters', route(async (_req, res) => res.json({ characters: await store.list() })));
app.post('/api/characters', route(async (req, res) => res.status(201).json(await store.create(req.body))));
app.put('/api/characters/:id', route(async (req, res) => { await store.get(req.params.id); res.json(await store.save(req.params.id, req.body)); }));
app.delete('/api/characters/:id', route(async (req, res) => {
  await store.get(req.params.id);
  await store.remove(req.params.id, { forgetMemory: req.query.forgetMemory === '1' });
  res.json({ ok: true });
}));
app.get('/api/characters/:id/history', route(async (req, res) => { await store.get(req.params.id); res.json({ messages: await store.history(req.params.id) }); }));
app.delete('/api/characters/:id/history', route(async (req, res) => { await store.get(req.params.id); await store.clearHistory(req.params.id); res.json({ ok: true }); }));
// One-time move of a conversation kept in the browser (v0.2) into a character's memory folder.
app.post('/api/characters/:id/history/import', route(async (req, res) => {
  await store.get(req.params.id);
  if ((await store.history(req.params.id)).length) return res.json({ imported: 0 });
  const raw = Array.isArray(req.body?.messages) ? req.body.messages : [];
  const turns = raw.slice(raw.length % 2 ? -41 : -40, raw.length % 2 ? -1 : undefined);
  const valid = turns.every((m, i) => m && m.role === (i % 2 ? 'assistant' : 'user') && typeof m.content === 'string' && m.content.trim() && m.content.length <= 12000);
  if (!valid) throw new Error('Invalid conversation.');
  const at = new Date().toISOString();
  const imported = turns.map(m => ({ role: m.role, content: m.content, at, ...(Array.isArray(m.beats) ? { beats: m.beats.filter(beat => beat && EMOTIONS.includes(beat.emotion)).slice(0, 6) } : {}) }));
  await store.appendHistory(req.params.id, imported);
  res.json({ imported: imported.length });
}));
app.get('/api/characters/:id/memories', route(async (req, res) => { await store.get(req.params.id); res.json({ memories: await store.memories(req.params.id) }); }));
app.delete('/api/characters/:id/memories', route(async (req, res) => { await store.get(req.params.id); await store.clearMemories(req.params.id); res.json({ ok: true }); }));
app.delete('/api/characters/:id/memories/:memoryId', route(async (req, res) => { await store.get(req.params.id); await store.forgetMemory(req.params.id, req.params.memoryId); res.json({ ok: true }); }));

let busy = false;
app.post('/api/chat', async (req, res) => {
  if (!configured) return res.status(409).json({ error: 'Connect a model in Settings first.' });
  const question = req.body?.message;
  if (typeof question !== 'string' || !question.trim() || question.length > 12000) return res.status(400).json({ error: 'Send a message of 1 to 12,000 characters.' });
  let card, history, memories, profile, messages;
  try {
    card = await store.get(String(req.body?.characterId ?? ''));
    [history, memories, profile] = await Promise.all([store.history(card.id), store.memories(card.id), store.profile()]);
    messages = validateMessages(contextFromHistory(history, question.trim()));
  } catch (error) { return fail(res, error); }
  if (busy) return res.status(429).json({ error: `${card.name} is answering another request. Please wait.` });
  busy = true;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error('timeout')), 90000);
  res.on('close', () => { if (!res.writableEnded) controller.abort(); });
  try {
    const clipGestures = (await listAnimations().catch(() => [])).filter(clip => clip.kind === 'gesture').map(clip => clip.key);
    const { notes, ...reply } = await generatePerformance({ ...config }, messages, controller.signal, { card, memories, profile, clipGestures });
    if (controller.signal.aborted || res.destroyed) return; // the user pressed Stop: keep no half turn
    const at = new Date().toISOString();
    await store.appendHistory(card.id, [{ role: 'user', content: question.trim(), at }, { role: 'assistant', content: reply.text, beats: reply.beats, at }]);
    const remembered = await store.addMemories(card.id, notes);
    res.json({ ...reply, remembered });
  } catch (error) {
    if (!res.destroyed) res.status(502).json({ error: controller.signal.aborted ? 'The request timed out. Try again.' : error.message === 'fetch failed' ? 'Could not reach the provider. Check your internet connection or local model server.' : error.message });
  } finally { clearTimeout(timeout); busy = false; }
});
app.use('/api', (_req, res) => res.status(404).json({ error: 'Unknown API endpoint.' }));
app.use((error, _req, res, _next) => {
  res.status(error.type === 'entity.too.large' ? 413 : 400).json({ error: error.type === 'entity.too.large' ? 'Request too large.' : 'Invalid JSON request.' });
});

if (process.argv.includes('--production')) {
  app.use(express.static(path.join(root, 'dist')));
  app.get('/{*path}', (_req, res) => res.sendFile(path.join(root, 'dist/index.html')));
} else {
  const { createServer: createViteServer } = await import('vite');
  const vite = await createViteServer({ root, server: { middlewareMode: true, hmr: { server }, allowedHosts: ['localhost', '127.0.0.1'] }, appType: 'spa' });
  app.use(vite.middlewares);
}
server.on('error', error => { console.error(`Maido could not start: ${error.code || error.message}`); process.exit(1); });
server.listen(port, '127.0.0.1', () => console.log(`\n  Maido is here → http://localhost:${port}\n  Local only. Press Ctrl+C to stop.\n`));
