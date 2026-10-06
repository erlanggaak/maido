import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transformWithEsbuild } from 'vite';

// Compile the browser helper using the project's existing Vite toolchain.
const source = await readFile(new URL('../src/chat/replyStream.ts', import.meta.url), 'utf8');
const { code } = await transformWithEsbuild(source, 'replyStream.ts', { loader: 'ts' });
const { readReplyStream } = await import(
  `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
);

test('reply stream decodes split UTF-8, blank lines, and a final line without newline', async () => {
  const events = [
    { type: 'text', text: 'Halo 世界 👋' },
    { type: 'done', text: 'Halo 世界 👋', beats: [], remembered: [] },
  ];
  const bytes = new TextEncoder().encode(
    '\n' + events.map((event) => JSON.stringify(event)).join('\n\n'),
  );
  const body = new ReadableStream({
    start(controller) {
      for (const byte of bytes) controller.enqueue(Uint8Array.of(byte));
      controller.close();
    },
  });
  const actual = [];
  for await (const event of readReplyStream(body)) actual.push(event);
  assert.deepEqual(actual, events);
  assert.equal(body.locked, false);
});

test('leaving a reply stream early cancels the HTTP body and releases its lock', async () => {
  let cancelled = false;
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('{"type":"error","error":"offline"}\n'));
    },
    cancel() {
      cancelled = true;
    },
  });
  for await (const event of readReplyStream(body)) {
    assert.equal(event.type, 'error');
    break;
  }
  assert.equal(cancelled, true);
  assert.equal(body.locked, false);
});

test('reply stream preserves network failures and releases the reader', async () => {
  const body = new ReadableStream({
    start(controller) {
      controller.error(new Error('network failed'));
    },
  });
  await assert.rejects(async () => {
    for await (const _event of readReplyStream(body)) {
    }
  }, /network failed/);
  assert.equal(body.locked, false);
});
