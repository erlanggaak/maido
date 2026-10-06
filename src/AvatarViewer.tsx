import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { VRM, VRMLoaderPlugin, VRMUtils, VRMHumanBoneName } from '@pixiv/three-vrm';
import { ClipPlayer } from './avatar/clips';
import type { Director, Performance } from './avatar/director';
import { SpringTuner, type PhysicsPrefs } from './avatar/physics';
import { FaceRig } from './avatar/faces';
import { ManpuLayer } from './avatar/manpu';
import { ArmClearance } from './avatar/clearance';
import type { Bone } from './avatar/poses';
import type { AvatarAsset, ClipAsset } from './types';

interface Props {
  asset: AvatarAsset | null;
  director: Director;
  clips: ClipAsset[];
  physics: PhysicsPrefs;
  /** 'faithful' matches VRoid/MToon colours; 'studio' is brighter and warmer. */
  lighting: Lighting;
  /** Draw manga symbols (blush, sweat, "!") around the head. */
  manpu: boolean;
  /** Render/physics frame cap. */
  fps: 30 | 60;
  reset: number;
  onLoaded: (asset: AvatarAsset | null) => void;
  onError: (error: string) => void;
}
export type Lighting = 'faithful' | 'studio';

interface Stage {
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

function createMascot() {
  const group = new THREE.Group();
  const cream = new THREE.MeshStandardMaterial({ color: '#fff5e8', roughness: 0.65 });
  const purple = new THREE.MeshStandardMaterial({ color: '#9382b5', roughness: 0.55 });
  const dark = new THREE.MeshStandardMaterial({ color: '#493d62', roughness: 0.4 });
  const pink = new THREE.MeshStandardMaterial({ color: '#efb1b9', roughness: 0.8 });
  const mint = new THREE.MeshStandardMaterial({ color: '#afd5c3', roughness: 0.45 });
  function sphere(parent: THREE.Object3D, x: number, y: number, z: number, sx: number, sy: number, sz: number, mat: THREE.Material) {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 32), mat);
    mesh.position.set(x, y, z); mesh.scale.set(sx, sy, sz); mesh.castShadow = true; parent.add(mesh); return mesh;
  }
  sphere(group, 0, .66, 0, .32, .38, .25, purple);
  sphere(group, 0, .71, .22, .21, .22, .06, cream);
  sphere(group, -.18, .3, .04, .16, .10, .19, purple);
  sphere(group, .18, .3, .04, .16, .10, .19, purple);
  const head = new THREE.Group(); head.position.y = 1.0; group.add(head);
  sphere(head, 0, .19, 0, .44, .38, .32, cream);
  for (const sign of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(.15, .32, 3), cream);
    ear.position.set(sign * .29, .53, -.03); ear.rotation.z = sign * -.22; ear.rotation.y = Math.PI; ear.castShadow = true; head.add(ear);
    sphere(head, sign * .32, .51, .045, .065, .10, .03, pink);
    sphere(head, sign * .28, .08, .256, .078, .033, .018, pink);
  }
  const leftEye = sphere(head, -.14, .21, .3, .035, .058, .024, dark);
  const rightEye = sphere(head, .14, .21, .3, .035, .058, .024, dark);
  const mouth = sphere(head, 0, .12, .31, .05, .012, .02, dark);
  const leftArm = new THREE.Group(); leftArm.position.set(.3, .92, 0); group.add(leftArm);
  const rightArm = new THREE.Group(); rightArm.position.set(-.3, .92, 0); group.add(rightArm);
  sphere(leftArm, .2, 0, 0, .24, .1, .1, purple);
  sphere(rightArm, -.2, 0, 0, .24, .1, .1, purple);
  const aerial = new THREE.Mesh(new THREE.OctahedronGeometry(.10), mint);
  aerial.position.set(0, .84, 0); head.add(aerial);
  return { group, head, leftEye, rightEye, mouth, leftArm, rightArm, aerial };
}

const scratch = new THREE.Quaternion();
const clipPose = new THREE.Quaternion();
const identity = new THREE.Quaternion();
const euler = new THREE.Euler();

/** Applies one frame of the director's performance to a VRM or the fallback mascot. */
function perform(state: Stage, perf: Performance, lookTarget: THREE.Object3D, delta: number, time: number, physics: PhysicsPrefs) {
  if (state.vrm) {
    const vrm = state.vrm;
    const player = state.player;
    player?.update(perf, delta);
    const shot = player?.shotWeight ?? 0;
    const loop = player?.loopWeight ?? 0;
    // Compose every bone from scratch each frame: clip pose (from the player's proxy skeleton)
    // blended with the procedural pose. Procedural wins fully without clips; with clips it
    // only overrides where the director asks (e.g. an emotion the idle clip can't express).
    for (const bone of Object.keys(vrm.humanoid.humanBones)) {
      const node = vrm.humanoid.getNormalizedBoneNode(bone as VRMHumanBoneName);
      if (!node) continue;
      const euler3 = perf.pose[bone as Bone];
      if (euler3) scratch.setFromEuler(euler.set(euler3[0], euler3[1], euler3[2])); else scratch.identity();
      const proxy = player?.proxies.get(bone);
      if (!proxy) { node.quaternion.copy(scratch); continue; }
      // How much playing clips own this bone; the procedural pose fills the rest, and can
      // override the idle where the director asks (not during a one-shot gesture clip).
      const covered = player!.coverage.get(bone) ?? 0;
      const clipShareOfBone = covered * (1 - (perf.override[bone as Bone] ?? 0) * (1 - shot));
      if (clipShareOfBone < .001) { node.quaternion.copy(scratch); continue; }
      // three.js fills a partly-covered bone with its bind pose; undo that so the blend runs
      // procedural ↔ clip (not via stiff bind-pose fingers) while a clip fades in or out.
      clipPose.copy(proxy.quaternion);
      if (covered < .999) clipPose.copy(identity.identity()).slerp(proxy.quaternion, 1 / covered);
      node.quaternion.copy(scratch).slerp(clipPose, clipShareOfBone);
    }
    const hips = vrm.humanoid.getNormalizedBoneNode(VRMHumanBoneName.Hips);
    if (hips) {
      const rest = hips.userData.restPosition ??= hips.position.clone();
      const proxy = player?.proxies.get('hips');
      if (proxy) hips.position.copy(proxy.position).lerp(rest, 1 - player!.hipsMove); else hips.position.copy(rest);
    }
    const clipShare = 1 - (1 - shot) * (1 - loop);
    if (clipShare > .001) for (const [bone, [x, y, z]] of Object.entries(perf.additive) as [Bone, [number, number, number]][]) {
      const node = vrm.humanoid.getNormalizedBoneNode(bone as VRMHumanBoneName);
      if (node) { node.rotation.x += x * clipShare; node.rotation.y += y * clipShare; node.rotation.z += z * clipShare; }
    }
    state.clearance?.update(delta, true);
    state.faces?.apply(perf.faces, perf.extra);
    vrm.scene.position.y = vrm.scene.userData.baseY + perf.rootY;
    if (vrm.lookAt) vrm.lookAt.target = lookTarget;
    state.tuner?.update(physics, time);
    vrm.update(delta);
    return;
  }
  const m = state.mascot;
  m.group.position.y = perf.rootY + Math.sin(time * 1.8) * .015;
  const head = perf.pose.head!;
  m.head.rotation.set(head[0], head[1], head[2]);
  // Mascot arms are simple stubs: map VRM upper-arm angles onto them.
  const l = perf.pose.leftUpperArm!, r = perf.pose.rightUpperArm!;
  m.leftArm.rotation.set(l[0], l[1], l[2] + .6); m.rightArm.rotation.set(r[0], r[1], r[2] - .6);
  const smiling = (perf.faces.smile ?? 0) + (perf.faces.joy ?? 0) + (perf.faces.content ?? 0);
  const eye = .058 * (1 - perf.extra.blink * .94) * (1 - Math.min(1, smiling) * .4);
  m.leftEye.scale.y = m.rightEye.scale.y = eye;
  m.mouth.scale.y = .012 + (perf.extra.aa + perf.extra.oh + perf.extra.ou) * .05;
  m.aerial.rotation.y = time;
}

export default function AvatarViewer(props: Props) {
  const mount = useRef<HTMLDivElement>(null);
  const live = useRef(props); live.current = props;
  const stage = useRef<Stage | null>(null);
  const loadId = useRef(0);
  const [vrmVersion, setVrmVersion] = useState(0);

  useEffect(() => {
    const host = mount.current!;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); }
    catch { live.current.onError('WebGL is unavailable. Enable hardware acceleration to see Maido.'); return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.setAttribute('aria-label', 'Maido, your 3D companion. Drag to rotate, right-drag or Shift-drag to pan, scroll to zoom.');
    renderer.domElement.setAttribute('role', 'img');
    renderer.domElement.className = 'block h-full w-full outline-none';
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(28, 1, .01, 100);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    // Rotate: drag. Pan: right-drag, or Shift/⌘/Ctrl + drag, two fingers on touch, arrow keys on the canvas.
    // Zoom: scroll/pinch, toward the cursor so you can zoom straight into her face or hands.
    controls.enablePan = true; controls.screenSpacePanning = true; controls.zoomToCursor = true;
    controls.keyPanSpeed = 20;
    renderer.domElement.tabIndex = 0;
    controls.listenToKeyEvents(renderer.domElement);
    // Keep the pivot near the character so panning can't lose her off-screen.
    controls.addEventListener('change', () => {
      const h = state.height, t = controls.target;
      const x = THREE.MathUtils.clamp(t.x, -h * 0.5, h * 0.5), y = THREE.MathUtils.clamp(t.y, h * 0.05, h * 1.05), z = THREE.MathUtils.clamp(t.z, -h * 0.4, h * 0.4);
      if (x !== t.x || y !== t.y || z !== t.z) { camera.position.add(new THREE.Vector3(x - t.x, y - t.y, z - t.z)); t.set(x, y, z); }
    });
    controls.minPolarAngle = Math.PI * .25; controls.maxPolarAngle = Math.PI * .55;
    const ambient = new THREE.HemisphereLight(0xffffff, 0xffffff, 0); scene.add(ambient);
    const key = new THREE.DirectionalLight(0xffffff, Math.PI);
    key.position.set(1.5, 4, 3); key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024); key.shadow.bias = -.0005; scene.add(key);
    const rim = new THREE.DirectionalLight(0xc9c2ff, 0); rim.position.set(-3, 2.5, -2.5); scene.add(rim);
    let lightingApplied: Lighting | null = null;
    /**
     * VRoid's MToon shader shows the texture's own colours under one white light of intensity π
     * with no tone mapping ("faithful"). Extra lights and filmic tone mapping wash skin toward
     * white, so the warm studio look is opt-in.
     */
    const applyLighting = (lighting: Lighting) => {
      if (lighting === lightingApplied) return;
      lightingApplied = lighting;
      const studio = lighting === 'studio';
      renderer.toneMapping = studio ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping;
      renderer.toneMappingExposure = studio ? 1.05 : 1;
      ambient.color.set(studio ? 0xfff8ef : 0xffffff); ambient.groundColor.set(studio ? 0x9b88b0 : 0xffffff);
      ambient.intensity = studio ? 2.6 : 0; // measured: any ambient lifts lit skin above the texture colour
      key.color.set(studio ? 0xfff0dc : 0xffffff); key.intensity = studio ? 3.2 : Math.PI;
      rim.intensity = studio ? 2.2 : 0;
    };
    const floor = new THREE.Mesh(new THREE.CircleGeometry(1.4, 64), new THREE.ShadowMaterial({ opacity: .16 }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
    const mascot = createMascot(); mascot.group.scale.setScalar(.9); scene.add(mascot.group);

    const state: Stage = { scene, vrm: null, player: null, tuner: null, faces: null, clearance: null, manpu: new ManpuLayer(scene), mascot, height: 1.75, resetCamera: () => {
      const h = state.height;
      // Frame the whole body, a little higher than centre so the composer can sit over the feet.
      const visible = h * 1.22;
      const fov = THREE.MathUtils.degToRad(camera.fov / 2);
      const distance = visible / (2 * Math.tan(fov)) / Math.min(1, camera.aspect / .62);
      controls.target.set(0, h * .47, 0);
      camera.position.set(0, h * .55, distance);
      controls.minDistance = h * .5; controls.maxDistance = distance * 2;
      // Flush any leftover damping momentum, then place the camera again so reset is exact.
      const target = controls.target.clone(), position = camera.position.clone();
      controls.enableDamping = false; controls.update();
      controls.target.copy(target); camera.position.copy(position); controls.update();
      controls.enableDamping = true;
    } };
    stage.current = state;

    const resize = new ResizeObserver(() => {
      const { width, height } = host.getBoundingClientRect();
      if (!width || !height) return;
      renderer.setSize(width, height); camera.aspect = width / height; camera.updateProjectionMatrix();
      state.resetCamera();
    });
    resize.observe(host);

    const pointer = new THREE.Vector3(0, 1.4, 2);
    const lookTarget = new THREE.Object3D(); scene.add(lookTarget);
    const desired = new THREE.Vector3();
    const headPos = new THREE.Vector3();
    const move = (event: PointerEvent) => {
      const box = host.getBoundingClientRect();
      pointer.set(((event.clientX - box.left) / box.width - .5) * 2.4, state.height * .85 + (.5 - (event.clientY - box.top) / box.height) * 1.2, 2.2);
    };
    window.addEventListener('pointermove', move);
    const recenter = () => state.resetCamera();
    renderer.domElement.addEventListener('dblclick', recenter);
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

    let frame = 0, last = performance.now(), time = 0;
    const step = (delta: number) => {
      time += delta;
      applyLighting(live.current.lighting);
      const director = live.current.director;
      director.reducedMotion = reducedMotion.matches;
      const perf = director.update(delta);
      const head = state.vrm?.humanoid.getNormalizedBoneNode(VRMHumanBoneName.Head);
      if (head) head.getWorldPosition(headPos); else headPos.set(0, state.height * .9, 0);
      if (perf.look === 'user') desired.copy(camera.position);
      else if (perf.look === 'up') desired.set(headPos.x - .5, headPos.y + .6, headPos.z + 1.2);
      else if (perf.look === 'aside') desired.set(headPos.x + perf.glance * 1.4, headPos.y - .1, headPos.z + 1.4);
      else desired.copy(pointer);
      lookTarget.position.lerp(desired, .08);
      perform(state, perf, lookTarget, delta, time, live.current.physics);
      const headNode = state.vrm?.humanoid.getNormalizedBoneNode(VRMHumanBoneName.Head) ?? (state.mascot.group.visible ? state.mascot.head : null);
      state.manpu.update(perf.fx, perf.faceId, headNode, camera, state.height / 1.6, time, delta, live.current.manpu);
      controls.update(); renderer.render(scene, camera);
    };
    const render = (now: number) => {
      frame = requestAnimationFrame(render);
      if (document.hidden || now - last < 1000 / live.current.fps - 2) return;
      step(Math.min((now - last) / 1000, .06)); last = now;
    };
    frame = requestAnimationFrame(render);
    // Dev only: advance time by hand (e.g. maidoTick(2)) to inspect motion while the tab is in the background.
    if (import.meta.env.DEV) Object.assign(window, { maidoStage: state, maidoCamera: { camera, controls }, maidoTick: (seconds: number) => { for (let t = 0; t < seconds; t += 1 / 30) step(1 / 30); } });
    return () => {
      loadId.current++; cancelAnimationFrame(frame); resize.disconnect(); controls.dispose(); state.player?.dispose(); state.manpu.dispose();
      window.removeEventListener('pointermove', move);
      renderer.domElement.removeEventListener('dblclick', recenter);
      VRMUtils.deepDispose(scene); renderer.dispose(); renderer.domElement.remove(); stage.current = null;
    };
  }, []);

  useEffect(() => {
    const state = stage.current;
    if (!state) return;
    const id = ++loadId.current;
    if (!props.asset) {
      if (state.vrm) { state.faces?.dispose(); state.scene.remove(state.vrm.scene); VRMUtils.deepDispose(state.vrm.scene); state.vrm = null; state.tuner = null; state.faces = null; state.clearance = null; }
      state.mascot.group.visible = true; state.height = 1.75; state.resetCamera();
      setVrmVersion(version => version + 1);
      live.current.onLoaded(null); return;
    }
    const asset = props.asset;
    const manager = new THREE.LoadingManager();
    // VRoid exports embed assets. Never fetch external textures/URLs from an imported file.
    manager.setURLModifier(url => {
      if (url.startsWith('blob:') || url.startsWith('data:')) return url;
      throw new Error('Only self-contained VRM files are supported. Export directly from VRoid Studio.');
    });
    const loader = new GLTFLoader(manager);
    loader.register(parser => new VRMLoaderPlugin(parser));
    void (async () => {
      let vrm: VRM | undefined;
      try {
        const response = await fetch(asset.url, { cache: 'no-store' });
        if (!response.ok) throw new Error('Model is no longer available. Refresh the model list.');
        const gltf = await loader.parseAsync(await response.arrayBuffer(), '');
        vrm = gltf.userData.vrm as VRM | undefined;
        if (!vrm) { VRMUtils.deepDispose(gltf.scene); throw new Error('This file has no VRM avatar. Export a .vrm file from VRoid Studio.'); }
        if (id !== loadId.current) { VRMUtils.deepDispose(vrm.scene); return; }
        VRMUtils.rotateVRM0(vrm);
        vrm.scene.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(vrm.scene);
        const height = box.max.y - box.min.y;
        if (!Number.isFinite(height) || height < .05 || height > 20) throw new Error('This avatar has invalid dimensions. Re-export it from VRoid Studio.');
        vrm.scene.userData.baseY = -box.min.y;
        vrm.scene.position.y = -box.min.y;
        vrm.scene.traverse(object => { object.frustumCulled = false; if (object instanceof THREE.Mesh) object.castShadow = true; });
        if (state.vrm) { state.scene.remove(state.vrm.scene); VRMUtils.deepDispose(state.vrm.scene); }
        state.player?.dispose(); state.player = null; live.current.director.setClips([]);
        state.faces?.dispose();
        state.vrm = vrm; state.tuner = new SpringTuner(vrm); state.faces = new FaceRig(vrm);
        // Measure the body in its bind pose, before anything moves it.
        state.clearance = new ArmClearance(vrm); state.height = height; state.mascot.group.visible = false;
        state.scene.add(vrm.scene); state.resetCamera();
        setVrmVersion(version => version + 1);
        live.current.onLoaded(asset);
      } catch (error) {
        if (vrm && state.vrm !== vrm) VRMUtils.deepDispose(vrm.scene);
        if (id === loadId.current) live.current.onError(error instanceof Error ? error.message : 'Could not load this VRM file.');
      }
    })();
    return () => { loadId.current++; };
  }, [props.asset]);

  // (Re)build the animation layer whenever the avatar or the animations folder changes.
  useEffect(() => {
    const state = stage.current;
    const director = live.current.director;
    state?.player?.dispose();
    if (state) state.player = null;
    director.setClips([]);
    const vrm = state?.vrm;
    if (!state || !vrm || !props.clips.length) return;
    let cancelled = false;
    void ClipPlayer.create(vrm, props.clips, message => { if (!cancelled) live.current.onError(message); }).then(({ player, infos }) => {
      if (cancelled || state.vrm !== vrm) { player.dispose(); return; }
      state.player = player;
      director.setClips(infos);
    });
    return () => { cancelled = true; };
  }, [vrmVersion, props.clips]);

  useEffect(() => { stage.current?.resetCamera(); }, [props.reset]);
  return <div ref={mount} className="absolute inset-0 touch-none" />;
}
