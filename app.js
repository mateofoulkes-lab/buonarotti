import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const $ = s => document.querySelector(s);
const ui = {
  canvas: $('#view'), x: $('#x'), y: $('#y'), z: $('#z'), turntable: $('#turntable'),
  tool: $('#toolSelect'), carve: $('#carveBtn'), auto: $('#autoBtn'), reset: $('#resetBtn'),
  surface: $('#surfaceCount'), removed: $('#removedCount'), status: $('#statusText'), dot: $('#statusDot')
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

const DIRS=[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
class SparseShell {
  constructor(size=32, worldSize=3){
    this.size=size; this.worldSize=worldSize; this.cell=worldSize/size; this.half=worldSize/2;
    this.removed=new Set(); this.surface=new Set(); this.p=new THREE.Vector3(); this.m=new THREE.Matrix4();
    const geo=new THREE.BoxGeometry(this.cell*.98,this.cell*.98,this.cell*.98);
    const mat=new THREE.MeshStandardMaterial({color:0xd9e6ef,roughness:.88});
    this.mesh=new THREE.InstancedMesh(geo,mat,size*size*6+14000); this.mesh.castShadow=this.mesh.receiveShadow=true;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); stockRoot.add(this.mesh); this.reset();
  }
  key(x,y,z){return `${x},${y},${z}`}
  inside(x,y,z){return x>=0&&y>=0&&z>=0&&x<this.size&&y<this.size&&z<this.size}
  solid(x,y,z){return this.inside(x,y,z)&&!this.removed.has(this.key(x,y,z))}
  exposed(x,y,z){return this.solid(x,y,z)&&DIRS.some(([a,b,c])=>!this.solid(x+a,y+b,z+c))}
  toLocal(x,y,z,out=this.p){return out.set((x+.5)*this.cell-this.half,(y+.5)*this.cell,(z+.5)*this.cell-this.half)}
  toCell(v){return {x:Math.floor((v.x+this.half)/this.cell),y:Math.floor(v.y/this.cell),z:Math.floor((v.z+this.half)/this.cell)}}
  reset(){
    this.removed.clear(); this.surface.clear(); const n=this.size;
    for(let x=0;x<n;x++)for(let y=0;y<n;y++)for(let z=0;z<n;z++) if(x===0||y===0||z===0||x===n-1||y===n-1||z===n-1) this.surface.add(this.key(x,y,z));
    this.rebuild();
  }
  removeSphere(point,radius){
    const c=this.toCell(point), rr=Math.ceil(radius/this.cell)+1, touched=[];
    for(let x=c.x-rr;x<=c.x+rr;x++)for(let y=c.y-rr;y<=c.y+rr;y++)for(let z=c.z-rr;z<=c.z+rr;z++){
      if(!this.solid(x,y,z))continue; this.toLocal(x,y,z);
      if(this.p.distanceTo(point)<=radius){const k=this.key(x,y,z);this.removed.add(k);this.surface.delete(k);touched.push([x,y,z]);}
    }
    if(!touched.length)return 0;
    for(const [x,y,z] of touched) for(const [a,b,c] of DIRS){const X=x+a,Y=y+b,Z=z+c;if(this.exposed(X,Y,Z))this.surface.add(this.key(X,Y,Z));}
    this.rebuild(); return touched.length;
  }
  rebuild(){
    let i=0; for(const k of this.surface){const [x,y,z]=k.split(',').map(Number);this.toLocal(x,y,z);this.m.makeTranslation(this.p.x,this.p.y,this.p.z);this.mesh.setMatrixAt(i++,this.m);}
    this.mesh.count=i; this.mesh.instanceMatrix.needsUpdate=true; ui.surface.textContent=this.surface.size.toLocaleString('es-AR'); ui.removed.textContent=this.removed.size.toLocaleString('es-AR');
  }
}
const stock=new SparseShell(32,3);

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
function setStatus(s){ui.status.textContent=s;clearTimeout(setStatus.t);setStatus.t=setTimeout(()=>ui.status.textContent=auto?'AUTO DEMO':'LISTO',650)}
function cut(){const p=stockRoot.worldToLocal(target.clone()),n=stock.removeSphere(p,tools[currentTool].radius);if(n)setStatus(`REMOVIDOS +${n}`);return n}
function syncTarget(){target.set(+ui.x.value,+ui.y.value,+ui.z.value)}
function syncSliders(){ui.x.value=target.x;ui.y.value=target.y;ui.z.value=target.z}
function autoUI(){ui.auto.textContent=auto?'Detener auto':'Auto demo';ui.status.textContent=auto?'AUTO DEMO':'LISTO';ui.dot.style.background=auto?'#e4c763':'#57db8b'}
function setTool(name){currentTool=name;ui.tool.value=name;tip.scale.setScalar(tools[name].visual/.13)}
[ui.x,ui.y,ui.z].forEach(e=>e.addEventListener('input',()=>{auto=false;autoUI();syncTarget()}));
ui.turntable.addEventListener('input',()=>platter.rotation.y=THREE.MathUtils.degToRad(+ui.turntable.value));
ui.tool.addEventListener('change',()=>setTool(ui.tool.value));ui.carve.addEventListener('pointerdown',()=>carving=true);window.addEventListener('pointerup',()=>carving=false);
ui.auto.addEventListener('click',()=>{auto=!auto;autoUI()});ui.reset.addEventListener('click',()=>{stock.reset();target.set(0,1.55,2.05);platter.rotation.y=0;ui.turntable.value=0;auto=false;syncSliders();autoUI()});

const held=new Set();window.addEventListener('keydown',e=>{if(['INPUT','SELECT'].includes(document.activeElement?.tagName))return;held.add(e.code);if(e.code==='Space'){e.preventDefault();carving=true}});window.addEventListener('keyup',e=>{held.delete(e.code);if(e.code==='Space')carving=false});
function jog(dt){const s=1.2*dt;if(held.has('KeyA'))target.x-=s;if(held.has('KeyD'))target.x+=s;if(held.has('KeyR'))target.y+=s;if(held.has('KeyF'))target.y-=s;if(held.has('KeyW'))target.z-=s;if(held.has('KeyS'))target.z+=s;target.x=THREE.MathUtils.clamp(target.x,-2.4,2.4);target.y=THREE.MathUtils.clamp(target.y,.15,3);target.z=THREE.MathUtils.clamp(target.z,-2.1,2.1);if(held.size)syncSliders()}
function autoDemo(t){if(!auto)return;const a=t*.00075;platter.rotation.y=a*.45;target.x=Math.sin(a*1.7)*.95;target.y=1.45+Math.sin(a*.63)*.72;target.z=1.44+Math.cos(a*1.25)*.1;syncSliders();carving=true}

function viewport(cam,x,y,w,h){renderer.setViewport(x,y,w,h);renderer.setScissor(x,y,w,h);renderer.setScissorTest(true);cam.aspect=w/h;cam.updateProjectionMatrix();renderer.render(scene,cam)}
function render(){const r=ui.canvas.getBoundingClientRect();renderer.setSize(r.width,r.height,false);const W=ui.canvas.width,H=ui.canvas.height,mw=Math.floor(W/3.25),mh=Math.floor(H/3.25);renderer.setScissorTest(false);renderer.clear();viewport(mainCam,0,0,W,H);viewport(topCam,W-mw*2-12,12,mw,mh);viewport(sideCam,W-mw-6,12,mw,mh);viewport(wristCam,W-mw-6,mh+18,mw,mh);renderer.setScissorTest(false)}

let prev=performance.now();function loop(t){const dt=Math.min((t-prev)/1000,.05);prev=t;jog(dt);autoDemo(t);updateRobot();if(carving&&t-lastCut>42){cut();lastCut=t}if(!auto&&!held.has('Space')&&!ui.carve.matches(':active'))carving=false;orbit.update();render();requestAnimationFrame(loop)}
setTool('coarse');syncTarget();updateRobot();requestAnimationFrame(loop);

window.Buonarotti={
  moveToolTo(x,y,z){target.set(x,y,z);syncSliders();return [...target]},
  setTool,
  rotateStock(deg){platter.rotation.y=THREE.MathUtils.degToRad(deg);ui.turntable.value=deg},
  carve:cut,
  reset(){ui.reset.click()},
  getState(){return{toolPosition:target.toArray(),tool:currentTool,turntableDegrees:THREE.MathUtils.radToDeg(platter.rotation.y),activeSurfaceCells:stock.surface.size,removedCells:stock.removed.size,resolution:stock.size}}
};
