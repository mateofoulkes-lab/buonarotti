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

/**
 * Conservative orthographic multi-view depth target.
 * Contract for each depth PNG:
 * - transparent pixel => outside the target silhouette for that view
 * - grayscale 0..1 => surface depth from far (0) to near (1)
 * - image already normalized/cropped to the same stock bounding box
 *
 * A point is removable only when enough views independently classify it as
 * being in front of the observed surface or outside its silhouette.
 */
export class DepthTargetField {
  constructor(referenceViews, {
    worldSize = 3,
    height = 3,
    minOutsideVotes = 2,
    depthTolerance = 0.025,
    silhouetteVotes = 2
  } = {}) {
    this.referenceViews = referenceViews;
    this.worldSize = worldSize;
    this.height = height;
    this.minOutsideVotes = minOutsideVotes;
    this.depthTolerance = depthTolerance;
    this.silhouetteVotes = silhouetteVotes;
    this.tmp = new THREE.Vector3();
  }

  classify(localPoint) {
    const views = this.referenceViews.views;
    if (!views.length) return { outside: false, outsideVotes: 0, validVotes: 0, silhouetteVotes: 0 };

    let outsideVotes = 0;
    let validVotes = 0;
    let silhouetteVotes = 0;
    const half = this.worldSize / 2;

    for (const view of views) {
      const a = THREE.MathUtils.degToRad(view.angleDeg);
      const ca = Math.cos(a), sa = Math.sin(a);
      // Rotate stock point into a camera that sits on +Z and looks toward -Z.
      const qx = localPoint.x * ca - localPoint.z * sa;
      const qz = localPoint.x * sa + localPoint.z * ca;
      const u = (qx + half) / this.worldSize;
      const v = localPoint.y / this.height;
      const sample = this.referenceViews.sample(view, u, v);

      if (sample.masked) {
        silhouetteVotes++;
        continue;
      }
      if (!sample.valid || sample.confidence < 0.15) continue;
      validVotes++;

      // White/1 means the target surface is closest to the camera (+Z side).
      const targetZ = -half + sample.depth * this.worldSize;
      if (qz > targetZ + this.depthTolerance * this.worldSize) outsideVotes++;
    }

    const outsideByDepth = outsideVotes >= Math.min(this.minOutsideVotes, Math.max(1, validVotes));
    const outsideBySilhouette = silhouetteVotes >= Math.min(this.silhouetteVotes, Math.max(1, views.length));
    return { outside: outsideByDepth || outsideBySilhouette, outsideVotes, validVotes, silhouetteVotes };
  }

  isDefinitelyOutside(localPoint) {
    return this.classify(localPoint).outside;
  }
}
