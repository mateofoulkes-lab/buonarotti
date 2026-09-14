export class OutsideInPlanner {
  constructor(stock, targetField = null) {
    this.stock = stock;
    this.targetField = targetField;
    this.layerKeys = null;
    this.layerNumber = 0;
  }

  setTargetField(targetField) {
    this.targetField = targetField;
    this.resetLayers();
  }

  clearTargetField() {
    this.targetField = null;
    this.resetLayers();
  }

  resetLayers() {
    this.layerKeys = null;
    this.layerNumber = 0;
  }

  _targetAllows(x, y, z) {
    if (!this.targetField) return true;
    const p = this.stock.toLocal(x, y, z, this.stock.p);
    return this.targetField.isDefinitelyOutside(p);
  }

  _buildLayer() {
    const keys = new Set();
    this.stock.forEachSurface((x, y, z) => {
      if (this._targetAllows(x, y, z)) keys.add(this.stock.key(x,y,z));
    });
    this.layerKeys = keys;
    if (keys.size) this.layerNumber++;
    return keys;
  }

  ensureLayer() {
    if (this.layerKeys === null || this.layerKeys.size === 0) this._buildLayer();
    return this.layerKeys;
  }

  _pruneLayer() {
    if (!this.layerKeys) return;
    for (const key of [...this.layerKeys]) {
      const [x,y,z] = key.split(',').map(Number);
      if (!this.stock.solid(x,y,z)) this.layerKeys.delete(key);
    }
  }

  isCellRemovable(x, y, z) {
    const layer = this.ensureLayer();
    const key = this.stock.key(x,y,z);
    return this.stock.solid(x,y,z) && this.stock.surface.has(key) && layer.has(key) && this._targetAllows(x,y,z);
  }

  getRemovableSurfaceCells() {
    const layer = this.ensureLayer();
    const cells = [];
    for (const key of layer) {
      const [x,y,z] = key.split(',').map(Number);
      if (!this.stock.solid(x,y,z) || !this.stock.surface.has(key)) continue;
      const p = this.stock.toLocal(x,y,z,this.stock.p);
      cells.push({ x, y, z, key, point: p.clone() });
    }
    return cells;
  }

  carveSphere(localPoint, radius) {
    const layer = this.ensureLayer();
    if (!layer.size) return 0;
    const n = this.stock.removeSurfaceSphere(
      localPoint,
      radius,
      (x,y,z) => layer.has(this.stock.key(x,y,z)) && this._targetAllows(x,y,z)
    );
    this._pruneLayer();
    return n;
  }

  /**
   * Fast-forward primitive: remove the ENTIRE currently eligible outer layer in
   * one stock update. Only after that layer is gone can a newly exposed inner
   * layer be built, so the same strict outside -> inward invariant is preserved.
   */
  removeCurrentLayerBulk() {
    const layer = this.ensureLayer();
    if (!layer.size) return { removed: 0, layer: this.layerNumber, complete: true };

    const cells = [];
    for (const key of layer) {
      const [x,y,z] = key.split(',').map(Number);
      if (!this.stock.solid(x,y,z) || !this.stock.surface.has(key)) continue;
      if (!this._targetAllows(x,y,z)) continue;
      cells.push([x,y,z]);
    }

    if (!cells.length) {
      this.layerKeys = null;
      const next = this.ensureLayer();
      return { removed: 0, layer: this.layerNumber, complete: next.size === 0 };
    }

    this.stock.removeCells(cells);
    const removed = cells.length;
    // Force the next call to derive a brand-new frontier from the newly exposed shell.
    this.layerKeys = null;
    return { removed, layer: this.layerNumber, complete: false };
  }

  getLayerState() {
    const layer = this.ensureLayer();
    return { layer: this.layerNumber, remaining: layer.size };
  }
}
