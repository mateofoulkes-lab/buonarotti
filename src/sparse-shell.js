import * as THREE from 'three';

const DIRS = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];

/**
 * Sparse shell stock representation.
 * The untouched interior is implicit: only removed cells and the current exposed shell are stored.
 * Cutting is deliberately surface-only so material can never disappear behind an uncut crust.
 */
export class SparseShell {
  constructor({ root, size = 32, worldSize = 3, onStats = () => {} } = {}) {
    if (!root) throw new Error('SparseShell requires a THREE.Object3D root');
    this.root = root;
    this.size = size;
    this.worldSize = worldSize;
    this.cell = worldSize / size;
    this.half = worldSize / 2;
    this.onStats = onStats;

    this.removed = new Set();
    this.surface = new Set();
    this.p = new THREE.Vector3();
    this.m = new THREE.Matrix4();

    const geometry = new THREE.BoxGeometry(this.cell * 0.98, this.cell * 0.98, this.cell * 0.98);
    const material = new THREE.MeshStandardMaterial({ color: 0xd9e6ef, roughness: 0.88 });
    this.mesh = new THREE.InstancedMesh(geometry, material, size ** 3);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    root.add(this.mesh);
    this.reset();
  }

  key(x, y, z) { return `${x},${y},${z}`; }
  inside(x, y, z) { return x >= 0 && y >= 0 && z >= 0 && x < this.size && y < this.size && z < this.size; }
  solid(x, y, z) { return this.inside(x, y, z) && !this.removed.has(this.key(x, y, z)); }
  exposed(x, y, z) {
    return this.solid(x, y, z) && DIRS.some(([a,b,c]) => !this.solid(x + a, y + b, z + c));
  }

  toLocal(x, y, z, out = this.p) {
    return out.set(
      (x + 0.5) * this.cell - this.half,
      (y + 0.5) * this.cell,
      (z + 0.5) * this.cell - this.half
    );
  }

  toCell(v) {
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
    this.rebuild();
  }

  /**
   * Removes ONLY cells that were exposed before this operation.
   * Newly exposed cells become eligible on the next call, enforcing outside -> inward carving.
   */
  removeSurfaceSphere(point, radius, predicate = null) {
    const c = this.toCell(point);
    const rr = Math.ceil(radius / this.cell) + 1;
    const touched = [];

    for (let x = c.x - rr; x <= c.x + rr; x++) {
      for (let y = c.y - rr; y <= c.y + rr; y++) {
        for (let z = c.z - rr; z <= c.z + rr; z++) {
          if (!this.inside(x,y,z)) continue;
          const k = this.key(x,y,z);
          if (!this.surface.has(k) || !this.solid(x,y,z)) continue;
          this.toLocal(x,y,z,this.p);
          if (this.p.distanceTo(point) > radius) continue;
          if (predicate && !predicate(x,y,z,this.p)) continue;
          touched.push([x,y,z]);
        }
      }
    }

    if (!touched.length) return 0;
    this.removeCells(touched);
    return touched.length;
  }

  removeCells(cells) {
    for (const [x,y,z] of cells) {
      const k = this.key(x,y,z);
      if (!this.surface.has(k) || !this.solid(x,y,z)) continue;
      this.removed.add(k);
      this.surface.delete(k);
    }

    // Only neighbors revealed by this pass can become the next removable frontier.
    for (const [x,y,z] of cells) {
      for (const [a,b,c] of DIRS) {
        const X=x+a, Y=y+b, Z=z+c;
        if (this.exposed(X,Y,Z)) this.surface.add(this.key(X,Y,Z));
      }
    }

    this.rebuild();
  }

  forEachSurface(callback) {
    for (const k of this.surface) {
      const [x,y,z] = k.split(',').map(Number);
      this.toLocal(x,y,z,this.p);
      callback(x,y,z,this.p);
    }
  }

  rebuild() {
    let i = 0;
    for (const k of this.surface) {
      const [x,y,z] = k.split(',').map(Number);
      this.toLocal(x,y,z,this.p);
      this.m.makeTranslation(this.p.x,this.p.y,this.p.z);
      this.mesh.setMatrixAt(i++,this.m);
    }
    this.mesh.count = i;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.onStats({ surface: this.surface.size, removed: this.removed.size, resolution: this.size });
  }
}
