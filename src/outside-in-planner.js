export class OutsideInPlanner {
  constructor(stock, targetField = null) {
    this.stock = stock;
    this.targetField = targetField;
  }

  setTargetField(targetField) {
    this.targetField = targetField;
  }

  clearTargetField() {
    this.targetField = null;
  }

  isCellRemovable(x, y, z) {
    if (!this.stock.solid(x, y, z)) return false;
    const key = this.stock.key(x, y, z);
    if (!this.stock.surface.has(key)) return false;
    if (!this.targetField) return true;
    const p = this.stock.toLocal(x, y, z, this.stock.p);
    return this.targetField.isDefinitelyOutside(p);
  }

  getRemovableSurfaceCells() {
    const cells = [];
    this.stock.forEachSurface((x, y, z, p) => {
      if (!this.targetField || this.targetField.isDefinitelyOutside(p)) {
        cells.push({ x, y, z, key: this.stock.key(x,y,z), point: p.clone() });
      }
    });
    return cells;
  }

  carveSphere(localPoint, radius) {
    const target = this.targetField;
    return this.stock.removeSurfaceSphere(
      localPoint,
      radius,
      target ? (_x, _y, _z, p) => target.isDefinitelyOutside(p) : null
    );
  }
}
