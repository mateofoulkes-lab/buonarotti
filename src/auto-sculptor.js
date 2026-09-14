import * as THREE from 'three';

/**
 * Automatic subtractive sculptor.
 * Important invariant: it snapshots ONE complete removable exterior frontier and
 * refuses to advance to newly exposed material until that frontier is exhausted.
 * This keeps carving globally outside -> inward and avoids leaving pillars/crust
 * behind while drilling toward the target surface.
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
    this.stalledPasses = 0;
  }

  start(fromPoint = null) {
    if (!this.planner.targetField) throw new Error('Elegí un objetivo antes de comenzar la escultura');
    this.running = true;
    this.pass = 0;
    this.passQueue = [];
    this.totalRemoved = 0;
    this.stalledPasses = 0;
    if (fromPoint) this.cursor.copy(fromPoint);
    this.onStatus(this.getState());
  }

  stop() {
    this.running = false;
    this.onStatus(this.getState());
  }

  reset() {
    this.running = false;
    this.pass = 0;
    this.passQueue = [];
    this.totalRemoved = 0;
    this.stalledPasses = 0;
  }

  buildPass() {
    const cells = this.planner.getRemovableSurfaceCells();
    if (!cells.length) {
      this.running = false;
      this.passQueue = [];
      this.onStatus({ ...this.getState(), complete: true });
      return false;
    }

    this.pass++;

    // Nearest-neighbour ordering only changes travel order. Membership is frozen
    // for this pass, so newly exposed inner cells can NOT jump the queue.
    const remaining = cells.slice();
    const ordered = [];
    let p = this.cursor.clone();
    while (remaining.length) {
      let best = 0;
      let bestD = Infinity;
      for (let i = 0; i < remaining.length; i++) {
        const d = remaining[i].point.distanceToSquared(p);
        if (d < bestD) { bestD = d; best = i; }
      }
      const next = remaining.splice(best, 1)[0];
      ordered.push(next);
      p = next.point;
    }
    this.passQueue = ordered;
    this.onStatus(this.getState());
    return true;
  }

  step() {
    if (!this.running) return { removed: 0, running: false };
    if (!this.passQueue.length && !this.buildPass()) return { removed: 0, running: false, complete: true };

    // Discard cells already removed incidentally by a neighbouring spherical cut,
    // but never substitute a cell from the next interior frontier during this pass.
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
        this.stalledPasses = 0;
        this.onStatus(this.getState());
        return { removed, running: true, pass: this.pass, remainingInPass: this.passQueue.length };
      }
    }

    // Finished the complete outer frontier. Only NOW may the next exposed shell be considered.
    this.passQueue = [];
    this.onStatus(this.getState());
    return { removed: 0, running: true, passComplete: true, pass: this.pass };
  }

  getState() {
    return {
      running: this.running,
      pass: this.pass,
      remainingInPass: this.passQueue.length,
      totalRemoved: this.totalRemoved
    };
  }
}
