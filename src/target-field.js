import * as THREE from 'three';

export class AnalyticTargetField {
  constructor(testFn, { name = 'analytic' } = {}) {
    this.testFn = testFn;
    this.name = name;
  }
  isDefinitelyOutside(localPoint) { return !this.testFn(localPoint); }
  static sphere({ center = new THREE.Vector3(0, 1.45, 0), radius = 1.05 } = {}) {
    return new AnalyticTargetField(p => p.distanceTo(center) <= radius, { name: 'sphere' });
  }
}

/** Conservative orthographic multi-view depth target. */
export class DepthTargetField {
  constructor(referenceViews, {
    dimensions = { x: 3, y: 3, z: 3 },
    minOutsideVotes = 2,
    depthTolerance = 0.025,
    silhouetteVotes = 2
  } = {}) {
    this.referenceViews = referenceViews;
    this.dimensions = { ...dimensions };
    this.minOutsideVotes = minOutsideVotes;
    this.depthTolerance = depthTolerance;
    this.silhouetteVotes = silhouetteVotes;
  }

  classify(localPoint) {
    const views = this.referenceViews.views;
    if (!views.length) return { outside: false, outsideVotes: 0, validVotes: 0, silhouetteVotes: 0 };

    let outsideVotes = 0;
    let validVotes = 0;
    let silhouetteVotes = 0;

    for (const view of views) {
      const a = THREE.MathUtils.degToRad(view.angleDeg);
      const ca = Math.cos(a), sa = Math.sin(a);
      const qx = localPoint.x * ca - localPoint.z * sa;
      const qz = localPoint.x * sa + localPoint.z * ca;

      // Rotated orthographic bounds of a rectangular X/Z stock.
      const projectedWidth = Math.abs(ca) * this.dimensions.x + Math.abs(sa) * this.dimensions.z;
      const projectedDepth = Math.abs(sa) * this.dimensions.x + Math.abs(ca) * this.dimensions.z;
      const u = qx / projectedWidth + 0.5;
      const v = localPoint.y / this.dimensions.y;
      const sample = this.referenceViews.sample(view, u, v);

      if (sample.masked) {
        silhouetteVotes++;
        continue;
      }
      if (!sample.valid || sample.confidence < 0.15) continue;
      validVotes++;

      // White/1 means target surface nearest the camera (+Z in camera space).
      const targetZ = -projectedDepth / 2 + sample.depth * projectedDepth;
      if (qz > targetZ + this.depthTolerance * projectedDepth) outsideVotes++;
    }

    const outsideByDepth = outsideVotes >= Math.min(this.minOutsideVotes, Math.max(1, validVotes));
    const outsideBySilhouette = silhouetteVotes >= Math.min(this.silhouetteVotes, Math.max(1, views.length));
    return { outside: outsideByDepth || outsideBySilhouette, outsideVotes, validVotes, silhouetteVotes };
  }

  isDefinitelyOutside(localPoint) {
    return this.classify(localPoint).outside;
  }
}
