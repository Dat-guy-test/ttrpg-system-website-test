// ============================================================
// Tree
//
// Exports:
//   Tree class    — holds nodes, draws arcs, provides lookups
//   treeGen(tree) — async: fetches data from GitHub, populates tree
//
// areReqsMet() is a method on Tree (not a standalone export).
// TreeNode calls it via AppState.tr.areReqsMet(…).
// This is the key design choice that prevents the
//   Tree → TreeNode → Tree
// circular import that would occur if areReqsMet were exported
// from this file and imported by TreeNode.
// ============================================================

import * as THREE from 'three';
import AppState from './appState.js';
import { TreeNode } from './TreeNode.js';
import { computePanCamera } from './cameraControls.js';


export class Tree {
    /**
     * @param {number} smolFi  — min fi  (longitude) in degrees
     * @param {number} highFi  — max fi  (longitude) in degrees
     * @param {number} smolTh  — min theta (latitude) in degrees
     * @param {number} highTh  — max theta (latitude) in degrees
     */
    constructor(smolFi, highFi, smolTh, highTh) {
        this.nodes   = [];   // TreeNode[]
        this.mutExcl = [];   // raw mutuallyExclusive lines
        this.nodeIDs = [];   // sparse map: nodeId → index in this.nodes
        this.span    = [smolFi, highFi, smolTh, highTh];

        this.sphereRadius = 30;

        // Semi-transparent debug sphere showing the tree's extent
        this.treesphere = new THREE.Mesh(
            new THREE.SphereGeometry(this.sphereRadius, 32, 16),
                                         new THREE.MeshBasicMaterial({ color: 'purple', transparent: true, opacity: 0.25 })
        );
        AppState.scene.add(this.treesphere);
    }

    // ----------------------------------------------------------------
    // areReqsMet  (instance method — avoids a circular import)
    // ----------------------------------------------------------------

    /**
     * Returns true if every requirement in `reqs` is satisfied.
     *
     * Formats:
     *   "nodeId"       — AND: that node must be active
     *   "idAoidB"      — OR: at least one of idA, idB must be active
     *
     * @param {string[]} reqs
     * @returns {boolean}
     */
    areReqsMet(reqs) {
        for (const req of reqs) {
            if (req.includes('o')) {
                // OR group — split on 'o'; ALL inactive → fail
                const group = req.split('o');
                const allInactive = group.every(id => !this.nodes[this.nodeIDs[id]].nodeActive);
                if (allInactive) return false;
            } else {
                if (!this.nodes[this.nodeIDs[req]].nodeActive) return false;
            }
        }
        return true;
    }

    // ----------------------------------------------------------------
    // createLinesNTubes
    // ----------------------------------------------------------------

    /**
     * Draws a great-circle arc between two sphere-surface points and
     * places two invisible tube halves along it as click targets.
     *
     * @param {THREE.Vector3} pointStart
     * @param {THREE.Vector3} pointEnd
     * @param {number}  smoothness  — arc sample count
     * @param {boolean} clockWise   — take the long way round
     * @param {boolean} dashed      — OR-req (dashed) vs AND-req (solid)
     * @param {number}  a           — index of destination node
     * @param {number}  b           — index of the requirement entry
     * @param {number}  kej         — OR-group member index (-1 = AND link)
     * @param {string[]} ej         — OR-group member array
     */
    createLinesNTubes(pointStart, pointEnd, smoothness, clockWise, dashed, a, b, kej, ej) {
        // Great-circle rotation axis = cross(origin−end, start−end) normalised
        const cb = new THREE.Vector3(), ab = new THREE.Vector3(), normal = new THREE.Vector3();
        cb.subVectors(new THREE.Vector3(), pointEnd);
        ab.subVectors(pointStart, pointEnd);
        cb.cross(ab);
        normal.copy(cb).normalize();

        let angle = pointStart.angleTo(pointEnd);
        if (clockWise) angle -= Math.PI * 2;
        const angleDelta = angle / (smoothness - 1);

        const pnts = [];
        for (let i = 0; i < smoothness; i++) {
            pnts.push(pointStart.clone().applyAxisAngle(normal, angleDelta * i));
        }

        // Visible arc line
        const path         = new THREE.CatmullRomCurve3(pnts);
        const pathGeometry = new THREE.BufferGeometry().setFromPoints(path.getPoints(50));

        if (dashed) {
            const arc = new THREE.Line(
                pathGeometry,
                new THREE.LineDashedMaterial({ color: 0x666666, dashSize: 0.01, gapSize: 0.01 })
            );
            arc.computeLineDistances();
            AppState.scene.add(arc);
            this.nodes[a].skyLines.push(arc);
        } else {
            const arc = new THREE.Line(
                pathGeometry,
                new THREE.LineBasicMaterial({ color: 0x666666 })
            );
            AppState.scene.add(arc);
            this.nodes[a].skyLines.push(arc);
        }

        // Split arc into two invisible click-target tubes
        const pnts1h = [], pnts2h = [];
        const mid = Math.floor(pnts.length / 2);
        for (let i = 0; i <= mid + 1 && i < pnts.length; i++) pnts1h.push(pnts[i]);
        for (let i = mid + 1; i < pnts.length; i++)            pnts2h.push(pnts[i]);

        const mesh1h = new THREE.Mesh(
            new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pnts1h), 20, 0.02, 8, false),
                                      new THREE.MeshBasicMaterial({ color: 0x00ff00, wireframe: true, opacity: 0.0, transparent: true, depthWrite: false })
        );
        const mesh2h = new THREE.Mesh(
            new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pnts2h), 20, 0.01, 8, false),
                                      new THREE.MeshBasicMaterial({ color: 0x0000ff, wireframe: true, opacity: 0.0, transparent: true, depthWrite: false })
        );

        // Click handlers close over the loop variables a, b, kej, ej.
        // All global state accessed via AppState; computePanCamera imported above.
        const self = this; // capture tree instance for the closures below

        if (kej === -1) {
            // AND link
            mesh1h.onClick = function () {
                const reqNode = self.nodes[self.nodeIDs[self.nodes[a].requires[b]]];
                if (!reqNode.isHovered && !AppState.panCamBool && !AppState.zoomCamBool) {
                    AppState.panCamBool = true;
                    computePanCamera(
                        AppState.camera.rotation.x, AppState.camera.rotation.y,
                        self.nodes[a].theta, self.nodes[a].fi - Math.PI / 2
                    );
                }
            };
            mesh2h.onClick = function () {
                const reqNode = self.nodes[self.nodeIDs[self.nodes[a].requires[b]]];
                if (!self.nodes[a].isHovered && !AppState.panCamBool && !AppState.zoomCamBool) {
                    AppState.panCamBool = true;
                    computePanCamera(
                        AppState.camera.rotation.x, AppState.camera.rotation.y,
                        reqNode.theta, reqNode.fi - Math.PI / 2
                    );
                }
            };
        } else {
            // OR link
            mesh1h.onClick = function () {
                const reqNode = self.nodes[self.nodeIDs[ej[kej]]];
                if (!reqNode.isHovered && !AppState.panCamBool && !AppState.zoomCamBool) {
                    AppState.panCamBool = true;
                    computePanCamera(
                        AppState.camera.rotation.x, AppState.camera.rotation.y,
                        self.nodes[a].theta, self.nodes[a].fi - Math.PI / 2
                    );
                }
            };
            mesh2h.onClick = function () {
                const reqNode = self.nodes[self.nodeIDs[ej[kej]]];
                if (!self.nodes[a].isHovered && !AppState.panCamBool && !AppState.zoomCamBool) {
                    AppState.panCamBool = true;
                    computePanCamera(
                        AppState.camera.rotation.x, AppState.camera.rotation.y,
                        reqNode.theta, reqNode.fi - Math.PI / 2
                    );
                }
            };
        }

        AppState.scene.add(mesh1h);
        AppState.scene.add(mesh2h);
        this.nodes[a].reqTubes.push([mesh1h, mesh2h]);
    }

    // ----------------------------------------------------------------
    // init  — call once after all nodes are loaded
    // ----------------------------------------------------------------

    /**
     * 1) Builds the nodeIDs sparse map (nodeId → array index).
     * 2) Draws great-circle arcs between every node and its requirements.
     */
    init() {
        for (let i = 0; i < this.nodes.length; i++) {
            this.nodeIDs[this.nodes[i].nodeId] = i;
        }

        for (let i = 0; i < this.nodes.length; i++) {
            for (let j = 0; j < this.nodes[i].requires.length; j++) {
                const req  = this.nodes[i].requires[j];
                const endD = new THREE.Vector3();
                this.nodes[i].star.getWorldPosition(endD);

                if (req.includes('o')) {
                    // OR group — one dashed arc per member
                    const group = req.split('o');
                    for (let k = 0; k < group.length; k++) {
                        const startT = new THREE.Vector3();
                        const endD2  = new THREE.Vector3();
                        this.nodes[i].star.getWorldPosition(endD2);
                        this.nodes[this.nodeIDs[group[k]]].star.getWorldPosition(startT);
                        this.createLinesNTubes(startT, endD2, 50, false, true, i, j, k, group);
                    }
                } else {
                    // AND — single solid arc
                    const startT = new THREE.Vector3();
                    this.nodes[this.nodeIDs[req]].star.getWorldPosition(startT);
                    this.createLinesNTubes(startT, endD, 50, false, false, i, j, -1, null);
                }
            }
        }
    }

    // ----------------------------------------------------------------
    // Helpers
    // ----------------------------------------------------------------

    /**
     * @param {string|number} ID
     * @returns {THREE.Vector2}  x = fi, y = theta
     */
    getNodeSphericalCoordinates(ID) {
        const node = this.nodes[this.nodeIDs[ID]];
        return new THREE.Vector2(node.getFi(), node.getTheta());
    }

    /**
     * @param {string|number} ID
     * @returns {THREE.Vector3}
     */
    getNodeWorldPosition(ID) {
        const v = new THREE.Vector3();
        this.nodes[this.nodeIDs[ID]].getWorldPosition(v);
        return v;
    }
     }


     // ============================================================
     // treeGen
     // Fetches node data and mutually-exclusive group definitions
     // from GitHub, then fills `tree` with TreeNode instances.
     //
     // Node data format (pipe-delimited, one per line):
     //   nodeId | name | desc | hoverText | fi | theta | requires | cost | (unused) | temperature
     //
     // fi / theta are raw grid coords mapped linearly onto the
     // angular span defined by tree.span.
     // ============================================================

     export async function treeGen(tree) {

         // ---- Node data -----------------------------------------------
         const res1  = await fetch('https://raw.githubusercontent.com/Dat-guy-test/project/refs/heads/main/test');
         const text1 = await res1.text();
         const lines = text1.split('\n');

         const atrs = [];
         for (let i = 0; i < lines.length - 1; i++) {
             atrs[i]    = lines[i].split(' | ');
             atrs[i][6] = atrs[i][6].split(' '); // requires → array
         }

         // Normalise fi / theta grid coordinates to the tree's angular span
         let bigFi = 0, lowFi = 0, bigTh = 0, lowTh = 0;
         for (const row of atrs) {
             if (row[4] > bigFi) bigFi = row[4];
             if (row[4] < lowFi) lowFi = row[4];
             if (row[5] > bigTh) bigTh = row[5];
             if (row[5] < lowTh) lowTh = row[5];
         }
         const fiSteps = bigFi - lowFi;
         const thSteps = bigTh - lowTh;

         const minKorFi = tree.span[0] * (Math.PI / 180);
         const maxKorFi = tree.span[1] * (Math.PI / 180);
         const minKorTh = tree.span[2] * (Math.PI / 180);
         const maxKorTh = tree.span[3] * (Math.PI / 180);

         // ---- Mutually-exclusive group data ---------------------------
         const res2  = await fetch('https://raw.githubusercontent.com/Dat-guy-test/project/refs/heads/main/mutuallyExclusive');
         const text2 = await res2.text();
         const lines2 = text2.split('\n');

         for (let i = 0; i < lines2.length - 1; i++) {
             tree.mutExcl[i] = lines2[i];
             const exclIDs = lines2[i].split(' ');
             // Stamp the full group array onto each member node's atrs[k][8]
             for (let j = 2; j < exclIDs.length; j++) {
                 for (let k = 0; k < lines.length - 1; k++) {
                     if (atrs[k][0] == exclIDs[j]) atrs[k][8] = exclIDs;
                 }
             }
         }

         // ---- Instantiate TreeNodes -----------------------------------
         for (let i = 0; i < lines.length - 1; i++) {
             const fi = minKorFi + (atrs[i][4] - lowFi) * (maxKorFi - minKorFi) / fiSteps;
             const th = minKorTh + (atrs[i][5] - lowTh) * (maxKorTh - minKorTh) / thSteps;

             const x = tree.sphereRadius * Math.cos(th) * Math.cos(fi);
             const y = tree.sphereRadius * Math.sin(th);
             const z = tree.sphereRadius * Math.cos(th) * Math.sin(fi);

             tree.nodes[i] = new TreeNode(
                 atrs[i][0], atrs[i][1], atrs[i][2], atrs[i][3],
                 x, y, z,
                 fi, th,
                 atrs[i][6], atrs[i][7], atrs[i][8], atrs[i][9]
             );
             AppState.scene.add(tree.nodes[i]);
         }

         AppState.cameraRotationOffsetFromTree = -Math.PI / 2;
     }
