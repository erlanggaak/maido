import type { Beat, Memory } from '../types';

export type ReplyEvent =
  | { type: 'text'; text: string }
  | { type: 'beat'; beat: Beat }
  | { type: 'done'; text: string; beats: Beat[]; remembered: Memory[] }
  | { type: 'error'; error: string };

/** Decode NDJSON independently of network chunk boundaries, including a final unterminated line. */
export async function* readReplyStream(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<ReplyEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newline = buffer.indexOf('\n');
      while (newline >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (line) yield JSON.parse(line) as ReplyEvent;
        newline = buffer.indexOf('\n');
      }
    }
    buffer += decoder.decode();
    if (buffer.trim()) yield JSON.parse(buffer) as ReplyEvent;
  } finally {
    // Early exit (e.g. a server error event) must release the HTTP stream too.
    // An already-aborted stream can reject cancellation; preserve the original failure.
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
