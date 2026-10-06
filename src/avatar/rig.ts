import * as THREE from 'three';
import type { VRM } from '@pixiv/three-vrm';
import type { ClipPlayer } from './clips';
import type { Performance } from './director';
import type { SpringTuner, PhysicsPrefs } from './physics';
import type { FaceRig } from './faces';
import type { ManpuLayer } from './manpu';
import type { ArmClearance } from './clearance';
import type { Bone } from './poses';

export interface Stage {
  renderer: THREE.WebGLRenderer;
  bones: Map<string, THREE.Object3D>;
  scene: THREE.Scene;
  vrm: VRM | null;
  player: ClipPlayer | null;
  tuner: SpringTuner | null;
  faces: FaceRig | null;
  clearance: ArmClearance | null;
  manpu: ManpuLayer;
  mascot: ReturnType<typeof createMascot>;
  height: number;
  resetCamera: () => void;
}

export function createMascot() {
  const group = new THREE.Group();
  const cream = new THREE.MeshStandardMaterial({ color: '#fff5e8', roughness: 0.65 });
  const purple = new THREE.MeshStandardMaterial({ color: '#9382b5', roughness: 0.55 });
  const dark = new THREE.MeshStandardMaterial({ color: '#493d62', roughness: 0.4 });
  const pink = new THREE.MeshStandardMaterial({ color: '#efb1b9', roughness: 0.8 });
  const mint = new THREE.MeshStandardMaterial({ color: '#afd5c3', roughness: 0.45 });
  function sphere(
    parent: THREE.Object3D,
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
    mat: THREE.Material,
  ) {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 32), mat);
    mesh.position.set(x, y, z);
    mesh.scale.set(sx, sy, sz);
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  }
  sphere(group, 0, 0.66, 0, 0.32, 0.38, 0.25, purple);
  sphere(group, 0, 0.71, 0.22, 0.21, 0.22, 0.06, cream);
  sphere(group, -0.18, 0.3, 0.04, 0.16, 0.1, 0.19, purple);
  sphere(group, 0.18, 0.3, 0.04, 0.16, 0.1, 0.19, purple);
  const head = new THREE.Group();
  head.position.y = 1.0;
  group.add(head);
  sphere(head, 0, 0.19, 0, 0.44, 0.38, 0.32, cream);
  for (const sign of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.32, 3), cream);
    ear.position.set(sign * 0.29, 0.53, -0.03);
    ear.rotation.z = sign * -0.22;
    ear.rotation.y = Math.PI;
    ear.castShadow = true;
    head.add(ear);
    sphere(head, sign * 0.32, 0.51, 0.045, 0.065, 0.1, 0.03, pink);
    sphere(head, sign * 0.28, 0.08, 0.256, 0.078, 0.033, 0.018, pink);
  }
  const leftEye = sphere(head, -0.14, 0.21, 0.3, 0.035, 0.058, 0.024, dark);
  const rightEye = sphere(head, 0.14, 0.21, 0.3, 0.035, 0.058, 0.024, dark);
  const mouth = sphere(head, 0, 0.12, 0.31, 0.05, 0.012, 0.02, dark);
  const leftArm = new THREE.Group();
  leftArm.position.set(0.3, 0.92, 0);
  group.add(leftArm);
  const rightArm = new THREE.Group();
  rightArm.position.set(-0.3, 0.92, 0);
  group.add(rightArm);
  sphere(leftArm, 0.2, 0, 0, 0.24, 0.1, 0.1, purple);
  sphere(rightArm, -0.2, 0, 0, 0.24, 0.1, 0.1, purple);
  const aerial = new THREE.Mesh(new THREE.OctahedronGeometry(0.1), mint);
  aerial.position.set(0, 0.84, 0);
  head.add(aerial);
  return { group, head, leftEye, rightEye, mouth, leftArm, rightArm, aerial };
}

const scratch = new THREE.Quaternion();
const clipPose = new THREE.Quaternion();
const identity = new THREE.Quaternion();
const euler = new THREE.Euler();

/** Applies one frame of the director's performance to a VRM or the fallback mascot. */
export function perform(
  state: Stage,
  performanceState: Performance,
  lookTarget: THREE.Object3D,
  delta: number,
  time: number,
  physics: PhysicsPrefs,
) {
  if (state.vrm) {
    const vrm = state.vrm;
    const player = state.player;
    player?.update(performanceState, delta);
    const shot = player?.shotWeight ?? 0;
    const loop = player?.loopWeight ?? 0;
    // Compose every bone from scratch each frame: clip pose (from the player's proxy skeleton)
    // blended with the procedural pose. Procedural wins fully without clips; with clips it
    // only overrides where the director asks (e.g. an emotion the idle clip can't express).
    for (const [bone, node] of state.bones) {
      const euler3 = performanceState.pose[bone as Bone];
      if (euler3) scratch.setFromEuler(euler.set(euler3[0], euler3[1], euler3[2]));
      else scratch.identity();
      const proxy = player?.proxies.get(bone);
      if (!proxy) {
        node.quaternion.copy(scratch);
        continue;
      }
      // How much playing clips own this bone; the procedural pose fills the rest, and can
      // override the idle where the director asks (not during a one-shot gesture clip).
      const covered = player!.coverage.get(bone) ?? 0;
      const clipShareOfBone =
        covered * (1 - (performanceState.override[bone as Bone] ?? 0) * (1 - shot));
      if (clipShareOfBone < 0.001) {
        node.quaternion.copy(scratch);
        continue;
      }
      // three.js fills a partly-covered bone with its bind pose; undo that so the blend runs
      // procedural ↔ clip (not via stiff bind-pose fingers) while a clip fades in or out.
      clipPose.copy(proxy.quaternion);
      if (covered < 0.999) clipPose.copy(identity.identity()).slerp(proxy.quaternion, 1 / covered);
      node.quaternion.copy(scratch).slerp(clipPose, clipShareOfBone);
    }
    const hips = state.bones.get('hips');
    if (hips) {
      const rest = (hips.userData.restPosition ??= hips.position.clone());
      const proxy = player?.proxies.get('hips');
      if (proxy) hips.position.copy(proxy.position).lerp(rest, 1 - player!.hipsMove);
      else hips.position.copy(rest);
    }
    const clipShare = 1 - (1 - shot) * (1 - loop);
    if (clipShare > 0.001)
      for (const [bone, [x, y, z]] of Object.entries(performanceState.additive) as [
        Bone,
        [number, number, number],
      ][]) {
        const node = state.bones.get(bone);
        if (node) {
          node.rotation.x += x * clipShare;
          node.rotation.y += y * clipShare;
          node.rotation.z += z * clipShare;
        }
      }
    state.clearance?.update(delta, true);
    state.faces?.apply(performanceState.faces, performanceState.extra);
    vrm.scene.position.y = vrm.scene.userData.baseY + performanceState.rootY;
    if (vrm.lookAt) vrm.lookAt.target = lookTarget;
    state.tuner?.update(physics, time);
    vrm.update(delta);
    return;
  }
  const m = state.mascot;
  m.group.position.y = performanceState.rootY + Math.sin(time * 1.8) * 0.015;
  const head = performanceState.pose.head!;
  m.head.rotation.set(head[0], head[1], head[2]);
  // Mascot arms are simple stubs: map VRM upper-arm angles onto them.
  const l = performanceState.pose.leftUpperArm!,
    r = performanceState.pose.rightUpperArm!;
  m.leftArm.rotation.set(l[0], l[1], l[2] + 0.6);
  m.rightArm.rotation.set(r[0], r[1], r[2] - 0.6);
  const smiling =
    (performanceState.faces.smile ?? 0) +
    (performanceState.faces.joy ?? 0) +
    (performanceState.faces.content ?? 0);
  const eye = 0.058 * (1 - performanceState.extra.blink * 0.94) * (1 - Math.min(1, smiling) * 0.4);
  m.leftEye.scale.y = m.rightEye.scale.y = eye;
  m.mouth.scale.y =
    0.012 +
    (performanceState.extra.aa + performanceState.extra.oh + performanceState.extra.ou) * 0.05;
  m.aerial.rotation.y = time;
}
