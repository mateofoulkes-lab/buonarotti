import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { SparseShell } from './src/sparse-shell.js';
import { ReferenceViews } from './src/reference-views.js';
import { AnalyticTargetField, DepthTargetField } from './src/target-field.js';
import { OutsideInPlanner } from './src/outside-in-planner.js';
import { AutoSculptor } from './src/auto-sculptor.js';

const $ = s => document.querySelector(s);
const ui = {
  canvas: $('#view'), x: $('#x'), y: $('#y'), z: $('#z'), turntable: $('#turntable'),
  tool: $('#toolSelect'), carve: $('#carveBtn'), carveLatch: $('#carveLatchBtn'), sculpt: $('#sculptBtn'), reset: $('#resetBtn'),
  blockPreset: $('#blockPreset'), speed: $('#speedSelect'), surface: $('#surfaceCount'), removed: $('#removedCount'),
  resolution: $('#resolutionText'), pass: $('#passText'), frontier: $('#frontierText'), status: $('#statusText'), dot: $('#statusDot'),
  targetMode: $('#targetMode'), depthFiles: $('#depthFiles'), depthInfo: $('#depthInfo')
};

const BLOCK_PRESETS = {
  cube: { x: 3, y: 3, z: 3 },
  tall: { x: 2.5, y: 4, z: 2.5 },
  flat: { x: 4, y: 2, z: 4 }
};

const renderer = new THREE.WebGLRenderer({ canvas: ui.canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.setClearColor(0x090c10);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x090c10, 12, 28);
scene.add(new THREE.HemisphereLight(0xbfd7ff, 0x1d1710, 1.2));
const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.position.set(4, 8, 5); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); scene.add(sun);

const floor = new THREE.Mesh(new THREE.PlaneGeometry(22,22), new THREE.MeshStandardMaterial({color:0x111820,roughness:.95}));
floor.rotation.x = -Math.PI/2; floor.receiveShadow = true; scene.add(floor);
scene.add(new THREE.GridHelper(14,28,0x33404d,0x1b242d));

const mainCam = new THREE.PerspectiveCamera(45,1,.05,100); mainCam.position.set(7.5,5.1,8.5);
const topCam = new THREE.PerspectiveCamera(42,1,.05,100); topCam.position.set(0,9,.01); topCam.lookAt(0,0,0);
const sideCam = new THREE.PerspectiveCamera(45,1,.05,100); sideCam.position.set(8,2.6,0); sideCam.lookAt(0,1.2,0);
const wristCam = new THREE.PerspectiveCamera(58,1,.03,30); scene.add(wristCam);
const orbit = new OrbitControls(mainCam, ui.canvas); orbit.target.set(0,1.2,0); orbit.enableDamping = true;

const platter = new THREE.Group(); scene.add(platter);
const platterMesh = new THREE.Mesh(new THREE.CylinderGeometry(2.15,2.25,.24,64), new THREE.MeshStandardMaterial({color:0x222b34,metalness:.55,roughness:.4}));
platterMesh.position.y=.12; platterMesh.castShadow=platterMesh.receiveShadow=true; platter.add(platterMesh);
const stockRoot = new THREE.Group(); stockRoot.position.y=.26; platter.add(stockRoot);

const stock = new SparseShell({
  root: stockRoot,
  size: 32,
  worldSize: 3,
  dimensions: BLOCK_PRESETS.cube,
  onStats: ({surface, removed, resolution}) => {
    ui.surface.textContent = surface.toLocaleString('es-AR');
    ui.removed.textContent = removed.toLocaleString('es-AR');
    ui.resolution.textContent = resolution;
  }
});

const referenceViews = new ReferenceViews();
const planner = new OutsideInPlanner(stock);

const demoSphere = new THREE.Mesh(
  new THREE.SphereGeometry(1.05, 32, 20),
  new THREE.MeshBasicMaterial({ color: 0x59d9ff, wireframe: true, transparent: true, opacity: .22, depthWrite: false })
);
demoSphere.visible = false;
stockRoot.add(demoSphere);

function sphereSpec() {
  const d = stock.actualDimensions;
  const radius = Math.min(d.x, d.z, d.y) * .35;
  return { center: new THREE.Vector3(0, d.y * .5, 0), radius };
}

function updateDemoSphere() {
  const {center, radius} = sphereSpec();
  demoSphere.position.copy(center);
  demoSphere.scale.setScalar(radius / 1.05);
}

function setStatus(text, sticky = false) {
  ui.status.textContent = text;
  if (sticky) return;
  clearTimeout(setStatus.t);
  setStatus.t = setTimeout(() => {
    if (sculptor?.running) ui.status.textContent = `ESCULPIENDO · PASADA ${sculptor.pass || 1}`;
    else ui.status.textContent = 'LISTO';
  }, 900);
}

function applyTargetMode() {
  sculptor?.stop();
  demoSphere.visible = false;
  const mode = ui.targetMode.value;

  if (mode === 'none') {
    planner.clearTargetField();
    setStatus('OUTSIDE-IN LIBRE');
    updateLayerReadout();
    return;
  }

  if (mode === 'sphere') {
    const spec = sphereSpec();
    planner.setTargetField(AnalyticTargetField.sphere(spec));
    updateDemoSphere();
    demoSphere.visible = true;
    setStatus('OBJETIVO ESFERA');
    updateLayerReadout();
    return;
  }

  if (!referenceViews.views.length) {
    planner.clearTargetField();
    setStatus('FALTAN DEPTHMAPS');
    updateLayerReadout();
    return;
  }

  planner.setTargetField(new DepthTargetField(referenceViews, {
    dimensions: stock.actualDimensions,
    minOutsideVotes: 2,
    silhouetteVotes: 2,
    depthTolerance: .025
  }));
  setStatus(`${referenceViews.views.length} DEPTHMAPS ACTIVOS`);
  updateLayerReadout();
}

const robotBase=new THREE.Vector3(-4.1,.8,0), target=new THREE.Vector3(0,1.55,2.05), toolForward=new THREE.Vector3(0,0,-1);
const robot=new THREE.Group(); scene.add(robot);
const base=new THREE.Mesh(new THREE.CylinderGeometry(.72,.82,.7,40),new THREE.MeshStandardMaterial({color:0x38424c,metalness:.65,roughness:.3}));base.position.set(-4.1,.35,0);base.castShadow=true;robot.add(base);
const jointMat=new THREE.MeshStandardMaterial({color:0xb8c3cc,metalness:.65,roughness:.26}), armMat=new THREE.MeshStandardMaterial({color:0x56636f,metalness:.45,roughness:.32}), toolMat=new THREE.MeshStandardMaterial({color:0xe7c86f,metalness:.8,roughness:.22});
const joints=Array.from({length:4},()=>{const m=new THREE.Mesh(new THREE.SphereGeometry(.23,20,14),jointMat);robot.add(m);return m});
const links=Array.from({length:3},()=>{const m=new THREE.Mesh(new THREE.CylinderGeometry(.16,.19,1,16),armMat);robot.add(m);return m});
const toolBody=new THREE.Mesh(new THREE.CylinderGeometry(.11,.07,.9,18),toolMat), tip=new THREE.Mesh(new THREE.SphereGeometry(.13,18,12),toolMat); robot.add(toolBody,tip);
const tmp1=new THREE.Vector3(),tmp2=new THREE.Vector3(),UP=new THREE.Vector3(0,1,0);
function segment(mesh,a,b,scale=1){const d=tmp1.copy(b).sub(a),len=d.length();mesh.position.copy(tmp2.copy(a).add(b).multiplyScalar(.5));mesh.scale.set(scale,len,scale);mesh.quaternion.setFromUnitVectors(UP,d.normalize());}
function updateRobot(){
  const shoulder=robotBase.clone(), dir=target.clone().sub(shoulder).normalize(); let side=new THREE.Vector3().crossVectors(dir,UP); if(side.lengthSq()<1e-5)side.set(0,0,1); side.normalize(); const bend=new THREE.Vector3().crossVectors(side,dir).normalize();
  const a=shoulder.clone().addScaledVector(dir,1.75).addScaledVector(bend,.72), b=a.clone().addScaledVector(dir,1.5).addScaledVector(bend,-.38), c=target.clone().addScaledVector(toolForward,-.42);
  [shoulder,a,b,c].forEach((p,i)=>joints[i].position.copy(p)); segment(links[0],shoulder,a);segment(links[1],a,b);segment(links[2],b,c,.78);
  tip.position.copy(target);toolBody.position.copy(target).addScaledVector(toolForward,-.42);toolBody.quaternion.setFromUnitVectors(UP,toolForward);
  wristCam.position.copy(target).addScaledVector(toolForward,-.55).add(new THREE.Vector3(0,.18,0));wristCam.lookAt(target.clone().addScaledVector(toolForward,1.4));
}

const tools={coarse:{radius:.28,visual:.19},fine:{radius:.17,visual:.13},needle:{radius:.095,visual:.09}};
let currentTool='coarse', momentaryCarving=false, carveLatched=false, lastWork=0;
function getSpeed(){ return Number(ui.speed.value) || 1; }
function syncTarget(){target.set(+ui.x.value,+ui.y.value,+ui.z.value)}
function syncSliders(){ui.x.value=target.x;ui.y.value=target.y;ui.z.value=target.z}
function setTool(name){currentTool=name;ui.tool.value=name;tip.scale.setScalar(tools[name].visual/.13)}

function updateLayerReadout() {
  const state = planner.getLayerState();
  ui.pass.textContent = sculptor?.running ? `${sculptor.pass || state.layer}` : `${state.layer || '—'}`;
  ui.frontier.textContent = state.remaining.toLocaleString('es-AR');
}

function cut() {
  const p=stockRoot.worldToLocal(target.clone());
  const n=planner.carveSphere(p,tools[currentTool].radius);
  updateLayerReadout();
  if(n)setStatus(`CORTEZA -${n}`);
  return n;
}

const sculptor = new AutoSculptor({
  planner,
  stock,
  getToolRadius: () => tools[currentTool].radius,
  onMove: localPoint => {
    const worldPoint = stockRoot.localToWorld(localPoint.clone());
    target.copy(worldPoint);
    syncSliders();
  },
  onStatus: state => {
    ui.pass.textContent = state.pass || '—';
    ui.frontier.textContent = (state.remainingInPass ?? planner.getLayerState().remaining).toLocaleString('es-AR');
    if (state.complete) {
      ui.sculpt.textContent = 'Comenzar escultura';
      ui.sculpt.classList.remove('active');
      ui.dot.style.background='#57db8b';
      setStatus('ESCULTURA FINALIZADA / SIN MÁS MATERIAL SEGURO', true);
    } else if (state.running) {
      ui.sculpt.textContent = 'Detener escultura';
      ui.sculpt.classList.add('active');
      ui.dot.style.background='#e4c763';
      ui.status.textContent = `ESCULPIENDO · PASADA ${state.pass || 1}`;
    } else {
      ui.sculpt.textContent = 'Comenzar escultura';
      ui.sculpt.classList.remove('active');
      ui.dot.style.background='#57db8b';
    }
  }
});

function stopAutomaticForManual() {
  if (sculptor.running) sculptor.stop();
}

function updateLatchUI() {
  ui.carveLatch.textContent = `Desbaste fijo: ${carveLatched ? 'ON' : 'OFF'}`;
  ui.carveLatch.classList.toggle('active', carveLatched);
}

function setBlockPreset(name) {
  const dims = BLOCK_PRESETS[name] || BLOCK_PRESETS.cube;
  sculptor.reset();
  planner.resetLayers();
  carveLatched = false;
  updateLatchUI();
  stock.configureDimensions(dims, true);
  updateDemoSphere();
  const safeY = Math.min(dims.y * .55, dims.y - .15);
  target.set(0, safeY, dims.z * .5 + .55);
  syncSliders();
  ui.y.max = Math.max(4.2, dims.y + .5);
  ui.x.min = -(dims.x * .5 + 1); ui.x.max = dims.x * .5 + 1;
  ui.z.min = -(dims.z * .5 + 1); ui.z.max = dims.z * .5 + 1;
  applyTargetMode();
  setStatus(`BLOQUE ${name.toUpperCase()} LISTO`);
}

[ui.x,ui.y,ui.z].forEach(e=>e.addEventListener('input',()=>{stopAutomaticForManual();syncTarget()}));
ui.turntable.addEventListener('input',()=>{stopAutomaticForManual();platter.rotation.y=THREE.MathUtils.degToRad(+ui.turntable.value)});
ui.tool.addEventListener('change',()=>setTool(ui.tool.value));
ui.carve.addEventListener('pointerdown',()=>{stopAutomaticForManual();momentaryCarving=true});
window.addEventListener('pointerup',()=>momentaryCarving=false);
ui.carveLatch.addEventListener('click',()=>{stopAutomaticForManual();carveLatched=!carveLatched;updateLatchUI()});
ui.sculpt.addEventListener('click',()=>{
  carveLatched=false; momentaryCarving=false; updateLatchUI();
  if (sculptor.running) { sculptor.stop(); setStatus('ESCULTURA PAUSADA'); return; }
  if (!planner.targetField) { setStatus('ELEGÍ ESFERA O DEPTHMAPS'); return; }
  if (ui.targetMode.value === 'depth' && !referenceViews.views.length) { setStatus('CARGÁ DEPTHMAPS PRIMERO'); return; }
  try { sculptor.start(stockRoot.worldToLocal(target.clone())); }
  catch(err) { setStatus(err.message.toUpperCase()); }
});
ui.blockPreset.addEventListener('change',()=>setBlockPreset(ui.blockPreset.value));
ui.targetMode.addEventListener('change',applyTargetMode);
ui.depthFiles.addEventListener('change', async () => {
  const files=[...ui.depthFiles.files];
  sculptor.stop();
  if(!files.length){referenceViews.clear();ui.depthInfo.textContent='Sin depthmaps cargados';applyTargetMode();return;}
  try{
    ui.depthInfo.textContent='Leyendo depthmaps…';
    const summary=await referenceViews.loadDepthFiles(files,{invert:false,alphaIsMask:true});
    ui.depthInfo.textContent=summary.map(v=>`${v.angleDeg}° ${v.name}`).join(' · ');
    if(ui.targetMode.value==='depth')applyTargetMode();
  }catch(err){console.error(err);ui.depthInfo.textContent=`Error: ${err.message}`;setStatus('ERROR DEPTHMAP')}
});
ui.reset.addEventListener('click',()=>{
  sculptor.reset(); planner.resetLayers(); stock.reset(); target.set(0,Math.min(stock.actualDimensions.y*.55,2),stock.actualDimensions.z*.5+.55);
  platter.rotation.y=0;ui.turntable.value=0;carveLatched=false;momentaryCarving=false;updateLatchUI();syncSliders();applyTargetMode();updateLayerReadout();
});

const held=new Set();
window.addEventListener('keydown',e=>{
  if(['INPUT','SELECT'].includes(document.activeElement?.tagName))return;
  held.add(e.code);
  if(e.code==='Space'){e.preventDefault();stopAutomaticForManual();momentaryCarving=true}
});
window.addEventListener('keyup',e=>{held.delete(e.code);if(e.code==='Space')momentaryCarving=false});
function jog(dt){
  const s=1.2*dt;
  if(held.has('KeyA'))target.x-=s;if(held.has('KeyD'))target.x+=s;if(held.has('KeyR'))target.y+=s;if(held.has('KeyF'))target.y-=s;if(held.has('KeyW'))target.z-=s;if(held.has('KeyS'))target.z+=s;
  target.x=THREE.MathUtils.clamp(target.x,+ui.x.min,+ui.x.max);target.y=THREE.MathUtils.clamp(target.y,.15,+ui.y.max);target.z=THREE.MathUtils.clamp(target.z,+ui.z.min,+ui.z.max);
  if(held.size)syncSliders();
}

function doWorkTick() {
  const speed=getSpeed();
  if(sculptor.running){
    for(let i=0;i<speed && sculptor.running;i++) sculptor.step();
    updateLayerReadout();
    return;
  }
  if(momentaryCarving||carveLatched){
    for(let i=0;i<speed;i++) cut();
  }
}

function viewport(cam,x,y,w,h){renderer.setViewport(x,y,w,h);renderer.setScissor(x,y,w,h);renderer.setScissorTest(true);cam.aspect=w/h;cam.updateProjectionMatrix();renderer.render(scene,cam)}
function render(){const r=ui.canvas.getBoundingClientRect();renderer.setSize(r.width,r.height,false);const W=ui.canvas.width,H=ui.canvas.height,mw=Math.floor(W/3.25),mh=Math.floor(H/3.25);renderer.setScissorTest(false);renderer.clear();viewport(mainCam,0,0,W,H);viewport(topCam,W-mw*2-12,12,mw,mh);viewport(sideCam,W-mw-6,12,mw,mh);viewport(wristCam,W-mw-6,mh+18,mw,mh);renderer.setScissorTest(false)}

let prev=performance.now();
function loop(t){
  const dt=Math.min((t-prev)/1000,.05);prev=t;jog(dt);updateRobot();
  if(t-lastWork>70){doWorkTick();lastWork=t}
  orbit.update();render();requestAnimationFrame(loop);
}

setTool('coarse');updateLatchUI();syncTarget();updateRobot();updateDemoSphere();applyTargetMode();updateLayerReadout();requestAnimationFrame(loop);

window.Buonarotti={
  moveToolTo(x,y,z){stopAutomaticForManual();target.set(x,y,z);syncSliders();return target.toArray()},
  setTool,
  rotateStock(deg){stopAutomaticForManual();platter.rotation.y=THREE.MathUtils.degToRad(deg);ui.turntable.value=deg},
  carve:cut,
  setCarveLatched(value){carveLatched=!!value;updateLatchUI()},
  setSpeed(multiplier){if([1,4,8,16].includes(Number(multiplier)))ui.speed.value=String(multiplier)},
  setBlockPreset(name){ui.blockPreset.value=name;setBlockPreset(name)},
  startSculpt(){if(!sculptor.running)ui.sculpt.click()},
  stopSculpt(){if(sculptor.running)sculptor.stop()},
  setTargetMode(mode){ui.targetMode.value=mode;applyTargetMode()},
  async loadDepthFiles(files){const result=await referenceViews.loadDepthFiles(files);applyTargetMode();return result},
  reset(){ui.reset.click()},
  getState(){return{
    toolPosition:target.toArray(),tool:currentTool,turntableDegrees:THREE.MathUtils.radToDeg(platter.rotation.y),
    activeSurfaceCells:stock.surface.size,removedCells:stock.removed.size,resolution:[stock.nx,stock.ny,stock.nz],dimensions:stock.actualDimensions,
    targetMode:ui.targetMode.value,depthViews:referenceViews.getSummary(),carveLatched,speed:getSpeed(),
    layer:planner.getLayerState(),sculptor:sculptor.getState()
  }}
};
