import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { WORLD, PALETTE, phaseForTime } from './config.js';
import { makeRng, clamp, lerp, damp } from './util.js';
import { buildGround, buildLayout, terrainHeight, isOnRoad, PLACES } from './world.js';
import { buildHouse, buildTree, buildTreeInstances, buildLamp, buildProp, buildFireflies, createMaterialCache } from './props.js';
import { createNpcs, updateNpcs, dampAngle, npcLine } from './npcs.js';
import { villagerLine, villagerStatus } from './dialogue.js';
import { WorldBridge } from './world-bridge.js';
import { loadWorld, saveWorld, clearWorld } from './world-sim.js';
import { SkySystem, WeatherSystem, FireflySystem } from './systems.js';
import { pathTexture } from './textures.js';
import { glowSprite } from './textures.js';
import { createContactShadow } from './shadows.js';
import { updateSmoke } from './smoke.js';
import { mergeAll } from './merge.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Ambience } from './audio.js';
import { LightPool } from './lights.js';
import { buildBirds, updateBirds, buildGroundMist, updateMist } from './life.js';
import { CollisionWorld } from './collision.js';
import { LifeSim, NEED_DEFS, ITEM_DEFS, QUESTS } from './sim.js';
import {
  buildFallingLeaves, updateLeaves, buildButterflies, updateButterflies,
  buildRipples, updateRipples, applyTreeSway, buildMotes, updateMotes,
} from './atmosphere.js';
import { buildInteractables, nearestInteractable } from './interactions.js';
import { Cat } from './cat.js';
import { shopList, buyItem, sellItem } from './shops.js';

class Player {
  constructor(scene, terrainHeight) {
    this.pos = new THREE.Vector3(0, 0, 12);
    this.vel = new THREE.Vector3();
    this.yaw = Math.PI;
    this.pitch = -0.05;
    this.body = new THREE.Group();
    this.legL = new THREE.Group();
    this.legR = new THREE.Group();
    this.armL = new THREE.Group();
    this.armR = new THREE.Group();
    this.head = new THREE.Group();
    this.height = 1.72;
    this.phase = 0;
    this.bob = 0;
    this.build(scene);
  }

  build(scene) {
    const skin = new THREE.MeshStandardMaterial({ color: 0xf0c9a0, roughness: 0.75 });
    const coat = new THREE.MeshStandardMaterial({ color: 0x6d8fb8, roughness: 0.88 });
    const pants = new THREE.MeshStandardMaterial({ color: 0x4c5464, roughness: 0.88 });
    const hair = new THREE.MeshStandardMaterial({ color: 0x5a4030, roughness: 0.95 });
    const shoe = new THREE.MeshStandardMaterial({ color: 0x3a352e, roughness: 0.9 });
    const scarf = new THREE.MeshStandardMaterial({ color: 0xc25a44, roughness: 0.95 });

    const body = new THREE.Group();
    this.body.add(body);

    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.235, 0.245, 0.68, 12), coat);
    torso.position.y = 1.04;
    torso.castShadow = true;
    body.add(torso);

    // shoulders
    const shoulders = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 8), coat);
    shoulders.position.y = 1.36;
    shoulders.scale.set(1.25, 0.62, 0.92);
    shoulders.castShadow = true;
    body.add(shoulders);

    const hips = new THREE.Mesh(new THREE.CylinderGeometry(0.225, 0.215, 0.22, 12), pants);
    hips.position.y = 0.72;
    body.add(hips);

    // neck fills the gap between the shoulders and the head
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.1, 0.2, 10), skin);
    neck.position.y = 1.44;
    neck.castShadow = true;
    body.add(neck);

    const scarfRing = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.07, 6, 14), scarf);
    scarfRing.position.y = 1.4;
    scarfRing.rotation.x = Math.PI / 2;
    body.add(scarfRing);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.45, 0.08), scarf);
    tail.position.set(0.1, 1.22, -0.2);
    tail.rotation.z = 0.2;
    body.add(tail);

    for (const [g, s] of [[this.legL, -1], [this.legR, 1]]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.1, 0.78, 10), pants);
      leg.position.y = -0.39;
      leg.castShadow = true;
      g.add(leg);
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.1, 0.3), shoe);
      foot.position.set(0, -0.78, 0.07);
      foot.castShadow = true;
      g.add(foot);
      g.position.set(s * 0.13, 0.76, 0);
      body.add(g);
    }

    for (const [g, s] of [[this.armL, -1], [this.armR, 1]]) {
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.088, 0.078, 0.6, 10), coat);
      arm.position.y = -0.3;
      arm.castShadow = true;
      g.add(arm);
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.088, 10, 8), skin);
      hand.position.y = -0.62;
      g.add(hand);
      g.position.set(s * 0.3, 1.32, 0);
      body.add(g);
    }

    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.21, 16, 14), skin);
    skull.position.y = 0.2;
    skull.castShadow = true;
    this.head.add(skull);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.222, 16, 14, 0, Math.PI * 2, 0, Math.PI * 0.45), hair);
    cap.position.y = 0.22;
    this.head.add(cap);
    const beanie = new THREE.Mesh(new THREE.SphereGeometry(0.235, 16, 14, 0, Math.PI * 2, 0, Math.PI * 0.5), new THREE.MeshStandardMaterial({ color: 0xc25a44, roughness: 0.95 }));
    beanie.position.y = 0.32;
    this.head.add(beanie);
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.245, 0.245, 0.055, 16), new THREE.MeshStandardMaterial({ color: 0xa8493a, roughness: 0.95 }));
    brim.position.y = 0.315;
    this.head.add(brim);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x1a1512 });
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.033, 10, 8), eyeMat);
      eye.position.set(s * 0.075, 0.21, 0.185);
      this.head.add(eye);
    }
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.07, 8), skin);
    nose.position.set(0, 0.17, 0.2);
    nose.rotation.x = Math.PI / 2;
    this.head.add(nose);
    const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.012, 6, 12, Math.PI), new THREE.MeshStandardMaterial({ color: 0x8a4a4a, roughness: 0.6 }));
    mouth.position.set(0, 0.115, 0.185);
    mouth.rotation.z = Math.PI;
    this.head.add(mouth);
    this.head.position.y = 1.5;
    body.add(this.head);

    // backpack
    const pack = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.42, 0.2), new THREE.MeshStandardMaterial({ color: 0x6a4a30, roughness: 0.95 }));
    pack.position.set(0, 1.1, -0.28);
    pack.castShadow = true;
    body.add(pack);

    // hand lantern
    const lantern = new THREE.Group();
    const metal = new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.45, metalness: 0.6 });
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.012, 5, 10), metal);
    handle.position.y = 0.14;
    lantern.add(handle);
    const glass = new THREE.Mesh(
      new THREE.CylinderGeometry(0.062, 0.07, 0.16, 8),
      new THREE.MeshStandardMaterial({
        color: 0xffe9b8, emissive: 0xffb851, emissiveIntensity: 2.4,
        transparent: true, opacity: 0.92, roughness: 0.3,
      })
    );
    lantern.add(glass);
    const lampCap = new THREE.Mesh(new THREE.ConeGeometry(0.085, 0.06, 8), metal);
    lampCap.position.y = 0.115;
    lantern.add(lampCap);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.065, 0.03, 8), metal);
    base.position.y = -0.09;
    lantern.add(base);
    const llight = new THREE.PointLight(0xffb060, 3.0, 9, 2);
    llight.position.y = -0.02;
    lantern.add(llight);
    const lglow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowSprite('#ffcf8a'), color: 0xffb060, transparent: true, opacity: 0.7,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    lglow.scale.set(0.9, 0.9, 1);
    lantern.add(lglow);
    lantern.position.set(0.34, 0.86, 0.16);
    body.add(lantern);
    this.lantern = lantern;
    this.lanternLight = llight;
    this.lanternGlow = lglow;
    this.lanternGlass = glass;

    this.body.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    scene.add(this.body);

    this.shadow = createContactShadow(0.62, 0.5);
    scene.add(this.shadow);
  }
}

class Village {
  constructor(canvas) {
    this.canvas = canvas;
    this.clock = new THREE.Clock();
    this.time = 19.6;
    this.hours = 19.6;
    this.rng = makeRng(WORLD.seed);
    this.keys = {};
    this.nearbyNpc = null;
    this.autoWander = false;
    this.settings = { bloom: true, fireflies: true, sound: false };
    this.quality = 2;
    this._fpsAccum = 0;
    this._fpsFrames = 0;
    this.onPlaceChange = null;
    this.onToast = null;
    this.sim = new LifeSim();
    this.shopOpen = null;
    this.nearbyPlace = null;
    this.hudTimer = 0;
    this.setupRenderer();
    this.buildScene();
    this.bindEvents();
    this.animate();
  }

  setupRenderer() {
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 600);
    this.camera.position.set(0, 2.4, 14);
  }

  buildScene() {
    const scene = new THREE.Scene();
    this.scene = scene;
    const rng = this.rng;

    this.terrainHeight = terrainHeight;
    this.cache = createMaterialCache();

    // ground
    this.ground = buildGround(rng);
    scene.add(this.ground);

    // roads
    this.layout = buildLayout(rng);
    this.buildRoads();

    // houses
    this.houses = [];
    this.houseLights = [];
    this.interiorEmitters = [];
    this.staticGroups = [];
    this.lightPool = new LightPool(scene, 12);
    for (const spec of this.layout.houses) {
      const h = buildHouse(spec, this.cache);
      h.position.set(spec.x, terrainHeight(spec.x, spec.z), spec.z);
      h.rotation.y = spec.rot;
      h.userData.seed = spec.index;
      scene.add(h);
      this.houses.push(h);
      // interior warm light
      const pos = new THREE.Vector3(spec.x, terrainHeight(spec.x, spec.z) + 1.7, spec.z);
      const emitter = { position: pos, color: 0xffb266, intensity: 0, distance: 9 };
      this.lightPool.add(emitter);
      this.houseLights.push({ emitter, spec });

      // lamps inside the room
      const interior = h.getObjectByProperty('isInterior', true);
      const emitters = interior?.userData?.emitters;
      if (emitters) {
        const rot = h.rotation.y;
        for (const e of emitters) {
          const wp = e.position.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), rot).add(h.position);
          const emitter = { position: wp, color: e.color, intensity: 0, distance: e.distance };
          this.lightPool.add(emitter);
          this.interiorEmitters.push({ emitter, lit: spec.lit });
        }
      }
    }

    // merge each house into a handful of meshes to keep draw calls low
    for (const h of this.houses) {
      this.staticGroups.push(h);
    }

    // trees (instanced: one draw call for the whole forest)
    const treeSpecs = this.layout.trees.map((t) => ({
      x: t.x,
      y: terrainHeight(t.x, t.z),
      z: t.z,
      rot: rng.next() * Math.PI * 2,
      scale: t.scale,
    }));
    this.treeGroup = buildTreeInstances(treeSpecs, this.cache);
    scene.add(this.treeGroup);

    // apple trees (orchard)
    const orchard = [];
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      const r = 5 + Math.random() * 8;
      const x = 4 + Math.cos(a) * r;
      const z = -50 + Math.sin(a) * r;
      orchard.push({ x, y: terrainHeight(x, z), z, rot: rng.next() * Math.PI * 2, scale: 0.85 + Math.random() * 0.4 });
    }
    scene.add(buildTreeInstances(orchard, this.cache));

    // apples in the orchard
    const appleGeo = new THREE.SphereGeometry(0.09, 8, 6);
    const appleMat = new THREE.MeshStandardMaterial({ color: 0xc0392b, roughness: 0.7 });
    const appleCount = orchard.length * 7;
    const apples = new THREE.InstancedMesh(appleGeo, appleMat, appleCount);
    const m4 = new THREE.Matrix4();
    let ai = 0;
    for (const t of orchard) {
      for (let k = 0; k < 7; k++) {
        const ang = Math.random() * Math.PI * 2;
        const rad = 0.6 + Math.random() * 1.1;
        m4.makeTranslation(
          t.x + Math.cos(ang) * rad,
          t.y + 3.4 + Math.random() * 1.6,
          t.z + Math.sin(ang) * rad
        );
        apples.setMatrixAt(ai++, m4);
      }
    }
    apples.instanceMatrix.needsUpdate = true;
    apples.castShadow = true;
    scene.add(apples);

    // lamps
    this.lamps = [];
    for (const spec of this.layout.lamps) {
      const l = buildLamp(spec, this.cache);
      l.position.set(spec.x, terrainHeight(spec.x, spec.z), spec.z);
      l.rotation.y = spec.rot;
      scene.add(l);
      this.lamps.push(l);
      this.staticGroups.push(l);
      const emitter = l.userData.emitter;
      emitter.position.set(spec.x, terrainHeight(spec.x, spec.z) + 3.3, spec.z);
      this.lightPool.add(emitter);
    }

    // props
    this.spinner = null;
    this.bonfire = null;
    this.garlands = [];
    for (const spec of this.layout.props) {
      const p = buildProp(spec, this.cache);
      p.position.set(spec.x, terrainHeight(spec.x, spec.z), spec.z);
      p.rotation.y = spec.rot ?? 0;
      if (p.userData.spinner) this.spinner = p.userData.spinner;
      if (p.userData.bonfire) {
        this.bonfire = p.userData.bonfire;
        this.bonfirePosition = new THREE.Vector3(spec.x, terrainHeight(spec.x, spec.z), spec.z);
      }
      if (p.userData.garland) {
        this.garlands.push(p.userData.garland);
        p.userData.garland.origin = new THREE.Vector3(spec.x, terrainHeight(spec.x, spec.z), spec.z);
      }
      scene.add(p);
      this.staticGroups.push(p);
    }

    // Collapse the whole static village into one mesh per material.
    // Animated pieces (flames, garland lanterns, smoke) stay untouched.
    scene.add(mergeAll(this.staticGroups));

    // the bonfire and garlands feed the shared light pool
    scene.updateMatrixWorld(true);
    if (this.bonfire) {
      const b = this.bonfire;
      b.emitter.position.set(
        this.bonfirePosition.x,
        this.bonfirePosition.y + 0.7,
        this.bonfirePosition.z
      );
      this.lightPool.add(b.emitter);
    }
    for (const g of this.garlands) {
      g.emitter.position.set(g.origin.x, g.origin.y + 2.8, g.origin.z);
      this.lightPool.add(g.emitter);
    }

    // water pond
    this.buildWater();

    // collision world: solid buildings
    this.collision = new CollisionWorld();
    for (const spec of this.layout.houses) {
      this.collision.addBox(
        spec.x, spec.z,
        spec.w / 2 + 0.1, spec.d / 2 + 0.1,
        spec.rot,
        spec.h + spec.roofH
      );
    }
    // the mill, the church and the well block the way too
    const mill = PLACES.find((p) => p.name === 'Мельница');
    if (mill) this.collision.addBox(mill.x, mill.z, 2.4, 2.4, 0, 9);
    const church = PLACES.find((p) => p.name === 'Церковная площадь');
    if (church) this.collision.addBox(church.x, church.z - 4.6, 1.5, 1.5, 0, 14);
    const well = PLACES.find((p) => p.name === 'Колодец');
    if (well) this.collision.addBox(well.x, well.z, 1.1, 1.1, 0, 2.6);

    // The living world: villagers are simulated independently of the render
    // loop, and the simulation carries on while the game is closed.
    this.worldBridge = new WorldBridge(scene, this.layout, terrainHeight, rng);
    this.npcs = [...this.worldBridge.actors.values()];
    this.world = this.worldBridge.world;

    // player
    this.player = new Player(scene, terrainHeight);
    this.player.pos.set(2, 0, 9);
    this.player.yaw = Math.PI;
    this.player.body.position.copy(this.player.pos);

    // the ginger cat lives on the bench near the plaza
    this.cat = new Cat(scene, { x: -11, z: 6.4 }, terrainHeight);
    this.cat.onSay = (text) => {
      this.onToast?.(text);
    };

    // interactable places
    this.interactables = buildInteractables(this.layout);

    // fireflies
    this.fireflies = new FireflySystem(buildFireflies(260));
    scene.add(this.fireflies.points);

    // birds and morning mist
    this.birds = buildBirds(14);
    scene.add(this.birds);
    this.mist = buildGroundMist();
    scene.add(this.mist);

    // living atmosphere
    this.leaves = buildFallingLeaves(90);
    scene.add(this.leaves);
    this.butterflies = buildButterflies(14);
    scene.add(this.butterflies);
    this.ripples = buildRipples(12);
    scene.add(this.ripples);
    this.motes = buildMotes(60);
    scene.add(this.motes);

    // systems
    this.sky = new SkySystem(scene);
    this.weather = new WeatherSystem(scene);

    // composer
    this.setupComposer();

    this.placeNames = PLACES;
    this.currentPlace = null;
  }

  buildRoads() {
    const tex = pathTexture();
    tex.repeat.set(1, 1);
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 1 });
    const group = new THREE.Group();
    const geos = [];
    const v = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    for (const road of this.layout.roads) {
      const dx = road.to[0] - road.from[0];
      const dz = road.to[1] - road.from[1];
      const len = Math.hypot(dx, dz);
      const width = road.width;
      const segs = Math.max(2, Math.round(len / 3));
      const angle = Math.atan2(dx, dz);
      for (let i = 0; i < segs; i++) {
        const t0 = i / segs;
        const t1 = (i + 1) / segs;
        const x0 = road.from[0] + dx * t0, z0 = road.from[1] + dz * t0;
        const x1 = road.from[0] + dx * t1, z1 = road.from[1] + dz * t1;
        const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
        const segLen = Math.hypot(x1 - x0, z1 - z0) + 0.4;
        const geo = new THREE.PlaneGeometry(width, segLen, 1, 2);
        geo.rotateX(-Math.PI / 2);
        // follow the terrain, then place the segment
        const pos = geo.attributes.position;
        for (let vi = 0; vi < pos.count; vi++) {
          const lx = pos.getX(vi);
          const lz = pos.getZ(vi);
          const wx = mx + lx * Math.cos(angle) + lz * Math.sin(angle);
          const wz = mz - lx * Math.sin(angle) + lz * Math.cos(angle);
          pos.setY(vi, terrainHeight(wx, wz) + 0.06);
        }
        geo.computeVertexNormals();
        v.set(mx, 0, mz);
        q.setFromAxisAngle(up, angle);
        geo.applyMatrix4(new THREE.Matrix4().compose(v, q, new THREE.Vector3(1, 1, 1)));
        geos.push(geo);
      }
    }
    // one material, one draw call for every road in the village
    const merged = mergeGeometries(geos, false);
    const road = new THREE.Mesh(merged, mat);
    road.receiveShadow = true;
    road.matrixAutoUpdate = false;
    group.add(road);
    this.scene.add(group);
  }

  buildWater() {
    const geo = new THREE.CircleGeometry(14, 40);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshStandardMaterial({
      color: PALETTE.water,
      roughness: 0.15,
      metalness: 0.35,
      transparent: true,
      opacity: 0.85,
    });
    const m = new THREE.Mesh(geo, mat);
    m.position.set(58, -0.6, 44);
    m.receiveShadow = true;
    this.scene.add(m);
    this.water = m;

    // dock
    const wood = this.cache.getWood(0x6b4f36);
    for (let i = 0; i < 8; i++) {
      const plank = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.12, 0.9), wood);
      plank.position.set(50 + i * 1.0, -0.1, 40 + i * 0.9);
      plank.rotation.y = -0.72;
      plank.castShadow = true;
      plank.receiveShadow = true;
      this.scene.add(plank);
    }
    for (const s of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 2.2, 8), this.cache.getWood(0x4b3928));
      post.position.set(51.5, -0.6, 44.5 + s * 1.2);
      post.castShadow = true;
      this.scene.add(post);
    }
    // boat
    const boat = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.SphereGeometry(0.9, 12, 8), this.cache.getWood(0x7a5b3e));
    hull.scale.set(0.7, 0.4, 1.5);
    boat.add(hull);
    const bench = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.08, 0.2), this.cache.getWood(0x5c4430));
    bench.position.y = 0.2;
    boat.add(bench);
    boat.position.set(54, -0.15, 46);
    boat.rotation.y = 0.6;
    boat.castShadow = true;
    this.scene.add(boat);
    this.boat = boat;
  }

  setupComposer() {
    const composer = new EffectComposer(this.renderer);
    composer.addPass(new RenderPass(this.scene, this.camera));
    const bloom = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.42, 0.62, 0.85
    );
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
    composer.setSize(window.innerWidth, window.innerHeight);
    this.composer = composer;
    this.bloom = bloom;
    this.setBloom(true);
  }

  setBloom(on) {
    this.settings.bloom = on;
    if (this.bloom) this.bloom.enabled = on;
    document.getElementById('btn-bloom')?.classList.toggle('active', on);
    // manual choice pins the quality level
    if (this._qualityLocked !== undefined) this._qualityLocked = true;
  }

  bindEvents() {
    // the world is written out whenever the page is closed or hidden, so
    // the village continues exactly where it stopped
    window.addEventListener('beforeunload', () => this.worldBridge?.save());
    window.addEventListener('pagehide', () => this.worldBridge?.save());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.worldBridge?.save();
    });
    window.addEventListener('resize', () => this.onResize());
    window.addEventListener('keydown', (e) => {
      this.keys[e.code] = true;
      if (e.code === 'KeyE') this.interact();
      if (e.code === 'KeyF') this.togglePlayerLamp();
      if (e.code === 'KeyP') this.togglePhotoMode();
      if (e.code === 'KeyQ') this.quickEat();
      if (e.code === 'KeyR') this.petCat();
      if (e.code === 'KeyC') this.toggleShop();
      if (e.code === 'Escape') this.closeShop();
    });
    window.addEventListener('keyup', (e) => { this.keys[e.code] = false; });

    const canvas = this.canvas;
    let dragging = false;
    canvas.addEventListener('mousedown', (e) => { dragging = true; });
    window.addEventListener('mouseup', () => { dragging = false; });
    window.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      this.player.yaw -= e.movementX * 0.0032;
      this.player.pitch = clamp(this.player.pitch - e.movementY * 0.0028, -1.1, 0.85);
    });
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.cameraDist = clamp((this.cameraDist ?? 6) + Math.sign(e.deltaY) * 0.6, 2.4, 16);
    }, { passive: false });

    // touch
    let touchStart = null;
    canvas.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: performance.now() };
    }, { passive: true });
    canvas.addEventListener('touchmove', (e) => {
      if (touchStart && e.touches.length === 1) {
        const dx = e.touches[0].clientX - touchStart.x;
        const dy = e.touches[0].clientY - touchStart.y;
        this.player.yaw -= dx * 0.006;
        this.player.pitch = clamp(this.player.pitch - dy * 0.005, -1.1, 0.85);
      }
    }, { passive: true });
    canvas.addEventListener('touchend', () => { touchStart = null; }, { passive: true });

    document.getElementById('btn-bloom')?.addEventListener('click', () => this.setBloom(!this.settings.bloom));
    document.getElementById('btn-shuffle')?.addEventListener('click', () => {
      this.settings.fireflies = !this.settings.fireflies;
      this.fireflies.enabled = this.settings.fireflies;
      document.getElementById('btn-shuffle').classList.toggle('active', this.settings.fireflies);
    });
    document.getElementById('btn-sound')?.addEventListener('click', () => this.toggleSound());
    document.getElementById('btn-photo')?.addEventListener('click', () => this.takePhoto());
    document.querySelectorAll('[data-weather]').forEach((b) => {
      b.addEventListener('click', () => {
        const kind = b.dataset.weather;
        this.setWeather(kind);
        document.querySelectorAll('[data-weather]').forEach((x) => x.classList.remove('active'));
        b.classList.add('active');
      });
    });
    document.getElementById('time-slider')?.addEventListener('input', (e) => this.setTime(parseFloat(e.target.value)));
    document.querySelectorAll('.presets button').forEach((b) => {
      b.addEventListener('click', () => {
        this.setTime(parseFloat(b.dataset.time));
        document.querySelectorAll('.presets button').forEach((x) => x.classList.remove('active'));
        b.classList.add('active');
      });
    });
  }

  setWeather(kind) {
    this.weatherKind = kind;
    // the weather lives in the world, so it survives a reload
    if (this.world) {
      this.world.weather.kind = kind;
      this.world.weather.nextIn = 6;
    }
    if (kind === 'rain') this.weather.set(1, 0.35);
    else if (kind === 'fog') this.weather.set(0, 1);
    else this.weather.set(0, 0.12);
    const label = kind === 'rain' ? 'Дождь' : kind === 'fog' ? 'Туман' : 'Ясно';
    this.onToast?.(`Погода: ${label}`);
  }

  setTime(h) {
    // the slider moves the world's clock, not just a display value
    this.world.time = h * 60;
    this.targetHours = h;
    this.hours = h;
    const slider = document.getElementById('time-slider');
    if (slider) slider.value = h;
    this.updateClockLabel();
  }

  updateClockLabel() {
    const { label } = phaseForTime(this.hours);
    const el = document.getElementById('phase');
    if (el) el.textContent = label;
    const hh = Math.floor(this.hours) % 24;
    const mm = Math.floor((this.hours % 1) * 60);
    const clock = document.getElementById('clock');
    if (clock) clock.textContent = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  }

  toggleSound() {
    this.settings.sound = !this.settings.sound;
    document.getElementById('btn-sound')?.classList.toggle('active', this.settings.sound);
    if (!this.ambience) this.ambience = new Ambience();
    if (this.settings.sound) {
      this.ambience.enable();
      this.onToast?.('Звук: ветер, сверчки и птицы');
    } else {
      this.ambience.disable();
      this.onToast?.('Звук выключен');
    }
  }

  takePhoto() {
    this.renderer.render(this.scene, this.camera);
    const url = this.renderer.domElement.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `village-${Date.now()}.png`;
    a.click();
    this.onToast?.('Снимок сохранён');
  }

  togglePhotoMode() {
    this.photoMode = !this.photoMode;
    document.getElementById('hud')?.classList.toggle('photo', this.photoMode);
  }

  talk() {
    const npc = this.nearbyNpc;
    if (!npc) {
      this.onToast?.('Рядом никого нет');
      return;
    }
    // the villager answers according to what the simulation says about
    // them: their activity, the hour, the weather and their friendship
    const villager = this.world?.villagers?.find((v) => v.id === npc.userData.villagerId);
    if (villager) {
      const line = villagerLine(villager, this.world, this.hours);
      const spec = npc.userData.spec;
      this.onTalk?.(spec, line);
      return;
    }
    const spec = npc.userData.spec;
    const pick = npcLine(spec, this.hours);
    this.onTalk?.(spec, pick);
  }

  // The E key: talk to a villager if one is close, otherwise use the place
  // the player is standing at.
  interact() {
    if (this.shopOpen) {
      this.closeShop();
      return;
    }
    const npc = this.nearbyNpc;
    if (npc) {
      this.talk();
      const spec = npc.userData.spec;
      const sim = this.sim;
      // talking to somebody for the first time counts as making friends
      if (!sim.greeted.has(spec.name)) {
        sim.greeted.add(spec.name);
        sim.stats.talked += 1;
        const level = sim.befriend(spec.name, 8);
        sim.log(`Познакомились: ${spec.name}`);
        this.onToast?.(`Знакомство: ${spec.name} (дружба ${Math.round(level)})`);
      } else {
        sim.befriend(spec.name, 2);
      }
      // the villager reacts: they turn towards the player, remember the
      // meeting and grow a little fond of them
      const villager = this.world?.villagers?.find((v) => v.id === npc.userData.villagerId);
      if (villager && this.world) {
        const rel = this.world.relation(0, villager.id);
        rel.meetings++;
        this.world.adjustRelation(0, villager.id, 4);
        villager.social = Math.min(100, villager.social + 6);
        villager.fun = Math.min(100, villager.fun + 2);
        villager.talkTo = 0;
        villager.talkTimer = 10;
        villager.mood = 'happy';
      }
      return;
    }
    const place = this.nearbyPlace;
    if (!place) {
      this.onToast?.('Здесь ничего нет');
      return;
    }
    this.usePlace(place);
  }

  // Each interactable place has its own small effect on the simulation.
  usePlace(place) {
    const sim = this.sim;
    switch (place.id) {
      case 'well':
        sim.addItem('water', 1);
        sim.stats.water += 1;
        sim.needs.thirst = clamp(sim.needs.thirst + 12, 0, 100);
        this.onToast?.('Ведро воды из колодца. Прохладно и чисто.');
        break;
      case 'bench':
        sim.stats.rested += 1;
        sim.needs.energy = clamp(sim.needs.energy + 30, 0, 100);
        sim.needs.mood = clamp(sim.needs.mood + 6, 0, 100);
        this.onToast?.('Лавка скрипнула. Минутка покоя.');
        break;
      case 'bonfire':
        sim.stats.warmed += 1;
        sim.needs.energy = clamp(sim.needs.energy + 14, 0, 100);
        sim.needs.mood = clamp(sim.needs.mood + 9, 0, 100);
        this.onToast?.('Тепло от костра разлилось по спине.');
        break;
      case 'church':
        sim.stats.prayed += 1;
        sim.needs.mood = clamp(sim.needs.mood + 12, 0, 100);
        this.onToast?.('Тихое пение поднимается к небу.');
        break;
      case 'orchard': {
        if (!sim.greeted.has('apple-tree')) {
          sim.greeted.add('apple-tree');
        }
        const got = 1 + (Math.random() < 0.4 ? 1 : 0);
        sim.addItem('apple', got);
        sim.stats.apples += got;
        sim.log(`Собрано яблок: ${got}`);
        this.onToast?.(`Сорвал${got > 1 ? 'и' : ''} ${got} яблок${got > 1 ? 'а' : ''} с ветки.`);
        break;
      }
      case 'dock':
        sim.stats.fished += 1;
        sim.addItem('fish', 1);
        sim.log('Поймана рыба у пристани');
        this.onToast?.('Поймал рыбу. Она ещё дёргается.');
        break;
      case 'bakery':
      case 'mill':
        this.openShop(place.id === 'bakery' ? 'bakery' : 'mill');
        break;
      default:
        if (place.house) {
          this.sleep(place);
          break;
        }
        this.onToast?.(place.label);
    }
    this.checkQuests();
  }

  // Sleeping at a house ends the day: the village wakes up again at dawn.
  sleep(place) {
    const sim = this.sim;
    if (this.hours > 4 && this.hours < 20) {
      this.onToast?.('Спать сейчас не хочется. Дождись ночи.');
      return;
    }
    sim.startNewDay();
    this.setTime(6.4);
    this.player.pos.set(place.house.x + Math.sin(place.house.rot) * (place.house.d / 2 + 1.2), 0, place.house.z + Math.cos(place.house.rot) * (place.house.d / 2 + 1.2));
    this.player.pos.y = terrainHeight(this.player.pos.x, this.player.pos.z);
    this.onToast?.(`День ${sim.day}. Утро. Всё как было, только светлее.`);
  }

  // Eat the best food in the bag: Q.
  quickEat() {
    const sim = this.sim;
    for (const key of ['bread', 'fish', 'apple']) {
      if (sim.hasItem(key)) {
        const msg = sim.useItem(key);
        this.onToast?.(msg || 'Немного перекусили.');
        this.checkQuests();
        return;
      }
    }
    this.onToast?.('В сумке ничего съедобного.');
  }

  // Pet the cat if it is nearby: R.
  petCat() {
    const d = Math.hypot(this.cat.pos.x - this.player.pos.x, this.cat.pos.z - this.player.pos.z);
    if (d > 3.2) {
      this.onToast?.('Рыжий кот не рядом.');
      return;
    }
    this.cat.pet();
    this.sim.befriend('Рыжий кот', 3);
  }

  checkQuests() {
    const finished = this.sim.checkQuests();
    for (const q of finished) {
      this.onToast?.(`Задание выполнено: «${q.title}» +${q.reward} монет`);
    }
    if (finished.length) this.refreshHud(true);
  }

  // ---------------- Shop ----------------
  openShop(shopId) {
    this.shopOpen = shopId;
    this.onShop?.(shopId);
  }

  closeShop() {
    if (!this.shopOpen) return;
    this.shopOpen = null;
    this.onShop?.(null);
  }

  toggleShop() {
    if (this.shopOpen) this.closeShop();
    else if (this.nearbyPlace?.shop) this.openShop(this.nearbyPlace.shop === true ? 'bakery' : this.nearbyPlace.shop);
  }

  togglePlayerLamp() {
    this.playerLampOn = this.playerLampOn === undefined ? false : !this.playerLampOn;
    this.onToast?.(this.playerLampOn ? 'Фонарь включён' : 'Фонарь выключен');
  }

  onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.composer?.setSize(window.innerWidth, window.innerHeight);
    this.bloom?.setSize(window.innerWidth, window.innerHeight);
  }

  updatePlayer(dt) {
    const p = this.player;
    const speed = (this.keys.ShiftLeft || this.keys.ShiftRight) ? 6.2 : 3.1;
    let mx = 0, mz = 0;
    if (this.keys.KeyW) mz += 1;
    if (this.keys.KeyS) mz -= 1;
    if (this.keys.KeyA) mx -= 1;
    if (this.keys.KeyD) mx += 1;
    const len = Math.hypot(mx, mz);
    const moving = len > 0.01;
    if (moving) {
      mx /= len; mz /= len;
      // forward = away from camera, right = perpendicular
      const yaw = p.yaw;
      const fx = -Math.sin(yaw);
      const fz = -Math.cos(yaw);
      const rx = Math.cos(yaw);
      const rz = -Math.sin(yaw);
      const wx = rx * mx + fx * mz;
      const wz = rz * mx + fz * mz;
      const target = new THREE.Vector3(wx, 0, wz).multiplyScalar(speed);
      p.vel.x = damp(p.vel.x, target.x, 9, dt);
      p.vel.z = damp(p.vel.z, target.z, 9, dt);
    } else {
      p.vel.x = damp(p.vel.x, 0, 11, dt);
      p.vel.z = damp(p.vel.z, 0, 11, dt);
    }

    const next = p.pos.clone().add(p.vel.clone().multiplyScalar(dt));
    // world bounds
    const r = Math.hypot(next.x, next.z);
    if (r > WORLD.groundRadius - 3) {
      next.x = (next.x / r) * (WORLD.groundRadius - 3);
      next.z = (next.z / r) * (WORLD.groundRadius - 3);
    }
    // solid buildings: the player cannot walk through walls
    if (this.collision) {
      const fixed = this.collision.resolve(next.x, next.z, 0.4);
      next.x = fixed.x;
      next.z = fixed.z;
    }
    p.pos.x = next.x;
    p.pos.z = next.z;
    p.pos.y = terrainHeight(p.pos.x, p.pos.z);

    // animation
    const speedNow = Math.hypot(p.vel.x, p.vel.z);
    p.phase += dt * (4 + speedNow * 1.9);
    const w = Math.sin(p.phase) * Math.min(1, speedNow / 3);
    p.legL.rotation.x = w * 0.62;
    p.legR.rotation.x = -w * 0.62;
    p.armL.rotation.x = -w * 0.5;
    p.armR.rotation.x = w * 0.5;
    p.bob = Math.abs(Math.sin(p.phase)) * Math.min(0.06, speedNow * 0.02);
    p.body.position.set(p.pos.x, p.pos.y + p.bob, p.pos.z);

    // The character turns to face where it walks. The camera yaw only
    // decides which way "forward" means, not which way the body looks.
    if (speedNow > 0.35) {
      const moveAngle = Math.atan2(p.vel.x, p.vel.z);
      p.body.rotation.y = dampAngle(p.body.rotation.y, moveAngle, 11, dt);
    } else {
      // standing still: slowly turn back towards the camera
      const restAngle = p.yaw + Math.PI;
      p.body.rotation.y = dampAngle(p.body.rotation.y, restAngle, 3, dt);
    }
    p.head.rotation.x = clamp(p.pitch * 0.4, -0.5, 0.4);

    // contact shadow follows the player
    p.shadow.position.set(p.pos.x, p.pos.y + 0.04, p.pos.z);
    p.shadow.scale.setScalar(1 - p.bob * 1.5);
    p.shadow.updateMatrix();

    // camera: over-the-shoulder third person
    const dist = this.cameraDist ?? 6.5;
    const focus = new THREE.Vector3(p.pos.x, p.pos.y + 1.5, p.pos.z);
    const offset = new THREE.Vector3(
      Math.sin(p.yaw) * dist * Math.cos(p.pitch),
      0.9 - Math.sin(p.pitch) * dist * 0.6 + dist * 0.28,
      Math.cos(p.yaw) * dist * Math.cos(p.pitch)
    );
    const desired = focus.clone().add(offset);
    desired.y = Math.max(desired.y, terrainHeight(desired.x, desired.z) + 1.0);

    // Keep the camera outside buildings: when a wall is in the way the boom
    // slides sideways around the obstacle instead of snapping into the back
    // of the character.
    let camTarget = desired;
    if (this.collision) {
      const clamped = this.collision.resolveCameraBoom(
        focus.x, focus.y, focus.z,
        desired.x, desired.y, desired.z,
        0.4
      );
      camTarget = new THREE.Vector3(clamped.x, clamped.y, clamped.z);
    }
    this.camera.position.lerp(camTarget, 1 - Math.exp(-14 * dt));
    this.camera.lookAt(focus);

    if (this.playerLamp) {
      this.playerLamp.position.set(p.pos.x + Math.sin(p.yaw) * 0.4, p.pos.y + 1.3, p.pos.z + Math.cos(p.yaw) * 0.4);
      this.playerLamp.intensity = damp(this.playerLamp.intensity, this.playerLampOn ? 2.6 : 0, 6, dt);
    }
  }
  updatePlayerLantern(dt) {
    const p = this.player;
    const night = clamp(1 - (smoothstepLocal(5.4, 8.0, this.hours) * (1 - smoothstepLocal(17.6, 20.2, this.hours))), 0, 1);
    const on = this.playerLampOn === undefined ? true : this.playerLampOn;
    const target = on ? night : 0;
    const cur = p.lanternLight.intensity;
    const next = damp(cur, target * 2.1, 4, dt);
    p.lanternLight.intensity = next;
    p.lanternGlass.material.emissiveIntensity = 0.3 + (next / 2.1) * 1.6;
    p.lanternGlow.material.opacity = (next / 2.1) * 0.5;
    // gentle sway
    p.lantern.rotation.z = Math.sin(this.time * 2.4) * 0.09;
    p.lantern.rotation.x = Math.sin(this.time * 1.9 + 1) * 0.06;
  }

  updateNpcInteraction() {
    let best = null;
    let bestD = 3.6;
    for (const n of this.npcs) {
      const d = Math.hypot(n.position.x - this.player.pos.x, n.position.z - this.player.pos.z);
      if (d < bestD) { bestD = d; best = n; }
    }
    if (best !== this.nearbyNpc) {
      this.nearbyNpc = best;
      this.onNearbyChange?.(best);
      const prompt = document.getElementById('prompt');
      if (prompt) {
        prompt.classList.toggle('hidden', !best);
        const txt = document.getElementById('prompt-text');
        if (txt && best) {
          // the prompt tells you what the villager is doing right now
          const villager = this.world?.villagers?.find((v) => v.id === best.userData.villagerId);
          const status = villager ? villagerStatus(villager) : '';
          txt.textContent = status
            ? `Поговорить — ${best.userData.spec.name} (${status})`
            : `Поговорить — ${best.userData.spec.name}`;
        }
      }
    }
  }

  updatePlace() {
    let found = null;
    for (const p of this.placeNames) {
      if (Math.hypot(p.x - this.player.pos.x, p.z - this.player.pos.z) < p.r) { found = p; break; }
    }
    if (found !== this.currentPlace) {
      this.currentPlace = found;
      this.onPlaceChange?.(found);
    }
  }

  updateLamps(dt, time) {
    const night = clamp(1 - (smoothstepLocal(5.4, 8.0, this.hours) * (1 - smoothstepLocal(17.6, 20.2, this.hours))), 0, 1);
    for (const lamp of this.lamps) {
      const ud = lamp.userData;
      const flick = 1 + Math.sin(time * 9 + ud.seed) * 0.03 + Math.sin(time * 23 + ud.seed * 2) * 0.02;
      const target = night * 9.0 * ud.flicker * flick;
      ud.emitter.intensity = damp(ud.emitter.intensity, target, 5, dt);
      ud.glow.material.opacity = damp(ud.glow.material.opacity, night * 0.55, 5, dt);
      ud.pool.material.opacity = damp(ud.pool.material.opacity, night * 0.26, 5, dt);
      ud.glassMat.emissiveIntensity = damp(ud.glassMat.emissiveIntensity, 0.2 + night * 2.6, 5, dt);
    }
    // window glow
    for (const h of this.houses) {
      const ud = h.userData;
      const spec = ud.spec;
      const lit = spec.lit ? night : 0;
      for (const w of ud.windows) {
        w.pane.material.emissiveIntensity = 0.25 + lit * 3.4;
      }
    }
    for (const h of this.houseLights) {
      const lit = h.spec.lit ? night : 0;
      h.emitter.intensity = damp(h.emitter.intensity, lit * 3.6, 4, dt);
    }
    // the light pool also drives the interior lamps of every house
    for (const e of this.interiorEmitters) {
      e.emitter.intensity = damp(e.emitter.intensity, e.lit ? night * 2.4 : 0, 4, dt);
    }
    this.lightPool.update(this.camera.position);
  }

  // Adaptive quality: if the device cannot keep up, step down the effects
  // instead of dropping the frame rate.
  adaptQuality(dt) {
    this._fpsAccum += dt;
    this._fpsFrames++;
    if (this._fpsAccum < 2) return;
    const fps = this._fpsFrames / this._fpsAccum;
    this._fpsAccum = 0;
    this._fpsFrames = 0;
    this.measuredFps = fps;
    if (fps < 24 && this.quality > 0) {
      this.quality--;
      this._qualityLocked = true;
      this.applyQuality();
    } else if (fps > 52 && this.quality < 2 && !this._qualityLocked) {
      this.quality++;
      this.applyQuality();
    }
  }

  applyQuality() {
    const q = this.quality;
    // q2 = full, q1 = no bloom, q0 = no bloom and no shadows
    this.settings.bloom = q >= 2;
    if (this.bloom) this.bloom.enabled = this.settings.bloom;
    document.getElementById('btn-bloom')?.classList.toggle('active', this.settings.bloom);
    this.renderer.shadowMap.enabled = q >= 1;
    if (this.sky?.sun) this.sky.sun.castShadow = q >= 1;
    this.renderer.setPixelRatio(q >= 2 ? Math.min(window.devicePixelRatio, 2) : 1);
    if (this.composer) this.composer.setSize(window.innerWidth, window.innerHeight);
    this.onToast?.(q >= 2 ? 'Качество: высокое' : q === 1 ? 'Качество: среднее' : 'Качество: низкое');
  }

  animate = () => {
    requestAnimationFrame(this.animate);
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.time += dt;

    // the village keeps its own rhythm: the world clock advances on its own
    // timer and everything - sky, lamps, villagers - follows it
    if (this.autoTime !== false) {
      this.hours = this.world.hours;
      this.updateClockLabel();
      const slider = document.getElementById('time-slider');
      if (slider) slider.value = this.hours;
    }

    this.updatePlayer(dt);
    // The world runs on its own clock, independent of the frame rate.
    this.worldBridge.playerPos = this.player.pos;
    this.worldBridge.update(dt, this.hours);
    // the world's clock is the village's clock
    this.hours = this.world.hours;
    this.updateNpcInteraction();
    this.updatePlace();
    this.updateNearbyPlace();
    this.updateLamps(dt, this.time);
    this.updatePlayerLantern(dt);
    this.adaptQuality(dt);
    this.sky.update(this.hours, this.player.pos, this.camera.getWorldDirection(new THREE.Vector3()), this.weather);
    this.fireflies.update(dt, this.hours);
    this.weather.update(dt, this.player.pos, this.hours);
    updateBirds(this.birds, dt, this.time, this.hours, this.player.pos);
    updateMist(this.mist, dt, this.time, this.hours);

    // living atmosphere
    const windStrength = 0.5 + (this.weather?.rainAmount ?? 0) * -0.4;
    updateLeaves(this.leaves, dt, this.time, this.player.pos, terrainHeight, 0.55 + windStrength * 0.4);
    updateButterflies(this.butterflies, dt, this.time, this.hours, this.player.pos);
    updateRipples(this.ripples, dt, this.time, this.player.pos, { x: 58, z: 44 }, 13);
    updateMotes(this.motes, dt, this.time, this.player.pos, terrainHeight);
    applyTreeSway(this.treeGroup, this.time, 1);

    // the cat and the simulation
    this.cat.update(dt, this.time, this.player.pos, this.sim);
    const moving = Math.hypot(this.player.vel.x, this.player.vel.z) > 0.4;
    this.sim.advance(dt, this.hours, moving, this.weather);
    this.catchFireflies();
    this.checkQuests();

    this.hudTimer += dt;
    if (this.hudTimer > 0.4) {
      this.hudTimer = 0;
      this.refreshHud();
    }

    if (this.ambience) {
      const nearWater = Math.hypot(this.player.pos.x - 56, this.player.pos.z - 42) < 26;
      this.ambience.update(this.hours, nearWater);
    }

    // bonfire flames
    if (this.bonfire) {
      const { flames, emitter } = this.bonfire;
      for (let i = 0; i < flames.children.length; i++) {
        const s = flames.children[i];
        const t = this.time * 3 + i * 1.7;
        s.scale.setScalar(0.4 + (0.5 + Math.sin(t) * 0.5) * 0.5);
        s.position.y = 0.45 + ((this.time * 0.55 + i * 0.19) % 0.85);
        s.material.opacity = 0.75 * (1 - ((this.time * 0.55 + i * 0.19) % 0.85) / 0.85);
        s.material.color.setHex(Math.sin(t * 1.3) > 0 ? 0xffb04a : 0xff7a2a);
      }
      emitter.intensity = 5.5 + Math.sin(this.time * 9) * 0.9 + Math.sin(this.time * 21) * 0.4;
    }
    // garlands: little lanterns that glow after dark
    if (this.garlands?.length) {
      const gnight = clamp(1 - (smoothstepLocal(5.4, 8.0, this.hours) * (1 - smoothstepLocal(17.6, 20.2, this.hours))), 0, 1);
      for (const g of this.garlands) {
        for (const l of g.lanterns) {
          const flick = 1 + Math.sin(this.time * 3 + l.phase) * 0.08;
          l.mesh.material.emissiveIntensity = 0.2 + gnight * 0.9 * flick;
          l.glow.material.opacity = gnight * 0.14 * flick;
        }
        g.emitter.intensity = damp(g.emitter.intensity, gnight * 3.5, 4, dt);
      }
    }

    // windmill
    if (this.spinner) this.spinner.rotation.z += dt * 0.35;

    // chimney smoke: strongest in the cold evening hours
    const smokeStrength = 0.35 + (1 - Math.min(1, Math.abs(this.hours - 19) / 6)) * 0.75;
    for (const h of this.houses) {
      const smoke = h.userData.smoke;
      if (smoke) updateSmoke(smoke, dt, this.time + h.userData.seed, smokeStrength);
      const cloth = h.userData.cloth;
      if (cloth) {
        for (const c of cloth) c.rotation.z = Math.sin(this.time * 1.6 + c.id) * 0.06;
      }
    }

    // boat bob
    if (this.boat) {
      this.boat.position.y = -0.15 + Math.sin(this.time * 0.8) * 0.06;
      this.boat.rotation.z = Math.sin(this.time * 0.6) * 0.04;
    }

    if (this.composer && this.settings.bloom) this.composer.render();
    else this.renderer.render(this.scene, this.camera);

    this.updateStats(dt);
  };

  updateStats(dt) {
    this._statTimer = (this._statTimer ?? 0) + dt;
    if (this._statTimer < 0.35) return;
    this._statTimer = 0;
    const el = document.getElementById('stat-people');
    if (el) {
      let n = 0;
      for (const npc of this.npcs) {
        if (Math.hypot(npc.position.x - this.player.pos.x, npc.position.z - this.player.pos.z) < 22) n++;
      }
      el.textContent = n;
    }
    const h = document.getElementById('stat-houses');
    if (h) h.textContent = this.layout.houses.length;
  }

  // ---- HUD for the life simulation ----
  refreshHud() {
    const sim = this.sim;
    const coins = document.getElementById('stat-coins');
    if (coins) coins.textContent = sim.coins;
    const day = document.getElementById('stat-day');
    if (day) day.textContent = sim.day;
    const quests = document.getElementById('stat-quests');
    if (quests) quests.textContent = sim.done.size;

    // needs
    const bars = document.getElementById('needs-bars');
    if (bars && !bars.children.length) {
      for (const def of NEED_DEFS) {
        const row = document.createElement('div');
        row.className = 'need-row';
        row.dataset.need = def.key;
        row.innerHTML = `<span>${def.label}</span><span class="need-bar"><i style="background:${def.color}"></i></span><span class="need-val">0</span>`;
        bars.appendChild(row);
      }
    }
    if (bars) {
      for (const def of NEED_DEFS) {
        const row = bars.querySelector(`[data-need="${def.key}"]`);
        if (!row) continue;
        const v = sim.needs[def.key] ?? 0;
        row.querySelector('i').style.width = `${Math.round(v)}%`;
        row.querySelector('.need-val').textContent = Math.round(v);
        row.classList.toggle('low', v < 25);
      }
    }

    // inventory
    const inv = document.getElementById('inventory');
    if (inv) {
      const entries = Object.entries(sim.inventory).filter(([, n]) => n > 0);
      if (!entries.length) {
        inv.innerHTML = '<span class="inv-empty">Сумка пуста</span>';
      } else {
        inv.innerHTML = entries.map(([k, n]) =>
          `<span class="inv-item">${ITEM_DEFS[k]?.short || k}<b>${n}</b></span>`
        ).join('');
      }
    }

    // quest list
    const list = document.getElementById('quest-list');
    if (list) {
      list.innerHTML = QUESTS.map((q) => {
        const p = sim.questProgress(q);
        const done = sim.questDone(q);
        return `<div class="quest-row ${done ? 'done' : ''}"><i>${done ? '✓' : `${p}/${q.goal}`}</i><span>${q.title}<br><em style="font-style:normal;opacity:.65">${q.desc}</em></span></div>`;
      }).join('');
    }

    // journal: the village chronicle plus the player's own notes
    const journal = document.getElementById('journal-list');
    if (journal) {
      const own = sim.journal.map((e) => ({ text: e.text, kind: 'own', day: e.day, time: 0, minute: 0 }));
      const world = (this.world?.chronicle ?? []).map((c) => ({ ...c, kind: c.kind }));
      const all = [...world, ...own].slice(0, 24);
      if (!all.length) {
        journal.innerHTML = '<div class="journal-row">Пока пусто. Жизнь впереди.</div>';
      } else {
        journal.innerHTML = all.map((e) =>
          `<div class="journal-row ${e.kind}"><b>Д${e.day}</b>${e.text}</div>`
        ).join('');
      }
    // people list: who is doing what right now
    const people = document.getElementById('people-list');
    if (people && this.world) {
      people.innerHTML = this.world.villagers.map((v) => {
        const status = villagerStatus(v);
        const rel = this.world.relation(0, v.id);
        const badge = rel.value > 25 ? '<span class="badge">друг</span>'
          : rel.value < -25 ? '<span class="badge">недруг</span>' : '';
        return `<div class="person-row"><b>${v.name}</b><em>${status}</em>${badge}</div>`;
      }).join('');
    }
  }

  // world status panel
    const wDay = document.getElementById('world-day');
    if (wDay) wDay.textContent = this.world?.day ?? 1;
    const wWx = document.getElementById('world-weather');
    if (wWx) {
      wWx.textContent = { clear: 'ясно', rain: 'дождь', fog: 'туман' }[this.world?.weather?.kind] ?? 'ясно';
    }
    const wPeople = document.getElementById('world-people');
    if (wPeople) wPeople.textContent = this.world?.villagers?.length ?? 0;
    // how many villagers the player is on good terms with
    const wFriends = document.getElementById('world-friends');
    if (wFriends && this.world) {
      let n = 0;
      for (const [k, r] of this.world.relationships) {
        if (r.value > 25 && (k.startsWith('0|') || k.endsWith('|0'))) n++;
      }
      wFriends.textContent = n;
    }
    const fest = this.world?.festival;
    const festRow = document.getElementById('world-festival-row');
    const festEl = document.getElementById('world-festival');
    if (festRow && festEl) {
      festRow.style.display = fest ? '' : 'none';
      if (fest) festEl.textContent = fest.name;
    }
  }

  // Fireflies can be caught at night by walking right into them.
  catchFireflies() {
    const sim = this.sim;
    if (sim.stats.caught >= 5) return;
    const night = this.hours < 6 || this.hours > 18.4;
    if (!night) return;
    const pts = this.fireflies.points;
    if (!pts.visible) return;
    const pos = pts.geometry.attributes.position;
    const p = this.player.pos;
    const arr = pos.array;
    for (let i = 0; i < arr.length; i += 3) {
      const dx = arr[i] - p.x;
      const dy = arr[i + 1] - (p.y + 1.2);
      const dz = arr[i + 2] - p.z;
      if (dx * dx + dy * dy + dz * dz < 1.4) {
        // caught: pull the firefly out of the swarm
        arr[i + 1] = -900;
        sim.stats.caught += 1;
        sim.needs.mood = clamp(sim.needs.mood + 4, 0, 100);
        this.onToast?.(`Светлячок в банке: ${sim.stats.caught}/5`);
        break;
      }
    }
  }

  // Finds the closest place the player can interact with and shows a hint.
  updateNearbyPlace() {
    const place = nearestInteractable(this.interactables, this.player.pos);
    if (place !== this.nearbyPlace) {
      this.nearbyPlace = place;
      const el = document.getElementById('prompt-place');
      const txt = document.getElementById('prompt-place-text');
      if (el) {
        el.classList.toggle('hidden', !place);
        if (place && txt) txt.textContent = place.label;
      }
    }
  }
}

function smoothstepLocal(e0, e1, x) {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

// ---------------- Boot ----------------
const loadingEl = document.getElementById('loading');
const barEl = document.getElementById('loading-bar');
const statusEl = document.getElementById('loading-status');

function setProgress(p, text) {
  if (barEl) barEl.style.width = `${Math.round(p * 100)}%`;
  if (text && statusEl) statusEl.textContent = text;
}

async function boot() {
  setProgress(0.15, 'Разжигаем фонари…');
  await new Promise((r) => setTimeout(r, 60));
  setProgress(0.45, 'Строим домики…');
  await new Promise((r) => setTimeout(r, 60));
  setProgress(0.75, 'Расставляем светлячков…');
  await new Promise((r) => setTimeout(r, 60));

  const village = new Village(document.getElementById('scene'));
  window.village = village;
  village.setTime(village.hours);

  // HUD wiring
  const hud = document.getElementById('hud');
  hud.classList.remove('hidden');

  village.onPlaceChange = (place) => {
    document.getElementById('place-name').textContent = place ? place.name : 'Деревня';
    document.getElementById('place-sub').textContent = place ? place.sub : 'Гуляйте, куда зовёт сердце';
  };
  village.onToast = (msg) => {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.remove('hidden');
    clearTimeout(village._toastTimer);
    village._toastTimer = setTimeout(() => t.classList.add('hidden'), 2200);
  };
  village.onTalk = (spec, line) => {
    const b = document.getElementById('bubble');
    document.getElementById('bubble-text').textContent = line;
    document.getElementById('bubble-name').textContent = spec.name;
    b.classList.remove('hidden');
    clearTimeout(village._bubbleTimer);
    village._bubbleTimer = setTimeout(() => b.classList.add('hidden'), 5200);
  };

  // quest panel toggle
  const questPanel = document.getElementById('quest-panel');
  document.getElementById('btn-quests')?.addEventListener('click', () => {
    questPanel.classList.toggle('hidden');
    document.getElementById('journal-panel')?.classList.add('hidden');
  });
  const journalPanel = document.getElementById('journal-panel');
  document.getElementById('btn-journal')?.addEventListener('click', () => {
    journalPanel.classList.toggle('hidden');
    questPanel.classList.add('hidden');
  });

  // start the village from scratch
  document.getElementById('btn-reset')?.addEventListener('click', () => {
    clearWorld();
    village.onToast?.('Деревня началась заново. Перезагрузите страницу.');
    setTimeout(() => window.location.reload(), 900);
  });

  // the list of villagers
  const peoplePanel = document.getElementById('people-panel');
  document.getElementById('btn-people')?.addEventListener('click', () => {
    peoplePanel.classList.toggle('hidden');
  });

  // shop window
  const shopEl = document.getElementById('shop');
  document.getElementById('shop-close')?.addEventListener('click', () => village.closeShop());
  village.onShop = (shopId) => {
    if (!shopId) {
      shopEl.classList.add('hidden');
      return;
    }
    const shop = shopList(shopId);
    document.getElementById('shop-title').textContent = shop.title;
    document.getElementById('shop-greeting').textContent = shop.greeting;
    renderShopItems('shop-buy', shop.stock, false);
    renderShopItems('shop-sell', shop.buys, true);
    shopEl.classList.remove('hidden');
  };

  function renderShopItems(containerId, items, isSell) {
    const box = document.getElementById(containerId);
    if (!box) return;
    box.innerHTML = '';
    for (const item of items) {
      const btn = document.createElement('button');
      btn.className = 'shop-item';
      const have = village.sim.hasItem(item.id);
      btn.innerHTML = `<span>${ITEM_DEFS[item.id]?.label || item.id}<em>${item.desc}</em></span><b>${item.price}</b>`;
      if (isSell && !have) btn.disabled = true;
      btn.addEventListener('click', () => {
        const res = isSell ? sellItem(village.shopOpen, item.id, village.sim) : buyItem(village.shopOpen, item.id, village.sim);
        village.onToast?.(res.message);
        village.refreshHud();
        village.checkQuests();
        if (village.shopOpen) village.onShop(village.shopOpen);
      });
      box.appendChild(btn);
    }
  }

  // ---- the return report: what happened while the game was closed ----
  const returnCard = document.getElementById('return-card');
  document.getElementById('return-close')?.addEventListener('click', () => {
    returnCard.classList.add('hidden');
  });
  const summary = village.worldBridge.catchUpSummary;
  if (summary && summary.ticks > 0) {
    const lines = village.worldBridge.offlineReport();
    document.getElementById('return-title').textContent = 'Пока вас не было';
    document.getElementById('return-body').innerHTML = lines
      .map((l) => `<div>${l}</div>`)
      .join('');
    returnCard.classList.remove('hidden');
  }

  village.refreshHud();

  setProgress(1, 'Готово');
  await new Promise((r) => setTimeout(r, 320));
  loadingEl.classList.add('done');
  setTimeout(() => loadingEl.remove(), 700);

  village.onToast?.('Добро пожаловать в Тихую Деревню. Иди приветствовать соседей (E).');
}

boot();
