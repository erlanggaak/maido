import * as THREE from 'three';
import type { VRM } from '@pixiv/three-vrm';

export type PhysicsStyle = 'model' | 'soft' | 'bouncy';
export interface PhysicsPrefs {
  style: PhysicsStyle;
  wind: boolean;
}

/** Secondary parts that should flow: hair, skirt, tails, ribbons… (not bust or sleeve stiffeners). */
const FLOWING = /hair|skirt|tail|ribbon|coat|cloth|cape|ear|hood|tie|scarf|frill/i;
/** Multipliers over the model's own spring settings, plus extra gravity so hair/cloth hangs instead of floating. */
const STYLES: Record<PhysicsStyle, { stiffness: number; drag: number; gravity: number }> = {
  model: { stiffness: 1, drag: 1, gravity: 0 },
  soft: { stiffness: 0.55, drag: 0.7, gravity: 0.08 },
  bouncy: { stiffness: 0.35, drag: 0.45, gravity: 0.12 },
};

interface JointState {
  settings: {
    stiffness: number;
    dragForce: number;
    gravityPower: number;
    gravityDir: THREE.Vector3;
  };
  original: {
    stiffness: number;
    dragForce: number;
    gravityPower: number;
    gravityDir: THREE.Vector3;
  };
  flowing: boolean;
  phase: number;
}

/**
 * Tunes a VRM's spring bones at runtime. VRoid exports often ship with zero gravity and
 * high stiffness, so hair and skirts only move on big motions and look stiff during calm
 * idles. This keeps the model's own values as the baseline and layers softness, gravity,
 * and a gentle gusting breeze on top.
 */
export class SpringTuner {
  private joints: JointState[] = [];
  private dir = new THREE.Vector3();

  constructor(vrm: VRM) {
    for (const joint of vrm.springBoneManager?.joints ?? []) {
      const s = joint.settings;
      this.joints.push({
        settings: s,
        original: {
          stiffness: s.stiffness,
          dragForce: s.dragForce,
          gravityPower: s.gravityPower,
          gravityDir: s.gravityDir.clone(),
        },
        flowing: FLOWING.test(joint.bone.name),
        phase: joint.bone.position.x * 7 + joint.bone.position.y * 3,
      });
    }
  }

  get count() {
    return this.joints.length;
  }

  update(prefs: PhysicsPrefs, time: number) {
    const style = STYLES[prefs.style];
    // A slow-turning breeze from the front with soft gusts; never fully still, never a storm.
    const gust = prefs.wind
      ? 0.03 + 0.05 * Math.max(0, Math.sin(time * 0.5) * Math.sin(time * 1.3 + 1))
      : 0;
    const angle = Math.sin(time * 0.13) * 0.6;
    for (const joint of this.joints) {
      const { original: o, settings: s } = joint;
      if (!joint.flowing) {
        s.stiffness = o.stiffness;
        s.dragForce = o.dragForce;
        s.gravityPower = o.gravityPower;
        s.gravityDir.copy(o.gravityDir);
        continue;
      }
      s.stiffness = o.stiffness * style.stiffness;
      s.dragForce = o.dragForce * style.drag;
      const flutter = gust * (0.8 + 0.4 * Math.sin(time * 3.1 + joint.phase));
      // Blend "down" with the wind direction (blowing toward the avatar's back, −Z).
      this.dir.copy(o.gravityDir).multiplyScalar(o.gravityPower + style.gravity);
      this.dir.x += Math.sin(angle) * flutter;
      this.dir.z += -Math.cos(angle) * flutter;
      const power = this.dir.length();
      s.gravityPower = power;
      if (power > 1e-5) s.gravityDir.copy(this.dir).divideScalar(power);
    }
  }

  /** Puts every joint back to the model's own values. */
  restore() {
    for (const { original: o, settings: s } of this.joints) {
      s.stiffness = o.stiffness;
      s.dragForce = o.dragForce;
      s.gravityPower = o.gravityPower;
      s.gravityDir.copy(o.gravityDir);
    }
  }
}

// Live objects (director, mixer, spring state) outlive a hot update and would mix old and new
// code, e.g. stale clip weights leaving the body in its bind pose. Reload the page instead.
import.meta.hot?.accept(() => location.reload());
