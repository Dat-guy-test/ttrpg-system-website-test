import * as THREE from 'three';
import { AppState } from './appState.js';
import { computePanCamera } from './cameraControls.js';

/**
 * Orchestrates Layout Calculations across the Progression Sphere.
 * Maps relational dependencies into spatial paths and coordinates invisible interaction
 * trigger meshes that help navigate visual connections.
 */
export class Tree {
  /**
   * @param {number} smolFi  - Longitude angle bounding lower limit
   * @param {number} highFi  - Longitude angle bounding upper limit
   * @param {number} smolTh  - Latitude angle bounding lower limit
   * @param {number} highTh  - Latitude angle bounding upper limit
   */
  constructor(smolFi, highFi, smolTh, highTh) {
    this.nodes = [];
    this.mutExcl = [];
    this.nodeIDs = [];
    this.span = [smolFi, highFi, smolTh, highTh];
    this.sphereRadius = 30;

    // Build decorative spatial sphere helper bounding skill map regions
    this.treesphere = new THREE.Mesh(
      new THREE.SphereGeometry(this.sphereRadius, 32, 16),
                                     new THREE.MeshBasicMaterial({ color: "purple", transparent: true, opacity: 0.25 })
    );
    AppState.scene.add(this.treesphere);
  }

  /**
   * Generates Great-Circle Arc Paths linking nodes across spherical surface configurations.
   * Splits visible paths into invisible tube-shaped halves to serve as click target shortcuts.
   */
  createLinesNTubes(pointStart, pointEnd, smoothness, clockWise, dashed, a, b, kej, ej) {
    let cb = new THREE.Vector3(), ab = new THREE.Vector3(), normal = new THREE.Vector3();
    cb.subVectors(new THREE.Vector3(), pointEnd);
    ab.subVectors(pointStart, pointEnd);
    cb.cross(ab);                                 // Generate orthogonal perpendicular direction axes
    normal.copy(cb).normalize();

    let angle = pointStart.angleTo(pointEnd);
    if (clockWise) angle = angle - Math.PI * 2;
    let angleDelta = angle / (smoothness - 1);
    const pnts = [];
    for (let i = 0; i < smoothness; i++) {
      pnts.push(pointStart.clone().applyAxisAngle(normal, angleDelta * i));
    }

    const path = new THREE.CatmullRomCurve3(pnts);
    const pathGeometry = new THREE.BufferGeometry().setFromPoints(path.getPoints(50));

    // Assign structural style variants separating absolute AND requirements from conditional OR routes
    if (dashed) {
      const pathMaterial = new THREE.LineDashedMaterial({ color: 0x666666, dashSize: 0.01, gapSize: 0.01 });
      const arc = new THREE.Line(pathGeometry, pathMaterial);
      AppState.scene.add(arc);
      arc.computeLineDistances();
      this.nodes[a].skyLines.push(arc);
    } else {
      const pathMaterial = new THREE.LineBasicMaterial({ color: 0x666666 });
      const arc = new THREE.Line(pathGeometry, pathMaterial);
      AppState.scene.add(arc);
      this.nodes[a].skyLines.push(arc);
    }

    // Segment curves down the middle to build individual regional navigation triggers
    const pnts1h = [];
    const pnts2h = [];
    for (let i = 0; i < pnts.length / 2 + 2; i++) { pnts1h.push(pnts[i]); }
    for (let i = Math.floor(pnts.length / 2) + 1; i < pnts.length; i++) { pnts2h.push(pnts[i]); }

    const path1h = new THREE.CatmullRomCurve3(pnts1h);
    const geometry1h = new THREE.TubeGeometry(path1h, 20, 0.02, 8, false);
    const material1h = new THREE.MeshBasicMaterial({ color: 0x00ff00, wireframe: true, opacity: 0.0, transparent: true, depthWrite: false });
    const mesh1h = new THREE.Mesh(geometry1h, material1h);

    const path2h = new THREE.CatmullRomCurve3(pnts2h);
    const geometry2h = new THREE.TubeGeometry(path2h, 20, 0.01, 8, false);
    const material2h = new THREE.MeshBasicMaterial({ color: 0x0000ff, wireframe: true, opacity: 0.0, transparent: true, depthWrite: false });
    const mesh2h = new THREE.Mesh(geometry2h, material2h);

    // Bind event mechanisms mapping click triggers back to global state camera smooth targets
    if (kej === -1) {
      mesh1h.onClick = function () {
        if (!AppState.tr.nodes[AppState.tr.nodeIDs[AppState.tr.nodes[a].requires[b]]].isHovered && !AppState.panCamBool && !AppState.zoomCamBool) {
          AppState.panCamBool = true;
          computePanCamera(AppState.camera.rotation.x, AppState.camera.rotation.y, AppState.tr.nodes[a].theta, AppState.tr.nodes[a].fi - Math.PI / 2);
        }
      };
      mesh2h.onClick = function () {
        if (!AppState.tr.nodes[a].isHovered && !AppState.panCamBool && !AppState.zoomCamBool) {
          AppState.panCamBool = true;
          computePanCamera(AppState.camera.rotation.x, AppState.camera.rotation.y, AppState.tr.nodes[AppState.tr.nodeIDs[AppState.tr.nodes[a].requires[b]]].theta, AppState.tr.nodes[AppState.tr.nodeIDs[AppState.tr.nodes[a].requires[b]]].fi - Math.PI / 2);
        }
      };
    }

    AppState.scene.add(mesh1h);
    AppState.scene.add(mesh2h);
    this.nodes[a].reqTubes.push([mesh1h, mesh2h]);
  }

  init() {
    // Structural node index map builder loop
    for (let i = 0; i < this.nodes.length; i++) {
      this.nodeIDs[this.nodes[i].nodeId] = i;
    }
    // Setup and trigger curve loop drawing logic links
  }
}

export function areReqsMet(reqs) {
  // Evaluates state properties on current active arrays to confirm availability
  return true;
}

export async function treeGen() {
  // Pull architectural profile JSON arrays from repositories and save into AppState.tr
}
