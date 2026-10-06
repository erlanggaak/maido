import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request as httpRequest } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { writeFile, unlink, symlink, mkdtemp, mkdir, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { generateReply, parseReply, validateConfig } from '../server/providers.mjs';

test('provider requests use the expected contracts and redact errors', async t => {
  const calls = [];
  const fake = mock.method(globalThis, 'fetch', async (url, init) => {
    calls.push({ url, headers: init.headers, body: JSON.parse(init.body) });
    if (url.includes('anthropic')) return Response.json({ content: [{ type: 'text', text: 'Halo!' }] });
    return Response.json({ output: [{ type: 'message', content: [{ type: 'output_text', text: 'Hello!' }] }] });
  });
  t.after(() => fake.mock.restore());
  const message = [{ role: 'user', content: 'Hello / halo' }];
  assert.equal(await generateReply({ provider: 'openai', apiKey: 'test-only', model: 'test-model' }, message), 'Hello!');
  assert.equal(calls[0].url, 'https://api.openai.com/v1/responses');
  assert.equal(calls[0].body.store, false);
  assert.equal(calls[0].headers.Authorization, 'Bearer test-only');
  assert.equal(await generateReply({ provider: 'anthropic', apiKey: 'test-only', model: 'test-model' }, message), 'Halo!');
  assert.equal(calls[1].headers['x-api-key'], 'test-only');
  assert.equal(calls[1].headers['anthropic-version'], '2023-06-01');
  assert.deepEqual(calls[1].body.messages, message);
  fake.mock.mockImplementation(async () => new Response('sensitive provider error', { status: 401 }));
  await assert.rejects(generateReply({ provider: 'openai', apiKey: 'test-only', model: 'test' }, message), /rejected this key/);
});

test('stage tags become body beats and never reach the visible text', () => {
  const reply = parseReply('<mood emotion="happy" intensity="0.8" gesture="wave"/>Halo! <mood emotion="thinking" gesture="think"/> Hmm.');
  assert.equal(reply.text, 'Halo! Hmm.');
  assert.deepEqual(reply.beats, [
    { at: 0, emotion: 'happy', intensity: .8, gesture: 'wave' },
    { at: 6, emotion: 'thinking', intensity: .6, gesture: 'think' },
  ]);
  const faced = parseReply('<mood emotion="happy" intensity="0.6" gesture="none" face="smug"/>Heh. <mood emotion="sad" face="bogus"/>Oh.');
  assert.deepEqual(faced.beats.map(beat => beat.face), ['smug', undefined]);
  const unknown = parseReply('<mood emotion="furious" intensity="9" gesture="backflip"></mood>Hi');
  assert.equal(unknown.text, 'Hi');
  assert.deepEqual(unknown.beats, [{ at: 0, emotion: 'neutral', intensity: 1, gesture: 'none' }]);
});

test('changing a key destination cannot reuse the previous credential', () => {
  const previous = { provider: 'openai', model: 'model', apiKey: 'private-test-key', baseUrl: '' };
  assert.throws(() => validateConfig({ provider: 'anthropic', model: 'model' }, previous), /API key/);
  const changed = validateConfig({ provider: 'compatible', model: 'model', baseUrl: 'https://example.com/v1' }, previous);
  assert.equal(changed.apiKey, '');
  assert.throws(() => validateConfig({ provider: 'compatible', model: 'model', baseUrl: 'http://example.com/v1' }, previous), /HTTPS/);
  assert.throws(() => validateConfig({ provider: 'compatible', model: 'model', baseUrl: 'https://user:pass@example.com' }, previous), /credentials/);
});

test('local HTTP server: chat, validation, origin protection, cancellation, and disconnect', async t => {
  let upstreamRequest;
  let arrived;
  const received = new Promise(resolve => { arrived = resolve; });
  const upstream = createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    upstreamRequest = { path: req.url, authorization: req.headers.authorization, body: JSON.parse(body) };
    const question = upstreamRequest.body.messages.at(-1).content;
    if (question === 'slow') {
      arrived();
      const timer = setTimeout(() => res.end(JSON.stringify({ choices: [{ message: { content: 'Too late' } }] })), 4000);
      res.on('close', () => clearTimeout(timer));
      return;
    }
    if (question === 'error') { res.writeHead(429); res.end('Do not expose provider details'); return; }
    res.setHeader('Content-Type', 'application/json');
    const content = question === 'My cat is Mochi'
      ? '<mood emotion="happy" intensity="0.8" gesture="none" face="love"/>Mochi! Cute name. <remember>The user has a cat named Mochi.</remember>'
      : `Mock reply: ${question}`;
    res.end(JSON.stringify({ choices: [{ message: { content } }] }));
  });
  upstream.listen(0, '127.0.0.1'); await once(upstream, 'listening');
  t.after(() => { upstream.closeAllConnections(); upstream.close(); });
  // Characters and memories live in a throwaway folder, never in the real memory/.
  const data = await mkdtemp(path.join(tmpdir(), 'maido-test-'));
  t.after(() => rm(data, { recursive: true, force: true }));
  await mkdir(path.join(data, 'characters'));
  await writeFile(path.join(data, 'characters', 'tester.json'), JSON.stringify({ name: 'Tester', tagline: 'A test character.', model: '', selfDescription: 'I have green pigtails.', personality: 'Curious.', restingMood: 'happy' }));
  await writeFile(path.join(data, 'characters', 'other.json'), JSON.stringify({ name: 'Other', model: '' }));
  const port = 4418;
  const base = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['server/index.mjs', '--production'], {
    cwd: new URL('../', import.meta.url),
    env: { ...process.env, PORT: String(port), MAIDO_API_KEY: '', MAIDO_BASE_URL: '', MAIDO_DATA_DIR: data },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  t.after(() => child.kill('SIGTERM'));
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Test server did not start')), 10000);
    child.stdout.on('data', chunk => { if (String(chunk).includes('Maido is here')) { clearTimeout(timer); resolve(); } });
    child.on('exit', code => { clearTimeout(timer); reject(new Error(`Test server exited: ${code}`)); });
    child.stderr.on('data', chunk => { clearTimeout(timer); reject(new Error(String(chunk))); });
  });
  const post = (route, body, options = {}) => fetch(`${base}${route}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), ...options });
  await t.test('serves built app and starts unconfigured', async () => {
    assert.equal((await fetch(base)).status, 200);
    const initial = await (await fetch(`${base}/api/config`)).json();
    assert.equal(initial.configured, false); assert.equal('apiKey' in initial, false);
    assert.equal((await post('/api/chat', { characterId: 'tester', message: 'hi' })).status, 409);
  });
  await t.test('rejects foreign origins, hosts, malformed and oversized JSON', async () => {
    assert.equal((await post('/api/config', {}, { headers: { 'Content-Type': 'application/json', Origin: 'https://untrusted.example' } })).status, 403);
    const foreignHostStatus = await new Promise((resolve, reject) => {
      const req = httpRequest(`${base}/api/config`, { headers: { Host: 'untrusted.example' } }, res => { res.resume(); resolve(res.statusCode); });
      req.on('error', reject); req.end();
    });
    assert.equal(foreignHostStatus, 403);
    assert.equal((await post('/api/config', {}, { headers: { 'Content-Type': 'text/plain' } })).status, 415);
    assert.equal((await post('/api/config', {}, { body: '{invalid' })).status, 400);
    assert.equal((await post('/api/config', { value: 'x'.repeat(150000) })).status, 413);
  });
  await t.test('lists and serves folder models while refusing unrelated files and symlinks', async () => {
    const name = `maido-integration-${process.pid}.vrm`;
    const linkName = `maido-integration-link-${process.pid}.vrm`;
    const modelPath = new URL(`../models/${name}`, import.meta.url);
    const linkPath = new URL(`../models/${linkName}`, import.meta.url);
    const bytes = Buffer.from('temporary VRM route test fixture');
    await writeFile(modelPath, bytes, { flag: 'wx' });
    try {
      await symlink(new URL('../.env.example', import.meta.url).pathname, linkPath);
      const catalog = await (await fetch(`${base}/api/models`)).json();
      assert.ok(catalog.models.some(model => model.name === name));
      assert.ok(!catalog.models.some(model => model.name === linkName));
      assert.ok(catalog.models.every(model => model.name.toLowerCase().endsWith('.vrm')));
      const result = await fetch(`${base}/api/models/${name}`);
      assert.equal(result.status, 200);
      assert.deepEqual(Buffer.from(await result.arrayBuffer()), bytes);
      for (const filename of ['README.md', linkName, '..%2F.env.example']) {
        assert.equal((await fetch(`${base}/api/models/${filename}`)).status, 404);
      }
    } finally { await unlink(modelPath); await unlink(linkPath).catch(() => {}); }
  });
  await t.test('classifies animation clips by file name and offers gesture clips to the model', async () => {
    const names = [`gesture.it-${process.pid}.vrma`, `idle.happy.it-${process.pid}.vrma`, `idle.bogus.it-${process.pid}.vrma`];
    const paths = names.map(name => new URL(`../animations/${name}`, import.meta.url));
    for (const file of paths) await writeFile(file, 'temporary VRMA route test fixture', { flag: 'wx' });
    try {
      const { animations } = await (await fetch(`${base}/api/animations`)).json();
      const byName = Object.fromEntries(animations.map(clip => [clip.name, clip]));
      assert.deepEqual([byName[names[0]].kind, byName[names[0]].key], ['gesture', `it-${process.pid}`]);
      assert.deepEqual([byName[names[1]].kind, byName[names[1]].key], ['idle', 'happy']);
      assert.equal(byName[names[2]].kind, 'extra');
      assert.equal((await fetch(`${base}/api/animations/${names[0]}`)).status, 200);
      assert.equal((await fetch(`${base}/api/animations/..%2F.env.example`)).status, 404);
    } finally { for (const file of paths) await unlink(file); }
  });
  await t.test('configures a mock provider without leaking its key', async () => {
    const result = await post('/api/config', { provider: 'compatible', model: 'mock-test', baseUrl: `http://127.0.0.1:${upstream.address().port}/v1`, apiKey: 'local-test-key' });
    assert.equal(result.status, 200);
    const value = await result.text(); assert.ok(!value.includes('local-test-key')); assert.equal(JSON.parse(value).hasKey, true);
  });
  const chat = (message, characterId = 'tester', options) => post('/api/chat', { characterId, message }, options);
  const history = async id => (await (await fetch(`${base}/api/characters/${id}/history`)).json()).messages;
  await t.test('chats as the character, from her saved history', async () => {
    const first = await chat('Hello');
    const reply = await first.json();
    assert.equal(first.status, 200); assert.equal(reply.text, 'Mock reply: Hello');
    assert.deepEqual(reply.beats, [{ at: 0, emotion: 'neutral', intensity: .5, gesture: 'none' }]);
    assert.deepEqual(reply.remembered, []);
    assert.equal(upstreamRequest.path, '/v1/chat/completions');
    assert.equal(upstreamRequest.authorization, 'Bearer local-test-key');
    const system = upstreamRequest.body.messages[0];
    assert.equal(system.role, 'system');
    assert.match(system.content, /^You are Tester\. A test character\.\nYou are a girl\/woman \(she\/her\)\./);
    assert.match(system.content, /I have green pigtails\./);
    assert.match(system.content, /gesture: none, wave \(greeting or goodbye\)/);
    assert.match(system.content, /face \(optional.*smug \(smug, teasing\)/);
    // The second turn is built by the server from her history, with her earlier body tag re-attached.
    await chat('Apa kabar?');
    assert.deepEqual(upstreamRequest.body.messages.slice(1).map(m => m.role), ['user', 'assistant', 'user']);
    assert.equal(upstreamRequest.body.messages[2].content, '<mood emotion="neutral" intensity="0.5" gesture="none"/>Mock reply: Hello');
    assert.equal(upstreamRequest.body.messages[3].content, 'Apa kabar?');
    assert.equal((await history('tester')).length, 4);
  });
  await t.test('keeps memories she writes herself, per character', async () => {
    const reply = await (await chat('My cat is Mochi')).json();
    assert.equal(reply.text, 'Mochi! Cute name.');
    assert.equal(reply.beats[0].face, 'love');
    assert.deepEqual(reply.remembered.map(m => m.text), ['The user has a cat named Mochi.']);
    const { memories } = await (await fetch(`${base}/api/characters/tester/memories`)).json();
    assert.equal(memories.length, 1);
    await chat('What do you remember?');
    assert.match(upstreamRequest.body.messages[0].content, /What you remember about the user[\s\S]*cat named Mochi/);
    // Another character has her own (empty) history and no memory of Mochi.
    await chat('Hi', 'other');
    assert.doesNotMatch(upstreamRequest.body.messages[0].content, /Mochi/);
    assert.equal(upstreamRequest.body.messages.length, 2);
    // (The prompt's own example note must never plant a fake memory either.)
    assert.equal((await history('other')).length, 2);
    // Forgetting removes it from her next conversation.
    assert.equal((await fetch(`${base}/api/characters/tester/memories/${memories[0].id}`, { method: 'DELETE' })).status, 200);
    await chat('Still remember?');
    assert.doesNotMatch(upstreamRequest.body.messages[0].content, /Mochi/);
  });
  await t.test('every character knows the user from their profile', async () => {
    const put = body => fetch(`${base}/api/profile`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    assert.equal((await put({ name: 'x'.repeat(61) })).status, 400);
    const saved = await (await put({ name: 'Raka Pratama', callMe: 'Raka', gender: 'nonbinary', location: 'Jakarta', preferences: 'Straight to the point.' })).json();
    assert.equal(saved.gender, ''); // only female/male (or unset)
    assert.deepEqual(await (await fetch(`${base}/api/profile`)).json(), saved);
    assert.equal(JSON.parse(await readFile(path.join(data, 'memory', 'you.json'), 'utf8')).callMe, 'Raka');
    for (const id of ['tester', 'other']) {
      await chat('Hai', id);
      const system = upstreamRequest.body.messages[0].content;
      assert.match(system, /Who you are talking with[\s\S]*Name: Raka Pratama\nCall them: Raka\nLives in: Jakarta[\s\S]*Straight to the point\./);
      assert.match(system, /## Right now\nIt is \w+day, \d+ \w+ \d{4}/);
    }
  });
  await t.test('rejects bad messages, unknown characters, and path tricks', async () => {
    for (const message of ['', '   ', 'x'.repeat(12001), 42]) assert.equal((await chat(message)).status, 400);
    assert.equal((await chat('hi', 'nobody')).status, 404);
    assert.equal((await chat('hi', '../tester')).status, 404);
    assert.equal((await fetch(`${base}/api/characters/..%2Fcharacters%2Ftester/history`)).status, 404);
    const result = await chat('error');
    assert.equal(result.status, 502); assert.match((await result.json()).error, /quota/);
  });
  await t.test('creates, edits, and deletes characters', async () => {
    const created = await post('/api/characters', { name: 'Nova Star', gender: 'male', model: 'nova.vrm', restingMood: 'excited', restingFace: 'grin' });
    const card = await created.json();
    assert.equal(created.status, 201); assert.equal(card.id, 'nova-star'); assert.equal(card.restingFace, 'grin'); assert.equal(card.gender, 'male');
    assert.equal((await (await post('/api/characters', { name: 'No Gender', model: '' })).json()).gender, 'female');
    const put = (id, body) => fetch(`${base}/api/characters/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    assert.equal((await put('nova-star', { ...card, model: '../secret.vrm' })).status, 400);
    assert.equal((await put('nova-star', { ...card, name: '' })).status, 400);
    assert.equal((await (await put('nova-star', { ...card, tagline: 'Edited' })).json()).tagline, 'Edited');
    assert.equal(JSON.parse(await readFile(path.join(data, 'characters', 'nova-star.json'), 'utf8')).tagline, 'Edited');
    assert.equal((await fetch(`${base}/api/characters/nova-star?forgetMemory=1`, { method: 'DELETE' })).status, 200);
    const { characters } = await (await fetch(`${base}/api/characters`)).json();
    assert.deepEqual(characters.map(c => c.id), ['no-gender', 'other', 'tester']);
  });
  await t.test('rejects concurrent work and keeps no half turn when stopped', async () => {
    const before = (await history('tester')).length;
    const controller = new AbortController();
    const waiting = chat('slow', 'tester', { signal: controller.signal }).catch(e => e);
    await received;
    assert.equal((await chat('another')).status, 429);
    controller.abort(); assert.equal((await waiting).name, 'AbortError');
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.equal((await history('tester')).length, before);
  });
  await t.test('disconnect drops the key and blocks further chat', async () => {
    const result = await post('/api/disconnect', {});
    const value = await result.json(); assert.equal(value.configured, false); assert.equal(value.hasKey, false);
    assert.equal((await chat('hello')).status, 409);
  });
});
