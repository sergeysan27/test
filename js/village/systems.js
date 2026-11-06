import * as THREE from 'three';
import { WORLD, skyStateFor, phaseForTime, PALETTE } from './config.js';
import { clamp, lerp, smoothstep } from './util.js';

export class SkySystem {
  constructor(scene) {
    this.scene = scene;
    const geo = new THREE.SphereGeometry(400, 32, 20);
    this.material = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        topColor: { value: new THREE.Color(0x1d2747) },
        bottomColor: { value: new THREE.Color(0x5a4560) },
        offset: { value: 20 },
        exponent: { value: 0.6 },
        sunDir: { value: new THREE.Vector3(0.3, 0.4, 0.6) },
        sunColor: { value: new THREE.Color(0xffb277) },
        sunSize: { value: 0.004 },
        starAmount: { value: 0 },
      },
      vertexShader: `
        varying vec3 vWorldPosition;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorldPosition = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 bottomColor;
        uniform vec3 sunColor;
        uniform vec3 sunDir;
        uniform float offset;
        uniform float exponent;
        uniform float sunSize;
        uniform float starAmount;
        varying vec3 vWorldPosition;

        float hash(vec3 p) {
          p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
          p *= 17.0;
          return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
        }

        void main() {
          vec3 dir = normalize(vWorldPosition - cameraPosition);
          float h = clamp(dir.y * 0.5 + 0.5, 0.0, 1.0);
          vec3 col = mix(bottomColor, topColor, pow(max(h - offset, 0.0) / (1.0 - offset), exponent));

          // sun / moon disc + halo
          float sunDot = dot(dir, normalize(sunDir));
          float disc = smoothstep(1.0 - sunSize, 1.0 - sunSize * 0.4, sunDot);
          float halo = pow(max(sunDot, 0.0), 90.0) * 0.5 + pow(max(sunDot, 0.0), 8.0) * 0.12;
          col += sunColor * (disc * 1.6 + halo);

          // stars
          if (starAmount > 0.001) {
            vec3 sp = floor(dir * 220.0);
            float s = hash(sp);
            float twinkle = step(0.9975, s) * starAmount;
            float tw = 0.6 + 0.4 * sin(s * 100.0);
            col += vec3(0.85, 0.9, 1.0) * twinkle * tw * smoothstep(-0.05, 0.25, dir.y);
          }

          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);

    // lights
    this.hemi = new THREE.HemisphereLight(0x9fb8d8, 0x3b4a2e, 0.5);
    scene.add(this.hemi);

    this.sun = new THREE.DirectionalLight(0xffd9a0, 1.0);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1536, 1536);
    const cam = this.sun.shadow.camera;
    cam.near = 1;
    cam.far = 160;
    cam.left = -48;
    cam.right = 48;
    cam.top = 48;
    cam.bottom = -48;
    this.sun.shadow.bias = -0.0012;
    this.sun.shadow.normalBias = 0.045;
    scene.add(this.sun);
    scene.add(this.sun.target);

    // player lamp (warm light travelling with the camera)
    this.playerLight = new THREE.PointLight(0xffbe78, 0, 14, 2);
    scene.add(this.playerLight);

    // directional fill: keeps night readable without killing the mood
    this.fill = new THREE.DirectionalLight(0x8fa8d8, 0.2);
    this.fill.position.set(-40, 30, 25);
    scene.add(this.fill);
    scene.add(this.fill.target);
  }

  update(hours, playerPos, cameraDir, weather = null) {
    const st = skyStateFor(hours);
    this.material.uniforms.topColor.value.setHex(st.top);
    this.material.uniforms.bottomColor.value.setHex(st.bottom);
    this.material.uniforms.sunColor.value.setHex(st.sun);

    const dayAmount = smoothstep(5.4, 8.0, hours) * (1 - smoothstep(17.6, 20.2, hours));
    const nightAmount = 1 - dayAmount;

    // sun path
    const ang = ((hours - 6) / 24) * Math.PI * 2;
    const elevation = Math.sin(ang);
    const dir = new THREE.Vector3(Math.cos(ang) * 0.55, Math.max(elevation, -0.4), Math.sin(ang) * 0.35 + 0.25).normalize();
    this.material.uniforms.sunDir.value.copy(dir);
    this.material.uniforms.starAmount.value = clamp(nightAmount * 1.2 - 0.15, 0, 1);
    this.material.uniforms.exponent.value = lerp(0.55, 0.75, dayAmount);

    // sun light
    this.sun.position.copy(playerPos).add(dir.clone().multiplyScalar(70));
    this.sun.target.position.copy(playerPos);
    this.sun.intensity = lerp(0.25, 2.6, dayAmount) * (elevation > -0.1 ? 1 : 0.25) * (1 - (weather?.rainAmount ?? 0) * 0.55);
    this.sun.color.setHex(st.sun);
    this.sun.visible = dayAmount > 0.02;

    // ambient
    this.hemi.color.setHex(st.amb);
    this.hemi.groundColor.setHex(0x4a5a3a);
    this.hemi.intensity = st.ambI * 1.9;

    // soft night fill so silhouettes keep their shape
    this.fill.color.setHex(st.amb);
    this.fill.intensity = lerp(0.12, 0.55, nightAmount);

    // fog
    const rainAmount = weather?.rainAmount ?? 0;
    const fogAmount = weather?.fogAmount ?? 0;
    const fogColor = new THREE.Color(st.fog);
    if (rainAmount > 0.02) fogColor.lerp(new THREE.Color(0x8fa0b0), rainAmount * 0.5);
    if (fogAmount > 0.02) fogColor.lerp(new THREE.Color(0xc4d0dc), fogAmount * 0.6);
    if (!this.scene.fog) this.scene.fog = new THREE.Fog(fogColor, 40, 190);
    this.scene.fog.color.copy(fogColor);
    this.scene.fog.near = lerp(28, 55, dayAmount) * (1 - fogAmount * 0.75) * (1 - rainAmount * 0.35);
    this.scene.fog.far = lerp(150, 230, dayAmount) * (1 - fogAmount * 0.55) * (1 - rainAmount * 0.3);

    // player warm light at night
    this.playerLight.position.copy(playerPos).add(new THREE.Vector3(0, 2.4, 0));
    this.playerLight.intensity = lerp(0.6, 5.5, nightAmount);
    this.playerLight.distance = lerp(14, 26, nightAmount);

    // fill follows the player so night shapes stay readable
    this.fill.position.copy(playerPos).add(new THREE.Vector3(-30, 26, 20));
    this.fill.target.position.copy(playerPos);
    this.fill.target.updateMatrixWorld();
  }
}

export class WeatherSystem {
  constructor(scene) {
    this.scene = scene;
    // rain: short streaks rather than dots
    const count = 2200;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 90;
      pos[i * 3 + 1] = Math.random() * 40;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 90;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.rain = new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0xe8f2ff, size: 0.42, transparent: true, opacity: 0.5, depthWrite: false,
      map: rainTexture(),
    }));
    this.rain.visible = false;
    this.rain.frustumCulled = false;
    scene.add(this.rain);

    // fog banks
    this.fogBanks = new THREE.Group();
    const fogTex = makeFogTexture();
    for (let i = 0; i < 14; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({
        map: fogTex, transparent: true, opacity: 0.0, depthWrite: false, color: 0xc8d4e0,
      }));
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * 80;
      s.position.set(Math.cos(a) * r, 1.2 + Math.random() * 2.4, Math.sin(a) * r);
      s.scale.set(26, 8, 1);
      this.fogBanks.add(s);
    }
    scene.add(this.fogBanks);

    this.rainAmount = 0;
    this.fogAmount = 0;
  }

  set(rain, fog) {
    this.rainAmount = rain;
    this.fogAmount = fog;
    this.rain.visible = rain > 0.01;
  }

  update(dt, playerPos, hours) {
    if (this.rainAmount > 0.01) {
      const pos = this.rain.geometry.attributes.position;
      const arr = pos.array;
      const fall = dt * 14 * (0.6 + this.rainAmount * 0.6);
      for (let i = 0; i < arr.length; i += 3) {
        arr[i + 1] -= fall;
        arr[i] += dt * 1.8;
        if (arr[i + 1] < 0) {
          arr[i + 1] = 34;
          arr[i] = playerPos.x + (Math.random() - 0.5) * 60;
          arr[i + 2] = playerPos.z + (Math.random() - 0.5) * 60;
        }
      }
      pos.needsUpdate = true;
      this.rain.material.opacity = 0.55 * this.rainAmount;
    }
    const nightish = 1 - smoothstep(5.5, 8.5, hours) * (1 - smoothstep(17.5, 20, hours));
    for (const s of this.fogBanks.children) {
      s.material.opacity = this.fogAmount * 0.3 * (0.4 + nightish * 0.6);
      s.position.x += dt * 0.35;
      if (s.position.x > 90) s.position.x = -90;
    }
  }
}

function rainTexture() {
  const c = document.createElement('canvas');
  c.width = 16;
  c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 64);
  grad.addColorStop(0, 'rgba(255,255,255,0)');
  grad.addColorStop(0.35, 'rgba(235,245,255,0.95)');
  grad.addColorStop(0.8, 'rgba(220,235,250,0.6)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(5, 0, 6, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeFogTexture() {  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(128, 128, 10, 128, 128, 128);
  grad.addColorStop(0, 'rgba(255,255,255,0.55)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.22)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class FireflySystem {
  constructor(points) {
    this.points = points;
    this.enabled = true;
    this.time = 0;
  }

  update(dt, hours) {
    const night = clamp(1 - smoothstep(4.8, 8.0, hours) * (1 - smoothstep(17.4, 20.4, hours)), 0, 1);
    const target = this.enabled ? night : 0;
    const m = this.points.material;
    m.opacity += (target * 0.95 - m.opacity) * Math.min(1, dt * 2);
    this.points.visible = m.opacity > 0.01;
    if (!this.points.visible) return;
    this.time += dt;
    const pos = this.points.geometry.attributes.position;
    const arr = pos.array;
    const homes = this.points.userData.homes;
    for (let i = 0; i < homes.length; i++) {
      const h = homes[i];
      const t = this.time * h.speed + h.phase;
      arr[i * 3] = h.x + Math.sin(t) * h.radius;
      arr[i * 3 + 1] = h.y + Math.sin(t * 1.7) * 0.5;
      arr[i * 3 + 2] = h.z + Math.cos(t * 0.8) * h.radius;
    }
    pos.needsUpdate = true;
  }
}
