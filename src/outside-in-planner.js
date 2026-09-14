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

  carveSphere(localPoint, radius) {
    const target = this.targetField;
    return this.stock.removeSurfaceSphere(
      localPoint,
      radius,
      target ? (_x, _y, _z, p) => target.isDefinitelyOutside(p) : null
    );
  }
}
