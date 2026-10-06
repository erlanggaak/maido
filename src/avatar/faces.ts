import * as THREE from 'three';
import { VRMExpression, VRMExpressionMorphTargetBind, type VRM } from '@pixiv/three-vrm';
import type { Face } from '../types';
import { FACES, type FaceRecipe } from './faceRecipes';

/** Custom expression names are namespaced so they never collide with a model's own. */
const PREFIX = 'maido.';

/**
 * Registers every face as a custom VRM expression built from the model's own morphs, so the
 * expression manager blends them like any other expression. Reports which faces are native.
 */
export class FaceRig {
  readonly native = new Set<Face>();

  constructor(private vrm: VRM) {
    const manager = vrm.expressionManager;
    if (!manager) return;
    const meshes: THREE.Mesh[] = [];
    vrm.scene.traverse((object) => {
      if ((object as THREE.Mesh).morphTargetDictionary) meshes.push(object as THREE.Mesh);
    });
    for (const [face, recipe] of Object.entries(FACES) as [Face, FaceRecipe][]) {
      const morphs = Object.entries(recipe.morphs);
      if (!morphs.length) continue;
      const expression = new VRMExpression(PREFIX + face);
      let bound = 0;
      for (const [morph, weight] of morphs) {
        // VRoid splits the face into several primitives; bind the morph on every one that has it.
        const byIndex = new Map<number, THREE.Mesh[]>();
        for (const mesh of meshes) {
          const index = mesh.morphTargetDictionary?.[morph];
          if (index !== undefined) byIndex.set(index, [...(byIndex.get(index) ?? []), mesh]);
        }
        for (const [index, primitives] of byIndex) {
          expression.addBind(new VRMExpressionMorphTargetBind({ primitives, index, weight }));
          bound++;
        }
      }
      // Only use the native face if most of its recipe exists on this model.
      if (bound >= Math.ceil(morphs.length * 0.6)) {
        vrm.scene.add(expression);
        manager.registerExpression(expression);
        this.native.add(face);
      }
    }
  }

  /** Writes face weights (plus blink and visemes) to the expression manager. */
  apply(faces: Partial<Record<Face, number>>, extra: Record<string, number>) {
    const manager = this.vrm.expressionManager;
    if (!manager) return;
    const presets: Record<string, number> = {
      happy: 0,
      angry: 0,
      sad: 0,
      relaxed: 0,
      surprised: 0,
      blinkLeft: 0,
      blinkRight: 0,
    };
    for (const face of Object.keys(FACES) as Face[]) {
      const weight = faces[face] ?? 0;
      if (this.native.has(face)) manager.setValue(PREFIX + face, weight);
      else
        for (const [name, value] of Object.entries(FACES[face].fallback))
          presets[name] = (presets[name] ?? 0) + value * weight;
    }
    for (const [name, value] of Object.entries({ ...presets, ...extra })) {
      if (manager.getExpression(name)) manager.setValue(name, Math.min(1, value));
    }
  }

  dispose() {
    const manager = this.vrm.expressionManager;
    for (const face of this.native) {
      const expression = manager?.getExpression(PREFIX + face);
      if (expression) {
        manager!.unregisterExpression(expression);
        expression.removeFromParent();
      }
    }
  }
}

import.meta.hot?.accept(() => location.reload());
