import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { SparseShell } from './src/sparse-shell.js';
import { ReferenceViews } from './src/reference-views.js';
import { AnalyticTargetField, DepthTargetField } from './src/target-field.js';
import { OutsideInPlanner } from './src/outside-in-planner.js';

const $ = s => document.querySelector(s);
const ui = {
  canvas: $('#view'), x: $('#x'), y: $('#y'), z: $('#z'), turntable: $('#turntable'),
  tool: $('#toolSelect'), carve: $('#carveBtn'), auto: $('#autoBtn'), reset: $('#resetBtn'),
  surface: $('#surfaceCount'), removed: $('#removedCount'), resolution: $('#resolutionText'),
  status: $('#statusText'), dot: $('#statusDot'), targetMode: $('#targetMode'),
  depthFiles: $('#depthFiles'), depthInfo: $('#depthInfo')
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
  onStats: ({surface, removed, resolution}) => {
    if (ui.surface) ui.surface.textContent = surface.toLocaleString('es-AR');
    if (ui.removed) ui.removed.textContent = removed.toLocaleString('es-AR');
    if (ui.resolution) ui.resolution.textContent = `${resolution}³`;
  }
});

const referenceViews = new ReferenceViews();
const planner = new OutsideInPlanner(stock);

const demoSphere = new THREE.Mesh(
  new THREE.SphereGeometry(1.05, 32, 20),
  new THREE.MeshBasicMaterial({ color: 0x59d9ff, wireframe: true, transparent: true, opacity: .22, depthWrite: false })
);
demoSphere.position.set(0,1.45,0);
demoSphere.visible = false;
stockRoot.add(demoSphere);

function applyTargetMode() {
  const mode = ui.targetMode.value;
  demoSphere.visible = false;

  if (mode === 'none') {
    planner.clearTargetField();
    setStatus('OUTSIDE-IN LIBRE');
    return;
  }

  if (mode === 'sphere') {
    planner.setTargetField(AnalyticTargetField.sphere({ center: new THREE.Vector3(0,1.45,0), radius: 1.05 }));
    demoSphere.visible = true;
    setStatus('OBJETIVO ESFERA');
    return;
  }

  if (!referenceViews.views.length) {
    planner.clearTargetField();
    setStatus('FALTAN DEPTHMAPS');
    return;
  }

  planner.setTargetField(new DepthTargetField(referenceViews, {
    worldSize: stock.worldSize,
    height: stock.worldSize,
    minOutsideVotes: 2,
    silhouetteVotes: 2,
    depthTolerance: .025
  }));
  setStatus(`${referenceViews.views.length} DEPTHMAPS ACTIVOS`);
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
let currentTool='coarse', carving=false, auto=false, lastCut=0;
function setStatus(s){ui.status.textContent=s;clearTimeout(setStatus.t);setStatus.t=setTimeout(()=>ui.status.textContent=auto?'AUTO DEMO':'LISTO',900)}
function cut(){
  const p=stockRoot.worldToLocal(target.clone());
  const n=planner.carveSphere(p,tools[currentTool].radius);
  if(n)setStatus(`CAPA EXTERIOR -${n}`);
  return n;
}
function syncTarget(){target.set(+ui.x.value,+ui.y.value,+ui.z.value)}
function syncSliders(){ui.x.value=target.x;ui.y.value=target.y;ui.z.value=target.z}
function autoUI(){ui.auto.textContent=auto?'Detener auto':'Auto demo';ui.status.textContent=auto?'AUTO DEMO':'LISTO';ui.dot.style.background=auto?'#e4c763':'#57db8b'}
function setTool(name){currentTool=name;ui.tool.value=name;tip.scale.setScalar(tools[name].visual/.13)}
[ui.x,ui.y,ui.z].forEach(e=>e.addEventListener('input',()=>{auto=false;autoUI();syncTarget()}));
ui.turntable.addEventListener('input',()=>platter.rotation.y=THREE.MathUtils.degToRad(+ui.turntable.value));
ui.tool.addEventListener('change',()=>setTool(ui.tool.value));
ui.carve.addEventListener('pointerdown',()=>carving=true);window.addEventListener('pointerup',()=>carving=false);
ui.auto.addEventListener('click',()=>{auto=!auto;autoUI()});
ui.targetMode.addEventListener('change',applyTargetMode);
ui.depthFiles.addEventListener('change', async () => {
  const files = [...ui.depthFiles.files];
  if (!files.length) {
    referenceViews.clear();
    ui.depthInfo.textContent = 'Sin depthmaps cargados';
    applyTargetMode();
    return;
  }
  try {
    ui.depthInfo.textContent = 'Leyendo depthmaps…';
    const summary = await referenceViews.loadDepthFiles(files, { invert: false, alphaIsMask: true });
    ui.depthInfo.textContent = summary.map(v => `${v.angleDeg}° ${v.name}`).join(' · ');
    if (ui.targetMode.value === 'depth') applyTargetMode();
  } catch (err) {
    console.error(err);
    ui.depthInfo.textContent = `Error: ${err.message}`;
    setStatus('ERROR DEPTHMAP');
  }
});
ui.reset.addEventListener('click',()=>{stock.reset();target.set(0,1.55,2.05);platter.rotation.y=0;ui.turntable.value=0;auto=false;syncSliders();autoUI();applyTargetMode()});

const held=new Set();window.addEventListener('keydown',e=>{if(['INPUT','SELECT'].includes(document.activeElement?.tagName))return;held.add(e.code);if(e.code==='Space'){e.preventDefault();carving=true}});window.addEventListener('keyup',e=>{held.delete(e.code);if(e.code==='Space')carving=false});
function jog(dt){const s=1.2*dt;if(held.has('KeyA'))target.x-=s;if(held.has('KeyD'))target.x+=s;if(held.has('KeyR'))target.y+=s;if(held.has('KeyF'))target.y-=s;if(held.has('KeyW'))target.z-=s;if(held.has('KeyS'))target.z+=s;target.x=THREE.MathUtils.clamp(target.x,-2.4,2.4);target.y=THREE.MathUtils.clamp(target.y,.15,3);target.z=THREE.MathUtils.clamp(target.z,-2.1,2.1);if(held.size)syncSliders()}
function autoDemo(t){if(!auto)return;const a=t*.00075;platter.rotation.y=a*.45;target.x=Math.sin(a*1.7)*.95;target.y=1.45+Math.sin(a*.63)*.72;target.z=1.44+Math.cos(a*1.25)*.1;syncSliders();carving=true}

function viewport(cam,x,y,w,h){renderer.setViewport(x,y,w,h);renderer.setScissor(x,y,w,h);renderer.setScissorTest(true);cam.aspect=w/h;cam.updateProjectionMatrix();renderer.render(scene,cam)}
function render(){const r=ui.canvas.getBoundingClientRect();renderer.setSize(r.width,r.height,false);const W=ui.canvas.width,H=ui.canvas.height,mw=Math.floor(W/3.25),mh=Math.floor(H/3.25);renderer.setScissorTest(false);renderer.clear();viewport(mainCam,0,0,W,H);viewport(topCam,W-mw*2-12,12,mw,mh);viewport(sideCam,W-mw-6,12,mw,mh);viewport(wristCam,W-mw-6,mh+18,mw,mh);renderer.setScissorTest(false)}

let prev=performance.now();function loop(t){const dt=Math.min((t-prev)/1000,.05);prev=t;jog(dt);autoDemo(t);updateRobot();if(carving&&t-lastCut>42){cut();lastCut=t}if(!auto&&!held.has('Space')&&!ui.carve.matches(':active'))carving=false;orbit.update();render();requestAnimationFrame(loop)}
setTool('coarse');syncTarget();updateRobot();applyTargetMode();requestAnimationFrame(loop);

window.Buonarotti={
  moveToolTo(x,y,z){target.set(x,y,z);syncSliders();return [...target]},
  setTool,
  rotateStock(deg){platter.rotation.y=THREE.MathUtils.degToRad(deg);ui.turntable.value=deg},
  carve:cut,
  setTargetMode(mode){ui.targetMode.value=mode;applyTargetMode()},
  async loadDepthFiles(files){const result=await referenceViews.loadDepthFiles(files);applyTargetMode();return result},
  reset(){ui.reset.click()},
  getState(){return{toolPosition:target.toArray(),tool:currentTool,turntableDegrees:THREE.MathUtils.radToDeg(platter.rotation.y),activeSurfaceCells:stock.surface.size,removedCells:stock.removed.size,resolution:stock.size,targetMode:ui.targetMode.value,depthViews:referenceViews.getSummary()}}
};
