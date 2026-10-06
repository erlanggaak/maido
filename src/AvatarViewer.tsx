import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { VRM, VRMLoaderPlugin, VRMUtils, VRMHumanBoneName } from '@pixiv/three-vrm';
import { ClipPlayer } from './avatar/clips';
import type { Director } from './avatar/director';
import { SpringTuner, type PhysicsPrefs } from './avatar/physics';
import { FaceRig } from './avatar/faces';
import { ManpuLayer } from './avatar/manpu';
import { ArmClearance } from './avatar/clearance';
import { createMascot, perform, type Stage } from './avatar/rig';
import { frameProfiler } from './avatar/profiler';
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

export default function AvatarViewer(props: Props) {
  const mount = useRef<HTMLDivElement>(null);
  const live = useRef(props);
  live.current = props;
  const stage = useRef<Stage | null>(null);
  const loadId = useRef(0);
  const [vrmVersion, setVrmVersion] = useState(0);

  useEffect(() => {
    const host = mount.current!;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      live.current.onError('WebGL is unavailable. Enable hardware acceleration to see Maido.');
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.setAttribute(
      'aria-label',
      'Maido, your 3D companion. Drag to rotate, right-drag or Shift-drag to pan, scroll to zoom.',
    );
    renderer.domElement.setAttribute('role', 'img');
    renderer.domElement.className = 'block h-full w-full outline-none';
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(28, 1, 0.01, 100);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    // Rotate: drag. Pan: right-drag, or Shift/⌘/Ctrl + drag, two fingers on touch, arrow keys on the canvas.
    // Zoom: scroll/pinch, toward the cursor so you can zoom straight into her face or hands.
    controls.enablePan = true;
    controls.screenSpacePanning = true;
    controls.zoomToCursor = true;
    controls.keyPanSpeed = 20;
    renderer.domElement.tabIndex = 0;
    controls.listenToKeyEvents(renderer.domElement);
    // Keep the pivot near the character so panning can't lose her off-screen.
    controls.addEventListener('change', () => {
      const h = state.height,
        t = controls.target;
      const x = THREE.MathUtils.clamp(t.x, -h * 0.5, h * 0.5),
        y = THREE.MathUtils.clamp(t.y, h * 0.05, h * 1.05),
        z = THREE.MathUtils.clamp(t.z, -h * 0.4, h * 0.4);
      if (x !== t.x || y !== t.y || z !== t.z) {
        camera.position.add(new THREE.Vector3(x - t.x, y - t.y, z - t.z));
        t.set(x, y, z);
      }
    });
    controls.minPolarAngle = Math.PI * 0.25;
    controls.maxPolarAngle = Math.PI * 0.55;
    const ambient = new THREE.HemisphereLight(0xffffff, 0xffffff, 0);
    scene.add(ambient);
    const key = new THREE.DirectionalLight(0xffffff, Math.PI);
    key.position.set(1.5, 4, 3);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.bias = -0.0005;
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xc9c2ff, 0);
    rim.position.set(-3, 2.5, -2.5);
    scene.add(rim);
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
      ambient.color.set(studio ? 0xfff8ef : 0xffffff);
      ambient.groundColor.set(studio ? 0x9b88b0 : 0xffffff);
      ambient.intensity = studio ? 2.6 : 0; // measured: any ambient lifts lit skin above the texture colour
      key.color.set(studio ? 0xfff0dc : 0xffffff);
      key.intensity = studio ? 3.2 : Math.PI;
      rim.intensity = studio ? 2.2 : 0;
    };
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(1.4, 64),
      new THREE.ShadowMaterial({ opacity: 0.16 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);
    const mascot = createMascot();
    mascot.group.scale.setScalar(0.9);
    scene.add(mascot.group);

    const state: Stage = {
      renderer,
      bones: new Map(),
      scene,
      vrm: null,
      player: null,
      tuner: null,
      faces: null,
      clearance: null,
      manpu: new ManpuLayer(scene),
      mascot,
      height: 1.75,
      resetCamera: () => {
        const h = state.height;
        // Frame the whole body, a little higher than centre so the composer can sit over the feet.
        const visible = h * 1.22;
        const fov = THREE.MathUtils.degToRad(camera.fov / 2);
        const distance = visible / (2 * Math.tan(fov)) / Math.min(1, camera.aspect / 0.62);
        controls.target.set(0, h * 0.47, 0);
        camera.position.set(0, h * 0.55, distance);
        controls.minDistance = h * 0.5;
        controls.maxDistance = distance * 2;
        // Flush any leftover damping momentum, then place the camera again so reset is exact.
        const target = controls.target.clone(),
          position = camera.position.clone();
        controls.enableDamping = false;
        controls.update();
        controls.target.copy(target);
        camera.position.copy(position);
        controls.update();
        controls.enableDamping = true;
      },
    };
    stage.current = state;
    frameProfiler.setScene(renderer, null, 0);

    const resize = new ResizeObserver(() => {
      const { width, height } = host.getBoundingClientRect();
      if (!width || !height) return;
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      state.resetCamera();
    });
    resize.observe(host);

    const pointer = new THREE.Vector3(0, 1.4, 2);
    const lookTarget = new THREE.Object3D();
    scene.add(lookTarget);
    const desired = new THREE.Vector3();
    const headPos = new THREE.Vector3();
    const move = (event: PointerEvent) => {
      const box = host.getBoundingClientRect();
      pointer.set(
        ((event.clientX - box.left) / box.width - 0.5) * 2.4,
        state.height * 0.85 + (0.5 - (event.clientY - box.top) / box.height) * 1.2,
        2.2,
      );
    };
    window.addEventListener('pointermove', move);
    const recenter = () => state.resetCamera();
    renderer.domElement.addEventListener('dblclick', recenter);
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

    let frame = 0,
      last = performance.now(),
      time = 0;
    const step = (delta: number) => {
      const profiling = frameProfiler.enabled;
      const started = profiling ? performance.now() : 0;
      time += delta;
      applyLighting(live.current.lighting);
      const director = live.current.director;
      director.reducedMotion = reducedMotion.matches;
      const performanceState = director.update(delta);
      const directed = profiling ? performance.now() : 0;
      const head = state.bones.get('head');
      if (head) head.getWorldPosition(headPos);
      else headPos.set(0, state.height * 0.9, 0);
      if (performanceState.look === 'user') desired.copy(camera.position);
      else if (performanceState.look === 'up')
        desired.set(headPos.x - 0.5, headPos.y + 0.6, headPos.z + 1.2);
      else if (performanceState.look === 'aside')
        desired.set(headPos.x + performanceState.glance * 1.4, headPos.y - 0.1, headPos.z + 1.4);
      else desired.copy(pointer);
      lookTarget.position.lerp(desired, 0.08);
      perform(state, performanceState, lookTarget, delta, time, live.current.physics);
      const posed = profiling ? performance.now() : 0;
      const headNode =
        state.bones.get('head') ?? (state.mascot.group.visible ? state.mascot.head : null);
      state.manpu.update(
        performanceState.fx,
        performanceState.faceId,
        headNode,
        camera,
        state.height / 1.6,
        time,
        delta,
        live.current.manpu,
      );
      const effected = profiling ? performance.now() : 0;
      controls.update();
      renderer.render(scene, camera);
      if (profiling) {
        const rendered = performance.now();
        frameProfiler.record({
          director: directed - started,
          body: posed - directed,
          effects: effected - posed,
          render: rendered - effected,
          total: rendered - started,
        });
      }
    };
    const render = (now: number) => {
      frame = requestAnimationFrame(render);
      if (document.hidden || now - last < 1000 / live.current.fps - 2) return;
      step(Math.min((now - last) / 1000, 0.06));
      last = now;
    };
    frame = requestAnimationFrame(render);
    // Dev only: advance time by hand (e.g. maidoTick(2)) to inspect motion while the tab is in the background.
    if (import.meta.env.DEV)
      Object.assign(window, {
        maidoStage: state,
        maidoCamera: { camera, controls },
        maidoTick: (seconds: number) => {
          for (let t = 0; t < seconds; t += 1 / 30) step(1 / 30);
        },
      });
    return () => {
      loadId.current++;
      cancelAnimationFrame(frame);
      resize.disconnect();
      controls.dispose();
      state.player?.dispose();
      state.manpu.dispose();
      window.removeEventListener('pointermove', move);
      renderer.domElement.removeEventListener('dblclick', recenter);
      frameProfiler.detach(renderer);
      VRMUtils.deepDispose(scene);
      renderer.dispose();
      renderer.domElement.remove();
      stage.current = null;
    };
  }, []);

  useEffect(() => {
    const state = stage.current;
    if (!state) return;
    const id = ++loadId.current;
    if (!props.asset) {
      if (state.vrm) {
        state.faces?.dispose();
        state.scene.remove(state.vrm.scene);
        VRMUtils.deepDispose(state.vrm.scene);
        state.vrm = null;
        state.bones.clear();
        state.tuner = null;
        state.faces = null;
        state.clearance = null;
      }
      state.mascot.group.visible = true;
      state.height = 1.75;
      state.resetCamera();
      setVrmVersion((version) => version + 1);
      frameProfiler.setScene(state.renderer, null, 0);
      live.current.onLoaded(null);
      return;
    }
    const asset = props.asset;
    const manager = new THREE.LoadingManager();
    // VRoid exports embed assets. Never fetch external textures/URLs from an imported file.
    manager.setURLModifier((url) => {
      if (url.startsWith('blob:') || url.startsWith('data:')) return url;
      throw new Error(
        'Only self-contained VRM files are supported. Export directly from VRoid Studio.',
      );
    });
    const loader = new GLTFLoader(manager);
    loader.register((parser) => new VRMLoaderPlugin(parser));
    void (async () => {
      let vrm: VRM | undefined;
      try {
        const response = await fetch(asset.url, { cache: 'no-store' });
        if (!response.ok) throw new Error('Model is no longer available. Refresh the model list.');
        const gltf = await loader.parseAsync(await response.arrayBuffer(), '');
        vrm = gltf.userData.vrm as VRM | undefined;
        if (!vrm) {
          VRMUtils.deepDispose(gltf.scene);
          throw new Error('This file has no VRM avatar. Export a .vrm file from VRoid Studio.');
        }
        if (id !== loadId.current) {
          VRMUtils.deepDispose(vrm.scene);
          return;
        }
        VRMUtils.rotateVRM0(vrm);
        vrm.scene.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(vrm.scene);
        const height = box.max.y - box.min.y;
        if (!Number.isFinite(height) || height < 0.05 || height > 20)
          throw new Error('This avatar has invalid dimensions. Re-export it from VRoid Studio.');
        vrm.scene.userData.baseY = -box.min.y;
        vrm.scene.position.y = -box.min.y;
        vrm.scene.traverse((object) => {
          object.frustumCulled = false;
          if (object instanceof THREE.Mesh) object.castShadow = true;
        });
        if (state.vrm) {
          state.scene.remove(state.vrm.scene);
          VRMUtils.deepDispose(state.vrm.scene);
        }
        state.player?.dispose();
        state.player = null;
        live.current.director.setClips([]);
        state.faces?.dispose();
        state.vrm = vrm;
        state.bones.clear();
        for (const bone of Object.keys(vrm.humanoid.humanBones)) {
          const node = vrm.humanoid.getNormalizedBoneNode(bone as VRMHumanBoneName);
          if (node) state.bones.set(bone, node);
        }
        state.tuner = new SpringTuner(vrm);
        state.faces = new FaceRig(vrm);
        // Measure the body in its bind pose, before anything moves it.
        state.clearance = new ArmClearance(vrm);
        state.height = height;
        state.mascot.group.visible = false;
        state.scene.add(vrm.scene);
        state.resetCamera();
        setVrmVersion((version) => version + 1);
        if (frameProfiler.enabled) {
          frameProfiler.setScene(state.renderer, asset.name, 0);
        }
        live.current.onLoaded(asset);
      } catch (error) {
        if (vrm && state.vrm !== vrm) VRMUtils.deepDispose(vrm.scene);
        if (id === loadId.current)
          live.current.onError(
            error instanceof Error ? error.message : 'Could not load this VRM file.',
          );
      }
    })();
    return () => {
      loadId.current++;
    };
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
    void ClipPlayer.create(vrm, props.clips, (message) => {
      if (!cancelled) live.current.onError(message);
    }).then(({ player, infos }) => {
      if (cancelled || state.vrm !== vrm) {
        player.dispose();
        return;
      }
      state.player = player;
      director.setClips(infos);
      if (frameProfiler.enabled) {
        frameProfiler.setScene(state.renderer, live.current.asset?.name ?? null, infos.length);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [vrmVersion, props.clips]);

  useEffect(() => {
    stage.current?.resetCamera();
  }, [props.reset]);
  return <div ref={mount} className="absolute inset-0 touch-none" />;
}
