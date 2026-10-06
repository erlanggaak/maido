export const EMOTIONS = ['neutral', 'happy', 'excited', 'sad', 'angry', 'surprised', 'relaxed', 'thinking', 'shy'];
/** Specific anime faces; optional and more precise than the emotion. */
export const FACES = {
  neutral: 'calm', smile: 'gentle smile', joy: 'eyes-closed beaming', grin: 'toothy fang grin', smug: 'smug, teasing',
  wink: 'playful wink', pout: 'sulky pout', annoyed: 'irritated', furious: 'really angry', sad: 'sad', crying: 'crying',
  surprised: 'surprised', shocked: 'wide-eyed shock', blank: 'speechless deadpan', sleepy: 'drowsy', thinking: 'pondering',
  embarrassed: 'blushing, flustered', excited: 'thrilled', determined: 'confident, fired up', content: 'peaceful, humming',
  love: 'affectionate, heart-eyed', nervous: 'nervous, sweating',
};
/** Gestures the avatar can always perform procedurally, even without animation files. */
export const BUILTIN_GESTURES = ['wave', 'nod', 'shake', 'think', 'shrug', 'cheer', 'bow', 'tilt'];
export const GESTURE_PATTERN = /^[a-z][a-z0-9-]{0,23}$/;
/** When to use each gesture. Clip-only gestures (from animations/) without a hint are still offered by name. */
const GESTURE_HINTS = {
  wave: 'greeting or goodbye', nod: 'agreeing, yes', shake: 'disagreeing, no', think: 'pondering',
  shrug: 'not sure', cheer: 'celebrating', bow: 'formal thanks or apology', tilt: 'curious',
  clap: 'applauding', laugh: 'something funny', peace: 'cute peace sign', point: 'pointing something out',
  'blow-kiss': 'affection', facepalm: 'exasperated', stretch: 'tired, waking up', yawn: 'sleepy',
  spin: 'twirl for joy', dance: 'very happy, party', cry: 'very sad', pout: 'sulking', salute: 'yes sir, ready',
  sigh: 'relief or tiredness', 'hands-on-hips': 'confident or scolding', 'hand-on-chest': 'touched, sincere',
  'fist-pump': 'determined, yes!', 'look-around': 'searching, confused', bashful: 'embarrassed', 'show-off': 'showing off your outfit',
  jump: 'excited bounce', 'cover-face': 'very embarrassed', 'heart-hands': 'love, appreciation', agree: 'strong agreement',
  dismiss: 'brushing something off', explain: 'explaining with hands', surprised: 'startled reaction',
  'finger-gun': 'playful "gotcha", teasing', pose: 'striking a cute model pose', squat: 'exercise, joking about workouts',
};

/** The original Maido, used when no character card is given (e.g. tests, or an empty characters/). */
export const FALLBACK_CARD = {
  id: 'maido', name: 'Maido', nameNative: '', gender: 'female', tagline: 'A warm, thoughtful personal companion.',
  selfDescription: '', background: '', personality: 'Friendly, concise, useful, and occasionally playful without forced anime catchphrases.',
  speakingStyle: '', likes: '', dislikes: '', relationship: 'A personal companion for one person.',
};

const section = (title, body) => body?.trim() ? `\n## ${title}\n${body.trim()}\n` : '';

/**
 * System prompt = who this character is (her card, in her own words) + what she remembers
 * about the user + the shared rules for this app (limits, body tags, memory notes).
 */
/** "Who you are talking with": the user's own profile, written by them (so: trusted facts). */
export function describeUser(profile = {}) {
  const lines = [];
  const add = (label, value) => { if (value?.trim()) lines.push(`${label}: ${value.trim()}`); };
  add('Name', profile.name);
  add('Call them', profile.callMe);
  if (profile.gender) lines.push(`Gender: ${profile.gender === 'male' ? 'male (he/him)' : 'female (she/her)'}`);
  add('Age', profile.age); add('Lives in', profile.location); add('Languages', profile.languages); add('Work / studies', profile.occupation);
  const blocks = [['About them', profile.about], ['Their personality and habits', profile.personality], ['Interests', profile.interests],
    ['What they are working toward', profile.goals], ['How they like to be talked to and helped', profile.preferences], ['Please avoid', profile.avoid]];
  for (const [title, value] of blocks) if (value?.trim()) lines.push(`${title}:\n${value.trim()}`);
  return lines.join('\n');
}

/** Local date and time on this computer, so characters know when "now" is for the user. */
export function nowForUser(date = new Date()) {
  return date.toLocaleString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' });
}

export function persona({ card = FALLBACK_CARD, memories = [], gestures = BUILTIN_GESTURES, profile = {}, now = nowForUser() } = {}) {
  const list = [...new Set(gestures)].map(g => GESTURE_HINTS[g] ? `${g} (${GESTURE_HINTS[g]})` : g).join(', ');
  const remembered = memories.slice(-60).map(memory => `- ${memory.text} (${memory.at.slice(0, 10)})`).join('\n');
  const gender = card.gender === 'male' ? 'a boy/man (he/him)' : 'a girl/woman (she/her)';
  return `You are ${card.name}${card.nameNative ? ` (${card.nameNative})` : ''}. ${card.tagline}
You are ${gender}. Stay fully in character as ${card.name}: you are this person, not an AI assistant playing a role.
In Indonesian the user may call you "kak", "${card.gender === 'male' ? 'mas/bang' : 'mbak'}" or by name; react naturally.
${section('Who you are (your own self-image and how you look)', card.selfDescription)}${section('Your background', card.background)}${section('Your personality', card.personality)}${section('How you speak', card.speakingStyle)}${section('Things you like', card.likes)}${section('Things you dislike', card.dislikes)}${section('You and the user', card.relationship)}${section('Who you are talking with (the user described themselves; treat this as true)', describeUser(profile))}${section('What you remember about the user from earlier conversations', remembered)}
## Right now
It is ${now} for the user. Use it naturally (greetings, "it's late, go to sleep"), don't announce it.

## Rules of this world
Speak naturally in English or Indonesian, matching the user's language and code-switching when appropriate.
You live on the user's computer as a 3D anime character they can see. You can only talk with them here.
You do NOT have computer control, file access, voice, browsing, or task execution yet.
Never claim to have performed an action, or to remember something that is neither in this conversation nor in your memories above.
If asked to do work that needs unavailable tools, say so in character and help with a draft or instructions.

## Remembering
When the user shares something worth keeping for future conversations (their name, preferences, plans, important events, feelings, things about their life), add a short note at the very END of your reply:
<remember>…one short fact about the user…</remember>
At most 2 notes per reply, written as facts about the user, only new information not already in your memories or in what the user told you about themselves. Never mention these notes.

## Your body
You control your body with stage tags that the user never sees.
Start EVERY reply with exactly one tag, then your words:
<mood emotion="happy" intensity="0.7" gesture="wave"/>
- emotion: ${EMOTIONS.join(', ')}
- intensity: 0.2 (subtle) to 1.0 (strong)
- gesture: none, ${list}
- face (optional, a specific expression): ${Object.entries(FACES).map(([f, hint]) => `${f} (${hint})`).join(', ')}
  e.g. <mood emotion="happy" intensity="0.6" gesture="none" face="smug"/>
When your feeling clearly changes mid-reply, put another tag right before that sentence (at most 3 tags in total).
Express your own personality through emotions, faces, and gestures. Most sentences need gesture="none"; do not repeat the same gesture every reply.
Never mention, explain, or quote the tags, and never put them inside code blocks.`;
}

// Spaces after a note go too, so "Eh?! <remember>…</remember> Anyway" doesn't leave a double space.
const REMEMBER = /<remember>([\s\S]*?)<\/remember>[ \t]*/gi;
/** Pulls the character's own memory notes out of a reply (at most 3, each short). */
export function extractMemories(raw) {
  const notes = [...raw.matchAll(REMEMBER)].map(match => match[1].replace(/\s+/g, ' ').trim()).filter(text => text && text.length <= 240).slice(0, 3);
  return { text: raw.replace(REMEMBER, '').replace(/[ \t]+\n/g, '\n').trim(), notes };
}

const TAG = /<mood\b([^>]*?)\/?>(?:\s*<\/mood>)?/gi;
/** Turns a tag's attribute text (` emotion="happy" gesture="wave"`) into a validated beat. */
export function beatFromTag(attributes, at, gestures = BUILTIN_GESTURES) {
  const attrs = Object.fromEntries([...attributes.matchAll(/(\w+)\s*=\s*["']([^"']*)["']/g)].map(m => [m[1].toLowerCase(), m[2].trim().toLowerCase()]));
  const intensity = Number.parseFloat(attrs.intensity);
  return {
    at,
    emotion: EMOTIONS.includes(attrs.emotion) ? attrs.emotion : 'neutral',
    intensity: Number.isFinite(intensity) ? Math.min(1, Math.max(.2, intensity)) : .6,
    gesture: gestures.includes(attrs.gesture) ? attrs.gesture : 'none',
    ...(Object.hasOwn(FACES, attrs.face ?? '') ? { face: attrs.face } : {}),
  };
}
/** Splits a raw model reply into clean text plus timed body "beats" for the avatar. */
export function parseReply(raw, gestures = BUILTIN_GESTURES) {
  const beats = [];
  let text = '';
  let last = 0;
  const segment = (from, to) => beats.length ? raw.slice(from, to).trimStart() : raw.slice(from, to);
  for (const match of raw.matchAll(TAG)) {
    text += segment(last, match.index);
    last = match.index + match[0].length;
    if (text.trim() === '') text = '';
    else if (!/\s$/.test(text)) text += ' ';
    beats.push(beatFromTag(match[1], text.length, gestures));
  }
  text += segment(last);
  // Leading whitespace was dropped above; keep beat offsets aligned with the trimmed text.
  const lead = text.length - text.trimStart().length;
  const clean = text.trim();
  return {
    text: clean,
    beats: beats.slice(0, 6).map(beat => ({ ...beat, at: Math.min(clean.length, Math.max(0, beat.at - lead)) })),
  };
}

/** Rebuilds the leading tag so history keeps teaching the model the stage-tag format. */
export function withLeadingTag(message) {
  const beat = message.beats?.[0];
  if (message.role !== 'assistant' || !beat) return message.content;
  return `<mood emotion="${beat.emotion}" intensity="${beat.intensity}" gesture="${beat.gesture}"${beat.face ? ` face="${beat.face}"` : ''}/>${message.content}`;
}

export function validateConfig(input, previous) {
  if (!input || typeof input !== 'object') throw new Error('Invalid settings.');
  const { provider, model } = input;
  if (!['openai', 'anthropic', 'compatible'].includes(provider)) throw new Error('Choose a supported provider.');
  if (typeof model !== 'string' || !model.trim() || model.length > 160) throw new Error('Enter a model ID.');
  const baseUrl = provider === 'compatible' ? validateBaseUrl(input.baseUrl) : '';
  const sameTarget = provider === previous.provider && baseUrl === previous.baseUrl;
  if (input.apiKey !== undefined && (typeof input.apiKey !== 'string' || input.apiKey.length > 4096)) {
    throw new Error('Invalid API key.');
  }
  // Never reuse a key when changing its destination/provider.
  const apiKey = input.apiKey?.trim() || (sameTarget ? previous.apiKey : '');
  if (provider !== 'compatible' && !apiKey) throw new Error('Enter an API key for this provider.');
  return { provider, model: model.trim(), baseUrl, apiKey };
}

function validateBaseUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error('Enter a valid API base URL.'); }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(loopback && url.protocol === 'http:')) {
    throw new Error('Use HTTPS, or HTTP for a localhost model server.');
  }
  if (url.username || url.password || url.search || url.hash) throw new Error('Base URL cannot contain credentials, query parameters, or fragments.');
  return url.toString().replace(/\/+$/, '');
}

export function validateMessages(messages) {
  if (!Array.isArray(messages) || !messages.length || messages.length > 40) throw new Error('Send between 1 and 40 messages.');
  let size = 0;
  const clean = messages.map((message, index) => {
    if (!message || !['user', 'assistant'].includes(message.role) || typeof message.content !== 'string' || !message.content.trim()) {
      throw new Error('Invalid conversation.');
    }
    if (message.role !== (index % 2 === 0 ? 'user' : 'assistant')) throw new Error('Conversation roles must alternate, starting with the user.');
    if (message.content.length > 12000) throw new Error('A message is too long (maximum 12,000 characters).');
    const beats = Array.isArray(message.beats) ? message.beats.slice(0, 1).filter(beat => beat && EMOTIONS.includes(beat.emotion) && (beat.gesture === 'none' || GESTURE_PATTERN.test(beat.gesture)) && typeof beat.intensity === 'number' && beat.intensity >= 0 && beat.intensity <= 1 && (beat.face === undefined || Object.hasOwn(FACES, beat.face))) : [];
    const content = withLeadingTag({ role: message.role, content: message.content, beats });
    size += content.length;
    return { role: message.role, content };
  });
  if (clean.at(-1).role !== 'user' || size > 60000) throw new Error('Conversation is too large or has no user question.');
  return clean;
}

/** Provider-specific endpoint, headers, and body; `stream` asks for server-sent events. */
export function providerRequest(config, messages, system, stream = false) {
  const headers = { 'Content-Type': 'application/json' };
  if (config.provider === 'anthropic') {
    headers['x-api-key'] = config.apiKey;
    headers['anthropic-version'] = '2023-06-01';
    return { url: 'https://api.anthropic.com/v1/messages', headers, body: { model: config.model, max_tokens: 1600, system, messages, ...(stream ? { stream } : {}) } };
  }
  if (config.provider === 'openai') {
    headers.Authorization = `Bearer ${config.apiKey}`;
    return { url: 'https://api.openai.com/v1/responses', headers, body: { model: config.model, instructions: system, input: messages, max_output_tokens: 1600, store: false, ...(stream ? { stream } : {}) } };
  }
  if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;
  return { url: `${config.baseUrl}/chat/completions`, headers, body: { model: config.model, messages: [{ role: 'system', content: system }, ...messages], max_tokens: 1600, ...(stream ? { stream } : {}) } };
}

/** Sends the request; on failure, throws a safe message (provider error bodies may echo request data). */
export async function providerFetch(config, messages, signal, system, stream = false) {
  const { url, headers, body } = providerRequest(config, messages, system, stream);
  const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal, redirect: 'error' });
  if (!response.ok) {
    await response.body?.cancel();
    if ([401, 403].includes(response.status)) throw new Error('The provider rejected this key or model access. Check Settings.');
    if (response.status === 429) throw new Error('Provider quota or rate limit reached. Check your API billing or try again later.');
    throw new Error(`Provider returned HTTP ${response.status}. Check the model ID and API endpoint.`);
  }
  return response;
}

export async function generateReply(config, messages, signal, system = persona()) {
  const data = await (await providerFetch(config, messages, signal, system)).json();
  let text;
  if (config.provider === 'anthropic') text = data.content?.filter(part => part.type === 'text').map(part => part.text).join('\n');
  else if (config.provider === 'openai') text = data.output?.filter(item => item.type === 'message').flatMap(item => item.content || []).filter(part => part.type === 'output_text').map(part => part.text).join('\n');
  else text = data.choices?.[0]?.message?.content;
  if (typeof text !== 'string' || !text.trim()) throw new Error('The model returned no text. Try another model or a shorter prompt.');
  if (text.length > 12000) throw new Error('The reply was too long. Please ask for a shorter answer.');
  return text.trim();
}
