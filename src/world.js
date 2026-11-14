import * as THREE from 'three';

// ─────────────────────────────────────────────────────────────
// Ship layout. All rooms and corridors are axis-aligned boxes
// defined in world units (1 unit ≈ 1 metre). Corridors overlap
// their rooms so the walkable union has no cracks at the seams.
// ─────────────────────────────────────────────────────────────

// The hub is the only compartment sized to the original drawing. Every bay
// sits BAY_EXT metres further out, which turns each 12 m link into a 20 m
// corridor — long enough that the far doorway is a shape, not a wall.
export const BAY_EXT = 8;
const HUB_HALF = 7;

// Push a world coordinate out to wherever its compartment now sits. Anything
// already beyond the hub moves; anything inside it stays put.
export function outCoord(value) {
  if (value > HUB_HALF) return value + BAY_EXT;
  if (value < -HUB_HALF) return value - BAY_EXT;
  return value;
}

// Same idea for a whole point: a prop belongs to one compartment, so only the
// axis that compartment was pushed along moves. Shifting both would drag a
// reactor valve sideways out through the wall.
export function outPoint(x, z) {
  const ax = Math.abs(x) > HUB_HALF ? Math.abs(x) - HUB_HALF : 0;
  const az = Math.abs(z) > HUB_HALF ? Math.abs(z) - HUB_HALF : 0;

  if (!ax && !az) return { x, z };
  if (ax >= az) return { x: x + Math.sign(x) * BAY_EXT, z };
  return { x, z: z + Math.sign(z) * BAY_EXT };
}

export const LAYOUT = {
  hub: { minX: -7, maxX: 7, minZ: -7, maxZ: 7, label: 'CENTRAL HUB', accent: 0x63d7ff },
  corridorN: { minX: -2.5, maxX: 2.5, minZ: -27, maxZ: -7, label: 'CORRIDOR NORTH', accent: 0x3f8499 },
  reactor: { minX: -10, maxX: 10, minZ: -41, maxZ: -27, label: 'REACTOR BAY', accent: 0xff6a32 },
  corridorE: { minX: 7, maxX: 27, minZ: -2.5, maxZ: 2.5, label: 'CORRIDOR EAST', accent: 0x3f8499 },
  med: { minX: 27, maxX: 41, minZ: -8, maxZ: 8, label: 'HYDRO BAY', accent: 0x59f0b0 },
  corridorW: { minX: -27, maxX: -7, minZ: -2.5, maxZ: 2.5, label: 'CORRIDOR WEST', accent: 0x3f8499 },
  nav: { minX: -41, maxX: -27, minZ: -8, maxZ: 8, label: 'NAV / COMMS', accent: 0x6f93ff },
  corridorS: { minX: -2.5, maxX: 2.5, minZ: 7, maxZ: 27, label: 'CORRIDOR SOUTH', accent: 0x3f8499 },
  escape: { minX: -9, maxX: 9, minZ: 27, maxZ: 41, label: 'ESCAPE BAY', accent: 0xa8e6ff },
};

// Collision uses the room boxes plus corridors pushed one metre into
// each adjoining room, so the inset-by-player-radius test always has
// an overlap at the seams and doorway thresholds stay passable.
const COLLISION_OVERLAP = 1.0;
export const WALKABLE = Object.entries(LAYOUT).map(([key, rect]) => {
  if (key === 'corridorN' || key === 'corridorS') {
    return { ...rect, minZ: rect.minZ - COLLISION_OVERLAP, maxZ: rect.maxZ + COLLISION_OVERLAP };
  }
  if (key === 'corridorE' || key === 'corridorW') {
    return { ...rect, minX: rect.minX - COLLISION_OVERLAP, maxX: rect.maxX + COLLISION_OVERLAP };
  }
  return rect;
});

const WALL_H = 3.4;
const WALL_T = 0.3;

export function roomAt(x, z) {
  for (const [key, r] of Object.entries(LAYOUT)) {
    if (x > r.minX && x < r.maxX && z > r.minZ && z < r.maxZ) return key;
  }
  return 'hub';
}

// ─────────────────────────────────────────────────────────────
// small canvas helpers
// ─────────────────────────────────────────────────────────────

function makeCanvas(w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return [canvas, canvas.getContext('2d')];
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w * 0.5, h * 0.5);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}

function canvasTexture(canvas) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// ─────────────────────────────────────────────────────────────
// floating interaction labels
// ─────────────────────────────────────────────────────────────

export function makeLabelSprite(text, color = '#8fe3ff', width = 1.15) {
  const w = 320;
  const h = 128;
  const [canvas, ctx] = makeCanvas(w, h);

  const draw = (value, tint) => {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(2,7,11,0.76)';
    roundRect(ctx, 12, 36, w - 24, 58, 10);
    ctx.fill();
    ctx.strokeStyle = tint;
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = tint;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const label = String(value).toUpperCase();
    let size = 30;
    ctx.font = `600 ${size}px ui-monospace, "SF Mono", Menlo, monospace`;
    while (ctx.measureText(label).width > w - 54 && size > 16) {
      size -= 2;
      ctx.font = `600 ${size}px ui-monospace, "SF Mono", Menlo, monospace`;
    }
    ctx.fillText(label, w / 2, 66);
  };

  draw(text, color);

  const texture = canvasTexture(canvas);
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    fog: true,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(width, width * 0.4, 1);
  sprite.center.set(0.5, 0.5);

  const setText = (value, tint = color) => {
    draw(value, tint);
    texture.needsUpdate = true;
  };
  sprite.setText = setText;
  sprite.userData.setText = setText;
  return sprite;
}

// ─────────────────────────────────────────────────────────────
// scrawled wall text
// ─────────────────────────────────────────────────────────────

export function makeScrawlTexture(lines, color = '#7996a6') {
  const [canvas, ctx] = makeCanvas(1024, 512);
  ctx.clearRect(0, 0, 1024, 512);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';

  lines.forEach((line, li) => {
    const size = li === 0 ? 92 : 54;
    ctx.font = `700 ${size}px ui-monospace, Menlo, monospace`;
    let x = 54;
    const y = 120 + li * 130;
    [...line].forEach((ch) => {
      const jx = (Math.random() - 0.5) * 7;
      const jy = (Math.random() - 0.5) * 8;
      ctx.save();
      ctx.translate(x + jx, y + jy);
      ctx.rotate((Math.random() - 0.5) * 0.06);
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.55 + Math.random() * 0.35;
      ctx.fillText(ch, 0, 0);
      ctx.restore();
      x += ctx.measureText(ch).width + (Math.random() * 8 - 2);
    });
  });

  // scratches / drips
  ctx.strokeStyle = color;
  for (let i = 0; i < 26; i += 1) {
    ctx.globalAlpha = 0.08 + Math.random() * 0.2;
    ctx.lineWidth = 1 + Math.random() * 2;
    ctx.beginPath();
    const sx = Math.random() * 1024;
    const sy = Math.random() * 512;
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + (Math.random() - 0.5) * 60, sy + 20 + Math.random() * 120);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  return canvasTexture(canvas);
}

// ─────────────────────────────────────────────────────────────
// hull cracks and dried blood
// ─────────────────────────────────────────────────────────────

function makeWeldTexture() {
  const [canvas, ctx] = makeCanvas(256, 256);
  ctx.clearRect(0, 0, 256, 256);

  ctx.fillStyle = 'rgba(54, 62, 70, 0.94)';
  roundRect(ctx, 34, 30, 188, 196, 18);
  ctx.fill();

  ctx.strokeStyle = 'rgba(150, 164, 176, 0.7)';
  ctx.lineWidth = 4;
  roundRect(ctx, 34, 30, 188, 196, 18);
  ctx.stroke();

  // weld beads across the plate
  ctx.strokeStyle = 'rgba(200, 212, 222, 0.5)';
  ctx.lineWidth = 6;
  ctx.setLineDash([7, 6]);
  ctx.beginPath();
  ctx.moveTo(48, 118);
  ctx.lineTo(208, 118);
  ctx.moveTo(128, 42);
  ctx.lineTo(128, 214);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = 'rgba(214, 226, 236, 0.6)';
  [[52, 48], [204, 48], [52, 208], [204, 208]].forEach(([x, y]) => {
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fill();
  });

  return canvasTexture(canvas);
}

function makeCrackTexture() {
  const [canvas, ctx] = makeCanvas(512, 512);
  ctx.clearRect(0, 0, 512, 512);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const branch = (x, y, angle, length, width, depth) => {
    if (depth <= 0 || length < 7) return;
    const nx = x + Math.cos(angle) * length;
    const ny = y + Math.sin(angle) * length;

    ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    ctx.lineWidth = width + 3;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(nx, ny);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(216,234,246,0.94)';
    ctx.lineWidth = width + 0.8;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(nx, ny);
    ctx.stroke();

    if (Math.random() < 0.82) branch(nx, ny, angle + (Math.random() - 0.5) * 0.75, length * 0.62, width * 0.66, depth - 1);
    if (Math.random() < 0.5) branch(nx, ny, angle + 0.55 + Math.random() * 0.5, length * 0.44, width * 0.55, depth - 1);
    if (Math.random() < 0.35) branch(nx, ny, angle - 0.6 - Math.random() * 0.5, length * 0.4, width * 0.5, depth - 1);
  };

  branch(256, 500, -Math.PI / 2 + 0.08, 110, 3.2, 4);
  branch(200, 470, -1.05, 80, 2.2, 3);
  branch(320, 480, -1.9, 85, 2.4, 3);
  branch(256, 300, -1.35, 60, 1.4, 2);

  for (let i = 0; i < 30; i += 1) {
    ctx.strokeStyle = `rgba(180,200,215,${0.06 + Math.random() * 0.12})`;
    ctx.lineWidth = 0.6;
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (Math.random() - 0.5) * 40, y + (Math.random() - 0.5) * 40);
    ctx.stroke();
  }

  return canvasTexture(canvas);
}

function makeBloodTexture() {
  const [canvas, ctx] = makeCanvas(512, 512);
  ctx.clearRect(0, 0, 512, 512);

  for (let i = 0; i < 24; i += 1) {
    const x = 256 + (Math.random() - 0.5) * 300;
    const y = 180 + Math.random() * 220;
    const r = 8 + Math.random() * 42;
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, 'rgba(92,8,12,0.9)');
    grad.addColorStop(0.6, 'rgba(60,4,8,0.55)');
    grad.addColorStop(1, 'rgba(30,0,4,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  for (let i = 0; i < 12; i += 1) {
    const x = 180 + Math.random() * 150;
    const y = 80 + Math.random() * 200;
    const len = 30 + Math.random() * 130;
    ctx.strokeStyle = `rgba(80,6,10,${0.35 + Math.random() * 0.4})`;
    ctx.lineWidth = 2 + Math.random() * 5;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.bezierCurveTo(x + 4, y + len * 0.4, x - 3, y + len * 0.7, x + 2, y + len);
    ctx.stroke();
  }

  return canvasTexture(canvas);
}

// ─────────────────────────────────────────────────────────────
// metal floor plates
// ─────────────────────────────────────────────────────────────

function makeFloorTexture() {
  const [canvas, ctx] = makeCanvas(512, 512);
  ctx.fillStyle = '#0d1117';
  ctx.fillRect(0, 0, 512, 512);

  for (let i = 0; i < 4; i += 1) {
    for (let j = 0; j < 4; j += 1) {
      const shade = Math.random();
      ctx.fillStyle = `rgb(${18 + shade * 9},${23 + shade * 10},${30 + shade * 12})`;
      ctx.fillRect(i * 128 + 3, j * 128 + 3, 122, 122);
    }
  }

  ctx.strokeStyle = 'rgba(70,92,110,0.32)';
  ctx.lineWidth = 2;
  for (let i = 0; i <= 4; i += 1) {
    ctx.beginPath();
    ctx.moveTo(i * 128, 0);
    ctx.lineTo(i * 128, 512);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i * 128);
    ctx.lineTo(512, i * 128);
    ctx.stroke();
  }

  // bolts
  ctx.fillStyle = 'rgba(120,145,165,0.3)';
  for (let i = 0; i < 4; i += 1) {
    for (let j = 0; j < 4; j += 1) {
      [[10, 10], [118, 10], [10, 118], [118, 118]].forEach(([ox, oy]) => {
        ctx.beginPath();
        ctx.arc(i * 128 + ox, j * 128 + oy, 2.4, 0, Math.PI * 2);
        ctx.fill();
      });
    }
  }

  // grime and rust
  for (let i = 0; i < 46; i += 1) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const r = 8 + Math.random() * 54;
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
    const rust = Math.random() > 0.55;
    grad.addColorStop(0, rust ? 'rgba(112,58,26,0.18)' : 'rgba(0,0,0,0.3)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  const tex = canvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function makeHazardTexture() {
  const [canvas, ctx] = makeCanvas(256, 64);
  ctx.fillStyle = 'rgba(10,10,10,0.9)';
  ctx.fillRect(0, 0, 256, 64);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, 256, 64);
  ctx.clip();
  ctx.fillStyle = 'rgba(196,158,46,0.85)';
  for (let x = -64; x < 300; x += 44) {
    ctx.beginPath();
    ctx.moveTo(x, 64);
    ctx.lineTo(x + 22, 0);
    ctx.lineTo(x + 44, 0);
    ctx.lineTo(x + 22, 64);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  // wear
  ctx.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 90; i += 1) {
    ctx.globalAlpha = 0.3 + Math.random() * 0.6;
    ctx.beginPath();
    ctx.arc(Math.random() * 256, Math.random() * 64, Math.random() * 7, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  const tex = canvasTexture(canvas);
  return tex;
}

function makeStarTexture() {
  const [canvas, ctx] = makeCanvas(1024, 512);
  const sky = ctx.createLinearGradient(0, 0, 1024, 512);
  sky.addColorStop(0, '#010207');
  sky.addColorStop(0.45, '#050a14');
  sky.addColorStop(1, '#02040a');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, 1024, 512);

  // nebulae
  const nebulae = [
    [250, 190, 340, 'rgba(46,24,86,0.55)'],
    [700, 320, 420, 'rgba(12,54,72,0.45)'],
    [880, 120, 260, 'rgba(70,18,54,0.35)'],
  ];
  nebulae.forEach(([x, y, r, color]) => {
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, color);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  });

  for (let i = 0; i < 620; i += 1) {
    const x = Math.random() * 1024;
    const y = Math.random() * 512;
    const r = Math.random() * 1.5 + 0.3;
    const tint = Math.random();
    ctx.fillStyle = tint > 0.85 ? 'rgba(190,215,255,0.95)' : tint > 0.6 ? 'rgba(255,225,200,0.7)' : 'rgba(200,215,235,0.55)';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // a distant ringed world
  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.translate(800, 400);
  ctx.rotate(-0.4);
  ctx.strokeStyle = 'rgba(140,160,190,0.5)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(0, 0, 92, 20, 0, 0, Math.PI * 2);
  ctx.stroke();
  const planet = ctx.createRadialGradient(-16, -14, 6, 0, 0, 52);
  planet.addColorStop(0, 'rgba(126,140,168,0.85)');
  planet.addColorStop(0.6, 'rgba(48,58,82,0.9)');
  planet.addColorStop(1, 'rgba(8,10,20,0.95)');
  ctx.fillStyle = planet;
  ctx.beginPath();
  ctx.arc(0, 0, 47, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  return canvasTexture(canvas);
}

// ─────────────────────────────────────────────────────────────
// materials
// ─────────────────────────────────────────────────────────────

const wallMat = new THREE.MeshStandardMaterial({ color: 0x161c25, roughness: 0.83, metalness: 0.36 });
const wallMatDark = new THREE.MeshStandardMaterial({ color: 0x0e131a, roughness: 0.9, metalness: 0.3 });
const ribMat = new THREE.MeshStandardMaterial({ color: 0x0b1015, roughness: 0.72, metalness: 0.5 });
const trimBaseMat = new THREE.MeshStandardMaterial({ color: 0x1b2430, roughness: 0.55, metalness: 0.7 });
const pipeMat = new THREE.MeshStandardMaterial({ color: 0x1d252e, roughness: 0.5, metalness: 0.8 });
const crateMat = new THREE.MeshStandardMaterial({ color: 0x232a30, roughness: 0.8, metalness: 0.35 });
const glassMat = new THREE.MeshStandardMaterial({
  color: 0x9fe0ff,
  transparent: true,
  opacity: 0.16,
  roughness: 0.1,
  metalness: 0.9,
  side: THREE.DoubleSide,
});
const glowMat = (color, opacity = 1) =>
  new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, fog: true });

// ─────────────────────────────────────────────────────────────
// the apparition
// ─────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────
// the thing
//
// One creature serves all three roles: the watcher that stands in
// the dark, the hunter that walks when control fails, and the face
// at the end. It follows the reference sheet: a gaunt, wet-skinned
// body slung forward on too-long arms, two white rings where the
// eyes should be, and a jaw that hangs open on needle teeth.
// ─────────────────────────────────────────────────────────────

const CREATURE_UP = new THREE.Vector3(0, 1, 0);
const CREATURE_HEAD_Y = 2.0;

const CREATURE_GEO = {
  cranium: new THREE.SphereGeometry(0.29, 16, 12),
  jaw: new THREE.ConeGeometry(0.24, 0.62, 14),
  maw: new THREE.SphereGeometry(0.19, 14, 12),
  eyeRing: new THREE.TorusGeometry(0.082, 0.02, 8, 22),
  eyeHalo: new THREE.TorusGeometry(0.114, 0.032, 6, 20),
  eyeCore: new THREE.SphereGeometry(0.054, 10, 8),
  tooth: new THREE.ConeGeometry(0.016, 0.2, 5),
  neck: new THREE.CylinderGeometry(0.075, 0.12, 1, 8),
  chest: new THREE.SphereGeometry(0.3, 14, 12),
  belly: new THREE.SphereGeometry(0.24, 12, 10),
  pelvis: new THREE.SphereGeometry(0.21, 12, 10),
  ridge: new THREE.BoxGeometry(0.4, 0.022, 0.05),
  vertebra: new THREE.SphereGeometry(0.045, 8, 6),
  joint: new THREE.SphereGeometry(0.05, 8, 6),
  upperArm: new THREE.CylinderGeometry(0.042, 0.052, 1, 7),
  forearm: new THREE.CylinderGeometry(0.028, 0.042, 1, 7),
  finger: new THREE.CylinderGeometry(0.008, 0.018, 1, 5),
  thigh: new THREE.CylinderGeometry(0.062, 0.08, 1, 7),
  shin: new THREE.CylinderGeometry(0.042, 0.062, 1, 7),
  foot: new THREE.ConeGeometry(0.08, 0.24, 6),
  claw: new THREE.ConeGeometry(0.014, 0.1, 5),
};

function creatureMaterials(fade) {
  // A fading apparition must not write depth, or its own parts punch
  // holes in each other while it fades in and out.
  const body = { transparent: fade, opacity: fade ? 0 : 1, depthWrite: !fade };

  return {
    skin: new THREE.MeshStandardMaterial({ color: 0x0f0a08, roughness: 0.5, metalness: 0.16, ...body }),
    skinLight: new THREE.MeshStandardMaterial({ color: 0x241610, roughness: 0.64, metalness: 0.08, ...body }),
    maw: new THREE.MeshBasicMaterial({ color: 0x1b0608, fog: true, ...body }),
    teeth: new THREE.MeshBasicMaterial({ color: 0xd6c5b2, fog: true, ...body }),
    dark: new THREE.MeshBasicMaterial({ color: 0x080203, fog: true, ...body }),
    eye: new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: fade ? 0 : 1, fog: true }),
    halo: new THREE.MeshBasicMaterial({
      color: 0xdceeff,
      transparent: true,
      opacity: fade ? 0 : 0.2,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: true,
    }),
  };
}

function buildCreature({ fade = false } = {}) {
  const mats = creatureMaterials(fade);
  const group = new THREE.Group();

  const add = (geo, mat, x, y, z, parent = group) => {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  };

  // A bone stretched between two points, keeping its taper.
  const bone = (geo, mat, ax, ay, az, bx, by, bz, parent = group) => {
    const from = new THREE.Vector3(ax, ay, az);
    const to = new THREE.Vector3(bx, by, bz);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(from).lerp(to, 0.5);
    mesh.scale.y = from.distanceTo(to);
    mesh.quaternion.setFromUnitVectors(CREATURE_UP, new THREE.Vector3().subVectors(to, from).normalize());
    parent.add(mesh);
    return mesh;
  };

  // ── head: a brow-heavy skull hanging over an open maw ───────
  const head = new THREE.Group();
  head.position.set(0, CREATURE_HEAD_Y, 0.1);
  head.rotation.set(-0.03, 0, 0.05);
  group.add(head);

  add(CREATURE_GEO.cranium, mats.skin, 0, 0.06, 0, head).scale.set(0.64, 1.0, 0.7);

  // the lower jaw hangs from a hinge so the maw can gape
  const jawPivot = new THREE.Group();
  jawPivot.position.set(0, -0.06, 0.06);
  head.add(jawPivot);

  const jaw = add(CREATURE_GEO.jaw, mats.skin, 0, -0.28, -0.04, jawPivot);
  jaw.rotation.x = Math.PI;
  jaw.scale.set(0.78, 1.05, 0.8);

  // the maw: a tall, open hole taking the whole lower face
  add(CREATURE_GEO.maw, mats.maw, 0, -0.16, 0.12, head).scale.set(0.95, 1.62, 0.62);

  // needles ring the opening: the top row hangs down, the lower row rises
  for (let i = 0; i < 7; i += 1) {
    const angle = (i / 6) * Math.PI;
    const tooth = add(
      CREATURE_GEO.tooth,
      mats.teeth,
      Math.cos(angle) * 0.16,
      -0.16 + Math.sin(angle) * 0.25,
      0.25,
      head,
    );
    tooth.rotation.x = Math.PI;
    tooth.rotation.z = Math.cos(angle) * 0.4;
  }

  for (let i = 0; i < 7; i += 1) {
    const angle = Math.PI + (i / 6) * Math.PI;
    const tooth = add(
      CREATURE_GEO.tooth,
      mats.teeth,
      Math.cos(angle) * 0.16,
      -0.1 + Math.sin(angle) * 0.25,
      0.19,
      jawPivot,
    );
    tooth.rotation.z = Math.cos(angle) * 0.4;
  }

  // ── eyes: white rings around a hole ─────────────────────────
  [-0.1, 0.1].forEach((x) => {
    add(CREATURE_GEO.eyeRing, mats.eye, x, 0.12, 0.22, head);
    add(CREATURE_GEO.eyeCore, mats.dark, x, 0.12, 0.2, head);
    add(CREATURE_GEO.eyeHalo, mats.halo, x, 0.12, 0.22, head);
  });

  // ── body: sunken chest, hunched shoulders ───────────────────
  bone(CREATURE_GEO.neck, mats.skin, 0, 1.66, -0.03, 0, 1.94, 0.05);

  add(CREATURE_GEO.chest, mats.skin, 0, 1.52, 0.04).scale.set(0.78, 1.06, 0.6);
  bone(CREATURE_GEO.thigh, mats.skin, 0, 1.44, 0.03, 0, 1.02, 0);
  add(CREATURE_GEO.pelvis, mats.skin, 0, 0.94, 0).scale.set(0.56, 0.5, 0.52);
  add(CREATURE_GEO.chest, mats.skin, 0, 1.74, -0.04).scale.set(0.66, 0.34, 0.56);

  [1.6, 1.53, 1.46, 1.39].forEach((y, i) => {
    const rib = add(CREATURE_GEO.ridge, mats.skinLight, 0, y, 0.185 - i * 0.004);
    rib.scale.set(0.72 - i * 0.06, 0.8, 1);
    rib.rotation.x = -0.22;
  });

  for (let i = 0; i < 6; i += 1) {
    add(CREATURE_GEO.vertebra, mats.skinLight, 0, 1.0 + i * 0.15, -0.13 - Math.sin(i * 0.6) * 0.03);
  }

  // ── arms: far too long, hung from shoulder pivots so they can reach
  const arms = [];

  [-1, 1].forEach((side) => {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.33, 1.68, 0.02);
    group.add(shoulder);
    arms.push(shoulder);

    add(CREATURE_GEO.joint, mats.skin, 0, 0, 0, shoulder);
    bone(CREATURE_GEO.upperArm, mats.skin, 0, 0, 0, side * 0.29, -0.34, 0.02, shoulder);
    add(CREATURE_GEO.joint, mats.skin, side * 0.29, -0.34, 0.02, shoulder);
    bone(CREATURE_GEO.forearm, mats.skin, side * 0.29, -0.34, 0.02, side * 0.17, -0.96, 0.3, shoulder);
    add(CREATURE_GEO.joint, mats.skin, side * 0.17, -0.96, 0.3, shoulder);

    for (let f = 0; f < 4; f += 1) {
      const spread = (f - 1.5) * 0.055;
      bone(
        CREATURE_GEO.finger,
        mats.skin,
        side * 0.17,
        -0.96,
        0.3,
        side * 0.17 + spread,
        -1.32,
        0.4 + Math.abs(f - 1.5) * 0.03,
        shoulder,
      );
    }
  });

  // ── legs: crouched under it ─────────────────────────────────
  [-1, 1].forEach((side) => {
    bone(CREATURE_GEO.thigh, mats.skin, side * 0.14, 0.92, 0, side * 0.28, 0.5, 0.16);
    add(CREATURE_GEO.joint, mats.skin, side * 0.28, 0.5, 0.16);
    bone(CREATURE_GEO.shin, mats.skin, side * 0.28, 0.5, 0.16, side * 0.2, 0.12, 0.04);

    const foot = add(CREATURE_GEO.foot, mats.skin, side * 0.2, 0.08, 0.16);
    foot.rotation.x = Math.PI / 2.05;

    for (let c = 0; c < 3; c += 1) {
      const claw = add(CREATURE_GEO.claw, mats.skinLight, side * 0.2 + (c - 1) * 0.05, 0.04, 0.3);
      claw.rotation.x = Math.PI / 1.7;
    }
  });

  const bodyMats = [mats.skin, mats.skinLight, mats.maw, mats.teeth, mats.dark];

  return {
    group,
    head,
    arms,
    jaw: jawPivot,
    setOpacity(value) {
      bodyMats.forEach((material) => {
        material.opacity = value;
      });
    },
    setEyeGlow(value) {
      mats.eye.opacity = Math.max(0, Math.min(1, value));
      mats.halo.opacity = Math.max(0, Math.min(0.7, value * 0.3));
    },
  };
}

export function createApparition() {
  const creature = buildCreature({ fade: true });
  creature.group.visible = false;
  creature.group.scale.setScalar(1.02);
  creature.setOpacity(0);
  creature.setEyeGlow(0);
  return creature;
}

// the thing that walks when the hull is nearly dead
function createStalker() {
  const creature = buildCreature();
  creature.group.visible = false;
  creature.group.scale.setScalar(1.12);
  creature.setEyeGlow(0.9);
  return creature;
}

// ─────────────────────────────────────────────────────────────
// world builder
// ─────────────────────────────────────────────────────────────

export function createWorld(scene) {
  const root = new THREE.Group();
  root.name = 'ship';
  scene.add(root);

  const floorTex = makeFloorTexture();
  const hazardTex = makeHazardTexture();

  const lightEntries = [];
  const fixtures = [];
  const extra = [];

  // ── geometry helpers ──────────────────────────────────────

  // Structure is laid out at the final coordinates, so it must not be pushed
  // out again by the bay shift that runs once the ship is built.
  let structuralBuild = false;

  function addBox(w, h, d, x, y, z, material, parent = root) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    mesh.userData.structural = structuralBuild;
    parent.add(mesh);
    return mesh;
  }

  function addWallZ(z, x1, x2, accent) {
    const wasStructural = structuralBuild;
    structuralBuild = true;
    addWallZParts(z, x1, x2, accent);
    structuralBuild = wasStructural;
  }

  function addWallZParts(z, x1, x2, accent) {
    const len = x2 - x1;
    const mat = new THREE.MeshStandardMaterial({
      color: 0x161c25,
      roughness: 0.83,
      metalness: 0.36,
    });
    addBox(len, WALL_H, WALL_T, (x1 + x2) / 2, WALL_H / 2, z, mat);
    const strip = addBox(len - 0.25, 0.035, WALL_T + 0.02, (x1 + x2) / 2, 2.94, z, glowMat(accent, 0.42));
    strip.material.depthWrite = false;
    addBox(len - 0.25, 0.05, WALL_T + 0.02, (x1 + x2) / 2, 0.09, z, trimBaseMat);
    for (let x = x1 + 0.9; x < x2 - 0.4; x += 2.6) {
      const rib = addBox(0.1, 3.16, WALL_T + 0.06, x, 1.62, z, ribMat);
      rib.material.depthWrite = true;
    }
  }

  function addWallX(x, z1, z2, accent) {
    const wasStructural = structuralBuild;
    structuralBuild = true;
    addWallXParts(x, z1, z2, accent);
    structuralBuild = wasStructural;
  }

  function addWallXParts(x, z1, z2, accent) {
    const len = z2 - z1;
    const mat = new THREE.MeshStandardMaterial({
      color: 0x161c25,
      roughness: 0.83,
      metalness: 0.36,
    });
    addBox(WALL_T, WALL_H, len, x, WALL_H / 2, (z1 + z2) / 2, mat);
    addBox(WALL_T + 0.02, 0.035, len - 0.25, x, 2.94, (z1 + z2) / 2, glowMat(accent, 0.42));
    addBox(WALL_T + 0.02, 0.05, len - 0.25, x, 0.09, (z1 + z2) / 2, trimBaseMat);
    for (let z = z1 + 0.9; z < z2 - 0.4; z += 2.6) {
      addBox(WALL_T + 0.06, 3.16, 0.1, x, 1.62, z, ribMat);
    }
  }

  function addFloor(rect) {
    structuralBuild = true;
    const w = rect.maxX - rect.minX;
    const d = rect.maxZ - rect.minZ;
    const tex = floorTex.clone();
    tex.needsUpdate = true;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(Math.max(1, w / 5), Math.max(1, d / 5));
    const material = new THREE.MeshStandardMaterial({ map: tex, color: 0xd7dfe8, roughness: 0.9, metalness: 0.25 });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d), material);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set((rect.minX + rect.maxX) / 2, 0, (rect.minZ + rect.maxZ) / 2);
    root.add(floor);
    structuralBuild = false;
  }

  function addCeiling(rect) {
    structuralBuild = true;
    const w = rect.maxX - rect.minX;
    const d = rect.maxZ - rect.minZ;
    const ceiling = new THREE.Mesh(
      new THREE.PlaneGeometry(w, d),
      new THREE.MeshStandardMaterial({ color: 0x0a0e13, roughness: 1, metalness: 0.1 }),
    );
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set((rect.minX + rect.maxX) / 2, WALL_H - 0.02, (rect.minZ + rect.maxZ) / 2);
    ceiling.userData.structural = true;
    root.add(ceiling);
    structuralBuild = false;
  }

  function addFixture(x, z, color, intensity, distance, longAxis = 'x', height = 3.24, atFinal = false) {
    const fixtureMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(0.5), fog: true });
    const w = longAxis === 'x' ? 1.9 : 0.42;
    const d = longAxis === 'x' ? 0.42 : 1.9;
    const fixture = addBox(w, 0.05, d, x, height, z, fixtureMat);
    fixture.material.depthWrite = false;
    addBox(w + 0.14, 0.12, d + 0.14, x, height + 0.07, z, trimBaseMat);

    const light = new THREE.PointLight(color, intensity, distance, 2);
    light.position.set(x, height - 0.32, z);
    if (atFinal) {
      fixture.userData.structural = true;
      light.userData.structural = true;
    }
    root.add(light);

    lightEntries.push({
      light,
      fixtureMat,
      baseColor: new THREE.Color(color),
      base: intensity,
      seed: Math.random() * 10,
      speed: 0.6 + Math.random() * 0.5,
      flickerUntil: 0,
      target: intensity,
    });
    fixtures.push(fixture);
  }

  function addDust() {
    const count = 780;
    const positions = new Float32Array(count * 3);
    const seeds = new Float32Array(count);
    for (let i = 0; i < count; i += 1) {
      positions[i * 3] = (Math.random() - 0.5) * 30;
      positions[i * 3 + 1] = Math.random() * 3.2;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 30;
      seeds[i] = Math.random() * Math.PI * 2;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.032,
      color: 0x9dbdd4,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
      fog: true,
    });
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    root.add(points);
    return { points, positions, seeds, count };
  }

  // ── hull ──────────────────────────────────────────────────
  Object.values(LAYOUT).forEach((rect) => {
    addFloor(rect);
    addCeiling(rect);
  });

  // hub
  addWallZ(-7, -7, -2.5, 0x63d7ff);
  addWallZ(-7, 2.5, 7, 0x63d7ff);
  addWallZ(7, -7, -2.5, 0x63d7ff);
  addWallZ(7, 2.5, 7, 0x63d7ff);
  addWallX(-7, -7, -2.5, 0x63d7ff);
  addWallX(-7, 2.5, 7, 0x63d7ff);
  addWallX(7, -7, -2.5, 0x63d7ff);
  addWallX(7, 2.5, 7, 0x63d7ff);

  // ── corridor walls ──────────────────────────────────────
  // Each link is one long side wall either side of the walkway. Both are cut
  // by a window at the midpoint, so a shift is twenty metres of hull with the
  // dark on the other side of the glass.
  const windowSpecs = [];

  function corridorWallAtX(x, z1, z2, accent) {
    const mid = (z1 + z2) / 2;
    const a = mid - 1.7;
    const b = mid + 1.7;
    addWallX(x, z1, a, accent);
    addWallX(x, b, z2, accent);

    const wasStructural = structuralBuild;
    structuralBuild = true;
    addBox(WALL_T, 1.02, b - a, x, 0.51, mid, wallMat);
    addBox(WALL_T, WALL_H - 2.42, b - a, x, (2.42 + WALL_H) / 2, mid, wallMat);
    structuralBuild = wasStructural;

    windowSpecs.push({ axis: 'x', x, z: mid, face: x > 0 ? -1 : 1, width: b - a });
  }

  function corridorWallAtZ(z, x1, x2, accent) {
    const mid = (x1 + x2) / 2;
    const a = mid - 1.7;
    const b = mid + 1.7;
    addWallZ(z, x1, a, accent);
    addWallZ(z, b, x2, accent);

    const wasStructural = structuralBuild;
    structuralBuild = true;
    addBox(b - a, 1.02, WALL_T, mid, 0.51, z, wallMat);
    addBox(b - a, WALL_H - 2.42, WALL_T, mid, (2.42 + WALL_H) / 2, z, wallMat);
    structuralBuild = wasStructural;

    windowSpecs.push({ axis: 'z', z, x: mid, face: z > 0 ? -1 : 1, width: b - a });
  }

  // north corridor
  corridorWallAtX(-2.5, -27, -7, 0x3f8499);
  corridorWallAtX(2.5, -27, -7, 0x3f8499);

  // reactor
  addWallX(-10, -41, -27, 0xff6a32);
  addWallX(10, -41, -27, 0xff6a32);
  addWallZ(-41, -10, 10, 0xff6a32);
  addWallZ(-27, -10, -2.5, 0xff6a32);
  addWallZ(-27, 2.5, 10, 0xff6a32);

  // east corridor
  corridorWallAtZ(-2.5, 7, 27, 0x3f8499);
  corridorWallAtZ(2.5, 7, 27, 0x3f8499);

  // cryo bay
  addWallX(41, -8, 8, 0x59f0b0);
  addWallZ(-8, 27, 41, 0x59f0b0);
  addWallZ(8, 27, 41, 0x59f0b0);
  addWallX(27, -8, -2.5, 0x59f0b0);
  addWallX(27, 2.5, 8, 0x59f0b0);

  // west corridor
  corridorWallAtZ(-2.5, -27, -7, 0x3f8499);
  corridorWallAtZ(2.5, -27, -7, 0x3f8499);

  // nav / comms
  addWallX(-41, -8, 8, 0x6f93ff);
  addWallZ(-8, -41, -27, 0x6f93ff);
  addWallZ(8, -41, -27, 0x6f93ff);
  addWallX(-27, -8, -2.5, 0x6f93ff);
  addWallX(-27, 2.5, 8, 0x6f93ff);

  // south corridor + escape bay
  corridorWallAtX(-2.5, 7, 27, 0x3f8499);
  corridorWallAtX(2.5, 7, 27, 0x3f8499);
  addWallX(-9, 27, 41, 0xa8e6ff);
  addWallX(9, 27, 41, 0xa8e6ff);
  addWallZ(41, -9, 9, 0xa8e6ff);
  addWallZ(27, -9, -2.5, 0xa8e6ff);
  addWallZ(27, 2.5, 9, 0xa8e6ff);

  // ── hazard thresholds ─────────────────────────────────────
  [
    [0, -7, 5, 1],
    [7, 0, 1, 5],
    [-7, 0, 1, 5],
  ].forEach(([x, z, w, d]) => {
    const mat = new THREE.MeshBasicMaterial({ map: hazardTex, transparent: true, opacity: 0.5, depthWrite: false, fog: true });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
    plane.rotation.x = -Math.PI / 2;
    plane.rotation.z = 0;
    plane.position.set(x, 0.012, z);
    root.add(plane);
  });

  // ── bulkhead door frames ──────────────────────────────────
  // The thresholds between compartments get a frame, so the thing that
  // waits has somewhere to stand in.
  const doorFrameMat = new THREE.MeshStandardMaterial({ color: 0x1b232d, roughness: 0.68, metalness: 0.52 });
  const doorGlowMat = new THREE.MeshBasicMaterial({ color: 0xff5a3c, transparent: true, opacity: 0.24, depthWrite: false, fog: true });

  const DOORWAYS = [
    { x: 0, z: -7, axis: 'z' },
    { x: 0, z: -27, axis: 'z' },
    { x: 0, z: 7, axis: 'z' },
    { x: 0, z: 27, axis: 'z' },
    { x: 7, z: 0, axis: 'x' },
    { x: 27, z: 0, axis: 'x' },
    { x: -7, z: 0, axis: 'x' },
    { x: -27, z: 0, axis: 'x' },
  ];

  // The thresholds are drawn after the shift, so they sit at the new doors.
  const doorSpecs = DOORWAYS.slice();

  structuralBuild = true;
  doorSpecs.forEach((door) => {
    const across = 2.5;
    const post = 0.22;
    const head = 2.58;
    if (door.axis === 'z') {
      [-1, 1].forEach((side) => {
        addBox(post, head, 0.44, door.x + side * (across + post / 2), head / 2, door.z, doorFrameMat);
      });
      addBox(across * 2 + post * 2, 0.24, 0.44, door.x, head + 0.12, door.z, doorFrameMat);
      addBox(across * 2 + post * 2, 0.045, 0.46, door.x, head + 0.27, door.z, doorGlowMat);
    } else {
      [-1, 1].forEach((side) => {
        addBox(0.44, head, post, door.x, head / 2, door.z + side * (across + post / 2), doorFrameMat);
      });
      addBox(0.44, 0.24, across * 2 + post * 2, door.x, head + 0.12, door.z, doorFrameMat);
      addBox(0.46, 0.045, across * 2 + post * 2, door.x, head + 0.27, door.z, doorGlowMat);
    }
  });

  // ── corridor pipes & wall conduits ────────────────────────
  structuralBuild = true;

  const pipeRun = (axis, fixed, along) => {
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 19.4, 8), pipeMat);
    pipe.userData.structural = true;
    if (axis === 'z') {
      pipe.rotation.x = Math.PI / 2;
      pipe.position.set(fixed, 3.06, along);
    } else {
      pipe.rotation.z = Math.PI / 2;
      pipe.position.set(along, 3.08, fixed);
    }
    root.add(pipe);
  };

  pipeRun('z', -2.05, -17);
  pipeRun('z', 2.05, -17);
  pipeRun('x', -2.05, 17);
  pipeRun('x', 2.05, 17);
  pipeRun('x', -2.05, -17);
  pipeRun('x', 2.05, -17);
  pipeRun('z', -2.05, 17);
  pipeRun('z', 2.05, 17);

  // ── corridor dread ────────────────────────────────────────
  // Each corridor gets emergency strips that stutter at floor and ceiling
  // level, plus cables hanging low enough to brush the helmet. The light
  // never sits still in there.
  const corridorStrips = [];
  const corridorCables = [];

  const CORRIDOR_RUNS = [
    { x: 0, z: -17, axis: 'z', length: 19.4 },
    { x: 17, z: 0, axis: 'x', length: 19.4 },
    { x: -17, z: 0, axis: 'x', length: 19.4 },
    { x: 0, z: 17, axis: 'z', length: 19.4 },
  ];

  CORRIDOR_RUNS.forEach((run) => {
    [-1, 1].forEach((side) => {
      const along = run.axis === 'z';
      const stripMat = new THREE.MeshBasicMaterial({
        color: 0x310606,
        transparent: true,
        opacity: 0.7,
        fog: true,
      });
      addBox(
        along ? 0.06 : run.length,
        0.04,
        along ? run.length : 0.06,
        along ? run.x + side * 2.32 : run.x,
        0.075,
        along ? run.z : run.z + side * 2.32,
        stripMat,
      );
      stripMat.depthWrite = false;
      corridorStrips.push({ mat: stripMat, seed: Math.random() * 10, upper: false });

      const upperMat = stripMat.clone();
      upperMat.opacity = 0.24;
      addBox(
        along ? 0.05 : run.length,
        0.03,
        along ? run.length : 0.05,
        along ? run.x + side * 2.32 : run.x,
        3.02,
        along ? run.z : run.z + side * 2.32,
        upperMat,
      );
      upperMat.depthWrite = false;
      corridorStrips.push({ mat: upperMat, seed: Math.random() * 10, upper: true });
    });

    for (let i = 0; i < 5; i += 1) {
      const cable = new THREE.Mesh(
        new THREE.CylinderGeometry(0.018, 0.03, 0.7 + Math.random() * 1.2, 5),
        new THREE.MeshStandardMaterial({ color: 0x090c10, roughness: 1 }),
      );
      const offset = -run.length / 2 + 1.4 + i * (run.length / 6);
      const across = -1.6 + Math.random() * 3.2;
      cable.position.set(
        run.axis === 'z' ? run.x + across : run.x + offset,
        2.66,
        run.axis === 'z' ? run.z + offset : run.z + across,
      );
      cable.rotation.z = (Math.random() - 0.5) * 0.18;
      cable.userData.structural = true;
      root.add(cable);
      corridorCables.push({ mesh: cable, phase: Math.random() * Math.PI * 2, base: cable.rotation.z });
    }
  });

  structuralBuild = false;

  // ── lights ────────────────────────────────────────────────
  addFixture(0, -3.4, 0x9fd8ff, 30, 20, 'x');
  // corridors are twice as long, so each one carries two lamps now
  addFixture(0, -11, 0x7dc6ee, 11, 11, 'x', 3.24, true);
  addFixture(0, -23, 0x6fb6dd, 10, 11, 'x', 3.24, true);
  addFixture(11, 0, 0x7dc6ee, 11, 11, 'z', 3.24, true);
  addFixture(23, 0, 0x6fb6dd, 10, 11, 'z', 3.24, true);
  addFixture(-11, 0, 0x7dc6ee, 11, 11, 'z', 3.24, true);
  addFixture(-23, 0, 0x6fb6dd, 10, 11, 'z', 3.24, true);
  addFixture(0, 11, 0x7dc6ee, 10, 11, 'z', 3.24, true);
  addFixture(0, 23, 0x6fb6dd, 9, 11, 'z', 3.24, true);
  addFixture(0, -26, 0xff6a32, 46, 24, 'z');
  addFixture(26, -1.4, 0x7dffc4, 30, 20, 'x');
  addFixture(-26, -0.6, 0x8fa9ff, 30, 20, 'x');
  addFixture(0, 22.4, 0x9fe4ff, 30, 20, 'x');
  addFixture(0, 31.6, 0x9fe4ff, 26, 18, 'x');

  // ── reactor core ──────────────────────────────────────────
  const reactor = new THREE.Group();
  reactor.position.set(0, 0, -27);
  root.add(reactor);

  const hazardRing = new THREE.Mesh(
    new THREE.RingGeometry(2.05, 2.7, 40),
    new THREE.MeshBasicMaterial({ color: 0xc49e2e, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false, fog: true }),
  );
  hazardRing.rotation.x = -Math.PI / 2;
  hazardRing.position.y = 0.02;
  reactor.add(hazardRing);

  const coreShell = new THREE.Mesh(
    new THREE.CylinderGeometry(1.75, 1.95, 3.0, 28, 1, true),
    new THREE.MeshStandardMaterial({ color: 0x2b241c, roughness: 0.45, metalness: 0.85, side: THREE.DoubleSide }),
  );
  coreShell.position.y = 1.5;
  reactor.add(coreShell);

  const coreGlow = new THREE.Mesh(
    new THREE.CylinderGeometry(1.42, 1.42, 2.7, 24),
    new THREE.MeshStandardMaterial({ color: 0x2a1004, emissive: 0xff4a12, emissiveIntensity: 1.7, roughness: 0.6 }),
  );
  coreGlow.position.y = 1.5;
  reactor.add(coreGlow);

  [0.5, 1.5, 2.5].forEach((y) => {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.86, 0.06, 8, 32),
      new THREE.MeshStandardMaterial({ color: 0x1a1f24, emissive: 0xff6a22, emissiveIntensity: 1.2, roughness: 0.4, metalness: 0.7 }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = y;
    reactor.add(ring);
  });

  for (let i = 0; i < 4; i += 1) {
    const angle = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 3.2, 8), pipeMat);
    pipe.position.set(Math.cos(angle) * 2.25, 1.5, Math.sin(angle) * 2.25);
    reactor.add(pipe);
  }

  const coreLight = new THREE.PointLight(0xff4a12, 16, 12, 2);
  coreLight.position.set(0, 1.7, 0);
  reactor.add(coreLight);
  lightEntries.push({
    light: coreLight,
    fixtureMat: null,
    baseColor: new THREE.Color(0xff4a12),
    base: 16,
    seed: Math.random() * 10,
    speed: 2.1,
    flickerUntil: 0,
    target: 16,
  });

  // reactor side machinery
  addBox(3.4, 1.5, 1.1, -7.6, 0.75, -28.4, trimBaseMat);
  addBox(3.4, 1.5, 1.1, 7.6, 0.75, -28.4, trimBaseMat);
  addBox(4.2, 2.6, 0.5, 0, 1.3, -32.6, wallMatDark);

  // ── cryo bay ──────────────────────────────────────────────
  addBox(4.4, 1.1, 0.8, 30.4, 0.55, -7.3, trimBaseMat);
  addBox(0.9, 2.3, 2.4, 32.2, 1.15, 4.2, crateMat);
  addBox(3.2, 0.12, 1.3, 25.6, 0.96, 2.4, trimBaseMat);
  addBox(0.16, 0.92, 0.16, 24.3, 0.46, 2.4, pipeMat);
  addBox(0.16, 0.92, 0.16, 26.9, 0.46, 2.4, pipeMat);

  const sheet = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.3, 1.1, 4, 10),
    new THREE.MeshStandardMaterial({ color: 0x8d949a, roughness: 1, metalness: 0 }),
  );
  sheet.rotation.z = Math.PI / 2;
  sheet.position.set(25.6, 1.16, 2.4);
  root.add(sheet);

  const surgicalLamp = new THREE.Mesh(
    new THREE.CylinderGeometry(0.42, 0.26, 0.16, 16),
    new THREE.MeshStandardMaterial({ color: 0x22282e, emissive: 0xdff3ff, emissiveIntensity: 1.4, metalness: 0.6, roughness: 0.4 }),
  );
  surgicalLamp.position.set(25.6, 2.5, 2.4);
  root.add(surgicalLamp);

  // specimen tanks along the east wall (scenery)
  [5.6, 1.9, -1.8].forEach((z) => {
    const tank = new THREE.Group();
    tank.position.set(32.2, 0, z);
    const shell = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 1.9, 14, 1, true), glassMat);
    shell.position.y = 1.05;
    tank.add(shell);
    const inner = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.16, 0.7, 4, 8),
      new THREE.MeshStandardMaterial({ color: 0x0c1a17, emissive: 0x2b8f74, emissiveIntensity: 0.5, roughness: 0.7 }),
    );
    inner.position.y = 0.95;
    tank.add(inner);
    root.add(tank);
  });

  const medScrawl = new THREE.Mesh(
    new THREE.PlaneGeometry(2.8, 1.4),
    new THREE.MeshBasicMaterial({ map: makeScrawlTexture(['IT WEARS', 'OUR FACES'], '#7fae9c'), transparent: true, opacity: 0.5, depthWrite: false }),
  );
  medScrawl.position.set(23.4, 1.82, 7.62);
  medScrawl.rotation.y = Math.PI;
  medScrawl.rotation.z = -0.02;
  root.add(medScrawl);

  // ── nav / comms ───────────────────────────────────────────
  const starTex = makeStarTexture();
  const viewportFrame = new THREE.Group();
  addBox(10.6, 0.16, 0.22, -32.7, 3.18, 0, trimBaseMat, viewportFrame);
  addBox(10.6, 0.16, 0.22, -32.7, 0.48, 0, trimBaseMat, viewportFrame);
  addBox(0.22, 2.9, 0.22, -32.7, 1.83, -5.2, trimBaseMat, viewportFrame);
  addBox(0.22, 2.9, 0.22, -32.7, 1.83, 5.2, trimBaseMat, viewportFrame);
  root.add(viewportFrame);

  const viewport = new THREE.Mesh(
    new THREE.PlaneGeometry(10.2, 2.6),
    new THREE.MeshBasicMaterial({ map: starTex, fog: true }),
  );
  viewport.position.set(-32.82, 1.83, 0);
  viewport.rotation.y = Math.PI / 2;
  root.add(viewport);

  const viewportGlow = new THREE.Mesh(
    new THREE.PlaneGeometry(10.6, 3.0),
    new THREE.MeshBasicMaterial({ color: 0x223a52, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false, fog: true }),
  );
  viewportGlow.position.set(-32.6, 1.83, 0);
  viewportGlow.rotation.y = Math.PI / 2;
  root.add(viewportGlow);

  // ── corridor windows ──────────────────────────────────────
  // The openings were left in the walls above. Each one gets a thick pane,
  // a frame you could brace a hand on, and the star field the ship is
  // drifting through — with a faint spill of cold light on the sill.
  const windowFrameMat = new THREE.MeshStandardMaterial({ color: 0x1d2833, roughness: 0.55, metalness: 0.7 });
  const windowRimMat = new THREE.MeshBasicMaterial({ color: 0x7fd0ff, transparent: true, opacity: 0.32, depthWrite: false, fog: true });

  windowSpecs.forEach((spec, index) => {
    const glassTex = starTex.clone();
    glassTex.needsUpdate = true;
    glassTex.wrapS = THREE.RepeatWrapping;
    glassTex.wrapT = THREE.RepeatWrapping;
    glassTex.offset.set((index * 0.29) % 1, (index * 0.47) % 1);

    const pane = new THREE.Mesh(
      new THREE.PlaneGeometry(spec.width, 1.36),
      new THREE.MeshBasicMaterial({ map: glassTex, color: 0xbfe3ff, fog: true }),
    );
    pane.userData.structural = true;

    const spread = new THREE.Mesh(
      new THREE.PlaneGeometry(spec.width + 0.5, 1.8),
      new THREE.MeshBasicMaterial({
        map: glassTex,
        color: 0x2f6d92,
        transparent: true,
        opacity: 0.22,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: true,
      }),
    );
    spread.userData.structural = true;

    if (spec.axis === 'x') {
      pane.rotation.y = spec.face > 0 ? Math.PI / 2 : -Math.PI / 2;
      pane.position.set(spec.x + spec.face * 0.02, 1.72, spec.z);
      spread.rotation.copy(pane.rotation);
      spread.position.set(spec.x + spec.face * 0.06, 1.72, spec.z);
    } else {
      pane.rotation.y = spec.face > 0 ? 0 : Math.PI;
      pane.position.set(spec.x, 1.72, spec.z + spec.face * 0.02);
      spread.rotation.copy(pane.rotation);
      spread.position.set(spec.x, 1.72, spec.z + spec.face * 0.06);
    }

    root.add(pane, spread);

    // frame: sill, header and two jambs
    if (spec.axis === 'x') {
      addBox(0.42, 0.1, spec.width + 0.24, spec.x, 1.02, spec.z, windowFrameMat).userData.structural = true;
      addBox(0.42, 0.1, spec.width + 0.24, spec.x, 2.42, spec.z, windowFrameMat).userData.structural = true;
      [-1, 1].forEach((side) => {
        addBox(0.42, 1.5, 0.12, spec.x, 1.72, spec.z + side * (spec.width / 2 + 0.06), windowFrameMat).userData.structural = true;
      });
      addBox(0.06, 0.05, spec.width + 0.5, spec.x + spec.face * 0.19, 1.4, spec.z, windowRimMat).userData.structural = true;
    } else {
      addBox(spec.width + 0.24, 0.1, 0.42, spec.x, 1.02, spec.z, windowFrameMat).userData.structural = true;
      addBox(spec.width + 0.24, 0.1, 0.42, spec.x, 2.42, spec.z, windowFrameMat).userData.structural = true;
      [-1, 1].forEach((side) => {
        addBox(0.12, 1.5, 0.42, spec.x + side * (spec.width / 2 + 0.06), 1.72, spec.z, windowFrameMat).userData.structural = true;
      });
      addBox(spec.width + 0.5, 0.05, 0.06, spec.x, 1.4, spec.z + spec.face * 0.19, windowRimMat).userData.structural = true;
    }
  });

  // nav table
  const navTable = new THREE.Group();
  navTable.position.set(-26, 0, 0.2);
  const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.5, 0.95, 12), trimBaseMat);
  pedestal.position.y = 0.48;
  navTable.add(pedestal);
  const tableTop = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 0.09, 20), trimBaseMat);
  tableTop.position.y = 0.99;
  navTable.add(tableTop);
  const holo = new THREE.Mesh(
    new THREE.PlaneGeometry(1.5, 1.5),
    new THREE.MeshBasicMaterial({
      map: makeHoloTexture(),
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: true,
    }),
  );
  holo.rotation.x = -Math.PI / 2;
  holo.position.y = 1.06;
  navTable.add(holo);
  root.add(navTable);

  const navScrawl = new THREE.Mesh(
    new THREE.PlaneGeometry(2.6, 1.3),
    new THREE.MeshBasicMaterial({ map: makeScrawlTexture(['THE SIGNAL', 'IS NOT HUMAN'], '#7f93c4'), transparent: true, opacity: 0.45, depthWrite: false }),
  );
  navScrawl.position.set(-23.3, 1.86, -7.63);
  root.add(navScrawl);

  // nav chairs / consoles
  addBox(0.9, 0.5, 0.9, -21.4, 0.25, 5.4, crateMat);
  addBox(0.9, 0.5, 0.9, -30.6, 0.25, 5.4, crateMat);

  // ── hub props ─────────────────────────────────────────────
  addBox(1.5, 1.0, 1.2, 5.4, 0.5, 5.2, crateMat);
  addBox(1.1, 0.7, 1.0, 4.4, 0.35, 6.2, crateMat);
  addBox(1.3, 1.5, 1.1, -5.3, 0.75, -6.2, crateMat);

  const hubScrawl = new THREE.Mesh(
    new THREE.PlaneGeometry(3.0, 1.5),
    new THREE.MeshBasicMaterial({ map: makeScrawlTexture(['DON\u2019T OPEN', 'THE AIRLOCK'], '#8aa6b8'), transparent: true, opacity: 0.5, depthWrite: false }),
  );
  hubScrawl.position.set(3.6, 1.86, 6.82);
  hubScrawl.rotation.y = Math.PI;
  root.add(hubScrawl);

  const reactorScrawl = new THREE.Mesh(
    new THREE.PlaneGeometry(2.8, 1.4),
    new THREE.MeshBasicMaterial({ map: makeScrawlTexture(['CREW 14', 'REMAINING 1'], '#c08a6a'), transparent: true, opacity: 0.45, depthWrite: false }),
  );
  reactorScrawl.position.set(-9.82, 1.9, -24.6);
  reactorScrawl.rotation.y = Math.PI / 2;
  root.add(reactorScrawl);

  // hanging cables in hub
  for (let i = 0; i < 5; i += 1) {
    const cable = new THREE.Mesh(
      new THREE.CylinderGeometry(0.025, 0.025, 1.4 + Math.random() * 1.2, 5),
      new THREE.MeshStandardMaterial({ color: 0x0a0c0f, roughness: 1 }),
    );
    cable.position.set(-6.2 + Math.random() * 1.2, 2.7, -4 + i * 1.7);
    root.add(cable);
  }

  // ── hub furniture ────────────────────────────────────────
  // The berth is where a shift starts and ends, so it is the one room with
  // somewhere to put a tool down, something to trip over and a screen that
  // still thinks it is 06:00.
  const benchMat = new THREE.MeshStandardMaterial({ color: 0x232b33, roughness: 0.7, metalness: 0.45 });

  addBox(2.4, 0.9, 0.72, 5.55, 0.45, -3.1, benchMat);
  addBox(2.55, 0.09, 0.82, 5.55, 0.94, -3.1, trimBaseMat);
  addBox(0.5, 0.26, 0.38, 4.95, 1.11, -3.15, crateMat);
  addBox(0.4, 0.2, 0.3, 5.9, 1.08, -3.3, crateMat);
  addBox(0.22, 0.16, 0.22, 6.1, 1.06, -2.8, pipeMat);

  // stacked supply crates by the west wall
  addBox(1.2, 0.9, 1.0, -5.95, 0.45, 2.6, crateMat);
  addBox(1.0, 0.78, 0.9, -6.0, 1.29, 2.7, crateMat);
  addBox(0.82, 0.6, 0.72, -5.9, 0.3, 4.2, crateMat);

  // locker bank and a dead status board on the north wall
  addBox(1.7, 1.95, 0.36, -4.4, 0.98, -6.7, benchMat);
  addBox(0.06, 0.06, 0.04, -4.4, 1.35, -6.5, glowMat(0x63d7ff, 0.6));
  const statusBoard = new THREE.Mesh(
    new THREE.PlaneGeometry(2.2, 1.1),
    new THREE.MeshBasicMaterial({ color: 0x0b1a22, transparent: true, opacity: 0.9, fog: true }),
  );
  statusBoard.position.set(3.4, 1.95, -6.82);
  root.add(statusBoard);
  const statusGlow = new THREE.Mesh(
    new THREE.PlaneGeometry(2.06, 0.06),
    new THREE.MeshBasicMaterial({ color: 0x63d7ff, transparent: true, opacity: 0.35, depthWrite: false, fog: true }),
  );
  statusGlow.position.set(3.4, 2.3, -6.8);
  root.add(statusGlow);

  // a grating torn up at the berth floor, and a cart someone left
  const grateMat = new THREE.MeshStandardMaterial({ color: 0x141b23, roughness: 0.85, metalness: 0.6 });
  addBox(1.9, 0.04, 1.5, 2.5, 0.022, -2.5, grateMat);
  addBox(0.9, 0.7, 0.6, -2.4, 0.35, 4.9, benchMat);
  addBox(1.02, 0.08, 0.72, -2.4, 0.74, 4.9, trimBaseMat);

  // barrels against the east wall, one on its side
  [4.4, 5.5].forEach((z) => {
    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.32, 0.32, 0.95, 12),
      new THREE.MeshStandardMaterial({ color: 0x2a323b, roughness: 0.72, metalness: 0.5 }),
    );
    barrel.position.set(6.3, 0.48, z);
    root.add(barrel);
  });
  const toppledBarrel = new THREE.Mesh(
    new THREE.CylinderGeometry(0.3, 0.3, 0.9, 12),
    new THREE.MeshStandardMaterial({ color: 0x2a323b, roughness: 0.72, metalness: 0.5 }),
  );
  toppledBarrel.rotation.z = Math.PI / 2;
  toppledBarrel.position.set(-1.6, 0.3, -5.4);
  root.add(toppledBarrel);

  // ceiling conduit that crosses the berth
  const hubPipe = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 12.6, 8), pipeMat);
  hubPipe.rotation.z = Math.PI / 2;
  hubPipe.position.set(0, 3.12, -1.6);
  root.add(hubPipe);
  const hubPipe2 = hubPipe.clone();
  hubPipe2.position.z = 1.6;
  root.add(hubPipe2);

  // ── corridor dressing ────────────────────────────────────
  // Twenty metres of link needs more than strips: cabinets that still have
  // somebody's name on them, junction boxes that blink, a handrail, and the
  // debris that collects where nobody sweeps.
  const cabinetMat = new THREE.MeshStandardMaterial({ color: 0x222c36, roughness: 0.62, metalness: 0.55 });
  const ledMat = new THREE.MeshBasicMaterial({ color: 0xff4a2a, fog: true });

  CORRIDOR_RUNS.forEach((run, runIndex) => {
    const along = run.axis === 'z';
    const half = run.length / 2;
    const at = (dist, across) => (along
      ? { x: run.x + across, z: run.z + dist }
      : { x: run.x + dist, z: run.z + across });

    // a cabinet against one wall near the hub end, on both sides alternately
    const side = runIndex % 2 === 0 ? -2.06 : 2.06;
    const cabinet = at(-half + 3.0, side);
    const cabinetBox = addBox(
      along ? 0.32 : 1.4,
      1.55,
      along ? 1.4 : 0.32,
      cabinet.x,
      0.78,
      cabinet.z,
      cabinetMat,
    );
    cabinetBox.userData.structural = true;
    const handle = at(-half + 3.0, side > 0 ? side - 0.18 : side + 0.18);
    addBox(0.05, 0.3, 0.05, handle.x, 1.05, handle.z, glowMat(0x9fd8ff, 0.5)).userData.structural = true;

    // junction box on the ceiling with a light that is not quite dead
    const junction = at(half - 4.4, along ? 1.5 : 1.5);
    addBox(0.5, 0.36, 0.5, junction.x, 2.94, junction.z, cabinetMat).userData.structural = true;
    const led = at(half - 4.4, along ? 1.5 : 1.5);
    addBox(0.07, 0.07, 0.07, led.x, 2.72, led.z, ledMat).userData.structural = true;

    // handrail down the far half of one wall
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, half - 1.2, 8), pipeMat);
    rail.userData.structural = true;
    if (along) {
      rail.rotation.x = Math.PI / 2;
      rail.position.set(run.x - 2.26, 1.06, run.z + half / 2);
    } else {
      rail.rotation.z = Math.PI / 2;
      rail.position.set(run.x + half / 2, 1.06, run.z - 2.26);
    }
    root.add(rail);

    // crates and a stain where the crew stopped carrying things
    [-1.2, -0.2].forEach((step, index) => {
      const crate = at(half - 2.2 - step, index === 0 ? 1.45 : 1.7);
      addBox(0.48, 0.4, 0.42, crate.x, 0.21, crate.z, crateMat).userData.structural = true;
    });

    const stain = at(-half + 5.2, 0.5);
    const stainMesh = new THREE.Mesh(
      new THREE.CircleGeometry(0.95, 16),
      new THREE.MeshBasicMaterial({ color: 0x05080a, transparent: true, opacity: 0.55, depthWrite: false, fog: true }),
    );
    stainMesh.rotation.x = -Math.PI / 2;
    stainMesh.position.set(stain.x, 0.015, stain.z);
    stainMesh.userData.structural = true;
    root.add(stainMesh);
  });

  // ── hull damage, vents and the thing in the dark ──────────
  const crackTex = makeCrackTexture();
  const weldTex = makeWeldTexture();

  // Every slot is a physical place a crack can open. Floor slots lie flat;
  // each crack also owns the welded plate that covers it once repaired.
  const crackSpecs = [
    { x: 3.6, y: 1.55, z: -6.82, ry: 0 },
    { x: -6.82, y: 1.75, z: -3.4, ry: Math.PI / 2 },
    { x: 2.42, y: 1.5, z: -10.5, ry: -Math.PI / 2 },
    { x: 12.2, y: 1.7, z: 2.42, ry: Math.PI },
    { x: 6.82, y: 1.3, z: 4.0, ry: -Math.PI / 2 },
    { x: -2.42, y: 1.8, z: -15.2, ry: Math.PI / 2 },
    { x: -12.5, y: 1.55, z: -2.42, ry: 0 },
    { x: 9.82, y: 1.65, z: -24.8, ry: -Math.PI / 2 },
    { x: 0, y: 1.9, z: -32.82, ry: 0 },
    { x: 32.82, y: 1.6, z: -3.2, ry: -Math.PI / 2 },
    { x: -32.82, y: 1.5, z: 3.0, ry: Math.PI / 2 },
    { x: 5.2, y: 1.1, z: 6.82, ry: Math.PI },
    { x: 17.0, y: 1.7, z: -2.42, ry: 0 },
    { x: -17.0, y: 1.4, z: 2.42, ry: Math.PI },
    { x: -5.4, y: 0.02, z: 1.8, ry: 0.4, floor: true },
    { x: 4.2, y: 0.02, z: -3.9, ry: 1.2, floor: true },
    { x: 0.6, y: 0.02, z: -12.4, ry: 2.1, floor: true },
    { x: 10.6, y: 0.02, z: -0.9, ry: 0.7, floor: true },
    { x: 23.4, y: 0.02, z: 3.6, ry: 2.6, floor: true },
    { x: -23.6, y: 0.02, z: -3.8, ry: 1.6, floor: true },
    { x: -3.2, y: 0.02, z: -25.2, ry: 0.9, floor: true },
    { x: 2.8, y: 0.02, z: 15.0, ry: 1.9, floor: true },
  ];

  const crackSlots = crackSpecs.map((spec, index) => {
    const crack = new THREE.Mesh(
      new THREE.PlaneGeometry(spec.floor ? 1.7 : 1.9, spec.floor ? 1.3 : 1.4),
      new THREE.MeshBasicMaterial({
        map: crackTex,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        side: THREE.DoubleSide,
        fog: true,
      }),
    );
    if (spec.floor) {
      crack.position.set(spec.x, spec.y, spec.z);
      crack.rotation.set(-Math.PI / 2, 0, spec.ry);
    } else {
      crack.position.set(spec.x, spec.y, spec.z);
      crack.rotation.y = spec.ry;
    }
    crack.visible = false;
    root.add(crack);

    const patch = new THREE.Mesh(
      new THREE.PlaneGeometry(0.95, 0.78),
      new THREE.MeshBasicMaterial({
        map: weldTex,
        transparent: true,
        opacity: 0.92,
        depthWrite: false,
        side: THREE.DoubleSide,
        fog: true,
      }),
    );
    if (spec.floor) {
      patch.position.set(spec.x, spec.y + 0.012, spec.z);
      patch.rotation.set(-Math.PI / 2, 0, spec.ry);
    } else {
      patch.position.set(
        spec.x + Math.sin(spec.ry) * 0.015,
        spec.y,
        spec.z + Math.cos(spec.ry) * 0.015,
      );
      patch.rotation.y = spec.ry;
    }
    patch.visible = false;
    root.add(patch);

    // A cool additive halo so a fresh 1% crack still catches the eye in
    // the dark, without reading as a light source.
    const glow = new THREE.Mesh(
      new THREE.PlaneGeometry(spec.floor ? 1.95 : 2.15, spec.floor ? 1.5 : 1.6),
      new THREE.MeshBasicMaterial({
        map: crackTex,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        fog: false,
      }),
    );
    if (spec.floor) {
      glow.position.set(spec.x, spec.y + 0.02, spec.z);
      glow.rotation.set(-Math.PI / 2, 0, spec.ry);
    } else {
      glow.position.set(
        spec.x + Math.sin(spec.ry) * 0.03,
        spec.y,
        spec.z + Math.cos(spec.ry) * 0.03,
      );
      glow.rotation.y = spec.ry;
    }
    glow.visible = false;
    root.add(glow);

    const placed = outPoint(spec.x, spec.z);

    return {
      index,
      x: placed.x,
      y: spec.y,
      z: placed.z,
      ry: spec.ry,
      floor: !!spec.floor,
      mesh: crack,
      patch,
      glow,
    };
  });

  const bloodTex = makeBloodTexture();
  const bloodMats = [];
  const bloodSpecs = [
    { x: 4.3, y: 1.8, z: -6.82, ry: 0 },
    { x: 6.82, y: 1.5, z: 4.6, ry: -Math.PI / 2 },
    { x: -2.42, y: 1.6, z: -13.2, ry: Math.PI / 2 },
    { x: 15.2, y: 1.7, z: 2.42, ry: Math.PI },
    { x: -25.0, y: 1.6, z: -7.82, ry: 0 },
    { x: 29.4, y: 1.4, z: 7.82, ry: Math.PI },
  ];

  bloodSpecs.forEach((spec) => {
    const material = new THREE.MeshBasicMaterial({
      map: bloodTex,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: true,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.35, 1.05), material);
    mesh.position.set(spec.x, spec.y, spec.z);
    mesh.rotation.y = spec.ry;
    root.add(mesh);
    bloodMats.push(material);
  });

  const ventEntries = [];
  const ventSpecs = [
    { x: 4.8, y: 1.58, z: -6.8, ry: 0 },
    { x: 6.8, y: 1.62, z: 3.2, ry: -Math.PI / 2 },
    { x: -2.4, y: 1.5, z: -11.8, ry: Math.PI / 2 },
    { x: 12.4, y: 1.56, z: 2.4, ry: Math.PI },
    { x: -25.5, y: 1.52, z: -7.8, ry: 0 },
  ];

  ventSpecs.forEach((spec) => {
    const vent = new THREE.Group();
    vent.position.set(spec.x, spec.y, spec.z);
    vent.rotation.y = spec.ry;

    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(0.74, 0.54, 0.08),
      new THREE.MeshStandardMaterial({ color: 0x080d12, roughness: 0.9, metalness: 0.4 }),
    );
    vent.add(frame);

    // The recess does not stop at the wall. It goes back into a throat of
    // dark, and the dark has something pale inside it.
    const recess = new THREE.Mesh(
      new THREE.BoxGeometry(0.62, 0.42, 0.3),
      new THREE.MeshBasicMaterial({ color: 0x000000 }),
    );
    recess.position.z = -0.08;
    vent.add(recess);

    const throatMat = new THREE.MeshBasicMaterial({
      color: 0x2a0806,
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
      fog: true,
    });
    const throat = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.34), throatMat);
    throat.position.z = 0.02;
    vent.add(throat);

    const eyeMat = new THREE.MeshBasicMaterial({
      color: 0xf5eee4,
      transparent: true,
      opacity: 0.14,
      depthWrite: false,
      fog: true,
    });

    [-0.1, 0.1].forEach((x) => {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.032, 8, 6), eyeMat);
      eye.position.set(x, 0, 0.075);
      vent.add(eye);
    });

    // Teeth behind the grate, only visible once the vent starts to shake.
    const teethMat = new THREE.MeshBasicMaterial({
      color: 0xd9cdbd,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      fog: true,
    });
    const teeth = [];
    for (let i = 0; i < 5; i += 1) {
      const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.024, 0.12, 5), teethMat);
      tooth.position.set(-0.18 + i * 0.09, 0.06, 0.08);
      tooth.rotation.x = Math.PI;
      vent.add(tooth);
      teeth.push(tooth);
    }

    const grate = new THREE.Group();
    for (let i = 0; i < 4; i += 1) {
      const slat = new THREE.Mesh(
        new THREE.BoxGeometry(0.66, 0.04, 0.04),
        new THREE.MeshStandardMaterial({ color: 0x1b242c, metalness: 0.7, roughness: 0.4 }),
      );
      slat.position.set(0, -0.16 + i * 0.1, 0.13);
      grate.add(slat);
    }
    vent.add(grate);

    root.add(vent);
    const startsOpen = Math.random() < 0.3;
    ventEntries.push({
      group: vent,
      eyeMat,
      teethMat,
      teeth,
      grate,
      throatMat,
      baseOpacity: 0.14,
      seed: Math.random() * 10,
      stir: 0,
      // The face in the grate is not a fixture: it comes and goes.
      showing: startsOpen,
      presence: startsOpen ? 1 : 0,
      presenceTimer: 1.5 + Math.random() * 6,
      alert: 0,
    });
  });

  const scareCreature = buildCreature();
  scareCreature.setEyeGlow(1);
  scareCreature.group.position.y = -1;

  const scareGroup = new THREE.Group();
  scareGroup.add(scareCreature.group);
  scareGroup.visible = false;
  root.add(scareGroup);
  let scareLife = 0;
  const scareOrigin = new THREE.Vector3();

  const stalker = createStalker();
  root.add(stalker.group);

  // the thing that waits in doorways and stands in corridors
  const lurker = buildCreature();
  lurker.group.visible = false;
  lurker.group.scale.setScalar(1.06);
  lurker.setEyeGlow(0.85);
  root.add(lurker.group);

  let lurkMode = 'idle'; // idle | door | stand | grab
  let lurkLife = 0;
  let lurkerVanished = false;

  // ── the peeker ───────────────────────────────────────────
  // A second body used only for half-seen things: a head leaned out of a
  // vent, or a shoulder around the far door frame. It never walks.
  const peeker = buildCreature();
  peeker.group.visible = false;
  peeker.setEyeGlow(0.9);
  root.add(peeker.group);

  let peekMode = 'idle'; // idle | vent | corridor
  let peekLife = 0;
  // Where the corridor pose started, and the axes it drifts along.
  const peekOrigin = new THREE.Vector3();
  const peekRight = new THREE.Vector3();
  const peekForward = new THREE.Vector3();
  let peekSide = 1;
  let peekDrift = 0;
  // Nonverbal acting for the corridor pose: an arm out at contact, a head
  // turned to follow the player once it has been shifted past.
  let peekReach = 0;
  let peekTurn = 0;

  // ── dust ──────────────────────────────────────────────────
  const dust = addDust();

  // ── ship temperature / fog control ────────────────────────
  const fogColor = new THREE.Color(0x05080c);
  scene.fog = new THREE.FogExp2(fogColor.getHex(), 0.032);
  scene.background = fogColor;

  const ghost = createApparition();
  scene.add(ghost.group);

  let elapsed = 0;
  let ghostLife = 0;
  let ghostFade = 0;
  let ghostMode = 'idle';

  function flicker(strength = 1) {
    if (!lightEntries.length) return;
    const entry = lightEntries[Math.floor(Math.random() * lightEntries.length)];
    entry.flickerUntil = elapsed + 0.45 + Math.random() * 1.1;
    entry.flickerStrength = 0.1 + Math.random() * 0.35 * strength;
  }

  let ghostVanished = false;

  // No fade, no drift in: it is simply standing there the moment you turn
  // the corner. Called for both the first sighting and the later watcher.
  function showGhost(playerPos, position) {
    const pos = position || pickGhostSpot(playerPos);
    if (!pos) return;
    ghost.group.position.set(pos.x, 0, pos.z);
    ghost.group.rotation.set(0, Math.atan2(playerPos.x - pos.x, playerPos.z - pos.z), 0);
    ghost.group.visible = true;
    ghostMode = 'hold';
    ghostLife = 0;
    ghostFade = 1;
    ghost.setOpacity(1);
  }

  function showWatcher(playerPos) {
    const pos = pickGhostSpot(playerPos);
    if (!pos) return;

    ghost.group.position.set(pos.x, 0, pos.z);
    ghost.group.rotation.set(0, Math.atan2(playerPos.x - pos.x, playerPos.z - pos.z), 0);
    ghost.group.scale.setScalar(1.08);
    ghost.group.visible = true;
    ghostMode = 'watcher';
    ghostLife = 0;
    ghostFade = 1;
    ghost.setOpacity(1);
    flicker(0.7);
  }

  // Gone between one frame and the next, with nothing left behind.
  function vanishGhost() {
    if (!ghost.group.visible) return;
    ghost.group.visible = false;
    ghostMode = 'idle';
    ghostFade = 0;
    ghost.setOpacity(0);
    ghostVanished = true;
  }

  function consumeGhostVanish() {
    const value = ghostVanished;
    ghostVanished = false;
    return value;
  }

  function hideGhost() {
    ghostMode = 'fadeout';
    scareLife = 0;
    scareGroup.visible = false;
  }

  function updateGhost(dt, camera) {
    if (!ghost.group.visible) return;

    if (ghostMode === 'fadein') {
      ghostFade = Math.min(1, ghostFade + dt / 0.9);
      if (ghostFade >= 1) ghostMode = 'hold';
    } else if (ghostMode === 'watcher') {
      ghostLife += dt;

      const dx = camera.position.x - ghost.group.position.x;
      const dz = camera.position.z - ghost.group.position.z;
      const dist = Math.hypot(dx, dz);
      ghost.group.rotation.y = Math.atan2(dx, dz);

      // It is only there while you are not looking straight at it: meet its
      // eyes and it is already gone.
      if (ghostLife > 0.12 && dist > 1.6) {
        const forward = new THREE.Vector3();
        camera.getWorldDirection(forward);
        const toGhost = new THREE.Vector3(-dx, 0, -dz).normalize();
        if (forward.dot(toGhost) > 0.9) vanishGhost();
      }

      if (ghostLife > 7.5) ghostMode = 'fadeout';
    } else if (ghostMode === 'hold') {
      ghostLife += dt;
      const dx = camera.position.x - ghost.group.position.x;
      const dz = camera.position.z - ghost.group.position.z;
      const dist = Math.hypot(dx, dz);
      // Drift, very slowly, always toward you.
      if (dist > 1) {
        ghost.group.position.x += (dx / dist) * dt * 0.32;
        ghost.group.position.z += (dz / dist) * dt * 0.32;
      }
      ghost.group.rotation.y = Math.atan2(dx, dz);

      if (dist > 1.6) {
        const forward = new THREE.Vector3();
        camera.getWorldDirection(forward);
        const toGhost = new THREE.Vector3(-dx, 0, -dz).normalize();
        if (forward.dot(toGhost) > 0.9) vanishGhost();
      }

      if (dist < 5.5 || ghostLife > 4.6) ghostMode = 'fadeout';
    } else if (ghostMode === 'fadeout') {
      ghostFade = Math.max(0, ghostFade - dt / 0.55);
      if (ghostFade <= 0) {
        ghost.group.visible = false;
        ghostMode = 'idle';
      }
    }

    ghost.setOpacity(ghostFade);
    ghost.setEyeGlow(ghostFade * (0.6 + Math.sin(elapsed * 11) * 0.35));
    ghost.group.position.y = Math.sin(elapsed * 1.4) * 0.04;
  }

  // Close enough that it takes a second to understand what you are seeing.
  function pickGhostSpot(playerPos, minDist = 6) {
    const spots = [
      { x: 0, z: -11 },
      { x: 0, z: 11 },
      { x: 11, z: 0 },
      { x: -11, z: 0 },
      { x: 0, z: outCoord(-17.4) },
      { x: outCoord(17.4), z: 0 },
      { x: outCoord(-17.4), z: 0 },
      { x: 0, z: outCoord(17.4) },
      { x: outCoord(26), z: 0 },
      { x: outCoord(-26), z: 0 },
      { x: 0, z: outCoord(-26) },
      { x: 0, z: outCoord(26) },
      { x: outCoord(26), z: 7.2 },
      { x: outCoord(-26), z: -7.2 },
    ];
    let best = null;
    let bestDist = Infinity;
    spots.forEach((s) => {
      const d = Math.hypot(s.x - playerPos.x, s.z - playerPos.z);
      if (d < minDist) return;
      if (d < bestDist) {
        bestDist = d;
        best = s;
      }
    });
    return best || spots[0];
  }

  function update(dt, camera) {
    elapsed += dt;

    // lights breathe, flicker, and lean on the fixture emissive
    lightEntries.forEach((entry) => {
      let target = entry.base * (0.93 + Math.sin(elapsed * entry.speed + entry.seed) * 0.07);
      if (elapsed < entry.flickerUntil) {
        const n = Math.sin(elapsed * 63.7 + entry.seed * 3.1) * 0.5 + 0.5;
        target *= n > 0.42 ? 1 : entry.flickerStrength ?? 0.15;
      }
      entry.target = target;
      entry.light.intensity += (target - entry.light.intensity) * Math.min(1, dt * 18);
      if (entry.fixtureMat) {
        const ratio = Math.max(0.06, target / entry.base);
        entry.fixtureMat.color.copy(entry.baseColor).multiplyScalar(0.32 + ratio * 0.5);
      }
    });

    // it breathes and swings its head while it walks
    if (stalker.group.visible) {
      stalker.head.rotation.z = 0.08 + Math.sin(elapsed * 1.6) * 0.07;
      stalker.head.rotation.x = 0.16 + Math.sin(elapsed * 2.1) * 0.05;
      stalker.setEyeGlow(0.7 + Math.sin(elapsed * 8.5) * 0.25);
    }

    if (scareGroup.visible) {
      scareCreature.setEyeGlow(0.75 + Math.sin(elapsed * 22) * 0.25);
    }

    // dust drifts and recycles around the camera
    const posAttr = dust.points.geometry.getAttribute('position');
    const arr = posAttr.array;
    for (let i = 0; i < dust.count; i += 1) {
      const i3 = i * 3;
      arr[i3 + 1] += dt * (0.02 + (i % 7) * 0.004);
      arr[i3] += Math.sin(elapsed * 0.4 + dust.seeds[i]) * dt * 0.03;
      arr[i3 + 2] += Math.cos(elapsed * 0.33 + dust.seeds[i]) * dt * 0.03;
      if (arr[i3 + 1] > 3.3) arr[i3 + 1] = 0.05;

      const dx = arr[i3] - camera.position.x;
      const dz = arr[i3 + 2] - camera.position.z;
      if (dx > 16) arr[i3] -= 32;
      else if (dx < -16) arr[i3] += 32;
      if (dz > 16) arr[i3 + 2] -= 32;
      else if (dz < -16) arr[i3 + 2] += 32;
    }
    posAttr.needsUpdate = true;

    // slow parallax on the viewport
    starTex.offset.x = (starTex.offset.x + dt * 0.0016) % 1;

    // rotate the nav holo
    holo.rotation.z += dt * 0.05;

    corridorCables.forEach((cable) => {
      cable.mesh.rotation.z = cable.base + Math.sin(elapsed * 0.55 + cable.phase) * 0.05;
    });

    corridorStrips.forEach((strip) => {
      const stutter = Math.sin(elapsed * 11 + strip.seed) > 0.988 ? 0.1 : 1;
      const breathe = 0.72 + Math.sin(elapsed * 1.25 + strip.seed) * 0.22;
      strip.mat.opacity = (strip.upper ? 0.26 : 0.7) * breathe * stutter;
    });

    ventEntries.forEach((vent) => {
      // Half the time a grate is just a grate. The eyes surface for a few
      // seconds, sink back into the dark, and come up somewhere else later.
      vent.presenceTimer -= dt;
      if (vent.presenceTimer <= 0) {
        vent.showing = !vent.showing;
        vent.presenceTimer = vent.showing
          ? 0.9 + Math.random() * (1.8 + vent.alert * 2.2)
          : 3.5 + Math.random() * (8 - vent.alert * 3.5);
      }
      vent.presence += ((vent.showing ? 1 : 0) - vent.presence) * Math.min(1, dt * 6);
      if (vent.presence < 0.004) vent.presence = 0;

      const blink = Math.sin(elapsed * 0.7 + vent.seed) > 0.972 ? 0.1 : 1;
      vent.eyeMat.opacity = vent.baseOpacity * blink * vent.presence;

      // A vent near the player starts to shake itself open.
      vent.stir = Math.max(0, vent.stir - dt * 0.35);
      const shudder = vent.stir * 0.035;
      vent.grate.position.x = Math.sin(elapsed * 47 + vent.seed) * shudder;
      vent.grate.rotation.z = Math.sin(elapsed * 39 + vent.seed) * shudder * 0.8;
      vent.throatMat.opacity = 0.36 + vent.stir * 0.55;
      vent.teethMat.opacity = Math.min(0.95, Math.max(vent.stir * 1.35, vent.presence * 0.7));
      vent.teeth.forEach((tooth, index) => {
        tooth.rotation.x = Math.PI + Math.sin(elapsed * 26 + index) * vent.stir * 0.25;
      });
    });

    // The corridor pose is not a photograph: it steps out from behind the
    // frame, shifts its weight, and leans a little into the passage.
    if (peekMode === 'corridor' && peeker.group.visible) {
      peekDrift += dt;
      // It comes out to meet you: the closer you get, the further out of the
      // frame it leans until it is standing in the doorway itself.
      const toPlayer = Math.hypot(camera.position.x - peekOrigin.x, camera.position.z - peekOrigin.z);
      const approach = Math.min(1, Math.max(0, 1 - (toPlayer - 2.2) / 4.5));
      const stepOut = Math.min(2.62, peekDrift * 0.12 + approach * 2.4);
      const sway = Math.sin(peekDrift * 1.15) * 0.24 + Math.sin(peekDrift * 2.7) * 0.06;
      const lateral = (2.75 - stepOut) * peekSide;
      const px = peekOrigin.x + peekRight.x * lateral + peekForward.x * sway;
      const pz = peekOrigin.z + peekRight.z * lateral + peekForward.z * sway;
      peeker.group.position.set(px, 0, pz);
      peeker.group.rotation.y = Math.atan2(camera.position.x - px, camera.position.z - pz);
      peeker.head.rotation.y = peekSide * 0.42 + Math.sin(peekDrift * 0.8) * 0.1;
      peeker.head.rotation.z = peekSide * 0.16 + Math.sin(peekDrift * 1.6) * 0.06;

      // Contact: one arm comes out flat, the body pitches in. E: the head
      // comes round to follow you instead of reaching.
      peeker.arms.forEach((arm, index) => {
        const side = index === 0 ? 1 : -1;
        arm.rotation.x = -1.15 * peekReach + 0.08 * peekTurn;
        arm.rotation.y = side * 0.24 * peekTurn;
        arm.rotation.z = side * (0.06 + 0.34 * peekReach);
      });
      peeker.head.rotation.x = 0.02 - 0.24 * peekReach + 0.14 * peekTurn;
      peeker.head.rotation.z = peekSide * 0.16 + Math.sin(peekDrift * 1.6) * 0.06 - 0.14 * peekTurn;
      peeker.setEyeGlow(0.8 + 0.2 * peekReach);

      if (peekReach > 0 || peekTurn > 0) {
        const tx = camera.position.x - px;
        const tz = camera.position.z - pz;
        const tl = Math.hypot(tx, tz) || 1;
        // Reach toward the visor at contact; step back out of the way, still
        // facing you, once you have shifted past.
        const outward = 0.34 * peekReach - 0.85 * peekTurn;
        peeker.group.position.set(px + (tx / tl) * outward, 0, pz + (tz / tl) * outward);
      }
    }

    if (finalLife > 0) {
      finalLife -= dt;
      const t = Math.min(1, Math.max(0, 1 - Math.max(0, finalLife) / finalDuration));
      const ease = (v) => v * v * (3 - 2 * v);

      // 0.00  it hangs back in the dark, jaw cracking open
      // 0.25  both arms come up and it starts toward the visor
      // 0.75  the face is against the lens
      const lunge = ease(Math.min(1, Math.max(0, (t - 0.22) / 0.55)));
      const jawOpen = ease(Math.min(1, Math.max(0, (t - 0.06) / 0.3)));

      camera.getWorldDirection(finalDir);
      const distance = 2.55 - lunge * 1.8;
      const jitter = 0.01 + t * 0.06;
      scareGroup.position.set(
        camera.position.x + finalDir.x * distance + Math.sin(elapsed * 73) * jitter,
        Math.sin(elapsed * 61) * jitter * 0.7,
        camera.position.z + finalDir.z * distance + Math.cos(elapsed * 67) * jitter,
      );
      scareGroup.rotation.y = Math.atan2(-finalDir.x, -finalDir.z);
      scareGroup.scale.setScalar(1.15 + t * 2.6);
      // keep the face level with the visor however far the group scales
      scareCreature.group.position.y = 1.62 / scareGroup.scale.y - CREATURE_HEAD_Y;

      // the head cocks, the jaw gapes, and both arms reach for the glass
      scareCreature.head.rotation.x = -0.03 + lunge * 0.2;
      scareCreature.head.rotation.y = Math.sin(elapsed * 21) * (0.1 + lunge * 0.5);
      scareCreature.head.rotation.z = 0.05 + Math.sin(elapsed * 31) * 0.02 * t;
      scareCreature.jaw.rotation.x = jawOpen * 0.85;
      scareCreature.arms.forEach((arm, index) => {
        const side = index === 0 ? 1 : -1;
        arm.rotation.x = -lunge * 1.15;
        arm.rotation.y = side * lunge * 0.3;
        arm.rotation.z = side * (0.05 + lunge * 0.12);
      });
      scareCreature.setEyeGlow(0.55 + jawOpen * 0.45);

      if (finalLife <= 0) scareGroup.visible = false;
    } else if (scareLife > 0) {
      scareLife -= dt;
      const intensity = Math.max(0, scareLife / 0.7);
      const jitter = intensity * 0.02;
      scareGroup.position.set(
        scareOrigin.x + Math.sin(elapsed * 63) * jitter,
        Math.sin(elapsed * 54) * jitter * 0.6,
        scareOrigin.z + Math.cos(elapsed * 58) * jitter,
      );
      scareGroup.scale.setScalar(1.18 + Math.sin(elapsed * 44) * 0.05);
      scareCreature.group.position.y = 1.5 / scareGroup.scale.y - CREATURE_HEAD_Y;
      scareCreature.jaw.rotation.x = 0.3 + intensity * 0.5;
      scareCreature.head.rotation.y = Math.sin(elapsed * 30) * 0.3 * intensity;
      scareCreature.arms.forEach((arm, index) => {
        arm.rotation.x = -0.5 * intensity;
        arm.rotation.z = (index === 0 ? 1 : -1) * 0.08 * intensity;
      });
      if (scareLife <= 0) scareGroup.visible = false;
    }

    if (lurker.group.visible) {
      if (lurkMode === 'door') {
        // out of the frame, two seconds of nothing, then gone — sooner if
        // you turn and meet its eyes
        lurkLife -= dt;
        lurker.head.rotation.z = 0.05 + Math.sin(elapsed * 3.1) * 0.05;
        lurker.setEyeGlow(0.85 + Math.sin(elapsed * 17) * 0.15);

        const dx = camera.position.x - lurker.group.position.x;
        const dz = camera.position.z - lurker.group.position.z;
        const dist = Math.hypot(dx, dz) || 1;
        if (dist > 2) {
          const forward = new THREE.Vector3();
          camera.getWorldDirection(forward);
          // dx/dz point from it to the camera, so flip them to aim.
          if ((-dx * forward.x - dz * forward.z) / dist > 0.9) {
            hideLurker();
            lurkerVanished = true;
          }
        }

        if (lurkMode === 'door' && lurkLife <= 0) hideLurker();
      } else if (lurkMode === 'stand') {
        lurker.head.rotation.z = 0.05 + Math.sin(elapsed * 1.3) * 0.04;
        lurker.jaw.rotation.x = 0.08 + Math.sin(elapsed * 2.2) * 0.05;
        lurker.setEyeGlow(0.78 + Math.sin(elapsed * 6.4) * 0.22);
      } else if (lurkMode === 'grab') {
        lurker.head.rotation.y = Math.sin(elapsed * 32) * 0.34;
        lurker.head.rotation.z = Math.sin(elapsed * 43) * 0.07;
        lurker.jaw.rotation.x = 0.5 + Math.sin(elapsed * 26) * 0.25;
        lurker.setEyeGlow(1);
        lurker.arms.forEach((arm, index) => {
          arm.rotation.x = -0.9 + Math.sin(elapsed * 19 + index) * 0.25;
          arm.rotation.z = (index === 0 ? 1 : -1) * 0.12;
        });
      }
    }

    if (peeker.group.visible) {
      peekLife += dt;
      if (peekMode === 'vent') {
        // The head leans in the frame, looking along the corridor instead
        // of straight back at you.
        peeker.head.rotation.z = 0.3 + Math.sin(elapsed * 2.4) * 0.05;
        peeker.head.rotation.y = 0.55 + Math.sin(elapsed * 0.9) * 0.08;
        peeker.setEyeGlow(0.9 + Math.sin(elapsed * 9.3) * 0.1);
      } else if (peekMode === 'corridor') {
        peeker.head.rotation.y = Math.sin(elapsed * 1.7) * 0.12;
        peeker.jaw.rotation.x = 0.06 + Math.sin(elapsed * 2.6) * 0.05;
        peeker.setEyeGlow(0.75 + Math.sin(elapsed * 7.7) * 0.2);
      }
    }

    updateGhost(dt, camera);
  }

  // The closing jumpscare: the face is dragged in front of the helmet
  // and rushes the lens. main.js calls this once, then plays the flash.
  let finalLife = 0;
  const finalDuration = 2.2;
  const finalDir = new THREE.Vector3();

  function finalScare(camera) {
    scareLife = 0;
    scareGroup.visible = true;
    scareGroup.scale.setScalar(1.8);
    scareCreature.group.position.y = 1.62 / 1.8 - CREATURE_HEAD_Y;
    scareCreature.head.rotation.set(-0.03, 0, 0.05);
    scareCreature.jaw.rotation.x = 0;
    scareCreature.arms.forEach((arm) => arm.rotation.set(0, 0, 0));
    camera.getWorldDirection(finalDir);
    scareGroup.position.set(
      camera.position.x + finalDir.x * 2.1,
      0,
      camera.position.z + finalDir.z * 2.1,
    );
    scareGroup.rotation.y = Math.atan2(-finalDir.x, -finalDir.z);
    finalLife = finalDuration;
  }

  function setAmbience(level) {
    // level 0..1: how close to total failure the ship looks
    const target = 0.03 + (1 - level) * 0.028;
    scene.fog.density += (target - scene.fog.density) * 0.5;
  }

  function setLightsDim(factor) {
    lightEntries.forEach((entry) => {
      entry.base = entry.base * 0.75 + (entry.original ?? entry.base) * 0.25;
    });
  }

  // list: [{ slot, severity }]; severity widens the crack, and a slot with
  // no entry is either never used or welded (see setPatches).
  function setCracks(list) {
    crackSlots.forEach((slot) => {
      slot.mesh.visible = false;
      slot.mesh.material.opacity = 0;
      slot.glow.visible = false;
      slot.glow.material.opacity = 0;
    });

    (list || []).forEach((entry) => {
      const slot = crackSlots[entry.slot];
      if (!slot) return;

      const severity = Math.min(5, Math.max(1, Math.round(Number(entry.severity) || 1)));
      const scale = 0.95 + severity * 0.18;

      slot.mesh.visible = true;
      slot.mesh.scale.setScalar(scale);
      slot.mesh.material.opacity = Math.min(1, 0.78 + severity * 0.045);

      slot.glow.visible = true;
      slot.glow.scale.setScalar(scale);
      slot.glow.material.opacity = 0.16 + severity * 0.035;
    });
  }

  function setPatches(list) {
    crackSlots.forEach((slot) => {
      slot.patch.visible = false;
    });

    (list || []).forEach((index) => {
      const slot = crackSlots[index];
      if (slot) slot.patch.visible = true;
    });
  }

  function setDread(control) {
    const dread = Math.min(1, Math.max(0, (90 - control) / 70));

    ventEntries.forEach((vent, index) => {
      vent.baseOpacity = 0.2 + dread * 0.8 * (index === 0 ? 1 : 0.85);
      vent.alert = dread;
      vent.eyeMat.color.setHex(dread > 0.55 ? 0xffd7c2 : 0xf2eee6);
      vent.throatMat.color.setHex(dread > 0.5 ? 0x410b05 : 0x2a0806);
    });

    bloodMats.forEach((material, index) => {
      material.opacity = Math.min(0.6, Math.max(0, (94 - control) / 60)) * (index % 2 ? 0.85 : 1);
    });
  }

  function ventScare(playerPos, camera) {
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);

    let best = null;
    let bestDot = 0.05;
    ventEntries.forEach((vent) => {
      const dx = vent.group.position.x - playerPos.x;
      const dz = vent.group.position.z - playerPos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 14 || dist < 0.2) return;
      const dot = (dx * forward.x + dz * forward.z) / dist;
      if (dot > bestDot) {
        best = vent.group.position;
        bestDot = dot;
      }
    });

    const origin = best
      ? new THREE.Vector3(best.x, 0, best.z)
      : new THREE.Vector3(playerPos.x + forward.x * 1.8, 0, playerPos.z + forward.z * 1.8);

    scareOrigin.copy(origin);
    scareGroup.position.copy(origin);
    scareGroup.rotation.y = Math.atan2(playerPos.x - origin.x, playerPos.z - origin.z);
    scareGroup.scale.setScalar(1.2);
    scareGroup.visible = true;
    scareCreature.head.rotation.set(-0.03, 0, 0.05);
    scareLife = 0.7;
  }

  // Push the nearest vent into a shudder. main.js calls this every frame
  // with the closeness of the player, so the slats rattle harder as they
  // lean in.
  function stirVent(index, intensity = 1) {
    const vent = ventEntries[index];
    if (!vent) return;
    vent.stir = Math.max(vent.stir || 0, Math.min(1, Math.max(0, intensity)));
  }

  // The thing comes out of one particular vent instead of the doorway
  // scare, so the effect lands where the player is standing.
  function ventScareAt(index, playerPos, camera) {
    const vent = ventEntries[index];
    if (!vent) {
      ventScare(playerPos, camera);
      return;
    }

    const origin = new THREE.Vector3(vent.group.position.x, 0, vent.group.position.z);
    scareOrigin.copy(origin);
    scareGroup.position.copy(origin);
    scareGroup.rotation.y = Math.atan2(playerPos.x - origin.x, playerPos.z - origin.z);
    scareGroup.scale.setScalar(1.2);
    scareGroup.visible = true;
    scareCreature.head.rotation.set(-0.03, 0, 0.05);
    scareCreature.jaw.rotation.x = 0.7;
    scareLife = 0.85;
    vent.stir = 1;
  }

  function setHunterActive(active) {
    stalker.group.visible = !!active;
  }

  // Pick the doorway ahead of the player and put the thing just beyond it,
  // so the frame reads around its shoulders.
  function lurkSpot(playerPos, camera) {
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    const room = roomAt(playerPos.x, playerPos.z);

    let best = null;
    let bestScore = -Infinity;
    DOORWAYS.forEach((door) => {
      const dx = door.x - playerPos.x;
      const dz = door.z - playerPos.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 2.4 || dist > 20) return;

      const dot = (dx * forward.x + dz * forward.z) / dist;
      if (dot < -0.05) return;

      const score = dot * 2 - Math.abs(dist - 9) * 0.06;
      if (score > bestScore) {
        bestScore = score;
        best = door;
      }
    });

    if (!best) return null;

    const dx = best.x - playerPos.x;
    const dz = best.z - playerPos.z;
    const len = Math.hypot(dx, dz) || 1;
    return new THREE.Vector3(best.x + (dx / len) * 0.9, 0, best.z + (dz / len) * 0.9);
  }

  function showLurker(playerPos, camera, mode = 'stand') {
    const spot = lurkSpot(playerPos, camera);
    if (!spot) return false;

    lurker.group.position.set(spot.x, 0, spot.z);
    lurker.group.rotation.set(0, Math.atan2(playerPos.x - spot.x, playerPos.z - spot.z), 0);
    lurker.group.scale.setScalar(mode === 'door' ? 1.12 : 1.06);
    lurker.group.visible = true;
    lurker.jaw.rotation.x = mode === 'door' ? 0.22 : 0.06;
    lurker.head.rotation.set(-0.03, 0, 0.05);
    lurker.arms.forEach((arm) => arm.rotation.set(0, 0, 0));
    lurker.setEyeGlow(0.85);

    lurkMode = mode;
    lurkLife = mode === 'door' ? 2 : 0;
    return true;
  }

  function hideLurker() {
    lurker.group.visible = false;
    lurkMode = 'idle';
    lurkLife = 0;
  }

  // ── peeking ───────────────────────────────────────────────
  // Two half-poses. The vent one keeps the body inside the wall so only a
  // face shows through the slats; the corridor one puts a shoulder just
  // past the far door frame.

  function ventSpotAhead(playerPos, camera) {
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);

    let best = null;
    let bestScore = -Infinity;
    ventEntries.forEach((vent, index) => {
      const v = vent.group.position;
      const dx = v.x - playerPos.x;
      const dz = v.z - playerPos.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 1.4 || dist > 12) return;

      const dot = (dx * forward.x + dz * forward.z) / (dist || 1);
      if (dot < 0.15) return;

      const score = dot * 2 - Math.abs(dist - 5.5) * 0.07;
      if (score > bestScore) {
        bestScore = score;
        best = { index, vent, dist };
      }
    });

    return best;
  }

  function showVentPeek(playerPos, camera) {
    const spot = ventSpotAhead(playerPos, camera);
    if (!spot) return null;

    const v = spot.vent.group.position;
    const normal = new THREE.Vector3();
    spot.vent.group.getWorldDirection(normal);
    const scale = 0.78;

    // Only the head exists for this pose: it leans out of the grate at an
    // angle, and the body that owns it stays inside the duct.
    peeker.group.children.forEach((child) => {
      child.visible = child === peeker.head;
    });

    const towardX = playerPos.x - v.x;
    const towardZ = playerPos.z - v.z;
    const towardLen = Math.hypot(towardX, towardZ) || 1;
    const lean = 0.24;

    peeker.group.position.set(
      v.x + (towardX / towardLen) * lean + normal.x * 0.06,
      v.y - CREATURE_HEAD_Y * scale,
      v.z + (towardZ / towardLen) * lean + normal.z * 0.06,
    );
    peeker.group.scale.setScalar(scale);
    peeker.group.visible = true;
    peeker.group.rotation.set(0, Math.atan2(playerPos.x - v.x, playerPos.z - v.z), 0.22);
    peeker.head.rotation.set(0.04, 0.55, 0.3);
    peeker.jaw.rotation.x = 0.05;
    peeker.arms.forEach((arm, index) => arm.rotation.set(0, 0, (index ? -1 : 1) * 0.2));
    peeker.setEyeGlow(0.95);

    peekMode = 'vent';
    peekLife = 0;
    return { x: v.x, y: v.y, z: v.z, index: spot.index };
  }

  function showCorridorPeek(playerPos, camera) {
    const spot = lurkSpot(playerPos, camera);
    if (!spot) return null;

    // This pose has a body again.
    peeker.group.children.forEach((child) => {
      child.visible = true;
    });

    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();
    const right = new THREE.Vector3(-forward.z, 0, forward.x);
    const side = Math.random() < 0.5 ? -1 : 1;
    // Far enough past the jamb that the wall takes the rest of it.
    const x = spot.x + right.x * 2.75 * side;
    const z = spot.z + right.z * 2.75 * side;

    peekOrigin.set(spot.x, 0, spot.z);
    peekRight.copy(right);
    peekForward.copy(forward);
    peekSide = side;
    peekDrift = 0;

    peeker.group.position.set(x, 0, z);
    peeker.group.scale.setScalar(1.02);
    peeker.group.visible = true;
    peeker.group.rotation.set(0, Math.atan2(playerPos.x - x, playerPos.z - z), 0);
    peeker.head.rotation.set(0.02, side * 0.42, side * 0.16);
    peeker.jaw.rotation.x = 0.07;
    peeker.arms.forEach((arm) => arm.rotation.set(0, 0, 0));
    peeker.setEyeGlow(0.8);

    peekMode = 'corridor';
    peekLife = 0;
    // fx/fz point down the corridor, away from the player: the side it
    // blocks. Behind it there is nothing to push against.
    return { x, z, fx: forward.x, fz: forward.z };
  }

  function hidePeek() {
    peeker.group.visible = false;
    peekMode = 'idle';
    peekLife = 0;
    peekReach = 0;
    peekTurn = 0;
  }

  // It puts a hand out when you walk into it.
  function peekLunge() {
    if (peekMode !== 'corridor') return;
    peekReach = 1;
    peekTurn = 0;
  }

  // Shifted past, it turns its head to follow you rather than lunging.
  function peekTurnHead() {
    if (peekMode !== 'corridor') return;
    peekTurn = 1;
    peekReach = 0;
  }

  function setPeekVisible(visible) {
    if (peekMode === 'idle') return;
    peeker.group.visible = !!visible;
  }

  // Right in the visor, jaw open, both hands up: the struggle pose.
  function grabLurker(camera) {
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);

    const grabScale = 1.55;
    lurker.group.position.set(
      camera.position.x + forward.x * 1.55,
      1.62 / grabScale - CREATURE_HEAD_Y,
      camera.position.z + forward.z * 1.55,
    );
    lurker.group.rotation.set(0, Math.atan2(-forward.x, -forward.z), 0);
    lurker.group.scale.setScalar(grabScale);
    lurker.group.visible = true;
    lurker.jaw.rotation.x = 0.55;
    lurker.head.rotation.set(-0.03, 0, 0.05);
    lurker.arms.forEach((arm, index) => {
      arm.rotation.set(-0.85, 0, (index === 0 ? 1 : -1) * 0.1);
    });
    lurker.setEyeGlow(1);

    lurkMode = 'grab';
    lurkLife = 0;
  }

  // ── bay shift ─────────────────────────────────────────────
  // Everything loose was drawn at the old (shorter-corridor) coordinates.
  // Structure is already at the new ones, so it is skipped; everything else
  // moves out with its compartment, props and lights together.
  root.children.forEach((child) => {
    if (child.userData.structural) return;
    const moved = outPoint(child.position.x, child.position.z);
    child.position.x = moved.x;
    child.position.z = moved.z;
  });

  return {
    root,
    update,
    flicker,
    showGhost,
    showWatcher,
    hideGhost,
    pickGhostSpot,
    ventScare,
    ventScareAt,
    stirVent,
    ventFace: (index) => (ventEntries[index] ? ventEntries[index].presence : 0),
    vents: ventEntries.map((vent) => ({
      x: vent.group.position.x,
      y: vent.group.position.y,
      z: vent.group.position.z,
    })),
    finalScare,
    setCracks,
    setPatches,
    crackSlots,
    setDread,
    setHunterActive,
    showLurker,
    hideLurker,
    grabLurker,
    showVentPeek,
    showCorridorPeek,
    peekLunge,
    peekTurnHead,
    hidePeek,
    setPeekVisible,
    peekPos: () => ({
      x: peeker.group.position.x,
      z: peeker.group.position.z,
      visible: peeker.group.visible,
    }),
    consumeGhostVanish,
    consumeLurkerVanish: () => {
      const value = lurkerVanished;
      lurkerVanished = false;
      return value;
    },
    peekMode: () => peekMode,
    hunter: stalker.group,
    lurker: lurker.group,
    doorways: DOORWAYS,
    setAmbience,
    starTex,
    lightEntries,
    ghost,
    elapsed: () => elapsed,
  };
}

// small placeholder to keep the holo texture local to this module
function makeHoloTexture() {
  const [canvas, ctx] = makeCanvas(256, 256);
  ctx.clearRect(0, 0, 256, 256);
  ctx.strokeStyle = 'rgba(120,190,255,0.8)';
  ctx.lineWidth = 1.5;
  [48, 88, 122].forEach((r) => {
    ctx.beginPath();
    ctx.arc(128, 128, r, 0, Math.PI * 2);
    ctx.stroke();
  });
  ctx.beginPath();
  ctx.moveTo(128, 10);
  ctx.lineTo(128, 246);
  ctx.moveTo(10, 128);
  ctx.lineTo(246, 128);
  ctx.stroke();
  for (let i = 0; i < 40; i += 1) {
    const x = Math.random() * 256;
    const y = Math.random() * 256;
    ctx.fillStyle = 'rgba(150,220,255,0.8)';
    ctx.beginPath();
    ctx.arc(x, y, Math.random() * 1.8 + 0.4, 0, Math.PI * 2);
    ctx.fill();
  }
  return canvasTexture(canvas);
}

// ─────────────────────────────────────────────────────────────
// cryo sleep pod (interactive; the day ends here)
// ─────────────────────────────────────────────────────────────

export function createSleepPod() {
  const group = new THREE.Group();

  const base = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.22, 1.3), trimBaseMat);
  base.position.y = 0.11;
  group.add(base);

  const pod = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.62, 1.9, 18, 1, true), glassMat);
  pod.position.y = 1.18;
  group.add(pod);

  const inner = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.3, 1.0, 4, 10),
    new THREE.MeshStandardMaterial({ color: 0x0a1418, emissive: 0x1f5f74, emissiveIntensity: 0.35, roughness: 0.8 }),
  );
  inner.position.y = 1.1;
  group.add(inner);

  [0.24, 2.08].forEach((y) => {
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(0.6, 0.045, 8, 24),
      new THREE.MeshStandardMaterial({ color: 0x2b3945, metalness: 0.9, roughness: 0.35, emissive: 0x2a7f97, emissiveIntensity: 0.4 }),
    );
    rim.rotation.x = Math.PI / 2;
    rim.position.y = y;
    group.add(rim);
  });

  const panelTex = (() => {
    const [canvas, ctx] = makeCanvas(256, 256);
    ctx.fillStyle = 'rgba(3,10,14,0.95)';
    ctx.fillRect(0, 0, 256, 256);
    ctx.strokeStyle = 'rgba(120,230,255,0.8)';
    ctx.lineWidth = 3;
    ctx.strokeRect(8, 8, 240, 240);
    ctx.fillStyle = '#a9ecff';
    ctx.font = '700 42px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('CRYO', 128, 110);
    ctx.font = '500 26px ui-monospace, monospace';
    ctx.fillStyle = 'rgba(255,180,94,0.9)';
    ctx.fillText('END SHIFT', 128, 160);
    return canvasTexture(canvas);
  })();

  const panel = new THREE.Mesh(
    new THREE.PlaneGeometry(0.62, 0.62),
    new THREE.MeshBasicMaterial({ map: panelTex, transparent: true, fog: true }),
  );
  panel.position.set(0, 1.42, 0.62);
  group.add(panel);

  const halo = new THREE.Mesh(
    new THREE.TorusGeometry(1.0, 0.025, 6, 40),
    new THREE.MeshBasicMaterial({ color: 0x63e0ff, transparent: true, opacity: 0.5, fog: true }),
  );
  halo.rotation.x = Math.PI / 2;
  halo.position.y = 0.04;
  group.add(halo);

  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.55, 0.95, 3.2, 18, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0x56c8e8,
      transparent: true,
      opacity: 0.045,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: true,
    }),
  );
  beam.position.y = 1.7;
  group.add(beam);

  const light = new THREE.PointLight(0x6fe0ff, 5, 5.5, 2);
  light.position.set(0, 1.7, 0.6);
  group.add(light);

  group.userData.halo = halo;
  group.userData.beam = beam;
  return group;
}

// ─────────────────────────────────────────────────────────────
// escape pod (interactive; the way off the ship)
// ─────────────────────────────────────────────────────────────

export function createEscapePod() {
  const group = new THREE.Group();

  const cradleMat = new THREE.MeshStandardMaterial({ color: 0x2a333d, metalness: 0.82, roughness: 0.42 });
  const hullMat = new THREE.MeshStandardMaterial({ color: 0x6b7884, metalness: 0.35, roughness: 0.85 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x141b22, metalness: 0.7, roughness: 0.55 });
  const litMat = new THREE.MeshStandardMaterial({
    color: 0x0b1a20,
    emissive: 0x66d9ff,
    emissiveIntensity: 0.18,
    roughness: 0.4,
  });

  // launch cradle the pod sits in
  const cradle = new THREE.Mesh(new THREE.CylinderGeometry(2.15, 2.35, 0.3, 28), cradleMat);
  cradle.position.y = 0.15;
  group.add(cradle);

  [[-1.55, -1.55], [1.55, -1.55], [-1.55, 1.55], [1.55, 1.55]].forEach(([x, z]) => {
    const clamp = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.28), cradleMat);
    clamp.position.set(x * 0.9, 0.62, z * 0.9);
    clamp.rotation.y = -Math.atan2(z, x);
    group.add(clamp);
  });

  // scaffolding, torn down once the pod is assembled
  const scaffold = new THREE.Group();
  [[-1.7, -1.1], [1.7, -1.1], [-1.7, 1.1], [1.7, 1.1]].forEach(([x, z]) => {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, 3.2, 0.16), cradleMat);
    post.position.set(x, 1.6, z);
    scaffold.add(post);
  });
  [-1.1, 1.1].forEach((z) => {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.14, 0.14), cradleMat);
    beam.position.set(0, 3.1, z);
    scaffold.add(beam);
  });
  group.add(scaffold);

  // hull, nose and window band
  const body = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.3, 2.5, 24, 1), hullMat);
  body.position.y = 1.6;
  group.add(body);

  const nose = new THREE.Mesh(new THREE.ConeGeometry(1.15, 1.15, 24), hullMat);
  nose.position.y = 3.42;
  group.add(nose);

  const collar = new THREE.Mesh(new THREE.CylinderGeometry(1.32, 1.32, 0.16, 24), darkMat);
  collar.position.y = 2.86;
  group.add(collar);

  const windowBand = new THREE.Mesh(new THREE.CylinderGeometry(1.17, 1.17, 0.42, 24, 1, true), litMat);
  windowBand.position.y = 2.2;
  group.add(windowBand);

  // engine bells
  [[-0.55, 0], [0.55, 0], [0, 0.7]].forEach(([x, z]) => {
    const bell = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.62, 14, 1, true), darkMat);
    bell.position.set(x, 0.42, z * 0.6);
    bell.rotation.x = Math.PI;
    group.add(bell);
  });

  // status lamps around the cradle: amber while unbuilt, green once ready
  const lamps = [];
  for (let i = 0; i < 6; i += 1) {
    const angle = (i / 6) * Math.PI * 2;
    const material = new THREE.MeshStandardMaterial({
      color: 0x0a1014,
      emissive: 0xff7a45,
      emissiveIntensity: 0.55,
      roughness: 0.5,
    });
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.06, 0.1), material);
    lamp.position.set(Math.cos(angle) * 2.05, 0.31, Math.sin(angle) * 2.05);
    lamp.rotation.y = -angle;
    lamps.push(material);
    group.add(lamp);
  }

  // build console in front of the cradle
  const consoleGroup = new THREE.Group();
  const pedestal = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.0, 0.5), cradleMat);
  pedestal.position.y = 0.5;
  consoleGroup.add(pedestal);

  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(0.66, 0.42),
    new THREE.MeshBasicMaterial({ color: 0x8fe6ff, transparent: true, opacity: 0.5 }),
  );
  screen.position.set(0, 1.02, -0.26);
  screen.rotation.x = -0.5;
  consoleGroup.add(screen);
  consoleGroup.position.set(0, 0, -2.6);
  group.add(consoleGroup);

  let built = false;

  function setBuilt(value) {
    built = !!value;
    scaffold.visible = !built;
    hullMat.color.set(built ? 0x8b9aa6 : 0x5f6d78);
    hullMat.roughness = built ? 0.7 : 0.85;
    litMat.emissiveIntensity = built ? 1.4 : 0.18;
    nose.visible = built;
    windowBand.visible = built;
    screen.material.color.set(built ? 0x8bffc8 : 0x8fe6ff);
    lamps.forEach((material) => {
      material.emissive.set(built ? 0x66ffb2 : 0xff7a45);
      material.emissiveIntensity = built ? 1.5 : 0.55;
    });
    body.scale.setScalar(built ? 1 : 0.86);
  }

  setBuilt(false);

  return {
    group,
    setBuilt,
    isBuilt: () => built,
    update(time) {
      litMat.emissiveIntensity = built
        ? 1.1 + Math.sin(time * 2.4) * 0.3
        : 0.14 + Math.sin(time * 1.6) * 0.04;
    },
  };
}
