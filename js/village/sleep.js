import * as THREE from 'three';
import { clamp, damp } from './util.js';

// ---------------------------------------------------------------------------
// Going to bed.
//
// Sleeping is not a teleport: the character walks to the door, opens it,
// steps inside, the door swings shut and the screen fades to black. Only
// then does the new day begin.
//
// The sequence is driven by a small state machine with named phases, so it
// can be interrupted safely (by walking away, say) at any point.
// ---------------------------------------------------------------------------

export const SLEEP_PHASES = [
  'idle',      // nothing is happening
  'approach',  // walking to the door
  'reach',     // standing in front of the door, hand on the handle
  'open',      // the door swings open
  'enter',     // stepping over the threshold
  'close',     // the door swings shut
  'fade',      // the screen fades out
  'wake',      // the screen fades back in on a new morning
];

const WALK_SPEED = 1.9;

export class SleepSequence {
  constructor(village) {
    this.village = village;
    this.phase = 'idle';
    this.t = 0;
    this.house = null;
    this.door = null;
    this.doorAngle = 0;
    this.fade = 0;
    this.onFinished = null;
    this.onToast = null;
    this._savedPos = new THREE.Vector3();
    this._savedYaw = 0;
    this._target = new THREE.Vector3();
    this._doorCenter = new THREE.Vector3();
  }

  get active() {
    return this.phase !== 'idle';
  }

  // Finds the door leaf of the house so it can be opened.
  findDoor(house) {
    // the house group holds a mesh named by the builder; look for the one
    // that sits in the doorway
    let best = null;
    let bestD = Infinity;
    house.traverse((o) => {
      if (!o.isMesh) return;
      if (o.userData.door) {
        best = o;
        return;
      }
    });
    return best;
  }

  // Begins the sequence. Returns false if the conditions are not met.
  start(place, doorMesh) {
    if (this.active) return false;
    const house = place.house;
    if (!house) return false;
    this.house = house;
    this.door = doorMesh || null;
    this.phase = 'approach';
    this.t = 0;

    // where the character has to stand to be in the doorway
    const dx = Math.sin(house.rot);
    const dz = Math.cos(house.rot);
    const doorDist = house.d / 2;
    this._doorCenter.set(house.x + dx * doorDist, 0, house.z + dz * doorDist);
    // a step back from the door, where the character waits
    this._target.set(
      house.x + dx * (doorDist + 1.5),
      0,
      house.z + dz * (doorDist + 1.5)
    );

    // remember where we started, so an interrupted sequence can put the
    // character back
    const p = this.village.player;
    this._savedPos.copy(p.pos);
    this._savedYaw = p.yaw;
    return true;
  }

  cancel() {
    if (!this.active) return;
    const p = this.village.player;
    p.pos.copy(this._savedPos);
    p.pos.y = this.village.terrainHeight(p.pos.x, p.pos.z);
    p.yaw = this._savedYaw;
    this.phase = 'idle';
    this.fade = 0;
    if (this.door) {
      this.door.rotation.y = this.doorAngle;
    }
    this.onToast?.('Ты передумал спать.');
  }

  update(dt) {
    if (!this.active) return;
    const v = this.village;
    const p = v.player;
    this.t += dt;

    switch (this.phase) {
      case 'approach': {
        // walk to the spot in front of the door
        const dx = this._target.x - p.pos.x;
        const dz = this._target.z - p.pos.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.25) {
          this.phase = 'reach';
          this.t = 0;
          // face the door
          p.yaw = Math.atan2(this._doorCenter.x - p.pos.x, this._doorCenter.z - p.pos.z);
          break;
        }
        const step = Math.min(d, WALK_SPEED * dt);
        p.pos.x += (dx / d) * step;
        p.pos.z += (dz / d) * step;
        p.pos.y = v.terrainHeight(p.pos.x, p.pos.z);
        // turn towards the direction of travel
        p.yaw = Math.atan2(dx, dz);
        v.playerMoveLocked = true;
        break;
      }

      case 'reach': {
        // a short pause, as if the character is gathering themselves
        p.yaw = Math.atan2(this._doorCenter.x - p.pos.x, this._doorCenter.z - p.pos.z);
        if (this.t > 0.7) {
          this.phase = 'open';
          this.t = 0;
        }
        break;
      }

      case 'open': {
        // the door swings open
        if (this.door) {
          const k = clamp(this.t / 0.9, 0, 1);
          const eased = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
          this.door.rotation.y = this.doorAngle + eased * 1.5;
        }
        if (this.t > 0.9) {
          this.phase = 'enter';
          this.t = 0;
        }
        break;
      }

      case 'enter': {
        // step over the threshold and into the dark room
        const dx = this._doorCenter.x - p.pos.x;
        const dz = this._doorCenter.z - p.pos.z;
        const d = Math.hypot(dx, dz);
        const step = Math.min(d, WALK_SPEED * 0.7 * dt);
        if (d > 0.001) {
          p.pos.x += (dx / d) * step;
          p.pos.z += (dz / d) * step;
        }
        p.pos.y = v.terrainHeight(p.pos.x, p.pos.z);
        if (this.t > 1.3) {
          this.phase = 'close';
          this.t = 0;
          // now the character is inside: hide them
          p.body.visible = false;
          p.shadow.visible = false;
        }
        break;
      }

      case 'close': {
        // the door swings shut behind them
        if (this.door) {
          const k = clamp(this.t / 0.9, 0, 1);
          const eased = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
          this.door.rotation.y = this.doorAngle + (1 - eased) * 1.5;
        }
        if (this.t > 0.9) {
          this.phase = 'fade';
          this.t = 0;
        }
        break;
      }

      case 'fade': {
        // the screen goes dark
        this.fade = clamp(this.t / 1.2, 0, 1);
        if (this.t > 1.2) {
          this.phase = 'wake';
          this.t = 0;
          this.onFinished?.();
        }
        break;
      }

      case 'wake': {
        // and a new morning
        this.fade = clamp(1 - this.t / 1.4, 0, 1);
        if (this.t > 1.4) {
          this.fade = 0;
          this.phase = 'idle';
          p.body.visible = true;
          p.shadow.visible = true;
          // step back out of the door
          const house = this.house;
          const dx = Math.sin(house.rot);
          const dz = Math.cos(house.rot);
          const out = house.d / 2 + 1.4;
          p.pos.set(house.x + dx * out, 0, house.z + dz * out);
          p.pos.y = v.terrainHeight(p.pos.x, p.pos.z);
          p.yaw = Math.atan2(-dx, -dz);
          this.house = null;
          this.door = null;
        }
        break;
      }
    }
  }
}
