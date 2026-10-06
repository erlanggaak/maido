import { BUILTIN_GESTURES, beatFromTag, providerFetch } from './providers.mjs';

/**
 * Streaming replies: read the provider's server-sent events as text deltas, and strip the
 * hidden stage tags (<mood …/>, <remember>…</remember>) while they're still arriving, even
 * when a tag is split across chunks. The avatar can start speaking at the first word.
 */

/** Yields the text deltas of a streaming provider response. */
export async function* streamText(config, messages, signal, system) {
  const response = await providerFetch(config, messages, signal, system, true);
  const decoder = new TextDecoder();
  let buffer = '';
  for await (const chunk of response.body) {
    buffer += decoder.decode(chunk, { stream: true });
    // SSE: events end with a blank line; we only need their data: lines.
    let end;
    while ((end = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, end).replace(/\r$/, '');
      buffer = buffer.slice(end + 1);
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (!data || data === '[DONE]') continue;
      let event;
      try { event = JSON.parse(data); } catch { continue; }
      const delta = deltaOf(config.provider, event);
      if (delta) yield delta;
    }
  }
}

function deltaOf(provider, event) {
  if (event.type === 'error' || event.error) throw new Error('The provider stopped with an error. Try again, or check the model in Settings.');
  if (provider === 'anthropic') return event.type === 'content_block_delta' && event.delta?.type === 'text_delta' ? event.delta.text : '';
  if (provider === 'openai') {
    if (event.type === 'response.failed' || event.type === 'response.incomplete') throw new Error('The provider stopped before finishing. Try again.');
    return event.type === 'response.output_text.delta' ? event.delta : '';
  }
  return event.choices?.[0]?.delta?.content ?? '';
}

const OPENERS = ['<mood', '<remember>', '</mood>', '</remember>'];
const MAX_TAG = 400;

/**
 * Incremental twin of parseReply + extractMemories. Feed raw deltas with push(); it returns
 * events: { type: 'text', text } (clean, user-visible) and { type: 'beat', beat } (with `at`
 * = position in the clean text). Memory notes are collected for the end.
 */
export class StageStream {
  constructor(gestures = BUILTIN_GESTURES) {
    this.gestures = gestures;
    this.pending = '';
    this.length = 0;         // clean characters emitted so far
    this.lastChar = '';
    this.afterTag = false;   // text right after a tag loses its leading spaces (like parseReply)
    this.beats = 0;
    this.notes = [];
  }

  push(delta) {
    this.pending += delta;
    const events = [];
    for (;;) {
      const open = this.pending.indexOf('<');
      if (open < 0) { this.text(this.pending, events); this.pending = ''; break; }
      if (open > 0) { this.text(this.pending.slice(0, open), events); this.pending = this.pending.slice(open); }
      const rest = this.pending;
      const lower = rest.toLowerCase();
      if (lower.startsWith('<mood') && /^<mood[\s/>]/.test(lower)) {
        const close = rest.indexOf('>');
        if (close < 0) { if (rest.length > MAX_TAG) this.literal(events); break; }
        this.beat(rest.slice(5, close).replace(/\/$/, ''), events);
        this.pending = rest.slice(close + 1);
        continue;
      }
      if (lower.startsWith('<remember>')) {
        const close = lower.indexOf('</remember>');
        if (close < 0) { if (rest.length > MAX_TAG) this.literal(events); break; }
        const note = rest.slice(10, close).replace(/\s+/g, ' ').trim();
        if (note && note.length <= 240 && this.notes.length < 3) this.notes.push(note);
        this.pending = rest.slice(close + 11);
        this.afterTag = true;
        continue;
      }
      if (lower.startsWith('</mood>')) { this.pending = rest.slice(7); continue; }
      // Could this still become a tag once more text arrives? Then wait for it.
      if (OPENERS.some(tag => tag.startsWith(lower) || (tag === '<mood' && lower === '<mood'))) break;
      this.literal(events);
    }
    return events;
  }

  /** Flushes what's left; an unfinished tag at the very end is dropped. */
  end() {
    const events = [];
    if (this.pending && !OPENERS.some(tag => this.pending.toLowerCase().startsWith(tag.slice(0, Math.min(tag.length, this.pending.length))))) this.text(this.pending, events);
    this.pending = '';
    return events;
  }

  literal(events) { this.text('<', events); this.pending = this.pending.slice(1); }

  text(raw, events) {
    let text = raw;
    if (!this.length || this.afterTag) text = text.trimStart();
    if (!text) return;
    this.afterTag = false;
    this.length += text.length; this.lastChar = text.at(-1);
    events.push({ type: 'text', text });
  }

  beat(attributes, events) {
    // Same spacing rule as parseReply: a tag mid-sentence separates the words around it.
    if (this.length && !/\s/.test(this.lastChar)) { this.length += 1; this.lastChar = ' '; events.push({ type: 'text', text: ' ' }); }
    this.afterTag = true;
    if (this.beats++ >= 6) return;
    events.push({ type: 'beat', beat: beatFromTag(attributes, this.length, this.gestures) });
  }
}
