import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const canvas = document.querySelector('#view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.setClearColor(0x090c10, 1);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x090c10, 12, 28);

const mainCamera = new THREE.PerspectiveCamera(45, 1, 0.05, 100);
mainCamera.position.set(7.5, 5.1, 8.5);
const controls = new OrbitControls(mainCamera, canvas);
controls.target.set(0, 1.2, 0);
controls.enableDamping = true;

const topCamera = new THREE.PerspectiveCamera(42, 1, 0.05, 100);
topCamera.position.set(0, 9, 0.01);
topCamera.lookAt(0, 0, 0);
const sideCamera = new THREE.PerspectiveCamera(45, 1, 0.05, 100);
sideCamera.position.set(8, 2.6, 0);
sideCamera.lookAt(0, 1.2, 0);
const wristCamera = new THREE.PerspectiveCamera(58, 1, 0.03, 30);
scene.add(wristCamera);

scene.add(new THREE.HemisphereLight(0xbfd7ff, 0x1d1710, 1.2));
const key = new THREE.DirectionalLight(0xffffff, 2.3);
key.position.set(4, 8, 5);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
scene.add(key);

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(22, 22),
  new THREE.MeshStandardMaterial({ color: 0x111820, roughness: 0.95 })
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);
scene.add(new THREE.GridHelper(14, 28, 0x33404d, 0x1b242d));

// --- Turntable -------------------------------------------------------------
const turntable = new THREE.Group();
scene.add(turntable);
const tableBase = new THREE.Mesh(
  new THREE.CylinderGeometry(2.15, 2.25, 0.24, 64),
  new THREE.MeshStandardMaterial({ color: 0x222b34, metalness: 0.55, roughness: 0.4 })
);
tableBase.position.y = 0.12;
tableBase.castShadow = tableBase.receiveShadow = true;
turntable.add(tableBase);

const materialRoot = new THREE.Group();
materialRoot.position.y = 0.26;
turntable.add(materialRoot);

// --- Sparse shell voxel material ------------------------------------------
class SparseShellMaterial {
  constructor({ size = 32, worldSize = 3.0 } = {}) {
    this.size = size;
    this.worldSize = worldSize;
    this.cell = worldSize / size;
    this.half = worldSize / 2;
    this.removed = new Set();
    this.surface = new Set();
    this.tmpMatrix = new THREE.Matrix4();
    this.tmpPos = new THREE.Vector3();
    this.geometry = new THREE.BoxGeometry(this.cell * 0.98, this.cell * 0.98, this.cell * 0.98);
    this.material = new THREE.MeshStandardMaterial({
      color: 0xd9e6ef,
      roughness: 0.88,
      metalness: 0.0
    });
    this.mesh = new THREE.InstancedMesh(this.geometry, this.material, size * size * 6 + 12000);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    materialRoot.add(this.mesh);
    this.reset();
  }

  key(x, y, z) { return `${x},${y},${z}`; }
  inBounds(x, y, z) { return x >= 0 && y >= 0 && z >= 0 && x < this.size && y < this.size && z < this.size; }
  isSolid(x, y, z) { return this.inBounds(x, y, z) && !this.removed.has(this.key(x, y, z)); }
  isSurface(x, y, z) {
    if (!this.isSolid(x, y, z)) return false;
    return DIRS.some(([dx, dy, dz]) => !this.isSolid(x + dx, y + dy, z + dz));
  }
  cellToLocal(x, y, z, out = new THREE.Vector3()) {
    return out.set(
      (x + 0.5) * this.cell - this.half,
      (y + 0.5) * this.cell,
      (z + 0.5) * this.cell - this.half
    );
  }
  localToCell(v) {
    return {
      x: Math.floor((v.x + this.half) / this.cell),
      y: Math.floor(v.y / this.cell),
      z: Math.floor((v.z + this.half) / this.cell)
    };
  }
  reset() {
    this.removed.clear();
    this.surface.clear();
    const n = this.size;
    for (let x = 0; x < n; x++) for (let y = 0; y < n; y++) for (let z = 0; z < n; z++) {
      if (x === 0 || y === 0 || z === 0 || x === n - 1 || y === n - 1 || z === n - 1) {
        this.surface.add(this.key(x, y, z));
      }
    }
    this.rebuildInstances();
  }
  removeSphere(localPoint, radius) {
    const c = this.localToCell(localPoint);
    const rCells = Math.ceil(radius / this.cell) + 1;
    let removedNow = 0;
    const touched = [];

    for (let x = c.x - rCells; x <= c.x + rCells; x++) {
      for (let y = c.y - rCells; y <= c.y + rCells; y++) {
        for (let z = c.z - rCells; z <= c.z + rCells; z++) {
          if (!this.isSolid(x, y, z)) continue;
          this.cellToLocal(x, y, z, this.tmpPos);
          if (this.tmpPos.distanceTo(localPoint) <= radius) {
            const k = this.key(x, y, z);
            this.removed.add(k);
            this.surface.delete(k);
            touched.push([x, y, z]);
            removedNow++;
          }
        }
      }
    }

    if (!removedNow) return 0;

    // Only cells exposed by the cut become active surface. The untouched interior stays implicit.
    for (const [x, y, z] of touched) {
      for (const [dx, dy, dz] of DIRS) {
        const nx = x + dx, ny = y + dy, nz = z + dz;
        if (this.isSurface(nx, ny, nz)) this.surface.add(this.key(nx, ny, nz));
      }
    }

    // Remove any stale surface cells made invalid by neighborhood changes.
    for (const [x, y, z] of touched) {
      for (const [dx, dy, dz] of DIRS) {
        const nx = x + dx, ny = y + dy, nz = z + dz;
        const nk = this.key(nx, ny, nz);
        if (this.surface.has(nk) && !this.isSurface(nx, ny, nz)) this.surface.delete(nk);
      }
    }

    this.rebuildInstances();
    return removedNow;
  }
  rebuildInstances() {
    let i = 0;
    for (const k of this.surface) {
      const [x, y, z] = k.split(',').map(Number);
      this.cellToLocal(x, y, z, this.tmpPos);
      this.tmpMatrix.makeTranslation(this.tmpPos.x, this.tmpPos.y, this.tmpPos.z);
      this.mesh.setMatrixAt(i++, this.tmpMatrix);
    }
    this.mesh.count = i;
    this.mesh.instanceMatrix.needsUpdate = true;
    updateStats();
  }
}

const DIRS = [
  [1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]
];
const stock = new SparseShellMaterial({ size: 32, worldSize: 3.0 });

// --- Robot -----------------------------------------------------------------
const robot = new THREE.Group();
scene.add(robot);
const robotBase = new THREE.Vector3(-4.1, 0.35, 0);

const baseMesh = new THREE.Mesh(
  new THREE.CylinderGeometry(0.72, 0.82, 0.7, 40),
  new THREE.MeshStandardMaterial({ color: 0x38424c, metalness: 0.65, roughness: 0.3 })
);
baseMesh.position.copy(robotBase);
baseMesh.castShadow = true;
robot.add(baseMesh);

const jointMaterial = new THREE.MeshStandardMaterial({ color: 0xb8c3cc, metalness: 0.65, roughness: 0.26 });
const armMaterial = new THREE.MeshStandardMaterial({ color: 0x56636f, metalness: 0.45, roughness: 0.32 });
const toolMaterial = new THREE.MeshStandardMaterial({ color: 0xe7c86f, metalness: 0.8, roughness: 0.22 });

const joints = Array.from({ length: 4 }, () => {
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.23, 24, 16), jointMaterial);
  m.castShadow = true;
  robot.add(m);
  return m;
});
const links = Array.from({ length: 3 }, () => {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.19, 1, 18), armMaterial);
  m.castShadow = true;
  robot.add(m);
  return m;
});
const toolMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.07, 0.9, 20), toolMaterial);
toolMesh.castShadow = true;
robot.add(toolMesh);
const toolTip = new THREE.Mesh(new THREE.SphereGeometry(0.13, 20, 14), toolMaterial);
toolTip.castShadow = true;
robot.add(toolTip);

const target = new THREE.Vector3(0, 1.55, 2.05);
const toolForward = new THREE.Vector3(0, 0, -1);
const p0 = new THREE.Vector3(), p1 = new THREE.Vector3(), p2 = new THREE.Vector3(), p3 = new THREE.Vector3();
const shoulder = new THREE.Vector3();
const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3();

function setSegment(mesh, a, b, radiusScale = 1) {
  const mid = tmpA.copy(a).add(b).multiplyScalar(0.5);
  const dir = tmpB.copy(b).sub(a);
  const len = dir.length();
  mesh.position.copy(mid);
  mesh.scale.set(radiusScale, len, radiusScale);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
}

function updateRobot() {
  p0.copy(robotBase).add(new THREE.Vector3(0, 0.45, 0));
  shoulder.copy(p0).add(new THREE.Vector3(0, 0.25, 0));

  // Lightweight visual IK: elbow bends upward while maintaining a stable reachable silhouette.
  const toTarget = tmpA.copy(target).sub(shoulder);
  const dist = Math.max(0.001, toTarget.length());
  const dir = toTarget.clone().normalize();
  const side = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0));
  if (side.lengthSq() < 1e-5) side.set(0, 0, 1);
  side.normalize();
  const bend = new THREE.Vector3().crossVectors(side, dir).normalize();

  const reach1 = Math.min(1.8, dist * 0.46);
  const reach2 = Math.min(1.65, dist * 0.38);
  p1.copy(shoulder).addScaledVector(dir, reach1).addScaledVector(bend, 0.72);
  p2.copy(p1).addScaledVector(dir, reach2).addScaledVector(bend, -0.38);
  p3.copy(target).addScaledVector(toolForward, -0.42);

  joints[0].position.copy(shoulder);
  joints[1].position.copy(p1);
  joints[2].position.copy(p2);
  joints[3].position.copy(p3);
  setSegment(links[0], shoulder, p1);
  setSegment(links[1], p1, p2);
  setSegment(links[2], p2, p3, 0.78);

  toolTip.position.copy(target);
  toolMesh.position.copy(target).addScaledVector(toolForward, -0.42);
  toolMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), toolForward.clone().normalize());

  wristCamera.position.copy(target).addScaledVector(toolForward, -0.55).add(new THREE.Vector3(0, 0.18, 0));
  wristCamera.lookAt(target.clone().addScaledVector(toolForward, 1.4));
}

// --- Cutting ---------------------------------------------------------------
const tools = {
  coarse: { radius: 0.28, visual: 0.19 },
  fine: { radius: 0.17, visual: 0.13 },
  needle: { radius: 0.095, visual: 0.09 }
};
let currentTool = 'coarse';
let carving = false;
let autoDemo = false;
let lastCarve = 0;

function carveOnce() {
  // Transform world-space tool tip into the rotating stock's local coordinates.
  const local = materialRoot.worldToLocal(target.clone());
  const removed = stock.removeSphere(local, tools[currentTool].radius);
  if (removed) flashStatus(`REMOVIDOS +${removed}`);
}

function flashStatus(text) {
  statusText.textContent = text;
  clearTimeout(flashStatus.t);
  flashStatus.t = setTimeout(() => statusText.textContent = autoDemo ? 'AUTO DEMO' : 'LISTO', 700);
}

// --- UI --------------------------------------------------------------------
const xInput = document.querySelector('#x');
const yInput = document.querySelector('#y');
const zInput = document.querySelector('#z');
const turntableInput = document.querySelector('#turntable');
const toolSelect = document.querySelector('#toolSelect');
const carveBtn = document.querySelector('#carveBtn');
const autoBtn = document.querySelector('#autoBtn');
const resetBtn = document.querySelector('#resetBtn');
const surfaceCount = document.querySelector('#surfaceCount');
const removedCount = document.querySelector('#removedCount');
const statusText = document.querySelector('#statusText');
const statusDot = document.querySelector('#statusDot');

function syncTargetFromUI() {
  target.set(+xInput.value, +yInput.value, +zInput.value);
}
function syncUIFromTarget() {
  xInput.value = target.x;
  yInput.value = target.y;
  zInput.value = target.z;
}
[xInput, yInput, zInput].forEach(el => el.addEventListener('input', () => { autoDemo = false; updateAutoUI(); syncTargetFromUI(); }));
turntableInput.addEventListener('input', () => turntable.rotation.y = THREE.MathUtils.degToRad(+turntableInput.value));
toolSelect.addEventListener('change', () => { currentTool = toolSelect.value; updateToolLook(); });
carveBtn.addEventListener('mousedown', () => carving = true);
window.addEventListener('mouseup', () => carving = false);
carveBtn.addEventListener('touchstart', e => { e.preventDefault(); carving = true; }, { passive: false });
window.addEventListener('touchend', () => carving = false);
autoBtn.addEventListener('click', () => { autoDemo = !autoDemo; updateAutoUI(); });
resetBtn.addEventListener('click', () => {
  stock.reset();
  target.set(0, 1.55, 2.05);
  turntable.rotation.y = 0;
  turntableInput.value = 0;
  autoDemo = false;
  syncUIFromTarget();
  updateAutoUI();
});

function updateToolLook() {
  const r = tools[currentTool].visual;
  toolTip.scale.setScalar(r / 0.13);
}
function updateAutoUI() {
  autoBtn.textContent = autoDemo ? 'Detener auto' : 'Auto demo';
  statusText.textContent = autoDemo ? 'AUTO DEMO' : 'LISTO';
  statusDot.style.background = autoDemo ? '#e4c763' : '#57db8b';
}
function updateStats() {
  if (!surfaceCount) return;
  surfaceCount.textContent = stock.surface.size.toLocaleString('es-AR');
  removedCount.textContent = stock.removed.size.toLocaleString('es-AR');
}

const held = new Set();
window.addEventListener('keydown', e => {
  if (['INPUT', 'SELECT'].includes(document.activeElement?.tagName)) return;
  held.add(e.code);
  if (e.code === 'Space') { e.preventDefault(); carving = true; }
});
window.addEventListener('keyup', e => {
  held.delete(e.code);
  if (e.code === 'Space') carving = false;
});

function keyboardJog(dt) {
  const speed = 1.2 * dt;
  if (held.has('KeyA')) target.x -= speed;
  if (held.has('KeyD')) target.x += speed;
  if (held.has('KeyR')) target.y += speed;
  if (held.has('KeyF')) target.y -= speed;
  if (held.has('KeyW')) target.z -= speed;
  if (held.has('KeyS')) target.z += speed;
  target.x = THREE.MathUtils.clamp(target.x, -2.4, 2.4);
  target.y = THREE.MathUtils.clamp(target.y, 0.15, 3.0);
  target.z = THREE.MathUtils.clamp(target.z, -2.1, 2.1);
  if (held.size) syncUIFromTarget();
}

function runAutoDemo(t) {
  if (!autoDemo) return;
  // Demonstrates a shallow spiral cut around the stock. It is intentionally simple;
  // later an agent can replace this with high-level tool commands.
  const a = t * 0.00075;
  turntable.rotation.y = a * 0.45;
  turntableInput.value = THREE.MathUtils.radToDeg(turntable.rotation.y) % 180;
  target.x = Math.sin(a * 1.7) * 0.95;
  target.y = 1.45 + Math.sin(a * 0.63) * 0.72;
  target.z = 1.44 + Math.cos(a * 1.25) * 0.10;
  syncUIFromTarget();
  carving = true;
}

// --- Rendering multiple virtual cameras -----------------------------------
function renderViewport(camera, x, y, w, h) {
  renderer.setViewport(x, y, w, h);
  renderer.setScissor(x, y, w, h);
  renderer.setScissorTest(true);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.render(scene, camera);
}

function renderAll() {
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, Math.floor(rect.width * renderer.getPixelRatio()));
  const height = Math.max(1, Math.floor(rect.height * renderer.getPixelRatio()));
  if (canvas.width !== width || canvas.height !== height) renderer.setSize(rect.width, rect.height, false);

  const W = canvas.width, H = canvas.height;
  const miniW = Math.floor(W / 3.25);
  const miniH = Math.floor(H / 3.25);

  renderer.setScissorTest(false);
  renderer.clear();
  renderViewport(mainCamera, 0, 0, W, H);
  renderViewport(topCamera, W - miniW * 2 - 12, 12, miniW, miniH);
  renderViewport(sideCamera, W - miniW - 6, 12, miniW, miniH);
  renderViewport(wristCamera, W - miniW - 6, miniH + 18, miniW, miniH);
  renderer.setScissorTest(false);
}

let prev = performance.now();
function animate(t) {
  const dt = Math.min((t - prev) / 1000, 0.05);
  prev = t;
  keyboardJog(dt);
  runAutoDemo(t);
  updateRobot();

  if (carving && t - lastCarve > 42) {
    carveOnce();
    lastCarve = t;
  }
  if (!autoDemo && !held.has('Space') && !carveBtn.matches(':active')) carving = false;

  controls.update();
  renderAll();
  requestAnimationFrame(animate);
}

updateToolLook();
syncTargetFromUI();
updateRobot();
updateStats();
requestAnimationFrame(animate);

// Public control surface for future agent/robot drivers.
window.Buonarotti = {
  moveToolTo(x, y, z) {
    target.set(x, y, z);
    syncUIFromTarget();
    return { x: target.x, y: target.y, z: target.z };
  },
  setTool(name) {
    if (!tools[name]) throw new Error(`Unknown tool: ${name}`);
    currentTool = name;
    toolSelect.value = name;
    updateToolLook();
  },
  rotateStock(degrees) {
    turntable.rotation.y = THREE.MathUtils.degToRad(degrees);
    turntableInput.value = degrees;
  },
  carve() { return carveOnce(); },
  reset() { resetBtn.click(); },
  getState() {
    return {
      toolPosition: target.toArray(),
      tool: currentTool,
      turntableDegrees: THREE.MathUtils.radToDeg(turntable.rotation.y),
      activeSurfaceCells: stock.surface.size,
      removedCells: stock.removed.size,
      resolution: stock.size
    };
  }
};
