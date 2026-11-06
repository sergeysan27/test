import * as THREE from 'three';

// A pool of point lights that are re-assigned to whichever emitters are
// closest to the camera.
//
// Every additional point light costs a branch in the fragment shader of
// every lit material, for every pixel. Six is a good balance for a village
// this size: the lamps nearest the player still read as warm pools of
// light, and the frame rate stays comfortable on modest hardware.
export class LightPool {
  constructor(scene, size = 6) {
    this.size = size;
    this.lights = [];
    for (let i = 0; i < size; i++) {
      const l = new THREE.PointLight(0xffb060, 0, 12, 2);
      l.visible = false;
      scene.add(l);
      this.lights.push(l);
    }
    this.emitters = [];
    // scratch buffers, reused every frame so the update allocates nothing
    this._scratch = [];
    this._scratchIndex = 0;
  }

  // emitter: { position: Vector3, color: number, intensity: number, distance: number }
  add(emitter) {
    this.emitters.push(emitter);
  }

  update(cameraPos) {
    const emitters = this.emitters;
    // Keep only the closest few emitters. Sorting the whole list every frame
    // is wasteful: instead we do a single pass that keeps the best N.
    const n = this.size;
    const best = this._best ?? (this._best = []);
    best.length = 0;

    for (let i = 0; i < emitters.length; i++) {
      const e = emitters[i];
      if (e.intensity <= 0.01) continue;
      const d = e.position.distanceToSquared(cameraPos);
      // a lamp far away cannot contribute much, so drop it early
      if (d > 60 * 60) continue;
      if (best.length < n) {
        best.push({ e, d });
        if (best.length === n) best.sort((a, b) => a.d - b.d);
      } else if (d < best[n - 1].d) {
        best[n - 1] = { e, d };
        // bubble it into place
        for (let k = n - 1; k > 0 && best[k].d < best[k - 1].d; k--) {
          const t = best[k]; best[k] = best[k - 1]; best[k - 1] = t;
        }
      }
    }
    if (best.length < n) best.sort((a, b) => a.d - b.d);

    for (let i = 0; i < this.size; i++) {
      const l = this.lights[i];
      const entry = best[i];
      if (!entry) {
        l.visible = false;
        l.intensity = 0;
        continue;
      }
      const e = entry.e;
      l.visible = true;
      l.position.copy(e.position);
      l.color.setHex(e.color);
      l.intensity = e.intensity;
      l.distance = e.distance;
    }
  }
}
