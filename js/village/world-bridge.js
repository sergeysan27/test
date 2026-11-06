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
    this.syncActors(dt);
  }

  // Copies the simulated state onto the visible meshes.
  syncActors(dt) {
    for (const v of this.world.villagers) {
      const obj = this.actors.get(v.id);
      if (!obj) continue;
      const y = terrainHeightSafe(this.terrainHeight, v.x, v.z);
      obj.position.x = v.x;
      obj.position.z = v.z;
      obj.position.y = y;

      // face the way they walk, or turn towards whoever they talk to
      let facing = v.facing ?? 0;
      if (v.talkTo !== null && v.talkTo !== undefined) {
        const other = this.world.villagers.find((o) => o.id === v.talkTo);
        if (other) facing = Math.atan2(other.x - v.x, other.z - v.z);
      }
      obj.rotation.y = approachAngle(obj.rotation.y, facing, dt * 6);

      const parts = obj.userData.parts;
      const phase = this.world.tickCount * 0.4 + v.id;
      const w = Math.sin(phase * 7) * (v.moving ? 1 : 0);
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
