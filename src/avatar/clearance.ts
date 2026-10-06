import * as THREE from 'three';
import { VRMHumanBoneName, type VRM } from '@pixiv/three-vrm';

/**
 * Keeps hanging arms from sinking into the body, skirt, or jacket, for any model.
 *
 * At load, the model's torso/legs/clothes are sampled into a side-profile table (how far the
 * body reaches sideways at each height and depth, in hips space), and the forearm thickness
 * (with sleeve) is measured. Every frame, whatever posed the arms (clip or procedural), the
 * elbow, forearm, wrist, and fingertips are checked against that profile, and each upper arm
 * swings outward just enough to clear it.
 */

const BIN = 0.02;
const NOT_BODY = /arm|hand|shoulder|thumb|index|middle|ring|little|hair|eye|head|neck|ear|face/i;
const MAX_ANGLE = 0.35;
/** Light contact (a hand resting on a skirt) is natural; only correct real sinking. */
const TOLERANCE = 0.012;

interface Side { sign: 1 | -1; upper: THREE.Object3D; lower: THREE.Object3D; hand: THREE.Object3D; angle: number }

export class ArmClearance {
  /** key "yBin,zBin" → furthest body extent on that side (hips space, metres). */
  private profile: [Map<string, number>, Map<string, number>] = [new Map(), new Map()];
  private radius = 0.04;
  private sides: Side[] = [];
  private hips: THREE.Object3D;
  private inverse = new THREE.Matrix4();
  private v = new THREE.Vector3();
  private shoulder = new THREE.Vector3();
  private points = Array.from({ length: 5 }, () => new THREE.Vector3());
  private rotated = new THREE.Vector3();
  /** Diagnostics: angles applied on the last frame (radians). */
  readonly last = { left: 0, right: 0 };

  constructor(private vrm: VRM) {
    const h = vrm.humanoid;
    this.hips = h.getNormalizedBoneNode(VRMHumanBoneName.Hips)!;
    for (const [sign, prefix] of [[1, 'left'], [-1, 'right']] as const) {
      const upper = h.getNormalizedBoneNode(`${prefix}UpperArm` as VRMHumanBoneName);
      const lower = h.getNormalizedBoneNode(`${prefix}LowerArm` as VRMHumanBoneName);
      const hand = h.getNormalizedBoneNode(`${prefix}Hand` as VRMHumanBoneName);
      if (upper && lower && hand) this.sides.push({ sign, upper, lower, hand, angle: 0 });
    }
    this.measure();
  }

  /** Samples body vertices (bind pose) into the profile and estimates forearm thickness. */
  private measure() {
    const vrm = this.vrm;
    vrm.scene.updateMatrixWorld(true);
    this.inverse.copy(this.hips.matrixWorld).invert();
    const leftLower = vrm.humanoid.getRawBoneNode(VRMHumanBoneName.LeftLowerArm);
    const leftHand = vrm.humanoid.getRawBoneNode(VRMHumanBoneName.LeftHand);
    const elbow = leftLower?.getWorldPosition(new THREE.Vector3());
    const wrist = leftHand?.getWorldPosition(new THREE.Vector3());
    const forearm = elbow && wrist ? new THREE.Line3(elbow, wrist) : null;
    const distances: number[] = [];
    const closest = new THREE.Vector3();
    vrm.scene.traverse(object => {
      const mesh = object as THREE.SkinnedMesh;
      if (!mesh.isSkinnedMesh) return;
      const position = mesh.geometry.getAttribute('position');
      const index = mesh.geometry.getAttribute('skinIndex');
      const weight = mesh.geometry.getAttribute('skinWeight');
      if (!position || !index || !weight) return;
      const bones = mesh.skeleton.bones;
      const step = position.count > 30000 ? 3 : 2;
      for (let i = 0; i < position.count; i += step) {
        // Classify a vertex by the bone that moves it most.
        let best = 0, bone = index.getX(i);
        for (let k = 0; k < 4; k++) { const w = weight.getComponent(i, k); if (w > best) { best = w; bone = index.getComponent(i, k); } }
        const name = bones[bone]?.name ?? '';
        mesh.getVertexPosition(i, this.v);
        mesh.localToWorld(this.v);
        if (/lowerarm/i.test(name) && /(^|_)l(_|$)|left/i.test(name) && forearm) {
          distances.push(forearm.closestPointToPoint(this.v, true, closest).distanceTo(this.v));
          continue;
        }
        if (NOT_BODY.test(name)) continue;
        this.v.applyMatrix4(this.inverse);
        const side = this.v.x >= 0 ? 0 : 1;
        const reach = Math.abs(this.v.x);
        for (let dz = -1; dz <= 1; dz++) {
          const key = `${Math.round(this.v.y / BIN)},${Math.round(this.v.z / BIN) + dz}`;
          const table = this.profile[side];
          if ((table.get(key) ?? 0) < reach) table.set(key, reach);
        }
      }
    });
    if (distances.length > 20) {
      distances.sort((a, b) => a - b);
      // The inner third of forearm vertices is the arm itself; wide sleeves are cloth and may overlap.
      this.radius = THREE.MathUtils.clamp(distances[Math.floor(distances.length * 0.33)], 0.018, 0.05);
    }
  }

  /** How far into the body a hips-space point on this side sinks (≤ 0 means clear). */
  private depth(p: THREE.Vector3, side: Side) {
    if (p.x * side.sign <= 0) return 0; // crossed the midline on purpose (e.g. clasped hands)
    const table = this.profile[side.sign === 1 ? 0 : 1];
    const y = Math.round(p.y / BIN), z = Math.round(p.z / BIN);
    let reach = 0;
    for (let dy = -1; dy <= 1; dy++) reach = Math.max(reach, table.get(`${y + dy},${z}`) ?? 0);
    return reach > 0 ? reach + this.radius - Math.abs(p.x) : 0;
  }

  /** Call after the pose is composed and before vrm.update(). */
  update(dt: number, enabled: boolean) {
    this.hips.updateWorldMatrix(true, false);
    this.inverse.copy(this.hips.matrixWorld).invert();
    for (const side of this.sides) {
      let needed = 0;
      if (enabled) {
        side.hand.updateWorldMatrix(true, false);
        this.shoulder.setFromMatrixPosition(side.upper.matrixWorld).applyMatrix4(this.inverse);
        const elbow = this.points[0].setFromMatrixPosition(side.lower.matrixWorld).applyMatrix4(this.inverse);
        const wrist = this.points[2].setFromMatrixPosition(side.hand.matrixWorld).applyMatrix4(this.inverse);
        this.points[1].lerpVectors(elbow, wrist, 0.5);
        this.points[3].lerpVectors(this.shoulder, elbow, 0.75);
        // Palm (not fingertips: those may rest on clothes): a quarter hand-length past the wrist.
        this.points[4].subVectors(wrist, elbow).multiplyScalar(0.25).add(wrist);
        // Smallest outward swing (about the body's forward axis, around the shoulder) that clears every point.
        for (let angle = 0; angle <= MAX_ANGLE; angle += 0.02) {
          const c = Math.cos(angle * side.sign), s = Math.sin(angle * side.sign);
          const clear = this.points.every(p => {
            const x = p.x - this.shoulder.x, y = p.y - this.shoulder.y;
            this.rotated.set(this.shoulder.x + x * c - y * s, this.shoulder.y + x * s + y * c, p.z);
            return this.depth(this.rotated, side) <= TOLERANCE;
          });
          if (clear) { needed = angle; break; }
          needed = angle;
        }
      }
      // Glide, so a gesture passing near the hips doesn't make the arm twitch.
      side.angle += (needed - side.angle) * (1 - Math.exp(-(needed > side.angle ? 14 : 4) * dt));
      if (side.angle > 0.001) side.upper.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(AXIS, side.angle * side.sign));
      this.last[side.sign === 1 ? 'left' : 'right'] = side.angle;
    }
  }
}

const AXIS = new THREE.Vector3(0, 0, 1);

import.meta.hot?.accept(() => location.reload());
