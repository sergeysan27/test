import * as THREE from 'three';
import { buildCharacter } from './props.js';
import { createContactShadow } from './shadows.js';
import { World, loadWorld, saveWorld, TICK, HOURS_PER_TICK, TIME_SCALE } from './world-sim.js';
import { clamp } from './util.js';

// ---------------------------------------------------------------------------
// The bridge between the living world and the picture.
//
// The world (world-sim.js) is pure data and knows nothing about Three.js.
// This module owns the visible villagers: it creates a mesh for each one,
// reads the simulated position every frame and drives the walk animation.
//
// It also owns the world clock: the world is stepped on its own schedule,
// completely decoupled from the render loop, so a slow frame rate cannot
// make the village live faster or slower.
// ---------------------------------------------------------------------------

const SAVE_INTERVAL = 10;   // seconds of real time between autosaves

export class WorldBridge {
  constructor(scene, layout, terrainHeight, rng) {
    this.scene = scene;
    this.layout = layout;
    this.terrainHeight = terrainHeight;
    this.actors = new Map();
    this.accum = 0;
    this.saveTimer = 0;
    this.awaySeconds = 0;
    this.catchUpSummary = null;
    this.onChronicle = null;
    this.onCatchUp = null;
    this.running = false;
    this.lastTickAt = Date.now();
    this.playerPos = { x: 0, z: 0 };

    // pick up where the village left off, or start a new one
    const { world, awaySeconds } = loadWorld();
    this.awaySeconds = awaySeconds;
    if (world) {
      this.world = world;
      this.dayBefore = world.day;
      // fast-forward through everything that happened while the game was closed
      if (awaySeconds > 30) {
        const summary = this.world.catchUp(awaySeconds);
        this.catchUpSummary = summary;
        this.onCatchUp?.(summary, awaySeconds);
      }
    } else {
      this.world = new World({ seed: 20261106, time: 19.6 * 60 });
      this.world.log('Деревня проснулась. Всё по-старому, но день новый.', 'day');
    }

    this.buildActors();
    this.applyWorldTime();
    this.start();
  }

  // The world runs on its own timer, completely independent of the render
  // loop. That way the village keeps breathing even when the browser stops
  // painting, and the simulation speed never depends on the frame rate.
  start() {
    if (this.running) return;
    this.running = true;
    this.lastTickAt = Date.now();
    this.timer = setInterval(() => this.tick(), TICK * 1000);
    this.saveTimerId = setInterval(() => {
      saveWorld(this.world);
    }, SAVE_INTERVAL * 1000);
  }

  stop() {
    if (!this.running) return;
    this.running = false;
    clearInterval(this.timer);
    clearInterval(this.saveTimerId);
  }

  // One step of the world's own clock.
  tick() {
    const now = Date.now();
    // if the timer was throttled (background tab), catch up on the gap
    let elapsed = (now - this.lastTickAt) / 1000;
    this.lastTickAt = now;
    if (elapsed > TICK * 4) {
      // the browser slept: fast-forward through the gap
      this.world.catchUp(elapsed);
      return;
    }
    this.world.step();
  }

  // Creates one visible actor per simulated villager.
  buildActors() {
    for (const v of this.world.villagers) {
      const spec = {
        name: v.name,
        skinIdx: v.id % 5,
        shirtIdx: (v.id * 3) % 7,
        pantsIdx: v.id % 3,
        hairIdx: (v.id * 5) % 6,
        longHair: v.id % 3 === 0,
        hat: v.id % 4 === 0,
        hatColor: [0x4a3a2a, 0x6a5a3a, 0x3a4a5a, 0x7a4a3a][v.id % 4],
        smile: true,
        scale: v.id % 6 === 3 ? 0.92 : 1 + (v.id % 3) * 0.04,
        lantern: v.id % 3 === 1,
        basket: v.id % 4 === 2,
        cat: false,
        dog: false,
      };
      const obj = buildCharacter(spec);
      obj.position.set(v.x, terrainHeightSafe(this.terrainHeight, v.x, v.z), v.z);
      obj.userData.isNpc = true;
      obj.userData.villagerId = v.id;
      const shadow = createContactShadow(0.6, 0.45);
      this.scene.add(shadow);
      obj.userData.shadow = shadow;
      this.scene.add(obj);
      this.actors.set(v.id, obj);
    }
  }

  // Copies the simulated state onto the visible meshes. This is the only
  // part of the bridge that runs inside the render loop.
  update(dt, hours) {
    // let the world know where the player is, so villagers can react
    if (this.playerPos) this.world.playerPos = this.playerPos;
    // The real time since the last frame. The render loop clamps its delta
    // so a stall cannot teleport the player, but the villagers have to keep
    // up with the wall clock or they drift behind the simulation.
    const now = performance.now();
    if (this._lastFrameAt === undefined) this._lastFrameAt = now;
    const realDt = Math.min((now - this._lastFrameAt) / 1000, 0.25);
    this._lastFrameAt = now;
    this.syncActors(realDt);
  }

  // The world is stepped on its own timer, four times a second. If the
  // meshes simply copied the simulated position, every villager would jump
  // four times a second - which reads as a character moving at five frames
  // per second next to the player, who moves smoothly.
  //
  // So the bridge remembers where each villager was before the last tick
  // and eases the visible mesh from there to the new position. The walk
  // animation runs on the render clock as well, at the same speed as the
  // player's.
  syncActors(dt) {
    for (const v of this.world.villagers) {
      const obj = this.actors.get(v.id);
      if (!obj) continue;

      // How the villagers move.
      //
      // The world is stepped ten times a second, so the simulated position
      // jumps. The visible mesh must not: it is moved by the same amount
      // the simulation moved, but spread over the frames in between and
      // capped at the villager's own walking speed. That is what makes them
      // move at the same rate as the player instead of hopping.
      if (v.visX === undefined) {
        v.visX = v.x;
        v.visZ = v.z;
        v.simX = v.x;
        v.simZ = v.z;
      }
      // How far the simulation has come since the last frame
      const simDX = v.x - v.simX;
      const simDZ = v.z - v.simZ;
      v.simX = v.x;
      v.simZ = v.z;

      // The mesh walks towards the simulated position at the villager's own
      // speed. The world is stepped ten times a second, so the goal arrives
      // in small steps; the mesh follows it smoothly instead of copying it.
      // If the frame rate is low and the mesh falls behind, it catches up
      // a little faster, so the villagers never lag behind the simulation.
      const dx = v.x - v.visX;
      const dz = v.z - v.visZ;
      const dist = Math.hypot(dx, dz);
      const speed = v.speed ?? 1.2;
      // if the mesh has fallen a long way behind - the villager changed
      // their mind, or the frame rate dropped - they hurry to catch up
      const catchUp = dist > 1.5 ? 2.6 : 1.0;
      const maxStep = speed * dt * catchUp;
      let tx = v.visX;
      let tz = v.visZ;
      if (dist > 0.0001) {
        const step = Math.min(dist, maxStep);
        tx += (dx / dist) * step;
        tz += (dz / dist) * step;
      }
      const movedNow = Math.hypot(tx - v.visX, tz - v.visZ);
      v.visX = tx;
      v.visZ = tz;

      const y = terrainHeightSafe(this.terrainHeight, tx, tz);
      obj.position.x = tx;
      obj.position.z = tz;
      obj.position.y = y;

      const walking = movedNow > 0.002;

      // face the way they walk, or turn towards whoever they talk to
      let facing = v.facing ?? 0;
      if (v.talkTo !== null && v.talkTo !== undefined) {
        const other = this.world.villagers.find((o) => o.id === v.talkTo);
        if (other) facing = Math.atan2(other.x - tx, other.z - tz);
      }
      obj.rotation.y = approachAngle(obj.rotation.y, facing, dt * 6);

      // the walk cycle is driven by the distance the mesh actually
      // covered, so the feet never slide
      v.stride = (v.stride ?? 0) + movedNow * 3.4;

      const parts = obj.userData.parts;
      const phase = v.stride + v.id * 1.7;
      const w = Math.sin(phase) * (walking ? 1 : 0);
      if (parts?.legL) {
        parts.legL.rotation.x = w * 0.55;
        parts.legR.rotation.x = -w * 0.55;
        parts.armL.rotation.x = -w * 0.42;
        parts.armR.rotation.x = w * 0.42;
        parts.body.position.y = Math.abs(w) * 0.045;
        parts.head.rotation.y = Math.sin(phase * 0.6) * 0.3;
        // an emote changes how the arms are held
        if (v.emote === 'eat' || v.emote === 'wash') {
          parts.armR.rotation.x = -0.9 + Math.sin(phase * 5) * 0.25;
        } else if (v.emote === 'work') {
          parts.armR.rotation.x = -0.7 + Math.sin(phase * 4) * 0.5;
          parts.armL.rotation.x = 0.7 - Math.sin(phase * 4) * 0.5;
        } else if (v.emote === 'dance') {
          parts.armL.rotation.x = -1.6 + Math.sin(phase * 6) * 0.4;
          parts.armR.rotation.x = -1.6 - Math.sin(phase * 6) * 0.4;
          parts.body.rotation.y = Math.sin(phase * 3) * 0.25;
        } else if (v.emote === 'greet') {
          // a raised hand, waving
          parts.armR.rotation.x = -2.1 + Math.sin(phase * 7) * 0.45;
          parts.armR.rotation.z = 0.25;
          parts.head.rotation.y = Math.sin(phase * 1.2) * 0.15;
        }
      }
      if (obj.userData.lampGroup) {
        obj.userData.lampGroup.rotation.z = Math.sin(this.world.tickCount * 0.3 + v.id) * 0.12;
      }
      const sh = obj.userData.shadow;
      if (sh) {
        sh.position.set(v.x, y + 0.04, v.z);
        sh.updateMatrix();
      }
    }
  }

  // The world's clock drives the sky, the lamps and the HUD.
  applyWorldTime() {
    const h = this.world.hours;
    return h;
  }

  get hours() { return this.world.hours; }

  // A one-line summary of what the village did while you were away.
  offlineReport() {
    const w = this.world;
    const lines = [];
    const days = w.day - (this.dayBefore ?? w.day);
    lines.push(
      `Пока вас не было, прошло ${days} ${plural(days, 'день', 'дня', 'дней')}. Сейчас в деревне ${w.clockString}.`
    );
    const notable = w.chronicle
      .filter((c) => c.kind === 'festival' || c.kind === 'social')
      .slice(0, 4);
    if (notable.length) {
      lines.push('Пока вас не было:');
      for (const n of notable) {
        lines.push(`Д${n.day}, ${String(n.time).padStart(2, '0')}:${String(n.minute).padStart(2, '0')} — ${n.text}`);
      }
    } else {
      lines.push('Ничего особенного не случилось. Деревня жила обычной жизнью.');
    }
    const wx = { clear: 'ясно', rain: 'дождь', fog: 'туман' }[w.weather.kind];
    lines.push(`Погода сейчас: ${wx}.`);
    if (w.festival) lines.push(`На площади — ${w.festival.name.toLowerCase()}.`);
    return lines;
  }

  dispose() {
    this.stop();
    saveWorld(this.world);
    for (const obj of this.actors.values()) {
      this.scene.remove(obj);
      if (obj.userData.shadow) this.scene.remove(obj.userData.shadow);
    }
    this.actors.clear();
  }

  // Writes the world out. Called on a timer and whenever the page is
  // closed, so the village is never lost.
  save() {
    return saveWorld(this.world);
  }
}

function terrainHeightSafe(fn, x, z) {
  try { return fn(x, z) ?? 0; } catch { return 0; }
}

// Russian plural: 1 день, 2 дня, 5 дней
function plural(n, one, few, many) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

// Rotates towards the target angle the short way round.
function approachAngle(current, target, rate) {
  let diff = target - current;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return current + diff * Math.min(1, rate);
}
