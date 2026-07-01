// ============================================================
// Tree
//
// Exports:
//   Tree class    — holds nodes, draws arcs, provides lookups
//   treeGen(tree) — async: loads data (now local JSON), populates tree
//
// areReqsMet() is a method on Tree (not a standalone export).
// TreeNode calls it via AppState.tr.areReqsMet(…).
// This is the key design choice that prevents the
//   Tree → TreeNode → Tree
// circular import that would occur if areReqsMet were exported
// from this file and imported by TreeNode.
//
// ------------------------------------------------------------
// DATA FORMAT (as of the JSON migration)
// ------------------------------------------------------------
// Requirements are now real arrays instead of delimiter-encoded
// strings:
//   "5"                          — AND: node 5 must be active
//   ["-1001", "-1002", "-1003"]  — OR: at least one member must be active
// A node's `requires` field is an array whose entries are each
// either a plain id string (AND) or an array of id strings (OR
// group). This replaces the old "-1001o-1002o-1003" string format,
// which broke down as soon as an id or delimiter collided.
//
// Mutual-exclusion groups are shared objects: { label, max, members }.
// Every member TreeNode's `.excl` points at the SAME object, so all
// members of a group are always looking at one shared max/members —
// convenient once edit-mode code starts mutating groups live.
// ============================================================

import * as THREE from 'three';
import AppState from './appState.js';
import { TreeNode } from './TreeNode.js';
import { computePanCamera } from './cameraControls.js';
import { NODE_DATA_URL } from './constants.js';


export class Tree {
    /**
     * @param {number} smolFi  — min fi  (longitude) in degrees
     * @param {number} highFi  — max fi  (longitude) in degrees
     * @param {number} smolTh  — min theta (latitude) in degrees
     * @param {number} highTh  — max theta (latitude) in degrees
     */
    constructor(smolFi, highFi, smolTh, highTh) {
        this.nodes         = [];   // TreeNode[]
        this.mutExclGroups = [];   // [{ label, max, members }, …] — filled in by treeGen()
        this.nodeIDs       = [];   // sparse map: nodeId → index in this.nodes
        this.span          = [smolFi, highFi, smolTh, highTh];

        this.sphereRadius = 30;

        // Semi-transparent debug sphere showing the tree's extent
        this.treesphere = new THREE.Mesh(
            new THREE.SphereGeometry(this.sphereRadius, 32, 16),
                                         new THREE.MeshBasicMaterial({ color: 'purple', transparent: true, opacity: 0.25 })
        );
        AppState.scene.add(this.treesphere);
    }

    // ----------------------------------------------------------------
    // resolveNode  (defensive lookup)
    // ----------------------------------------------------------------

    /**
     * Safely resolves a node by id. Returns undefined — and logs a
     * one-time console error naming the bad id — if no node matches,
     * instead of letting callers crash on `undefined.star` /
     * `undefined.nodeActive`. This is what keeps a single typo in a
     * hand-edited requires/exclGroup entry from taking down arc
     * drawing, camera setup, and every other node's activation with it.
     *
     * @param {string|number} id
     * @returns {TreeNode|undefined}
     */
    resolveNode(id) {
        const node = this.nodes[this.nodeIDs[id]];
        if (!node) {
            if (!this._warnedMissingIds) this._warnedMissingIds = new Set();
            if (!this._warnedMissingIds.has(id)) {
                this._warnedMissingIds.add(id);
                console.error(`Tree: no node found with id "${id}" — check nodes.json for a typo or a dangling reference.`);
            }
            return undefined;
        }
        return node;
    }

    // ----------------------------------------------------------------
    // areReqsMet  (instance method — avoids a circular import)
    // ----------------------------------------------------------------

    /**
     * Returns true if every requirement in `reqs` is satisfied.
     *
     * Formats:
     *   "nodeId"        — AND: that node must be active
     *   ["idA","idB"]   — OR: at least one of idA, idB must be active
     *
     * An id that doesn't resolve to a real node (bad data) is treated
     * as inactive/unsatisfied rather than throwing.
     *
     * @param {(string|string[])[]} reqs
     * @returns {boolean}
     */
    areReqsMet(reqs) {
        for (const req of reqs) {
            if (Array.isArray(req)) {
                // OR group — ALL inactive (or unresolved) → fail
                const allInactive = req.every(id => {
                    const node = this.resolveNode(id);
                    return !node || !node.nodeActive;
                });
                if (allInactive) return false;
            } else {
                const node = this.resolveNode(req);
                if (!node || !node.nodeActive) return false;
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
     *    A requirement id that doesn't resolve to a real node (typo,
     *    dangling reference) is logged via resolveNode() and that ONE
     *    arc is skipped — the rest of the tree still draws normally.
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

                if (Array.isArray(req)) {
                    // OR group — one dashed arc per member
                    const group = req;
                    for (let k = 0; k < group.length; k++) {
                        const startNode = this.resolveNode(group[k]);
                        if (!startNode) continue; // bad id in this OR group — skip just this arc

                        const startT = new THREE.Vector3();
                        const endD2  = new THREE.Vector3();
                        this.nodes[i].star.getWorldPosition(endD2);
                        startNode.star.getWorldPosition(startT);
                        this.createLinesNTubes(startT, endD2, 50, false, true, i, j, k, group);
                    }
                } else {
                    // AND — single solid arc
                    const startNode = this.resolveNode(req);
                    if (!startNode) continue; // bad id — skip just this arc

                    const startT = new THREE.Vector3();
                    startNode.star.getWorldPosition(startT);
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
        const node = this.resolveNode(ID);
        if (!node) return new THREE.Vector2(0, 0);
        return new THREE.Vector2(node.getFi(), node.getTheta());
    }

    /**
     * @param {string|number} ID
     * @returns {THREE.Vector3}
     */
    getNodeWorldPosition(ID) {
        const v = new THREE.Vector3();
        const node = this.resolveNode(ID);
        if (node) node.getWorldPosition(v);
        return v;
    }
     }


     // ============================================================
     // treeGen
     // Loads node data + mutually-exclusive group definitions from a
     // local JSON file (see constants.js → NODE_DATA_URL), then fills
     // `tree` with TreeNode instances.
     //
     // fi / theta in the JSON are already in degrees within the
     // tree's angular span — no more cross-dataset grid normalisation
     // (the old code rescaled every node's position based on the
     // min/max grid coordinate across the WHOLE dataset, which meant
     // adding a single outlier node could silently reflow every other
     // node's position — not something you want while hand-editing).
     // ============================================================

     export async function treeGen(tree) {

         const res  = await fetch(NODE_DATA_URL);
         const data = await res.json();

         // ---- Mutually-exclusive groups ---------------------------
         // Shared objects: every member TreeNode's `.excl` points at
         // the SAME object, so there's exactly one source of truth
         // per group (matters once edit-mode can add/remove members).
         // `members` is validated here — a malformed/missing members
         // array becomes [] with a console error instead of crashing
         // the first time something tries to iterate it.
         tree.mutExclGroups = (data.mutuallyExclusive || []).map(g => {
             if (!Array.isArray(g.members)) {
                 console.error(`Tree: mutual-exclusion group "${g.label}" has no valid "members" array — treating it as empty. Check nodes.json.`);
             }
             return {
                 label:   g.label,
                 max:     g.max,
                 members: Array.isArray(g.members) ? [...g.members] : [],
             };
         });

         // ---- Nodes -------------------------------------------------
         for (const nodeData of data.nodes) {
             const fiRad = nodeData.fi    * (Math.PI / 180);
             const thRad = nodeData.theta * (Math.PI / 180);

             const x = tree.sphereRadius * Math.cos(thRad) * Math.cos(fiRad);
             const y = tree.sphereRadius * Math.sin(thRad);
             const z = tree.sphereRadius * Math.cos(thRad) * Math.sin(fiRad);

             let exclGroup = null;
             if (nodeData.exclGroup) {
                 exclGroup = tree.mutExclGroups.find(g => g.label === nodeData.exclGroup) || null;
                 if (!exclGroup) {
                     console.error(`Tree: node "${nodeData.id}" references exclGroup "${nodeData.exclGroup}", but no mutuallyExclusive entry has that label. Check nodes.json.`);
                 }
             }

             const node = new TreeNode(
                 String(nodeData.id), nodeData.name, nodeData.desc, nodeData.hoverText,
                 x, y, z, fiRad, thRad,
                 nodeData.requires || [], nodeData.cost, exclGroup, nodeData.temperature
             );

             tree.nodes.push(node);
             AppState.scene.add(node);
         }

         AppState.cameraRotationOffsetFromTree = -Math.PI / 2;
     }
