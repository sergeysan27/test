import * as THREE from 'three';
import { buildCatModel } from './props.js';
import { dampAngle } from './npcs.js';
import { clamp } from './util.js';

// ---------------------------------------------------------------------------
// The ginger cat. It starts asleep on the bench, wanders around the plaza
// and follows the player once it has been fed. Following the cat around is
// the small heart of the life simulator: it reacts, purrs and can be petted.
// ---------------------------------------------------------------------------

export class Cat {
  constructor(scene, start, terrainHeight) {
    this.terrainHeight = terrainHeight;
    this.group = new THREE.Group();
    this.model = buildCatModel({
      catColor: 0xc07a3a,
      petScale: 1.15,
    });
    this.group.add(this.model);
    scene.add(this.group);

    this.pos = new THREE.Vector3(start.x, terrainHeight(start.x, start.z), start.z);
    this.vel = new THREE.Vector3();
    this.yaw = Math.random() * Math.PI * 2;
    this.state = 'sleep';
    this.following = false;
    this.happiness = 55;
    this.purr = 0;
    this.phase = Math.random() * Math.PI * 2;
    this.target = new THREE.Vector3(start.x, 0, start.z);
    this.bubbleTimer = 0;
    this.onSay = null;

    this.group.position.copy(this.pos);
  }

  // Called when the player offers food.
  feed(sim) {
    const food = sim.hasItem('fish') ? 'fish' : sim.hasItem('bread') ? 'bread' : sim.hasItem('apple') ? 'apple' : null;
    if (!food) {
      this.say('Мур? А что ты мне принёс?');
      return false;
    }
    sim.useItem(food);
    this.following = true;
    this.happiness = clamp(this.happiness + 26, 0, 100);
    this.state = 'follow';
    this.say(food === 'fish' ? 'Рыба! Вот это дело. Я пойду с тобой.' : 'Ну ладно, ненадолго.');
    sim.stats.catFed += 1;
    sim.befriend('Рыжий кот', 10);
    return true;
  }

  pet() {
    this.happiness = clamp(this.happiness + 6, 0, 100);
    this.purr = 2.4;
    this.say('Мур-р-р...');
  }

  say(text) {
    this.bubbleTimer = 4.2;
    this.onSay?.(text);
  }

  update(dt, time, playerPos, sim) {
    const speedToPlayer = Math.hypot(playerPos.x - this.pos.x, playerPos.z - this.pos.z);

    if (this.following) {
      // stay near the player, at a polite distance
      const want = 1.6;
      if (speedToPlayer > want + 1.2) {
        this.state = 'follow';
        const dir = Math.atan2(playerPos.x - this.pos.x, playerPos.z - this.pos.z);
        const move = Math.min(speedToPlayer - want, 5.2 * dt);
        this.pos.x += Math.sin(dir) * move;
        this.pos.z += Math.cos(dir) * move;
        this.yaw = dampAngle(this.yaw, dir, 7, dt);
        this.phase += dt * 9;
      } else {
        this.state = 'sit';
        this.yaw = dampAngle(this.yaw, Math.atan2(playerPos.x - this.pos.x, playerPos.z - this.pos.z), 5, dt);
      }
      // if the player runs far away, the cat gives up and goes home
      if (speedToPlayer > 34) {
        this.following = false;
        this.state = 'wander';
        this.say('Ладно, я пошла...');
      }
    } else {
      // idle wandering around the bench
      if (this.state !== 'sleep') {
        const d = Math.hypot(this.target.x - this.pos.x, this.target.z - this.pos.z);
        if (d < 0.5) {
          const a = Math.random() * Math.PI * 2;
          const r = 1.5 + Math.random() * 4;
          this.target.set(this.pos.x + Math.cos(a) * r, 0, this.pos.z + Math.sin(a) * r);
          if (Math.random() < 0.4) this.state = 'sleep';
        } else {
          const dir = Math.atan2(this.target.x - this.pos.x, this.target.z - this.pos.z);
          const move = Math.min(d, 1.1 * dt);
          this.pos.x += Math.sin(dir) * move;
          this.pos.z += Math.cos(dir) * move;
          this.yaw = dampAngle(this.yaw, dir, 6, dt);
          this.phase += dt * 6;
        }
      } else if (Math.random() < 0.004) {
        this.state = 'wander';
      }
    }

    this.pos.y = this.terrainHeight(this.pos.x, this.pos.z);
    this.group.position.copy(this.pos);
    this.group.rotation.y = this.yaw;

    // animation: leg swing, tail flick, ear twitch
    const p = this.model.userData;
    const moving = this.state === 'follow';
    const w = Math.sin(this.phase);
    if (p.legs) {
      p.legs.forEach((leg, i) => {
        leg.rotation.x = moving ? w * (i % 2 ? 0.7 : -0.7) : 0;
      });
    }
    if (p.body) {
      p.body.position.y = p.bodyBaseY + (moving ? Math.abs(w) * 0.05 : 0);
      p.body.rotation.x = this.state === 'sleep' ? -0.35 : 0;
    }
    if (p.tail) {
      p.tail.rotation.z = Math.sin(time * 2.2 + this.phase) * 0.35;
      p.tail.rotation.y = Math.sin(time * 1.3) * 0.4;
    }
    if (p.head) {
      p.head.rotation.y = Math.sin(time * 0.7 + this.phase) * 0.4;
    }

    if (this.purr > 0) this.purr -= dt;
    if (this.bubbleTimer > 0) this.bubbleTimer -= dt;
    this.happiness = clamp(this.happiness - dt * 0.06, 0, 100);
  }
}
