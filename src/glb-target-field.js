import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/**
 * Exact-ish volumetric target derived from a closed GLB mesh.
 * The mesh is fitted into stock-local coordinates and point-in-mesh is tested
 * with an odd/even ray parity test. Results are memoized at voxel resolution.
 */
export class GLBTargetField {
  constructor(group, { stock, visualRoot = null, name = 'GLB' } = {}) {
    this.group = group;
    this.stock = stock;
    this.name = name;
    this.visualRoot = visualRoot;
    this.cache = new Map();
    this.raycaster = new THREE.Raycaster();
    this.rayDir = new THREE.Vector3(1, 0, 0);
    this.rayOrigin = new THREE.Vector3();
    this.meshes = [];

    this.group.traverse(obj => {
      if (!obj.isMesh) return;
      obj.material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
      this.meshes.push(obj);
    });
    this.group.updateMatrixWorld(true);

    this.group.position.set(0, 0, 0);
    this.group.rotation.set(0, 0, 0);
    this.group.scale.set(1, 1, 1);
    this.group.updateMatrixWorld(true);
    this.sourceBox = new THREE.Box3().setFromObject(this.group);
    this.sourceSize = this.sourceBox.getSize(new THREE.Vector3());
    this.sourceCenter = this.sourceBox.getCenter(new THREE.Vector3());

    this.visual = this._makeVisualClone();
    if (this.visualRoot && this.visual) this.visualRoot.add(this.visual);
    this.fitToStock(stock);
  }

  static async fromFile(file, options = {}) {
    const loader = new GLTFLoader();
    const url = URL.createObjectURL(file);
    try {
      const gltf = await loader.loadAsync(url);
      return new GLBTargetField(gltf.scene, { ...options, name: file.name });
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  _makeVisualClone() {
    const visual = this.group.clone(true);
    visual.traverse(obj => {
      if (!obj.isMesh) return;
      obj.material = new THREE.MeshBasicMaterial({
        color: 0x59d9ff,
        wireframe: true,
        transparent: true,
        opacity: 0.22,
        depthWrite: false,
        side: THREE.DoubleSide
      });
    });
    return visual;
  }

  fitToStock(stock = this.stock) {
    this.stock = stock;
    const d = stock.actualDimensions;
    const sx = (d.x * 0.82) / Math.max(this.sourceSize.x, 1e-6);
    const sy = (d.y * 0.90) / Math.max(this.sourceSize.y, 1e-6);
    const sz = (d.z * 0.82) / Math.max(this.sourceSize.z, 1e-6);
    const scale = Math.min(sx, sy, sz);

    this.group.scale.setScalar(scale);
    this.group.position.set(
      -this.sourceCenter.x * scale,
      -this.sourceBox.min.y * scale,
      -this.sourceCenter.z * scale
    );
    this.group.updateMatrixWorld(true);

    if (this.visual) {
      this.visual.scale.copy(this.group.scale);
      this.visual.position.copy(this.group.position);
      this.visual.rotation.copy(this.group.rotation);
      this.visual.updateMatrixWorld(true);
    }
    this.cache.clear();
  }

  dispose() {
    if (this.visualRoot && this.visual) this.visualRoot.remove(this.visual);
    this.visual?.traverse(obj => {
      if (obj.isMesh) obj.material?.dispose?.();
    });
  }

  _key(p) {
    const c = Math.max(this.stock.cell, 1e-6);
    return `${Math.round(p.x/c)},${Math.round(p.y/c)},${Math.round(p.z/c)}`;
  }

  isInside(localPoint) {
    const key = this._key(localPoint);
    if (this.cache.has(key)) return this.cache.get(key);

    const eps = Math.max(this.stock.cell * 0.013, 1e-5);
    this.rayOrigin.copy(localPoint);
    this.rayOrigin.y += eps;
    this.rayOrigin.z += eps * 0.37;
    this.raycaster.set(this.rayOrigin, this.rayDir);
    this.raycaster.near = 0;
    this.raycaster.far = Infinity;

    const hits = [];
    for (const mesh of this.meshes) hits.push(...this.raycaster.intersectObject(mesh, false));
    hits.sort((a,b) => a.distance - b.distance);

    let crossings = 0;
    let last = -Infinity;
    const mergeEps = Math.max(this.stock.cell * 0.03, 1e-5);
    for (const hit of hits) {
      if (hit.distance - last <= mergeEps) continue;
      last = hit.distance;
      crossings++;
    }

    const inside = (crossings % 2) === 1;
    this.cache.set(key, inside);
    return inside;
  }

  isDefinitelyOutside(localPoint) {
    return !this.isInside(localPoint);
  }
}
