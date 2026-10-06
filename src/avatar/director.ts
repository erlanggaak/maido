import { EMOTIONS, FACES, type Beat, type ClipAsset, type Emotion, type Face, type Gesture, type Manpu } from '../types';
import { DEFAULT_FACE, FACES as FACE_RECIPES } from './faceRecipes';
import { BONES, ENERGY, GESTURE_LIBRARY, REST, envelope, postureFor, visemeFor, type BodyStyle, type Bone, type Euler3, type Pose } from './poses';

export type LookMode = 'user' | 'pointer' | 'up' | 'aside';
export interface ClipInfo extends Pick<ClipAsset, 'name' | 'kind' | 'key'> {
  duration: number;
  /** Times (s) where the body faces roughly as it started, so cutting there can't flip the blend. */
  calm: number[];
}
export interface Performance {
  /** Full procedural pose (absolute normalized-bone rotations). */
  pose: Pose;
  /**
   * Clip mode only: how strongly the procedural pose should override the playing
   * animation, per bone (0..1). Without a looping clip the procedural pose is the base.
   */
  override: Partial<Record<Bone, number>>;
  /** Clip mode only: small rotations added on top of the animation (head tilt, nods, breathing). */
  additive: Pose;
  /** Looping clip (idle/talk) and one-shot clip (gesture/react) that should be playing. */
  loop: string | null;
  shot: { name: string; id: number } | null;
  /** Face library weights 0..1 (see faceRecipes.ts). */
  faces: Partial<Record<Face, number>>;
  /** Raw VRM expressions layered on top: blink and visemes. */
  extra: Record<string, number>;
  /** Manga symbols to draw around the head, with strength 0..1. */
  fx: Partial<Record<Manpu, number>>;
  /** Changes whenever a new face is shown, so one-shot symbols (like "!") can pop again. */
  faceId: number;
  rootY: number;
  look: LookMode;
  /** Horizontal glance direction for 'aside' (−1 left … 1 right). */
  glance: number;
}

interface Speech {
  text: string;
  beats: Beat[];
  cursor: number;
  pause: number;
  nextBeat: number;
  /** More text may still arrive (a streaming reply); she waits instead of finishing. */
  open: boolean;
  /** Skipped while streaming: everything that arrives is shown at once. */
  rushed: boolean;
  onProgress: (shown: number) => void;
  onDone: () => void;
}

const VISEMES = ['aa', 'ih', 'ou', 'ee', 'oh'];
/** Brain-triggered clips are cut (with a fade) after this long; long photo-booth clips would hijack a whole reply. */
const MAX_REACTION_SECONDS = 5;
const ARM_BONES = new Set<Bone>(['leftShoulder', 'rightShoulder', 'leftUpperArm', 'rightUpperArm', 'leftLowerArm', 'rightLowerArm', 'leftHand', 'rightHand']);
const AXIAL_BONES: Bone[] = ['spine', 'chest', 'neck', 'head'];
/** Emotion whose idle/talk animation is an acceptable stand-in when an emotion has none of its own. */
const LOOP_FALLBACK: Partial<Record<Emotion, Emotion>> = { excited: 'happy', relaxed: 'neutral', shy: 'happy' };
const approach = (from: number, to: number, rate: number, dt: number) => from + (to - from) * (1 - Math.exp(-rate * dt));
const pick = <T,>(items: T[]) => items[Math.floor(Math.random() * items.length)];

/**
 * The "spinal cord" between Maido's brain and body. The brain only says *what* she
 * feels and *which* gesture fits; the director decides *how* the body moves:
 * animation clips when available, procedural posture otherwise, plus faces, idle
 * life, gaze, and text-driven lip-sync.
 */
export class Director {
  /** When false, brain-sent emotions/gestures are ignored (mouth still moves). */
  autoEmotion = true;
  /** Small spontaneous idle actions (glances, head tilts) and idle-variant rotation. */
  idleLife = true;
  reducedMotion = false;
  /** Picks masculine or feminine-coded procedural body language (from the character's gender). */
  bodyStyle: BodyStyle = 'feminine';

  private weights = Object.fromEntries(EMOTIONS.map(e => [e, 0])) as Record<Emotion, number>;
  private target: { emotion: Emotion; intensity: number } = { emotion: 'neutral', intensity: 0 };
  private baseline: { emotion: Emotion; intensity: number; face: Face | null } = { emotion: 'neutral', intensity: 0, face: null };
  private faceWeights = Object.fromEntries(FACES.map(f => [f, 0])) as Record<Face, number>;
  /** Face asked for by the brain (or a preview), shown while its emotion is on; else the emotion's default. */
  private face: Face | null = null;
  private faceId = 0;
  private thinking = false;
  private lingerUntil = 0;
  private gesture: { name: keyof typeof GESTURE_LIBRARY; start: number } | null = null;
  private speech: Speech | null = null;
  private mouth = Object.fromEntries(VISEMES.map(v => [v, 0])) as Record<string, number>;
  private time = 0;
  private blinkAt = 2;
  private nextIdleAction = 12;
  private glanceUntil = 0;
  private glance = 0;

  private clips: ClipInfo[] = [];
  private loop: { group: string; name: string; until: number } | null = null;
  private shot: { name: string; id: number; start: number; until: number } | null = null;
  /** A clip requested while the current one was mid-turn; it starts at the next calm moment. */
  private queued: { name: string; maxSeconds: number } | null = null;
  private shotCount = 0;

  get speaking() { return this.speech !== null; }

  /** Animation clips available for the current avatar (empty → fully procedural). */
  setClips(clips: ClipInfo[]) {
    this.clips = clips; this.loop = null; this.shot = null; this.queued = null;
    // An intro.* clip (e.g. pop up and greet) plays once whenever a character appears.
    const intros = clips.filter(c => c.kind === 'intro');
    if (intros.length) this.playClip(pick(intros).name);
  }
  /** Gesture names the body can perform (built-in procedural + gesture clips). */
  gestures(): string[] {
    return [...new Set([...Object.keys(GESTURE_LIBRARY), ...this.clips.filter(c => c.kind === 'gesture').map(c => c.key)])];
  }

  /** Manual/default mood that Maido returns to after a reply's emotion fades. */
  setBaseline(emotion: Emotion, intensity = 0.6, face: Face | null = null) {
    this.baseline = { emotion, intensity: emotion === 'neutral' && !face ? 0 : intensity, face };
    if (!this.speech && this.time >= this.lingerUntil) this.restToBaseline();
  }
  private restToBaseline() {
    this.target = { emotion: this.baseline.emotion, intensity: this.baseline.intensity };
    this.face = this.baseline.face;
    this.faceId++;
  }
  /** Shows an emotion now; it lingers, then fades back to the baseline. */
  feel(emotion: Emotion, intensity = 0.7, linger = 6, face: Face | null = null) {
    if (emotion !== this.target.emotion || face !== this.face) this.faceId++;
    this.target = { emotion, intensity };
    this.face = face;
    this.lingerUntil = this.time + linger;
  }
  /** Previews a specific face (keeps the current emotion's body language). */
  showFace(face: Face, intensity = 0.9, linger = 5) {
    this.feel(this.target.intensity > 0 ? this.target.emotion : 'neutral', Math.max(intensity, this.target.intensity), linger, face);
  }
  /** Plays a gesture: a gesture.<name> clip if one exists, else the procedural version. */
  play(gesture: Gesture) {
    if (gesture === 'none' || this.reducedMotion) return;
    const clips = this.clips.filter(c => c.kind === 'gesture' && c.key === gesture);
    if (clips.length) this.playClip(pick(clips).name, MAX_REACTION_SECONDS);
    else if (gesture in GESTURE_LIBRARY) { this.gesture = { name: gesture as keyof typeof GESTURE_LIBRARY, start: this.time }; }
  }
  /** Plays any loaded clip once by file name, optionally cut short (previews play in full). */
  playClip(name: string, maxSeconds = Infinity) {
    const clip = this.clips.find(c => c.name === name);
    if (!clip || this.reducedMotion) return;
    this.gesture = null;
    const current = this.shot && this.clips.find(c => c.name === this.shot!.name);
    if (current && this.shot) {
      // Crossfading out of a half-turned body can flip; wait for the current clip's next calm moment.
      const elapsed = this.time - this.shot.start;
      const calm = current.calm.find(t => t >= elapsed - 0.05);
      if (calm !== undefined && calm - elapsed > 0.15) {
        this.shot.until = this.shot.start + calm;
        this.queued = { name, maxSeconds };
        return;
      }
    }
    this.queued = null;
    // Cut long clips only at a calm moment: blending out of a half-turned body can flip.
    const end = maxSeconds >= clip.duration ? clip.duration : clip.calm.find(t => t >= maxSeconds) ?? clip.duration;
    this.shot = { name, id: ++this.shotCount, start: this.time, until: this.time + end };
  }
  setThinking(value: boolean) { this.thinking = value; }

  /** Speaks a complete reply: subtitles reveal, beats fire at their positions, mouth follows the text. */
  speak(text: string, beats: Beat[], onProgress: (shown: number) => void, onDone: () => void) {
    this.beginSpeech(onProgress, onDone);
    this.appendSpeech(text, beats);
    this.closeSpeech();
  }
  /** Starts a streaming reply; feed it with appendSpeech() and end it with closeSpeech(). */
  beginSpeech(onProgress: (shown: number) => void, onDone: () => void) {
    this.finishSpeech(false);
    this.speech = { text: '', beats: [], cursor: 0, pause: 0, nextBeat: 0, open: true, rushed: false, onProgress, onDone };
  }
  appendSpeech(text: string, beats: Beat[] = []) {
    const speech = this.speech;
    if (!speech) return;
    speech.text += text;
    speech.beats.push(...beats);
    if (speech.rushed) { speech.cursor = speech.text.length; speech.onProgress(speech.text.length); }
    this.fireBeats(speech.rushed);
  }
  /** No more text is coming. `final` (the server's saved version) may tidy whitespace. */
  closeSpeech(final?: { text: string; beats: Beat[] }) {
    const speech = this.speech;
    if (!speech) return;
    if (final) {
      speech.text = final.text;
      // Keep beats already fired; take any the stream didn't carry (e.g. the default opening one).
      speech.beats = [...final.beats].sort((a, b) => a.at - b.at);
      speech.nextBeat = speech.beats.filter(beat => beat.at <= speech.cursor).length; // same rule fireBeats uses
      speech.cursor = Math.min(speech.cursor, speech.text.length);
    }
    speech.open = false;
    if (speech.rushed) this.skip();
  }
  /** Drops the current reply without finishing it (e.g. the user pressed Stop). */
  cancelSpeech() { this.speech = null; }
  /** Reveals the rest of the reply immediately (still applies the last beat's emotion). */
  skip() {
    const speech = this.speech;
    if (!speech) return;
    speech.cursor = speech.text.length;
    this.fireBeats(true);
    if (speech.open) { speech.rushed = true; speech.onProgress(speech.text.length); return; }
    this.finishSpeech(true);
  }

  private fireBeats(lastOnly = false) {
    const speech = this.speech!;
    let fired: Beat | null = null;
    while (speech.nextBeat < speech.beats.length && speech.beats[speech.nextBeat].at <= speech.cursor) {
      fired = speech.beats[speech.nextBeat++];
      if (!lastOnly && this.autoEmotion) this.applyBeat(fired, true);
    }
    if (lastOnly && fired && this.autoEmotion) this.applyBeat(fired, false);
  }
  private applyBeat(beat: Beat, withMotion: boolean) {
    const changed = beat.emotion !== this.target.emotion;
    this.feel(beat.emotion, beat.intensity, 8, beat.face ?? null);
    if (!withMotion) return;
    if (beat.gesture !== 'none') this.play(beat.gesture);
    else if (changed && beat.intensity >= 0.5) {
      // No gesture requested: a react.<emotion> clip (e.g. a surprised flinch) makes the switch visible.
      const reactions = this.clips.filter(c => c.kind === 'react' && c.key === beat.emotion);
      if (reactions.length) this.playClip(pick(reactions).name, MAX_REACTION_SECONDS);
    }
  }
  private finishSpeech(notify: boolean) {
    const speech = this.speech;
    this.speech = null;
    if (speech && notify) { speech.onProgress(speech.text.length); speech.onDone(); }
  }

  /** Picks the idle/talk clip for an emotion, rotating between variants every so often. */
  private chooseLoop(emotion: Emotion): string | null {
    const kinds = this.speech ? ['talk', 'idle'] : ['idle'];
    for (const kind of kinds) {
      for (const key of [emotion, LOOP_FALLBACK[emotion], 'neutral', 'any']) {
        if (!key) continue;
        const options = this.clips.filter(c => c.kind === kind && c.key === key);
        if (!options.length) continue;
        const group = `${kind}.${key}`;
        const rotate = this.idleLife && !this.speech && this.loop && this.time > this.loop.until && options.length > 1;
        if (this.loop?.group !== group || rotate) {
          const fresh = options.filter(c => c.name !== this.loop?.name);
          this.loop = { group, name: pick(fresh.length ? fresh : options).name, until: this.time + 18 + Math.random() * 20 };
        }
        return this.loop.name;
      }
    }
    this.loop = null;
    return null;
  }
  private hasOwnLoop(emotion: Emotion) {
    return this.clips.some(c => (c.kind === 'idle' || c.kind === 'talk') && c.key === emotion);
  }

  update(dt: number): Performance {
    this.time += dt;
    const t = this.time;
    const motion = this.reducedMotion ? 0 : 1;

    // 1. Speech timeline → beats, subtitles, mouth.
    let viseme: string | null = null;
    const speech = this.speech;
    if (speech) {
      const cps = Math.max(24, speech.text.length / 20);
      if (speech.pause > 0) speech.pause -= dt;
      else {
        const before = Math.floor(speech.cursor);
        speech.cursor = Math.min(speech.text.length, speech.cursor + cps * dt);
        const now = Math.floor(speech.cursor);
        if (now !== before) {
          const passed = speech.text.slice(before, now);
          if (/[.!?…]/.test(passed)) speech.pause = 0.32;
          else if (/[,;:]/.test(passed)) speech.pause = 0.16;
          speech.onProgress(now);
          this.fireBeats();
        }
        // Caught up with a reply that's still streaming: close the mouth and wait for more words.
        viseme = now < speech.text.length ? visemeFor(speech.text[now] ?? '') : null;
      }
      if (!speech.open && speech.cursor >= speech.text.length && speech.pause <= 0) this.finishSpeech(true);
    }
    for (const v of VISEMES) {
      const goal = viseme === v ? 0.75 : viseme === 'consonant' && v === 'aa' ? 0.2 : 0;
      this.mouth[v] = approach(this.mouth[v], goal, 22, dt);
    }

    // 2. Emotion weights glide toward the target (thinking overrides while waiting for the brain).
    if (!this.speech && t >= this.lingerUntil && !this.thinking && (this.target.emotion !== this.baseline.emotion || this.target.intensity !== this.baseline.intensity || this.face !== this.baseline.face)) {
      this.restToBaseline();
    }
    const goal = this.thinking ? { emotion: 'thinking' as Emotion, intensity: 0.8 } : this.target;
    // Feelings arrive quickly but fade slowly back to rest.
    for (const e of EMOTIONS) {
      const target = e === goal.emotion ? goal.intensity : 0;
      this.weights[e] = approach(this.weights[e], target, target > this.weights[e] ? 4 : 1.3, dt);
    }

    // 3. Clips: which loop/shot should play.
    if (this.shot && t >= this.shot.until) {
      this.shot = null;
      if (this.queued) { const next = this.queued; this.queued = null; this.playClip(next.name, next.maxSeconds); }
    }
    const loop = this.reducedMotion ? null : this.chooseLoop(goal.intensity > 0 ? goal.emotion : 'neutral');
    const clipMode = loop !== null;

    // 4. Procedural posture = REST + Σ weight × emotion delta, plus idle breathing/sway.
    const pose: Record<Bone, Euler3> = Object.fromEntries(BONES.map(b => [b, [...(REST[b] ?? [0, 0, 0])]])) as Record<Bone, Euler3>;
    const additive: Record<string, Euler3> = Object.fromEntries(AXIAL_BONES.map(b => [b, [0, 0, 0]]));
    const override: Partial<Record<Bone, number>> = {};
    let breath = 0, sway = 0, bounce = 0, total = 0;
    for (const e of EMOTIONS) {
      const w = this.weights[e];
      if (w < 0.001) continue;
      const ownLoop = this.hasOwnLoop(e);
      for (const [bone, delta] of Object.entries(postureFor(e, this.bodyStyle)) as [Bone, Euler3][]) {
        for (let i = 0; i < 3; i++) pose[bone][i] += delta[i] * w;
        if (!clipMode || ownLoop) continue;
        // The playing animation doesn't express this emotion: lean on the procedural posture.
        if (ARM_BONES.has(bone) && !this.shot) override[bone] = Math.max(override[bone] ?? 0, w);
        else if (additive[bone]) for (let i = 0; i < 3; i++) additive[bone][i] += delta[i] * w * 0.7;
      }
      breath += ENERGY[e].breath * w; sway += ENERGY[e].sway * w; bounce += ENERGY[e].bounce * w; total += w;
    }
    const rest = Math.max(0, 1 - total);
    breath += rest; sway += rest;
    const breathing = Math.sin(t * 1.6 * breath) * motion;
    const headSway = Math.sin(t * 0.6 + 1) * 0.025 * sway * motion;
    const talkBob = this.speech ? Math.sin(t * 5.3) * 0.02 * motion : 0;
    pose.chest[0] += breathing * 0.015;
    pose.leftShoulder[2] += breathing * 0.015; pose.rightShoulder[2] -= breathing * 0.015;
    pose.spine[2] += Math.sin(t * 0.55) * 0.02 * sway * motion;
    pose.head[2] += headSway;
    pose.head[0] += talkBob;
    pose.hips[1] += Math.sin(t * 0.4) * 0.03 * sway * motion;
    pose.leftUpperArm[2] -= breathing * 0.01; pose.rightUpperArm[2] += breathing * 0.01;
    additive.head[2] += headSway * 0.5; additive.head[0] += talkBob;
    let rootY = clipMode ? 0 : Math.abs(Math.sin(t * 4)) * bounce * motion;

    // 5. Procedural gesture layer (overrides arms, adds to head/spine).
    if (this.gesture) {
      const spec = GESTURE_LIBRARY[this.gesture.name];
      const p = (t - this.gesture.start) / spec.duration;
      if (p >= 1) this.gesture = null;
      else {
        const env = envelope(p, spec.duration);
        const frame = spec.frame(p, t);
        for (const [bone, delta] of Object.entries(frame.set ?? {}) as [Bone, Euler3][]) {
          const base = REST[bone] ?? [0, 0, 0];
          for (let i = 0; i < 3; i++) pose[bone][i] += (base[i] + delta[i] - pose[bone][i]) * env;
          override[bone] = Math.max(override[bone] ?? 0, env);
        }
        for (const [bone, delta] of Object.entries(frame.add ?? {}) as [Bone, Euler3][]) {
          for (let i = 0; i < 3; i++) pose[bone][i] += delta[i] * env;
          if (additive[bone]) for (let i = 0; i < 3; i++) additive[bone][i] += delta[i] * env;
          else override[bone] = Math.max(override[bone] ?? 0, env);
        }
        rootY += (frame.rootY ?? 0) * env;
      }
    }

    // 6. Spontaneous idle life: glances and small gestures when nothing is happening.
    if (!this.speech && !this.thinking && !this.gesture && !this.shot && this.idleLife && motion && t > this.nextIdleAction) {
      this.nextIdleAction = t + 10 + Math.random() * 14;
      if (Math.random() < 0.6) { this.glance = Math.random() < 0.5 ? -1 : 1; this.glanceUntil = t + 1.2 + Math.random() * 1.5; }
      else this.play(Math.random() < 0.7 ? 'tilt' : 'nod');
    }
    const look: LookMode = this.thinking ? 'up' : this.speech ? 'user' : t < this.glanceUntil ? 'aside' : 'pointer';

    // 7. Face: library faces glide like emotions; blink and lip-sync respect what the face already does.
    const faceGoal: Face = this.thinking ? 'thinking' : goal.intensity > 0 ? this.face ?? DEFAULT_FACE[goal.emotion] : 'neutral';
    const faces: Partial<Record<Face, number>> = {};
    const fx: Partial<Record<Manpu, number>> = {};
    let eyesClosed = 0, mouthBusy = 0;
    for (const f of FACES) {
      const faceTarget = f === faceGoal ? goal.intensity : 0;
      const w = this.faceWeights[f] = approach(this.faceWeights[f], faceTarget, faceTarget > this.faceWeights[f] ? 5 : 1.8, dt);
      if (w < 0.002) continue;
      faces[f] = w;
      const recipe = FACE_RECIPES[f];
      eyesClosed += (recipe.eyes ?? 0) * w; mouthBusy += (recipe.mouth ?? 0) * w;
      for (const m of recipe.fx ?? []) fx[m] = Math.max(fx[m] ?? 0, w);
    }
    if (t > this.blinkAt + 0.18) this.blinkAt = t + 2 + Math.random() * 3.5;
    const blink = t >= this.blinkAt ? Math.sin(Math.min((t - this.blinkAt) / 0.18, 1) * Math.PI) : 0;
    const extra: Record<string, number> = { blink: blink * (1 - Math.min(0.9, eyesClosed)) };
    const mouthScale = 1 - Math.min(0.6, mouthBusy * 0.6);
    for (const v of VISEMES) extra[v] = this.mouth[v] * mouthScale;

    return {
      pose, override, additive: clipMode ? additive : {}, loop,
      shot: this.shot ? { name: this.shot.name, id: this.shot.id } : null,
      faces, extra, fx, faceId: this.faceId, rootY, look, glance: this.glance,
    };
  }
}

// Live objects (director, mixer, spring state) outlive a hot update and would mix old and new
// code, e.g. stale clip weights leaving the body in its bind pose. Reload the page instead.
import.meta.hot?.accept(() => location.reload());
