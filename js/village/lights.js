import * as THREE from 'three';

// A pool of point lights that are re-assigned to whichever emitters are
// closest to the camera. Keeps the shader cheap no matter how many lamps,
// windows or fireflies the village contains.
export class LightPool {
  constructor(scene, size = 10) {
    this.size = size;
    this.lights = [];
    for (let i = 0; i < size; i++) {
      const l = new THREE.PointLight(0xffb060, 0, 12, 2);
      l.visible = false;
      scene.add(l);
      this.lights.push(l);
    }
    this.emitters = [];
  }

  // emitter: { position: Vector3, color: number, intensity: number, distance: number }
  add(emitter) {
    this.emitters.push(emitter);
  }

  update(cameraPos) {
    const sorted = this.emitters
      .map((e) => ({ e, d: e.position.distanceToSquared(cameraPos) }))
      .sort((a, b) => a.d - b.d);
    for (let i = 0; i < this.size; i++) {
      const l = this.lights[i];
      const entry = sorted[i];
      if (!entry || entry.e.intensity <= 0.01) {
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
