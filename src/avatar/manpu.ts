import * as THREE from 'three';
import type { Manpu } from '../types';

/**
 * Manpu: the manga symbols that float around an anime character's head (blush, sweat drop,
 * anger vein, "!", "?", zzz…). Each is a camera-facing sprite drawn on a canvas at startup,
 * positioned in head space every frame, and faded in/out with the face that implies it.
 */

type Draw = (g: CanvasRenderingContext2D, s: number) => void;
const INK = '#4b3a5c';

function texture(draw: Draw) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const g = canvas.getContext('2d')!;
  g.lineCap = 'round'; g.lineJoin = 'round';
  draw(g, 128);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  return map;
}
function glyph(text: string, color: string, size = 92, stroke = '#ffffff'): Draw {
  return (g, s) => {
    g.font = `900 ${size}px "Arial Rounded MT Bold", "Helvetica Neue", Arial, sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 12; g.strokeStyle = stroke; g.strokeText(text, s / 2, s / 2 + 4);
    g.fillStyle = color; g.fillText(text, s / 2, s / 2 + 4);
  };
}
const DRAW: Record<string, Draw> = {
  blush: (g, s) => {
    const gradient = g.createRadialGradient(s / 2, s / 2, 4, s / 2, s / 2, s / 2);
    gradient.addColorStop(0, 'rgba(255,120,150,0.75)'); gradient.addColorStop(1, 'rgba(255,120,150,0)');
    g.fillStyle = gradient; g.beginPath(); g.ellipse(s / 2, s / 2, s / 2, s / 3, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(225,70,105,0.85)'; g.lineWidth = 5;
    for (const x of [-22, 0, 22]) { g.beginPath(); g.moveTo(s / 2 + x + 8, s / 2 - 14); g.lineTo(s / 2 + x - 8, s / 2 + 14); g.stroke(); }
  },
  sweat: (g, s) => {
    g.beginPath(); g.moveTo(s / 2, 10);
    g.bezierCurveTo(s / 2 + 44, s / 2 + 10, s / 2 + 40, s - 12, s / 2, s - 12);
    g.bezierCurveTo(s / 2 - 40, s - 12, s / 2 - 44, s / 2 + 10, s / 2, 10);
    g.fillStyle = '#9fd3ff'; g.fill(); g.lineWidth = 6; g.strokeStyle = '#4c8fd6'; g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.9)'; g.beginPath(); g.ellipse(s / 2 - 12, s / 2 + 24, 7, 13, -0.4, 0, Math.PI * 2); g.fill();
  },
  vein: (g, s) => {
    g.strokeStyle = '#e2384f'; g.lineWidth = 13;
    for (let i = 0; i < 4; i++) {
      g.save(); g.translate(s / 2, s / 2); g.rotate(i * Math.PI / 2);
      g.beginPath(); g.moveTo(10, -34); g.quadraticCurveTo(14, -12, 34, -10); g.stroke(); g.restore();
    }
  },
  sparkle: (g, s) => {
    g.fillStyle = '#ffe27a'; g.strokeStyle = '#ffffff'; g.lineWidth = 6;
    g.beginPath();
    for (let i = 0; i < 8; i++) {
      const r = i % 2 ? 12 : s / 2 - 6, a = i * Math.PI / 4 - Math.PI / 2;
      g.lineTo(s / 2 + Math.cos(a) * r, s / 2 + Math.sin(a) * r);
    }
    g.closePath(); g.stroke(); g.fill();
  },
  exclaim: glyph('!', '#ff5a6e', 104),
  question: glyph('?', '#7c6bd6', 98),
  zzz: glyph('z', '#7c8fd6', 84),
  heart: (g, s) => {
    g.beginPath(); g.moveTo(s / 2, s - 18);
    g.bezierCurveTo(8, s / 2 + 4, 14, 14, s / 2, 34);
    g.bezierCurveTo(s - 14, 14, s - 8, s / 2 + 4, s / 2, s - 18);
    g.fillStyle = '#ff6f91'; g.fill(); g.lineWidth = 7; g.strokeStyle = '#ffffff'; g.stroke();
  },
  tear: (g, s) => {
    g.fillStyle = 'rgba(150,210,255,0.95)';
    g.beginPath(); g.moveTo(s / 2, 4); g.bezierCurveTo(s / 2 + 26, s / 2, s / 2 + 22, s - 8, s / 2, s - 8);
    g.bezierCurveTo(s / 2 - 22, s - 8, s / 2 - 26, s / 2, s / 2, 4); g.fill();
  },
  gloom: g => {
    g.strokeStyle = 'rgba(95,70,140,0.6)'; g.lineWidth = 4;
    for (let i = 0; i < 7; i++) { const x = 14 + i * 17; g.beginPath(); g.moveTo(x, 6); g.lineTo(x, 50 + (i % 3) * 22); g.stroke(); }
  },
  dots: glyph('…', INK, 96),
  note: glyph('♪', '#6bb59a', 96),
};

interface Piece { sprite: THREE.Sprite; seed: number }
interface Effect {
  pieces: Piece[];
  alpha: number;
  /** Shown only briefly when a face appears (e.g. "!"). */
  oneShot?: boolean;
  shownFor?: number;
  lastFace?: number;
  /** On the face itself: hide when the head turns away from the camera. */
  facial?: boolean;
  /** Head-space placement for piece i at time t (metres for a 1.6 m tall avatar). */
  place: (i: number, t: number, seed: number) => { x: number; y: number; z: number; size: number; fade?: number };
}

const rise = (t: number, seed: number, period: number) => ((t + seed * period) % period) / period;

export class ManpuLayer {
  private group = new THREE.Group();
  private effects = new Map<Manpu, Effect>();
  private head = new THREE.Vector3();
  private forward = new THREE.Vector3();
  private toCamera = new THREE.Vector3();
  private local = new THREE.Vector3();
  private textures: THREE.Texture[] = [];

  constructor(scene: THREE.Scene) {
    scene.add(this.group);
    const make = (name: string, count: number) => Array.from({ length: count }, (_, i) => {
      const map = texture(DRAW[name]);
      this.textures.push(map);
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false, depthTest: false, opacity: 0 }));
      sprite.renderOrder = 10;
      sprite.visible = false;
      this.group.add(sprite);
      return { sprite, seed: i / count };
    });
    const add = (m: Manpu, name: string, count: number, effect: Omit<Effect, 'pieces' | 'alpha'>) => this.effects.set(m, { ...effect, pieces: make(name, count), alpha: 0 });

    add('blush', 'blush', 2, { facial: true, place: i => ({ x: i ? -0.048 : 0.048, y: 0.035, z: 0.085, size: 0.055 }) });
    add('sweat', 'sweat', 1, { place: (_i, t) => { const p = rise(t, 0, 2.4); return { x: 0.1, y: 0.13 - p * 0.05, z: 0.05, size: 0.045, fade: Math.min(1, (1 - p) * 4) }; } });
    add('vein', 'vein', 1, { place: (_i, t) => ({ x: 0.09, y: 0.15, z: 0.06, size: 0.045 * (1 + Math.max(0, Math.sin(t * 7)) * 0.25) }) });
    // Sparkles drift on both sides of the head, never across the face.
    add('sparkle', 'sparkle', 3, { place: (i, t, seed) => ({
      x: (i % 2 ? -1 : 1) * (0.14 + 0.03 * Math.sin(t * 0.7 + seed * 6)), y: 0.06 + seed * 0.12 + Math.sin(t * 0.9 + i) * 0.015, z: 0.02,
      size: 0.032 * (0.6 + 0.4 * Math.abs(Math.sin(t * 3 + i * 2))),
    }) });
    add('exclaim', 'exclaim', 1, { oneShot: true, place: (_i, t) => ({ x: 0.12, y: 0.19 + Math.abs(Math.sin(t * 6)) * 0.01, z: 0.02, size: 0.07 }) });
    add('question', 'question', 1, { place: (_i, t) => ({ x: 0.12, y: 0.19 + Math.sin(t * 2) * 0.012, z: 0.02, size: 0.06 }) });
    add('zzz', 'zzz', 3, { place: (_i, t, seed) => { const p = rise(t, seed, 3); return { x: 0.1 + p * 0.06, y: 0.12 + p * 0.09, z: 0.02, size: 0.025 + p * 0.025, fade: Math.sin(p * Math.PI) }; } });
    add('hearts', 'heart', 3, { place: (_i, t, seed) => { const p = rise(t, seed, 2.6); return { x: (seed < 0.5 ? -1 : 1) * (0.12 + seed * 0.05) + Math.sin(t * 2 + seed * 9) * 0.015, y: 0.06 + p * 0.15, z: 0.03, size: 0.03, fade: Math.sin(p * Math.PI) }; } });
    add('tears', 'tear', 4, { facial: true, place: (i, t, seed) => { const p = rise(t, seed * 2, 1.1); return { x: i % 2 ? -0.036 : 0.036, y: 0.05 - p * 0.07, z: 0.085, size: 0.022, fade: Math.sin(p * Math.PI) }; } });
    add('gloom', 'gloom', 1, { facial: true, place: () => ({ x: 0, y: 0.105, z: 0.095, size: 0.065, fade: 0.7 }) });
    add('dots', 'dots', 1, { place: (_i, t) => ({ x: 0.1, y: 0.18, z: 0.02, size: 0.08, fade: 0.6 + 0.4 * Math.sin(t * 2) }) });
    add('notes', 'note', 2, { place: (_i, t, seed) => { const p = rise(t, seed, 2.8); return { x: 0.11 + Math.sin(t * 2.5 + seed * 5) * 0.02, y: 0.12 + p * 0.14, z: 0.03, size: 0.04, fade: Math.sin(p * Math.PI) }; } });
  }

  /**
   * @param head  the head bone (its local axes match the body: +Z forward, +Y up)
   * @param scale avatar height / 1.6 m, so placement fits any model size
   */
  update(fx: Partial<Record<Manpu, number>>, faceId: number, head: THREE.Object3D | null, camera: THREE.Camera, scale: number, t: number, dt: number, enabled: boolean) {
    this.group.visible = enabled && !!head;
    if (!head || !enabled) return;
    head.getWorldPosition(this.head);
    this.forward.set(0, 0, 1).applyQuaternion(head.getWorldQuaternion(new THREE.Quaternion()));
    const facing = this.forward.dot(this.toCamera.copy(camera.position).sub(this.head).normalize());
    for (const [name, effect] of this.effects) {
      let target = fx[name] ?? 0;
      if (effect.oneShot) {
        if (target > 0.3 && effect.lastFace !== faceId) { effect.lastFace = faceId; effect.shownFor = 0; }
        effect.shownFor = (effect.shownFor ?? Infinity) + dt;
        if (effect.shownFor > 1.6) target = 0;
      }
      effect.alpha += (Math.min(1, target * 1.4) - effect.alpha) * (1 - Math.exp(-(target > effect.alpha ? 10 : 4) * dt));
      const facial = effect.facial ? THREE.MathUtils.smoothstep(facing, 0.15, 0.5) : 1;
      // Pop in with a little overshoot, like a manga panel.
      const pop = effect.alpha < 0.999 ? 1 + Math.sin(Math.min(1, effect.alpha) * Math.PI) * 0.25 : 1;
      effect.pieces.forEach((piece, i) => {
        const opacity = effect.alpha * facial;
        piece.sprite.visible = opacity > 0.01;
        if (!piece.sprite.visible) return;
        const at = effect.place(i, t, piece.seed);
        head.localToWorld(this.local.set(at.x * scale, at.y * scale, at.z * scale));
        piece.sprite.position.copy(this.local);
        piece.sprite.scale.setScalar(at.size * scale * pop * effect.alpha ** 0.3);
        (piece.sprite.material as THREE.SpriteMaterial).opacity = opacity * (at.fade ?? 1);
      });
    }
  }

  dispose() {
    this.group.removeFromParent();
    this.group.traverse(object => { if (object instanceof THREE.Sprite) object.material.dispose(); });
    for (const map of this.textures) map.dispose();
  }
}

import.meta.hot?.accept(() => location.reload());
