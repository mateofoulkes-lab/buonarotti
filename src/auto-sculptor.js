import * as THREE from 'three';

/**
 * Automatic subtractive sculptor.
 * Invariant: one COMPLETE removable exterior frontier is frozen per pass.
 * Newly exposed inner cells cannot be considered until that pass is exhausted.
 */
export class AutoSculptor {
  constructor({ planner, stock, getToolRadius, onMove = () => {}, onStatus = () => {} }) {
    this.planner = planner;
    this.stock = stock;
    this.getToolRadius = getToolRadius;
    this.onMove = onMove;
    this.onStatus = onStatus;
    this.running = false;
    this.pass = 0;
    this.passQueue = [];
    this.cursor = new THREE.Vector3();
    this.totalRemoved = 0;
  }

  start(fromPoint = null) {
    if (!this.planner.targetField) throw new Error('Elegí un objetivo antes de comenzar la escultura');
    this.running = true;
    this.pass = 0;
    this.passQueue = [];
    this.totalRemoved = 0;
    if (fromPoint) this.cursor.copy(fromPoint);
    this.onStatus(this.getState());
  }

  stop() { this.running = false; this.onStatus(this.getState()); }
  reset() { this.running = false; this.pass = 0; this.passQueue = []; this.totalRemoved = 0; }

  buildPass() {
    const cells = this.planner.getRemovableSurfaceCells();
    if (!cells.length) {
      this.running = false;
      this.passQueue = [];
      this.onStatus({ ...this.getState(), complete: true });
      return false;
    }

    this.pass++;
    // Coherent raster/shell sweep. Membership is frozen before cutting starts,
    // so no newly exposed inner cell can jump ahead of remaining outer material.
    cells.sort((a,b) => {
      const dy = b.y - a.y;
      if (dy) return dy;
      const dz = a.z - b.z;
      if (dz) return dz;
      return (a.z & 1) ? b.x - a.x : a.x - b.x;
    });
    this.passQueue = cells;
    this.onStatus(this.getState());
    return true;
  }

  step() {
    if (!this.running) return { removed: 0, running: false };
    if (!this.passQueue.length && !this.buildPass()) return { removed: 0, running: false, complete: true };

    while (this.passQueue.length) {
      const candidate = this.passQueue.shift();
      if (!this.stock.solid(candidate.x, candidate.y, candidate.z)) continue;
      if (!this.stock.surface.has(candidate.key)) continue;
      if (!this.planner.isCellRemovable(candidate.x, candidate.y, candidate.z)) continue;

      this.cursor.copy(candidate.point);
      this.onMove(candidate.point, candidate);
      const removed = this.planner.carveSphere(candidate.point, this.getToolRadius());
      this.totalRemoved += removed;
      if (removed > 0) {
        this.onStatus(this.getState());
        return { removed, running: true, pass: this.pass, remainingInPass: this.passQueue.length };
      }
    }

    this.passQueue = [];
    this.onStatus(this.getState());
    return { removed: 0, running: true, passComplete: true, pass: this.pass };
  }

  getState() {
    return { running: this.running, pass: this.pass, remainingInPass: this.passQueue.length, totalRemoved: this.totalRemoved };
  }
}
