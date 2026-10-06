import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { VRM } from '@pixiv/three-vrm';
import { VRMAnimationLoaderPlugin, createVRMAnimationClip, type VRMAnimation } from '@pixiv/three-vrm-animation';
import type { ClipAsset } from '../types';
import type { ClipInfo, Performance } from './director';

// Parsed .vrma files are avatar-independent, so switching characters only re-targets them.
const parsed = new Map<string, Promise<VRMAnimation>>();
function loadAnimation(asset: ClipAsset) {
  const cacheKey = `${asset.url}#${asset.size}`;
  let pending = parsed.get(cacheKey);
  if (!pending) {
    const loader = new GLTFLoader();
    loader.register(parser => new VRMAnimationLoaderPlugin(parser));
    pending = fetch(asset.url, { cache: 'no-store' })
      .then(response => { if (!response.ok) throw new Error(`${asset.name} is no longer available.`); return response.arrayBuffer(); })
      .then(data => loader.parseAsync(data, ''))
      .then(gltf => {
        const animation = (gltf.userData.vrmAnimations as VRMAnimation[] | undefined)?.[0];
        if (!animation) throw new Error(`${asset.name} has no VRM animation.`);
        return animation;
      });
    pending.catch(() => parsed.delete(cacheKey));
    parsed.set(cacheKey, pending);
  }
  return pending;
}

/**
 * Clips are authored with the character standing at different floor spots (ChatVRM's idle
 * sits 14 cm to the side), which makes the body slide sideways on every crossfade. Re-centre
 * hips translation on the floor plane: loops around their average, one-shots on their first frame.
 */
function centerHips(clip: THREE.AnimationClip, loop: boolean) {
  const track = clip.tracks.find(t => t.name.endsWith('.position'));
  if (!track) return;
  const v = track.values, n = v.length / 3;
  let x = v[0], z = v[2];
  if (loop) { x = 0; z = 0; for (let i = 0; i < n; i++) { x += v[i * 3]; z += v[i * 3 + 2]; } x /= n; z /= n; }
  for (let i = 0; i < n; i++) { v[i * 3] -= x; v[i * 3 + 2] -= z; }
}

/** Keyframe times (≈10 Hz) where the hips face within 20° of the clip's first frame. */
function calmTimes(clip: THREE.AnimationClip) {
  const track = clip.tracks.find(t => /hips/i.test(t.name) && t.name.endsWith('.quaternion'));
  if (!track) return [];
  const v = track.values, start = new THREE.Quaternion().fromArray(v, 0), q = new THREE.Quaternion();
  const limit = THREE.MathUtils.degToRad(20), times: number[] = [];
  let last = -1;
  track.times.forEach((time, i) => {
    if (time - last < 0.1) return;
    if (q.fromArray(v, i * 4).angleTo(start) < limit) { times.push(time); last = time; }
  });
  return times;
}

/** Timings (seconds) for every transition; eased so nothing pops at the start or end of a fade. */
// Settling back to idle is deliberately slower than starting a gesture: snapping back reads as robotic.
const FADE = { loop: 1.6, shotIn: 0.6, shotOut: 1.6, shotSwap: 0.8 };
const ease = (x: number) => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };

/** A weight that glides from one value to another over a fixed time with an ease-in-out curve. */
class Fade {
  private from = 0;
  private to = 0;
  private start = 0;
  private duration = 1;
  value = 0;
  get target() { return this.to; }
  set(to: number, duration: number, now: number) {
    if (to === this.to) return;
    this.from = this.value; this.to = to; this.start = now; this.duration = Math.max(0.01, duration);
  }
  tick(now: number) { this.value = this.from + (this.to - this.from) * ease((now - this.start) / this.duration); return this.value; }
}

interface Slot { action: THREE.AnimationAction; fade: Fade }

/**
 * Plays .vrma clips on one VRM in two layers:
 *  - base: looping idle/talk clips, crossfaded when the loop changes;
 *  - overlay: one-shot gesture/reaction clips, which fade over the base and crossfade
 *    into each other (the same clip twice uses an alternate slot, so it never snaps to frame 0).
 * Weights always sum to 1, so the body never passes through the bind pose mid-fade.
 */
export class ClipPlayer {
  readonly mixer: THREE.AnimationMixer;
  /**
   * The mixer animates this stand-in skeleton (nodes named like the VRM's normalized bones),
   * never the avatar itself. three.js skips writing values that haven't changed, so if both the
   * mixer and our procedural layer wrote to the real bones, stale values would flicker through.
   * The viewer composes the final pose from these proxies every frame instead.
   */
  readonly proxies = new Map<string, THREE.Object3D>();
  private readonly proxyRoot = new THREE.Object3D();
  private clips = new Map<string, THREE.AnimationClip>();
  /** Bones each clip actually animates (many idles skip fingers, eyes, or the head). */
  private animates = new Map<THREE.AnimationClip, Set<string>>();
  /**
   * Per bone, how much of it the playing clips own (0..1). Bones a clip doesn't animate stay
   * with the procedural pose instead of falling back to the stiff bind pose.
   */
  readonly coverage = new Map<string, number>();
  /** Coverage of the hips translation track. */
  hipsMove = 0;
  private loops = new Map<string, Slot>();
  private shots: (Slot & { name: string; id: number })[] = [];
  private overlay = new Fade();
  private now = 0;
  private shotId = -1;
  private currentLoop: string | null = null;
  /** 0..1 — how much one-shot clips own the body. */
  shotWeight = 0;
  /** 0..1 — how much looping clips own the body. */
  loopWeight = 0;

  private constructor(vrm: VRM) {
    for (const bone of Object.keys(vrm.humanoid.humanBones)) {
      const node = vrm.humanoid.getNormalizedBoneNode(bone as never);
      if (!node) continue;
      const proxy = new THREE.Object3D();
      proxy.name = node.name;
      proxy.position.copy(node.position);
      this.proxyRoot.add(proxy);
      this.proxies.set(bone, proxy);
    }
    this.mixer = new THREE.AnimationMixer(this.proxyRoot);
  }

  /** Loads and re-targets every clip; failures are reported but never block the rest. */
  static async create(vrm: VRM, assets: ClipAsset[], onError: (message: string) => void) {
    const player = new ClipPlayer(vrm);
    const infos: ClipInfo[] = [];
    await Promise.all(assets.map(async asset => {
      try {
        const clip = createVRMAnimationClip(await loadAnimation(asset), vrm);
        clip.name = asset.name;
        // Only expression/look-at-free bone tracks; faces and gaze belong to the director.
        clip.tracks = clip.tracks.filter(track => /\.(quaternion|position)$/.test(track.name));
        centerHips(clip, asset.kind === 'idle' || asset.kind === 'talk');
        player.clips.set(asset.name, clip);
        player.track(clip);
        infos.push({ name: asset.name, kind: asset.kind, key: asset.key, duration: clip.duration, calm: calmTimes(clip) });
      } catch (error) { onError(error instanceof Error ? error.message : `Could not load ${asset.name}.`); }
    }));
    return { player, infos };
  }

  private track(clip: THREE.AnimationClip) {
    const byName = new Map([...this.proxies].map(([bone, proxy]) => [proxy.name, bone]));
    const bones = new Set<string>();
    for (const track of clip.tracks) {
      const [node, property] = track.name.split('.');
      const bone = byName.get(node);
      if (bone) bones.add(property === 'position' ? 'hips.position' : bone);
    }
    this.animates.set(clip, bones);
  }

  private startShot(name: string, id: number) {
    const clip = this.clips.get(name);
    if (!clip) return;
    // Reuse a finished slot for this clip, otherwise make a fresh action from a clone so an
    // instance that is still fading out keeps playing smoothly underneath.
    let slot = this.shots.find(s => s.name === name && s.fade.target === 0 && s.fade.value < 0.001);
    if (!slot) {
      const busy = this.shots.filter(s => s.name === name).length;
      const source = busy ? clip.clone() : clip;
      if (source !== clip) this.animates.set(source, this.animates.get(clip)!);
      slot = { action: this.mixer.clipAction(source), fade: new Fade(), name, id };
      this.shots.push(slot);
    }
    slot.id = id;
    slot.action.reset().setLoop(THREE.LoopOnce, 1).play();
    slot.action.clampWhenFinished = true;
    const swapping = this.overlay.target === 1;
    for (const other of this.shots) if (other !== slot) other.fade.set(0, FADE.shotSwap, this.now);
    slot.fade.set(1, swapping ? FADE.shotSwap : 0.001, this.now);
    if (!swapping) slot.fade.tick(this.now);
    this.overlay.set(1, FADE.shotIn, this.now);
  }

  update(perf: Performance, dt: number) {
    this.now += dt;
    const now = this.now;
    if (perf.shot && perf.shot.id !== this.shotId) { this.shotId = perf.shot.id; this.startShot(perf.shot.name, perf.shot.id); }
    if (!perf.shot) this.overlay.set(0, FADE.shotOut, now);

    if (perf.loop !== this.currentLoop) {
      this.currentLoop = perf.loop;
      if (perf.loop && !this.loops.has(perf.loop)) {
        const clip = this.clips.get(perf.loop);
        if (clip) {
          const action = this.mixer.clipAction(clip);
          action.setLoop(THREE.LoopRepeat, Infinity).play();
          this.loops.set(perf.loop, { action, fade: new Fade() });
        }
      }
      for (const [name, slot] of this.loops) slot.fade.set(name === perf.loop ? 1 : 0, FADE.loop, now);
    }

    // Base layer: normalise loop weights so a crossfade never dips.
    // Only actions the mixer is really applying count. If one isn't (stopped, never started),
    // reporting its weight would leave the proxies at their bind pose: a T-pose.
    const live = (slot: Slot) => slot.action.enabled && slot.action.isScheduled();
    let loopTotal = 0;
    for (const slot of this.loops.values()) { slot.fade.tick(now); if (live(slot)) loopTotal += slot.fade.value; }
    // Overlay layer: shots crossfade among themselves, then the whole layer fades over the base.
    let shotTotal = 0;
    for (const slot of this.shots) { slot.fade.tick(now); if (live(slot)) shotTotal += slot.fade.value; }
    const overlay = this.overlay.tick(now) * (shotTotal > 0.001 ? 1 : 0);
    this.loopWeight = Math.min(1, loopTotal);
    this.shotWeight = overlay;

    for (const [name, slot] of this.loops) {
      // Mixer weights always total 1 (three.js fills any shortfall with the bind pose, which looks
      // like a dip); the viewer blends clip ↔ procedural itself using loopWeight/shotWeight.
      const weight = loopTotal > 0.001 && live(slot) ? (slot.fade.value / loopTotal) * (1 - overlay) : 0;
      slot.action.setEffectiveWeight(weight);
      if (slot.fade.target === 0 && slot.fade.value < 0.001) { slot.action.stop(); this.mixer.uncacheAction(slot.action.getClip()); this.loops.delete(name); }
    }
    const shotShare = loopTotal > 0.001 ? overlay : 1;
    for (const slot of this.shots) slot.action.setEffectiveWeight(shotTotal > 0.001 && live(slot) ? (slot.fade.value / shotTotal) * shotShare : 0);
    // Drop shot instances that have fully faded out.
    this.shots = this.shots.filter(slot => {
      const gone = slot.fade.target === 0 && slot.fade.value < 0.001 || overlay < 0.001 && this.overlay.target === 0;
      if (!gone) return true;
      slot.action.stop(); slot.fade.set(0, 0.001, now); slot.fade.tick(now);
      const original = slot.action.getClip() === this.clips.get(slot.name);
      if (!original) this.mixer.uncacheAction(slot.action.getClip());
      return original;
    });
    this.mixer.update(dt);

    this.coverage.clear();
    let hipsMove = 0;
    for (const slot of [...this.loops.values(), ...this.shots]) {
      const weight = slot.action.getEffectiveWeight();
      if (weight < 0.001) continue;
      for (const bone of this.animates.get(slot.action.getClip()) ?? []) {
        if (bone === 'hips.position') hipsMove += weight;
        else this.coverage.set(bone, Math.min(1, (this.coverage.get(bone) ?? 0) + weight));
      }
    }
    this.hipsMove = Math.min(1, hipsMove);
  }

  dispose() { this.mixer.stopAllAction(); this.mixer.uncacheRoot(this.mixer.getRoot()); }
}

// Live objects (director, mixer, spring state) outlive a hot update and would mix old and new
// code, e.g. stale clip weights leaving the body in its bind pose. Reload the page instead.
import.meta.hot?.accept(() => location.reload());
