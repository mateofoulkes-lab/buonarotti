import * as THREE from 'three';

const DIRS = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];

/**
 * Sparse shell stock representation.
 * The untouched interior is implicit: only removed cells and the current exposed shell are stored.
 * Cutting is deliberately surface-only so material can never disappear behind an uncut crust.
 */
export class SparseShell {
  constructor({ root, size = 32, worldSize = 3, dimensions = null, onStats = () => {} } = {}) {
    if (!root) throw new Error('SparseShell requires a THREE.Object3D root');
    this.root = root;
    this.size = size;
    this.baseWorldSize = worldSize;
    this.cell = worldSize / size;
    this.onStats = onStats;
    this.removed = new Set();
    this.surface = new Set();
    this.p = new THREE.Vector3();
    this.m = new THREE.Matrix4();
    this.mesh = null;
    this.configureDimensions(dimensions || { x: worldSize, y: worldSize, z: worldSize }, false);
  }

  configureDimensions(dimensions, doReset = true) {
    this.dimensions = { x: dimensions.x, y: dimensions.y, z: dimensions.z };
    this.nx = Math.max(2, Math.round(this.dimensions.x / this.cell));
    this.ny = Math.max(2, Math.round(this.dimensions.y / this.cell));
    this.nz = Math.max(2, Math.round(this.dimensions.z / this.cell));
    this.halfX = this.nx * this.cell / 2;
    this.halfZ = this.nz * this.cell / 2;
    this.actualDimensions = { x: this.nx * this.cell, y: this.ny * this.cell, z: this.nz * this.cell };
    this.worldSize = Math.max(this.actualDimensions.x, this.actualDimensions.z);

    if (this.mesh) {
      this.root.remove(this.mesh);
      this.mesh.geometry.dispose();
      this.mesh.material.dispose();
    }
    const geometry = new THREE.BoxGeometry(this.cell * 0.98, this.cell * 0.98, this.cell * 0.98);
    const material = new THREE.MeshStandardMaterial({ color: 0xd9e6ef, roughness: 0.88 });
    this.mesh = new THREE.InstancedMesh(geometry, material, this.nx * this.ny * this.nz);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.root.add(this.mesh);
    if (doReset || !this.surface.size) this.reset();
  }

  key(x, y, z) { return `${x},${y},${z}`; }
  inside(x, y, z) { return x >= 0 && y >= 0 && z >= 0 && x < this.nx && y < this.ny && z < this.nz; }
  solid(x, y, z) { return this.inside(x, y, z) && !this.removed.has(this.key(x, y, z)); }
  exposed(x, y, z) {
    return this.solid(x, y, z) && DIRS.some(([a,b,c]) => !this.solid(x + a, y + b, z + c));
  }

  toLocal(x, y, z, out = this.p) {
    return out.set(
      (x + 0.5) * this.cell - this.halfX,
      (y + 0.5) * this.cell,
      (z + 0.5) * this.cell - this.halfZ
    );
  }

  toCell(v) {
    return {
      x: Math.floor((v.x + this.halfX) / this.cell),
      y: Math.floor(v.y / this.cell),
      z: Math.floor((v.z + this.halfZ) / this.cell)
    };
  }

  reset() {
    this.removed.clear();
    this.surface.clear();
    for (let x = 0; x < this.nx; x++) for (let y = 0; y < this.ny; y++) for (let z = 0; z < this.nz; z++) {
      if (x === 0 || y === 0 || z === 0 || x === this.nx - 1 || y === this.ny - 1 || z === this.nz - 1) {
        this.surface.add(this.key(x, y, z));
      }
    }
    this.rebuild();
  }

  /** Removes ONLY cells exposed before this operation. Newly exposed cells wait for the next operation. */
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
    const actuallyRemoved = [];
    for (const [x,y,z] of cells) {
      const k = this.key(x,y,z);
      if (!this.surface.has(k) || !this.solid(x,y,z)) continue;
      this.removed.add(k);
      this.surface.delete(k);
      actuallyRemoved.push([x,y,z]);
    }

    for (const [x,y,z] of actuallyRemoved) {
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
    this.onStats({
      surface: this.surface.size,
      removed: this.removed.size,
      resolution: `${this.nx}×${this.ny}×${this.nz}`,
      dimensions: this.actualDimensions
    });
  }
}
