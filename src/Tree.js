import * as THREE from 'three';
import { AppState } from './appState.js';
import { TreeNode } from './TreeNode.js';
import { computePanCamera } from './cameraControls.js';

export class Tree {
  constructor(smolFi, highFi, smolTh, highTh) {
    this.nodes = [];
    this.mutExcl = []; 
    this.nodeIDs = []; 
    this.span = [smolFi, highFi, smolTh, highTh];
    this.sphereRadius = 30;

    this.treesphere = new THREE.Mesh(
      new THREE.SphereGeometry(this.sphereRadius, 32, 16),
      new THREE.MeshBasicMaterial({ color: "purple", transparent: true, opacity: 0.25 })
    );
    AppState.scene.add(this.treesphere);
  }

  createLinesNTubes(pointStart, pointEnd, smoothness, clockWise, dashed, a, b, kej, ej) {
    // ... Original geometry creation logic ...
    
    // Applying modified handlers leveraging AppState
    if (kej == -1) {
      mesh1h.onClick = function (e) {
        if (!AppState.tr.nodes[AppState.tr.nodeIDs[AppState.tr.nodes[a].requires[b]]].isHovered && AppState.panCamBool == false && AppState.zoomCamBool == false) {
          AppState.panCamBool = true;
          computePanCamera(AppState.camera.rotation.x, AppState.camera.rotation.y, AppState.tr.nodes[a].theta, AppState.tr.nodes[a].fi - Math.PI / 2);
        }
      }
      mesh2h.onClick = function (e) {
        if (!AppState.tr.nodes[a].isHovered && AppState.panCamBool == false && AppState.zoomCamBool == false) {
          AppState.panCamBool = true;
          computePanCamera(AppState.camera.rotation.x, AppState.camera.rotation.y, AppState.tr.nodes[AppState.tr.nodeIDs[AppState.tr.nodes[a].requires[b]]].theta, AppState.tr.nodes[AppState.tr.nodeIDs[AppState.tr.nodes[a].requires[b]]].fi - Math.PI / 2);
        }
      }
    } else {
      // OR link mapping...
    }
    
    // ... original scene.add logic ...
  }

  init() {
    // ... original loop logic ...
  }
}

export function areReqsMet(reqs) {
  // ... Original areReqsMet loop referencing AppState.tr ...
}

export async function treeGen() {
  // ... Async fetch data from GitHub, instantiation of Tree in AppState.tr ...
}