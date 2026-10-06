# Maido

A personal, local-first 3D companion for macOS. Maido fills the screen as a 3D
character; settings live in a slide-out sidebar, and the full chat transcript only
opens on demand. Her brain (your LLM) drives her face and body. It is a new, small app inspired by the
Riko project; it does not contain Riko's audio pipeline.

## Start

Requires Node.js 22.12+ and npm. No Python, GPU setup, or cloud deployment needed.

```sh
npm install
npm run dev
```

Open **http://localhost:4317**. Keep the terminal running; Ctrl+C stops it.
The server binds only to `127.0.0.1`. Use the same browser and hostname to retain
your local conversation and selected avatar.

## Characters: a folder, not uploads

1. Put your exported `.vrm` files in [`models/`](models/README.md).
2. Start Maido. It automatically selects the first model alphabetically, unless
   a previous model choice exists in this browser.
3. Switch characters in **Settings → Character**.
4. Click the refresh button there after adding, replacing, or removing files.

For an explicit first-run default, copy `.env.example` to `.env` and set:

```dotenv
MAIDO_DEFAULT_MODEL=AvatarSample_D.vrm
```

Your last successfully loaded choice takes priority on later visits. A `.vroid`
file is the editable VRoid project, not the runtime avatar. Keep it for editing,
and export a self-contained VRM 1.0 (or legacy 0.x) file to this folder. No model
data is sent to the LLM provider. Files over 150 MB, hidden files, symlinks, and
subfolders are excluded. Without a VRM the built-in temporary 3D mascot appears.

The viewer runs at up to 60 fps (30 optional), caps pixel ratio, and pauses rendering
when the tab is hidden. Idle motion respects reduced-motion preferences. Drag to
orbit, right-drag or Shift-drag (or arrow keys on the canvas) to pan, scroll to zoom
toward the cursor, and double-click to reset the camera.

## How the brain moves the body

```text
LLM reply ──► <mood emotion="happy" intensity="0.8" gesture="wave"/>Halo! <mood emotion="thinking" gesture="think"/>Hmm…
   │ server/providers.mjs  parseReply(): strips tags → clean text + beats [{at, emotion, intensity, gesture}]
   ▼
Director (src/avatar/director.ts) — the "spinal cord"
   • reveals the reply like subtitles; fires each beat when the text reaches it
   • blends emotion weights smoothly → face presets + posture
   • layers gestures on top, plus breathing, sway, blinking, gaze, idle glances
   • text-driven lip-sync: each vowel maps to a VRM viseme (aa/ih/ou/ee/oh)
   ▼
AvatarViewer — applies bone rotations + expressions to the VRM every frame
```

The LLM only decides *what* Maido feels and *which* gesture fits; it never
controls bones directly. Poses live in `src/avatar/poses.ts` (emotions: neutral,
happy, excited, sad, angry, surprised, relaxed, thinking, shy; gestures: wave, nod,
shake, think, shrug, cheer, bow, tilt). While waiting for a reply she shows the
thinking pose. After speaking, the emotion lingers then fades to the resting mood.

### Animation clips (.vrma)

Put `.vrma` files in [`animations/`](animations/README.md), named
`<kind>.<key>[.<variant>].vrma` (`idle.happy.sway.vrma`, `talk.neutral.vrma`,
`react.surprised.vrma`, `gesture.clap.vrma`). They are retargeted to the current
VRM with `@pixiv/three-vrm-animation` and played by a Three.js `AnimationMixer`:
idle/talk loops crossfade by emotion (variants rotate), gestures and reactions blend
on top, and new `gesture.*` names are offered to the LLM automatically. Without
clips everything falls back to the procedural poses. The animations README lists
where to get clips and a full recommended set.

### Faces and manga symbols

The tag can also carry a specific face: `<mood emotion="happy" face="smug" …/>`. Faces
(`src/avatar/faceRecipes.ts`) mix a VRoid model's separate brow, eye, mouth, and fang morphs
(57 on the sample model) into 21 anime expressions the five VRM presets can't do: smile,
joy, grin, smug, wink, pout, annoyed, furious, sad, crying, surprised, shocked, blank,
sleepy, thinking, embarrassed, excited, determined, content, love, nervous. Each emotion has
a default face; models without VRoid morphs fall back to preset weights. Faces also raise
manpu, drawn around the head (`src/avatar/manpu.ts`): blush, sweat drop, anger vein,
sparkles, "!", "?", zzz, hearts, tears, gloom lines, "…", and music notes. Blinking and
lip-sync scale down when a face already closes the eyes or shapes the mouth. Settings →
Body & emotion previews every face and can turn manga symbols off.

**Settings → Physics** tunes the VRM spring bones (hair, skirt, tails) at runtime:
*As exported* keeps the model's values, *Soft*/*Bouncy* lower stiffness and drag and add
a little gravity, and *Gentle breeze* adds a gusting wind (`src/avatar/physics.ts`).
VRoid exports often ship with zero gravity and stiff hair, which looks rigid in calm
idles. Rendering runs at 60 fps by default (30 fps option to save battery).

Arms never sink into the body or clothes: at load each model's torso, legs and skirt are
sampled into a side profile, and every frame the upper arms swing outward just enough for
the elbow, forearm and wrist to clear it (hands may rest lightly on a skirt). Lighting
defaults to *Faithful*: one white light of intensity π and no tone mapping, which renders
MToon textures at their true colours; *Studio* is the brighter, warmer look.

**Settings → Appearance** sets the background colour (presets or any custom colour).
**Settings → Animations** lists the loaded clips; click one to preview it.

**Settings → Body & emotion** toggles brain control and idle life, sets a resting
mood, and has buttons to preview every emotion and gesture. In dev, the console
also exposes `maido.feel('happy')` / `maido.play('wave')`.

Adding a new gesture: add it to `GESTURES` in both `src/types.ts` and
`server/providers.mjs`, then define its motion in `GESTURE_LIBRARY`.

## Characters

Each character is a card in [`characters/`](characters/) (`maido.json`, `kira.json`, …) and
gets a private folder in `memory/<id>/` (ignored by Git) with her conversation history and
long-term memories. Switching characters in **Settings → Characters** switches her body,
personality, conversation, and memories together, like talking to a different person.

A card holds: name (and native name), gender (female or male), tagline, body (`model`: a `.vrm` in `models/`),
resting mood and face, first greeting, a first-person self-description (her look, so she
is aware of her own appearance), background, personality, speaking style, likes,
dislikes, and her relationship with you. Edit or create them with the pencil / **New
character** buttons, or edit the JSON files directly.

Memories are written by the character herself: when you share something worth keeping,
she adds a hidden `<remember>…</remember>` note to her reply (no extra LLM call). The
server stores it, shows a "💭 … will remember" toast, and includes her memories in every
later conversation with her, and only her. The character editor's **Memories** tab lists
them; forget any one, or everything. The system prompt is built per request from her card,
her memories, and the shared rules (`server/providers.mjs`); her recent history (up to 19
turns) comes from `memory/<id>/history.json`.

Three characters ship with the app: **Maido** (a warm fox-girl companion,
`AvatarSample_D.vrm`), **Kira** (a teasing night-owl gamer girl, `AvatarSample_B.vrm`), and
**Haru** (a calm older-brother type; no body yet, so he shows the mascot until you set a
male `.vrm` on his card, e.g. one made from VRoid Studio's male presets).

Gender sets the character's pronouns in the prompt and the UI, and picks the procedural
body language: male characters scratch the back of their head when shy, fist-pump when
excited, and open their arms when surprised, instead of the feminine-coded defaults. A v0.2 conversation
stored in the browser is moved into Maido's history the first time she loads.

### You (two-way knowledge)

Characters know themselves from their cards, and know *you* from your profile: **Settings
→ You** (stored in `memory/you.json`, shared by every character). Name, what to call you,
gender, age, location, languages, work, your background, personality and habits,
interests, goals, how you like to be talked to, and what to avoid. It goes into every
character's prompt as "who you are talking with", together with your local date and time.
Things you write there are treated as facts; characters' own memories add what they learn
in conversation, and they're told not to re-note what your profile already says. Greetings
may use `{user}` for the name you want to be called.

## Connect a brain

Open **Settings**, choose a provider, enter its model ID and API key, and save.
Saving validates configuration, not account access; the first message tests the
actual provider connection.

| Provider | Interface |
| --- | --- |
| OpenAI | Responses API; `store: false` |
| Claude | Anthropic Messages API |
| Custom API | OpenAI-compatible `/chat/completions` endpoint |

For Custom API, supply the base URL including `/v1` when required. HTTPS is
required for remote services; localhost HTTP is allowed for local model servers.
A key is optional for compatible servers that do not require one. Compatibility
depends on your provider supporting the standard request/response format.

Keys entered in Settings are held in local server memory and are also remembered for
this browser session (sessionStorage, per provider): they stay filled in, survive page
reloads, and reconnect automatically after the local server restarts. Closing the tab
forgets them; Disconnect forgets that provider at once. The session copy is plain text in
this tab's storage. The config endpoint never returns keys, and a change of
provider/endpoint never silently reuses the old key.

To keep configuration across restarts, optionally copy `.env.example` to `.env`
and fill in `MAIDO_PROVIDER`, `MAIDO_MODEL`, `MAIDO_API_KEY`, and, if necessary,
`MAIDO_BASE_URL`. This saves the secret as plaintext on your Mac; `.env` is ignored
by Git. Never use `VITE_` variables for secrets. Disconnect clears the running
session's key; remove it from `.env` as well to prevent loading it next startup.

Use a model ID available to your API account. The sample OpenAI ID is a starting
configuration, not a guarantee of access. This app does not connect through or
reuse your ChatGPT/Claude desktop subscription session.

## Conversation and privacy

- English and Indonesian are requested in Maido's system instructions. Actual
  quality follows the selected model.
- Conversations and memories are saved per character in `memory/<id>/` as plain JSON on
  this computer (latest 400 messages, 200 memories). Not encrypted.
- A request sends her card, up to 60 of her memories, up to 19 recent completed turns,
  and the current question to your chosen provider, bounded by a character budget.
- Enter sends; Shift+Enter adds a line. Stop cancels the request and restores the
  question for editing. Errors do not create incomplete history entries.
- Export downloads the current character's conversation as JSON; Clear deletes it from
  `memory/<id>/history.json` (her memories stay until you forget them). This does not
  delete any provider-side data.
- Local hosting does not mean cloud AI is offline: the provider receives the
  selected chat context. Avatar rendering and model files stay local.

No voice, microphone recording, audio lip-sync, semantic memory, autonomous background
tasks, or computer use is implemented in v0.1. The UI explicitly distinguishes
these future features. No screenshot/desktop permissions are requested.

## Build and verification

```sh
npm run check
npm run build
npm run test:integration
npm start
```

`npm start` serves the production build at the same localhost address. Stop the
development server first. To use another port: `PORT=4318 npm run dev`.

Integration checks run after implementation, using Node's built-in test runner.
They launch an isolated app on port 4418 plus a temporary mock provider on a
random loopback port. They verify provider payloads, chat/error/cancellation
flows, key redaction, model-folder access, and local origin/host restrictions.
They do not call paid APIs. Live provider verification needs your own API key.

## Layout

```text
models/                  Your VRM files (ignored by Git)
src/App.tsx              Full-screen stage, speech bubble, composer, conversation state
src/AvatarViewer.tsx     Three.js scene, VRM loading; applies the director's output
src/avatar/director.ts   Emotion blending, gestures, idle life, gaze, text lip-sync
src/avatar/poses.ts      Posture, face, and gesture library (procedural)
src/avatar/clips.ts      .vrma loading, retargeting and AnimationMixer blending
src/avatar/physics.ts    Runtime spring-bone tuning (softness, gravity, wind)
src/avatar/faceRecipes.ts Face library (morph mixes) and each emotion's default face
src/avatar/faces.ts      Registers faces as VRM expressions on the loaded model
src/avatar/manpu.ts      Manga symbols drawn around the head
src/avatar/clearance.ts  Measures each model's body and swings arms out just enough not to clip
animations/              Your .vrma files (ignored by Git) + naming guide
src/Sidebar.tsx          Settings: brain (BYOK), character, body & emotion, conversation
src/Transcript.tsx       Full transcript panel (opened from the sidebar)
src/storage.ts           Local conversation, model choice and preferences
server/index.mjs         Local HTTP server, model catalog and API routes
server/characters.mjs    Character cards, per-character history and memories
characters/              Character cards (JSON)
memory/                  Per-character history and memories (ignored by Git)
src/CharacterEditor.tsx  Character profile and memories editor
server/providers.mjs     Provider adapters and request validation
tests/server.test.mjs    Local integration checks
```

React + TypeScript + Vite + Tailwind CSS v4 (inline utility classes), Three.js +
three-vrm, and a small Express server.
Browser assets are bundled locally; the UI needs no font CDN or remote image.
Future local speech can be a separate Python/Apple Silicon service without
changing the avatar renderer.
