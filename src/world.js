import * as THREE from 'three';

// ─────────────────────────────────────────────────────────────
// Ship layout. All rooms and corridors are axis-aligned boxes
// defined in world units (1 unit ≈ 1 metre). Corridors overlap
// their rooms so the walkable union has no cracks at the seams.
// ─────────────────────────────────────────────────────────────

export const LAYOUT = {
  hub: { minX: -7, maxX: 7, minZ: -7, maxZ: 7, label: 'CENTRAL HUB', accent: 0x63d7ff },
  corridorN: { minX: -2.5, maxX: 2.5, minZ: -19, maxZ: -7, label: 'CORRIDOR NORTH', accent: 0x3f8499 },
  reactor: { minX: -10, maxX: 10, minZ: -33, maxZ: -19, label: 'REACTOR BAY', accent: 0xff6a32 },
  corridorE: { minX: 7, maxX: 19, minZ: -2.5, maxZ: 2.5, label: 'CORRIDOR EAST', accent: 0x3f8499 },
  med: { minX: 19, maxX: 33, minZ: -8, maxZ: 8, label: 'HYDRO BAY', accent: 0x59f0b0 },
  corridorW: { minX: -19, maxX: -7, minZ: -2.5, maxZ: 2.5, label: 'CORRIDOR WEST', accent: 0x3f8499 },
  nav: { minX: -33, maxX: -19, minZ: -8, maxZ: 8, label: 'NAV / COMMS', accent: 0x6f93ff },
};

// Collision uses the room boxes plus corridors pushed one metre into
// each adjoining room, so the inset-by-player-radius test always has
// an overlap at the seams and doorway thresholds stay passable.
const COLLISION_OVERLAP = 1.0;
export const WALKABLE = Object.entries(LAYOUT).map(([key, rect]) => {
  if (key === 'corridorN') {
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

    ctx.strokeStyle = 'rgba(186,208,220,0.72)';
    ctx.lineWidth = width;
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

  function addBox(w, h, d, x, y, z, material, parent = root) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  }

  function addWallZ(z, x1, x2, accent) {
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
  }

  function addCeiling(rect) {
    const w = rect.maxX - rect.minX;
    const d = rect.maxZ - rect.minZ;
    const ceiling = new THREE.Mesh(
      new THREE.PlaneGeometry(w, d),
      new THREE.MeshStandardMaterial({ color: 0x0a0e13, roughness: 1, metalness: 0.1 }),
    );
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set((rect.minX + rect.maxX) / 2, WALL_H - 0.02, (rect.minZ + rect.maxZ) / 2);
    root.add(ceiling);
  }

  function addFixture(x, z, color, intensity, distance, longAxis = 'x', height = 3.24) {
    const fixtureMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(0.5), fog: true });
    const w = longAxis === 'x' ? 1.9 : 0.42;
    const d = longAxis === 'x' ? 0.42 : 1.9;
    const fixture = addBox(w, 0.05, d, x, height, z, fixtureMat);
    fixture.material.depthWrite = false;
    addBox(w + 0.14, 0.12, d + 0.14, x, height + 0.07, z, trimBaseMat);

    const light = new THREE.PointLight(color, intensity, distance, 2);
    light.position.set(x, height - 0.32, z);
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
  addWallZ(7, -7, 7, 0x63d7ff);
  addWallX(-7, -7, -2.5, 0x63d7ff);
  addWallX(-7, 2.5, 7, 0x63d7ff);
  addWallX(7, -7, -2.5, 0x63d7ff);
  addWallX(7, 2.5, 7, 0x63d7ff);

  // north corridor
  addWallX(-2.5, -19, -7, 0x3f8499);
  addWallX(2.5, -19, -7, 0x3f8499);

  // reactor
  addWallX(-10, -33, -19, 0xff6a32);
  addWallX(10, -33, -19, 0xff6a32);
  addWallZ(-33, -10, 10, 0xff6a32);
  addWallZ(-19, -10, -2.5, 0xff6a32);
  addWallZ(-19, 2.5, 10, 0xff6a32);

  // east corridor
  addWallZ(-2.5, 7, 19, 0x3f8499);
  addWallZ(2.5, 7, 19, 0x3f8499);

  // cryo bay
  addWallX(33, -8, 8, 0x59f0b0);
  addWallZ(-8, 19, 33, 0x59f0b0);
  addWallZ(8, 19, 33, 0x59f0b0);
  addWallX(19, -8, -2.5, 0x59f0b0);
  addWallX(19, 2.5, 8, 0x59f0b0);

  // west corridor
  addWallZ(-2.5, -19, -7, 0x3f8499);
  addWallZ(2.5, -19, -7, 0x3f8499);

  // nav / comms
  addWallX(-33, -8, 8, 0x6f93ff);
  addWallZ(-8, -33, -19, 0x6f93ff);
  addWallZ(8, -33, -19, 0x6f93ff);
  addWallX(-19, -8, -2.5, 0x6f93ff);
  addWallX(-19, 2.5, 8, 0x6f93ff);

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
    { x: 0, z: -19, axis: 'z' },
    { x: 7, z: 0, axis: 'x' },
    { x: 19, z: 0, axis: 'x' },
    { x: -7, z: 0, axis: 'x' },
    { x: -19, z: 0, axis: 'x' },
  ];

  DOORWAYS.forEach((door) => {
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
  const northPipe = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 11.6, 8), pipeMat);
  northPipe.rotation.x = Math.PI / 2;
  northPipe.position.set(-2.05, 3.06, -13);
  root.add(northPipe);
  const northPipe2 = northPipe.clone();
  northPipe2.position.x = 2.05;
  root.add(northPipe2);

  const eastPipe = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 11.4, 8), pipeMat);
  eastPipe.rotation.z = Math.PI / 2;
  eastPipe.position.set(13, 3.08, -2.05);
  root.add(eastPipe);
  const eastPipe2 = eastPipe.clone();
  eastPipe2.position.z = 2.05;
  root.add(eastPipe2);

  const westPipe = eastPipe.clone();
  westPipe.position.set(-13, 3.08, -2.05);
  root.add(westPipe);
  const westPipe2 = eastPipe.clone();
  westPipe2.position.set(-13, 3.08, 2.05);
  root.add(westPipe2);

  // ── lights ────────────────────────────────────────────────
  addFixture(0, -3.4, 0x9fd8ff, 30, 20, 'x');
  addFixture(0, -13, 0x7dc6ee, 18, 13, 'x');
  addFixture(13, 0, 0x7dc6ee, 18, 13, 'z');
  addFixture(-13, 0, 0x7dc6ee, 18, 13, 'z');
  addFixture(0, -26, 0xff6a32, 46, 24, 'z');
  addFixture(26, -1.4, 0x7dffc4, 30, 20, 'x');
  addFixture(-26, -0.6, 0x8fa9ff, 30, 20, 'x');

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

  // ── hull damage, vents and the thing in the dark ──────────
  const crackTex = makeCrackTexture();
  const crackMeshes = [];
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
  ];

  crackSpecs.forEach((spec) => {
    const material = new THREE.MeshBasicMaterial({
      map: crackTex,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: true,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 1.4), material);
    mesh.position.set(spec.x, spec.y, spec.z);
    mesh.rotation.y = spec.ry;
    mesh.visible = false;
    root.add(mesh);
    crackMeshes.push(mesh);
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
      new THREE.BoxGeometry(0.64, 0.44, 0.08),
      new THREE.MeshStandardMaterial({ color: 0x080d12, roughness: 0.9, metalness: 0.4 }),
    );
    vent.add(frame);

    const recess = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.34, 0.03), new THREE.MeshBasicMaterial({ color: 0x000000 }));
    recess.position.z = 0.045;
    vent.add(recess);

    const eyeMat = new THREE.MeshBasicMaterial({
      color: 0xf5eee4,
      transparent: true,
      opacity: 0.14,
      depthWrite: false,
      fog: true,
    });

    [-0.1, 0.1].forEach((x) => {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.032, 8, 6), eyeMat);
      eye.position.set(x, 0, 0.065);
      vent.add(eye);
    });

    for (let i = 0; i < 4; i += 1) {
      const slat = new THREE.Mesh(
        new THREE.BoxGeometry(0.56, 0.035, 0.035),
        new THREE.MeshStandardMaterial({ color: 0x1b242c, metalness: 0.7, roughness: 0.4 }),
      );
      slat.position.set(0, -0.14 + i * 0.095, 0.11);
      vent.add(slat);
    }

    root.add(vent);
    ventEntries.push({ group: vent, eyeMat, baseOpacity: 0.14, seed: Math.random() * 10 });
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

  function showGhost(playerPos, position) {
    const pos = position || pickGhostSpot(playerPos);
    if (!pos) return;
    ghost.group.position.set(pos.x, 0, pos.z);
    ghost.group.rotation.set(0, Math.atan2(playerPos.x - pos.x, playerPos.z - pos.z), 0);
    ghost.group.visible = true;
    ghostMode = 'fadein';
    ghostLife = 0;
    ghostFade = 0;
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
    ghostFade = 0;
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
      ghostFade = Math.min(1, ghostFade + dt / 0.7);
      ghostLife += dt;

      const dx = camera.position.x - ghost.group.position.x;
      const dz = camera.position.z - ghost.group.position.z;
      const dist = Math.hypot(dx, dz);
      ghost.group.rotation.y = Math.atan2(dx, dz);

      // It stands in the background until you actually look at it.
      if (ghostLife > 0.6 && ghostFade > 0.4 && dist > 2.2) {
        const forward = new THREE.Vector3();
        camera.getWorldDirection(forward);
        const toGhost = new THREE.Vector3(-dx, 0, -dz).normalize();
        if (forward.dot(toGhost) > 0.82) ghostMode = 'fadeout';
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

  function pickGhostSpot(playerPos) {
    const spots = [
      { x: 0, z: -17.4 },
      { x: 4.2, z: 6.3 },
      { x: 17.4, z: 0 },
      { x: -17.4, z: 0 },
      { x: 0, z: -31.4 },
      { x: 31.4, z: 0 },
      { x: -31.4, z: 0 },
      { x: 26, z: 7.2 },
      { x: -26, z: -7.2 },
    ];
    let best = null;
    let bestDist = 0;
    spots.forEach((s) => {
      const d = Math.hypot(s.x - playerPos.x, s.z - playerPos.z);
      if (d > bestDist) {
        bestDist = d;
        best = s;
      }
    });
    return bestDist > 7 ? best : spots[0];
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

    ventEntries.forEach((vent) => {
      const blink = Math.sin(elapsed * 0.7 + vent.seed) > 0.972 ? 0.06 : 1;
      vent.eyeMat.opacity = Math.max(0.04, vent.baseOpacity * blink);
    });

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
        // out of the frame, two seconds of nothing, then gone
        lurkLife -= dt;
        lurker.head.rotation.z = 0.05 + Math.sin(elapsed * 3.1) * 0.05;
        lurker.setEyeGlow(0.85 + Math.sin(elapsed * 17) * 0.15);
        if (lurkLife <= 0) hideLurker();
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

  function setHullDamage(level) {
    crackMeshes.forEach((mesh, index) => {
      mesh.visible = level >= index * 0.75;
      if (!mesh.visible) return;

      const scale = Math.min(1.8, 0.6 + level * 0.1 + (index % 3) * 0.08);
      mesh.scale.setScalar(scale);
      mesh.material.opacity = Math.min(0.72, 0.22 + level * 0.055);
    });
  }

  function setDread(control) {
    const dread = Math.min(1, Math.max(0, (90 - control) / 70));

    ventEntries.forEach((vent, index) => {
      vent.baseOpacity = 0.2 + dread * 0.8 * (index === 0 ? 1 : 0.85);
      vent.eyeMat.color.setHex(dread > 0.55 ? 0xffd7c2 : 0xf2eee6);
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

  return {
    root,
    update,
    flicker,
    showGhost,
    showWatcher,
    hideGhost,
    pickGhostSpot,
    ventScare,
    finalScare,
    setHullDamage,
    setDread,
    setHunterActive,
    showLurker,
    hideLurker,
    grabLurker,
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
