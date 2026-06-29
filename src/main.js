// ============================================================
// IMPORTS
// ============================================================
import './style.css'
import HelvetikerFont from "three/examples/fonts/helvetiker_regular.typeface.json"; // Bundled font used for node name labels
import Stats from '/node_modules/three/examples/jsm/libs/stats.module.js'          // FPS/ms performance overlay (toggle with Tab)
import * as THREE from 'three';
import { WebGLRenderer } from "three";
import { EffectComposer, EffectPass, RenderPass, SelectiveBloomEffect } from "postprocessing"; // Post-processing bloom pipeline
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js'; // 3D text geometry for node labels
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';    // For loading the telescope .glb model
 
 
// ============================================================
// ZOOM STATE
// Tracks the current zoom level and parameters needed to
// smoothly animate the camera FOV when zooming in/out.
// ============================================================
var zoomStage = 0;          // Discrete zoom level counter; 0 = default, higher = more zoomed in
var zoomDelta = 0;          // FOV change amount for the current zoom step
var initialZoom = 0;        // FOV at the start of a zoom animation
var finalZoom = 0;          // Target FOV at the end of a zoom animation
var zoomCamBool = false;    // True while a zoom animation is actively running
var zoomComputeBool = false; // True while the per-frame zoom interpolation is being executed
var zoomCamFov = 0;         // Working FOV value mutated each frame during a zoom
var queuedZoomOut = false;  // If a zoom-out was requested while another animation was running, execute it next frame
 
 
// ============================================================
// BLOOM LAYER
// Objects added to this Three.js layer are included in the
// SelectiveBloomEffect selection; everything else is not bloomed.
// ============================================================
const BLOOM_LAYER = 2;
 
 
// ============================================================
// SKILL TREE GAME STATE
// ============================================================
var perkPoints = 20; // The player's remaining budget for purchasing skill tree nodes
 
 
// ============================================================
// PAN (CAMERA ROTATION) STATE
// Tracks parameters needed to smoothly rotate the camera
// toward a target node when the player clicks.
// ============================================================
var panCamBool = false;    // True while a pan animation is actively running
var panComputeBool = false; // True while the per-frame pan interpolation is being executed
var panX = 0;              // Camera rotation.x at the start of the pan animation
var panY = 0;              // Camera rotation.y at the start of the pan animation
var dPanX = 0;             // Total delta to apply to rotation.x over the animation
var dPanY = 0;             // Total delta to apply to rotation.y over the animation
var panSpeed = 0;          // (Unused — reserved for future variable-speed panning)
var iniPanCamFov = 1;      // FOV before panning started; restored afterwards
var panCamFov = 0;         // Working FOV value mutated during the pan (creates a slight "dolly" effect)
 
 
// ============================================================
// FREE-CAMERA MOMENTUM STATE
// The main (skill-tree) camera uses arrow keys with momentum;
// these accumulate and decay each frame.
// ============================================================
var cameraAccelerationX = 0; // Current rotational velocity around X
var cameraAccelerationY = 0; // Current rotational velocity around Y
 
 
// ============================================================
// STAR MODEL REGISTRY
// Every TreeNode creates one StarModel (its visual star mesh
// with animated lava-shader material). They are stored here
// so the main animate() loop can update their shader uniforms.
// ============================================================
var starClasses = [];
 
 
// ============================================================
// CLASS: Tree
// Holds all skill-tree nodes, manages their spatial layout on
// a sphere, draws the connecting lines between them, and
// provides lookup helpers.
// ============================================================
class Tree {
  /**
   * @param {number} smolFi  - Minimum fi (longitude) angle in degrees
   * @param {number} highFi  - Maximum fi (longitude) angle in degrees
   * @param {number} smolTh  - Minimum theta (latitude) angle in degrees
   * @param {number} highTh  - Maximum theta (latitude) angle in degrees
   */
  constructor(smolFi, highFi, smolTh, highTh) {
    this.nodes = [];    // Array of TreeNode instances (order matches the data file)
    this.mutExcl = [];  // Each entry is a raw line from the mutuallyExclusive data file.
                        // Format: "[max allowed] [label] [nodeId…]"
                        // The 0th token is the maximum number of nodes that can be active in the block.
    this.nodeIDs = [];  // Sparse map: nodeId → index in this.nodes (built in init())
    this.span = [smolFi, highFi, smolTh, highTh]; // Angular range used when projecting data coordinates onto the sphere
 
    this.sphereRadius = 30; // Radius of the invisible sphere all nodes are placed on
 
    // Semi-transparent purple sphere that visually bounds the skill tree.
    // Mainly useful as a development aid to see the overall tree shape.
    this.treesphere = new THREE.Mesh(
      new THREE.SphereGeometry(this.sphereRadius, 32, 16),
      new THREE.MeshBasicMaterial({ color: "purple", transparent: true, opacity: 0.25 })
    );
    scene.add(this.treesphere);
  }
 
  /**
   * Draws a great-circle arc (visible line) and two invisible tube halves
   * between two points on the sphere surface.
   *
   * The visible arc is a dashed LineDashedMaterial for OR-requirements,
   * or a solid LineBasicMaterial for AND-requirements.
   *
   * The two invisible tube halves (mesh1h / mesh2h) cover the first and
   * second halves of the arc respectively. Clicking either half pans the
   * camera toward the node at that end of the line.
   *
   * @param {THREE.Vector3} pointStart  - World position of the "from" node
   * @param {THREE.Vector3} pointEnd    - World position of the "to" node
   * @param {number}        smoothness  - Number of sample points along the arc
   * @param {boolean}       clockWise   - If true, take the long way around the sphere
   * @param {boolean}       dashed      - Render as dashed (OR) or solid (AND)
   * @param {number}        a           - Index of the destination node in this.nodes
   * @param {number}        b           - Index of the requirement entry in node[a].requires
   * @param {number}        kej         - Index within an OR group (-1 if this is an AND link)
   * @param {string[]}      ej          - The split OR group array (unused when kej == -1)
   */
  createLinesNTubes(pointStart, pointEnd, smoothness, clockWise, dashed, a, b, kej, ej) {
    // Compute a normal vector perpendicular to the plane containing both points and the origin.
    // This normal is the rotation axis used to walk along the great-circle arc.
    var cb = new THREE.Vector3(), ab = new THREE.Vector3(), normal = new THREE.Vector3();
    cb.subVectors(new THREE.Vector3(), pointEnd); // cb = origin − end
    ab.subVectors(pointStart, pointEnd);          // ab = start − end
    cb.cross(ab);                                 // cb = cross product → perpendicular to the arc plane
    normal.copy(cb).normalize();
 
    // Walk from pointStart to pointEnd in equal angular steps around the normal axis.
    var angle = pointStart.angleTo(pointEnd);
    if (clockWise) angle = angle - Math.PI * 2;  // Go the long way around if requested
    var angleDelta = angle / (smoothness - 1);
    const pnts = [];
    for (var i = 0; i < smoothness; i++) {
      pnts.push(pointStart.clone().applyAxisAngle(normal, angleDelta * i));
    }
 
    // Build and add the visible arc line to the scene.
    const path = new THREE.CatmullRomCurve3(pnts);
    const pathGeometry = new THREE.BufferGeometry().setFromPoints(path.getPoints(50));
    if (dashed) {
      // Dashed line = OR requirement (one of these nodes must be active)
      const pathMaterial = new THREE.LineDashedMaterial({ color: 0x666666, dashSize: 0.01, gapSize: 0.01 });
      const arc = new THREE.Line(pathGeometry, pathMaterial);
      scene.add(arc);
      arc.computeLineDistances(); // Required for dashed lines to render correctly
      this.nodes[a].skyLines.push(arc);
    } else {
      // Solid line = AND requirement (this node must be active)
      const pathMaterial = new THREE.LineBasicMaterial({ color: 0x666666 });
      const arc = new THREE.Line(pathGeometry, pathMaterial);
      scene.add(arc);
      this.nodes[a].skyLines.push(arc);
    }
 
    // Split the arc point array into two halves.
    // Each half becomes an invisible tube used as a click target for panning the camera.
    const pnts1h = []; // First half of the arc (closer to node "a")
    const pnts2h = []; // Second half of the arc (closer to the required node)
    for (let i = 0; i < pnts.length / 2 + 2; i++) { pnts1h.push(pnts[i]); }
    for (let i = pnts.length / 2 + 1; i < pnts.length; i++) { pnts2h.push(pnts[i]); }
 
    // Build the two invisible tube meshes (fully transparent, wireframe, no depth write).
    const path1h = new THREE.CatmullRomCurve3(pnts1h);
    const geometry1h = new THREE.TubeGeometry(path1h, 20, 0.02, 8, false);
    const material1h = new THREE.MeshBasicMaterial({ color: 0x00ff00, wireframe: true, opacity: 0.0, transparent: true, depthWrite: false });
    const mesh1h = new THREE.Mesh(geometry1h, material1h);
 
    const path2h = new THREE.CatmullRomCurve3(pnts2h);
    const geometry2h = new THREE.TubeGeometry(path2h, 20, 0.01, 8, false);
    const material2h = new THREE.MeshBasicMaterial({ color: 0x0000ff, wireframe: true, opacity: 0.0, transparent: true, depthWrite: false });
    const mesh2h = new THREE.Mesh(geometry2h, material2h);
 
    // Assign click handlers to each tube half.
    // Clicking the first half pans toward node "a" (the destination node).
    // Clicking the second half pans toward the required node (the source).
    if (kej == -1) {
      // AND link: requires[b] is a simple node ID string
      mesh1h.onClick = function (e) {
        if (!tr.nodes[tr.nodeIDs[tr.nodes[a].requires[b]]].isHovered && panCamBool == false && zoomCamBool == false) {
          panCamBool = true;
          computePanCamera(camera.rotation.x, camera.rotation.y, tr.nodes[a].theta, tr.nodes[a].fi - Math.PI / 2);
        }
      }
      mesh2h.onClick = function (e) {
        if (!tr.nodes[a].isHovered && panCamBool == false && zoomCamBool == false) {
          panCamBool = true;
          computePanCamera(camera.rotation.x, camera.rotation.y, tr.nodes[tr.nodeIDs[tr.nodes[a].requires[b]]].theta, tr.nodes[tr.nodeIDs[tr.nodes[a].requires[b]]].fi - Math.PI / 2);
        }
      }
    } else {
      // OR link: ej[kej] is the specific node ID within the OR group
      mesh1h.onClick = function (e) {
        if (!tr.nodes[tr.nodeIDs[ej[kej]]].isHovered && panCamBool == false && zoomCamBool == false) {
          panCamBool = true;
          computePanCamera(camera.rotation.x, camera.rotation.y, tr.nodes[a].theta, tr.nodes[a].fi - Math.PI / 2);
        }
      }
      mesh2h.onClick = function (e) {
        if (!tr.nodes[a].isHovered && panCamBool == false && zoomCamBool == false) {
          panCamBool = true;
          computePanCamera(camera.rotation.x, camera.rotation.y, tr.nodes[tr.nodeIDs[ej[kej]]].theta, tr.nodes[tr.nodeIDs[ej[kej]]].fi - Math.PI / 2);
        }
      }
    }
 
    scene.add(mesh1h);
    scene.add(mesh2h);
    this.nodes[a].reqTubes.push([mesh1h, mesh2h]); // Store the pair so it can be accessed later if needed
  }
 
  /**
   * Called once after all nodes have been added.
   * 1) Builds the nodeIDs lookup map (nodeId → array index).
   * 2) Iterates every node's requires list and draws the connecting arcs.
   */
  init() {
    // Build nodeIDs: maps a node's string ID to its position in this.nodes[]
    for (let i = 0; i < this.nodes.length; i++) {
      this.nodeIDs[this.nodes[i].nodeId] = i;
    }
 
    // Draw lines between every node and each of its requirements.
    for (let i = 0; i < this.nodes.length; i++) {
      for (let j = 0; j < this.nodes[i].requires.length; j++) {
        var startT = new THREE.Vector3(); // World position of the required (source) node
        var endD = new THREE.Vector3();   // World position of the current (destination) node
        this.nodes[i].star.getWorldPosition(endD);
 
        if (this.nodes[i].requires[j].includes("o")) {
          // OR requirement: the requirement string contains "o" as a delimiter between node IDs.
          // Each ID in the group gets its own dashed arc.
          var a = this.nodes[i].requires[j].split("o");
          for (let k = 0; k < a.length; k++) {
            var startT = new THREE.Vector3();
            var endD = new THREE.Vector3();
            this.nodes[i].star.getWorldPosition(endD);
            this.nodes[this.nodeIDs[a[k]]].star.getWorldPosition(startT);
            this.createLinesNTubes(startT, endD, 50, false, true, i, j, k, a); // dashed = true
          }
        } else {
          // AND requirement: solid arc between this node and the single required node.
          this.nodes[this.nodeIDs[this.nodes[i].requires[j]]].star.getWorldPosition(startT);
          this.createLinesNTubes(startT, endD, 50, false, false, i, j, -1, 0); // dashed = false
        }
      }
    }
  }
 
  /**
   * Returns the spherical coordinates (fi, theta) of a node by its ID.
   * @param {string|number} ID - The nodeId to look up
   * @returns {THREE.Vector2} x = fi, y = theta
   */
  getNodeSphericalCoordinates(ID) {
    return new THREE.Vector2(this.nodes[this.nodeIDs[ID]].getFi(), this.nodes[this.nodeIDs[ID]].getTheta());
  }
 
  /**
   * Returns the world-space position of a node's invisible sphere by its ID.
   * @param {string|number} ID - The nodeId to look up
   * @returns {THREE.Vector3}
   */
  getNodeWorldPosition(ID) {
    var vSpecVec = new THREE.Vector3();
    this.nodes[this.nodeIDs[ID]].getWorldPosition(vSpecVec);
    return vSpecVec;
  }
}
 
 
// ============================================================
// CLASS: TreeNode  (extends THREE.Mesh)
// Represents a single perk/skill in the skill tree.
// Each node consists of:
//   - An invisible sphere mesh (the TreeNode itself, used for hover detection)
//   - A smaller star mesh (the visible glowing dot, added to bloom)
//   - A 3D text label mesh for the node name
//   - A StarModel (the animated lava-shader sphere applied when the node is activated)
// ============================================================
class TreeNode extends THREE.Mesh {
  /**
   * @param {string|number} anodeId    - Unique ID for this node (used in requires chains)
   * @param {string}        anodeName  - Display name shown in the UI panel and as a 3D label
   * @param {string}        anodeDesc  - Full description shown in the UI panel (use <D> for line breaks)
   * @param {string}        ahoverText - Short tooltip text (currently unused in the UI)
   * @param {number}        posX/Y/Z   - World-space position on the skill-tree sphere
   * @param {number}        afi        - Fi (longitude) angle in radians at this node's position
   * @param {number}        atheta     - Theta (latitude) angle in radians at this node's position
   * @param {string[]}      requires   - Array of requirement strings. "-" means no requirements.
   *                                     Plain IDs are AND requirements; IDs joined by "o" are OR groups.
   * @param {number}        anodeCost  - Perk-point cost to activate this node
   * @param {array}         exclStuff  - Mutual-exclusion group data for this node (from the mutuallyExclusive file)
   * @param {number}        temperature- Blackbody colour temperature in Kelvin; controls the star's colour
   */
  constructor(anodeId, anodeName, anodeDesc, ahoverText, posX, posY, posZ, afi, atheta, requires, anodeCost, exclStuff, temperature) {
    super();
    this.temperature = temperature;
    this.isHovered = false; // True while the pointer is over this node's invisible sphere
    this.skyLines = [];     // References to the arc Line objects connected to this node
    this.reqTubes = [];     // Pairs of invisible tube meshes placed along each requirement arc
 
    // Node visual size scales with cost, with a minimum for free nodes
    if (anodeCost < 1) {
      this.nodeSize = 0.05;
    } else {
      this.nodeSize = 0.05 * ((anodeCost) ^ (1 / 3)); // Note: ^ is bitwise XOR in JS, not exponentiation
    }
 
    this.excl = exclStuff; // Mutual-exclusion group data (see isMutExclCritMet in onClick)
 
    // fi is negated here so that positive fi values in the data file map to the expected visual direction
    this.fi = -afi;
    this.theta = atheta;
 
    // The TreeNode mesh itself is an invisible sphere used only as a raycaster hit target
    this.geometry = new THREE.SphereGeometry(this.nodeSize, 16, 16);
    this.material = new THREE.MeshBasicMaterial({ color: 0x999999, wireframe: true, opacity: 0.002, transparent: true, depthWrite: false });
    this.position.set(posX, posY, posZ);
 
    // ---- 3D Text Label ----
    // Build the text geometry for the node name, placed just outside the node's sphere surface.
    this.nameTextGeometry = new TextGeometry(anodeName, {
      font: hellishFont,
      size: 0.02,
      depth: 0.0,
      curveSegments: 12,
      bevelEnabled: false,
      bevelThickness: 0.03,
      bevelSize: 0.02,
      bevelOffset: 0,
      bevelSegments: 5,
    });
    this.nameTextMaterials = [
      new THREE.MeshBasicMaterial({ color: 0xfafafa }), // Front face of the extruded text
      new THREE.MeshBasicMaterial({ color: 0x00aaaa })  // Side/depth face of the extruded text
    ];
    this.nameText = new THREE.Mesh(this.nameTextGeometry, this.nameTextMaterials);
 
    // Compute the text bounding box to vertically centre the label on the node
    this.nameTextGeometry.computeBoundingBox();
    this.centerOffset = 0.5 * (this.nameTextGeometry.boundingBox.max.y - this.nameTextGeometry.boundingBox.min.y);
 
    // Position the label tangentially on the sphere surface (offset by fi direction)
    this.nameText.position.set(
      this.position.x + (this.nodeSize + 0.01) * Math.sin(this.fi),
      this.position.y - this.centerOffset,
      this.position.z + (this.nodeSize + 0.01) * Math.cos(this.fi)
    );
    // Rotate the label to face outward from the sphere surface
    this.nameText.rotation.set(0, -Math.PI * 1 / 2 + this.fi, 0);
    scene.add(this.nameText);
 
    // ---- Star Model ----
    // Register a StarModel (handles async texture loading and the lava shader) for this node.
    // starID lets us find this node's StarModel in the global starClasses array.
    this.starID = starClasses.length;
    starClasses.push(new StarModel(this.temperature));
 
    // Core node properties
    this.nodeName = anodeName;
    this.nodeDesc = anodeDesc;
    this.nodeCost = anodeCost;
    this.nodeActive = false; // Whether the player has purchased this node
    this.sphereSize = 1;     // (Unused — reserved for potential future size scaling)
 
    // ---- Visible Star Mesh ----
    // A small sphere that shows the node's position. Starts fully transparent (invisible).
    // When the player activates a node, this mesh's material is swapped to the animated lava shader.
    this.star = new THREE.Mesh(
      new THREE.SphereGeometry(this.nodeSize / 4, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0x000000, opacity: 0.0, transparent: true, depthWrite: false })
    );
 
    // Add the star to the bloom effect so it glows when active
    addToBloom(this.star);
 
    this.hovertext = ahoverText;
    this.nodeName = anodeName;
    this.nodeDesc = anodeDesc;
    this.nodeId = anodeId;
 
    // Parse requirements: a single "-" token means this node has no prerequisites
    if (requires[0] === "-") { this.requires = []; }
    else { this.requires = requires; }
 
    this.star.position.set(posX, posY, posZ);
    scene.add(this.star);
  }
 
  /**
   * Called by the pointer-move handler when the cursor enters this node's bounding sphere.
   * Scales the node up, updates the label position, and fills the UI info panel.
   */
  onPointerOver(e) {
    // Scale up the invisible hit sphere and the visible star mesh to indicate hover
    this.scale.set(2.0, 2.0, 2.0);
    this.star.scale.set(2.0, 2.0, 2.0);
 
    this.isHovered = true;
 
    // Reposition the label to follow the scaled-up node surface
    // (The sin/cos offsets keep the label tangent to the sphere at any position)
    this.nameText.position.set(
      this.position.x + (this.nodeSize + 0.01) * Math.sin(this.fi) * this.scale.x,
      this.position.y - this.centerOffset,
      this.position.z + (this.nodeSize + 0.01) * Math.cos(this.fi) * this.scale.z
    );
 
    // Populate the right-hand UI panel with this node's details
    document.getElementById("nodeName").textContent = this.nodeName;
    const nodeDescNode = document.getElementById("nodeDesc");
    nodeDescNode.textContent = '';
    // The description uses "<D>" as a manual line-break token
    var nodeDescSplit = this.nodeDesc.split("<D>");
    var mybr = document.createElement('br');
    for (let i = 0; i < nodeDescSplit.length; i++) {
      nodeDescNode.innerText += nodeDescSplit[i];
      if (i == nodeDescSplit.length - 1) { break; }
      nodeDescNode.appendChild(mybr);
    }
    document.getElementById("nodeCost").textContent = "Cost: " + this.nodeCost;
    document.getElementById("perkPoints").textContent = perkPoints;
  }
 
  /**
   * Called by the pointer-move handler when the cursor leaves this node's bounding sphere.
   * Restores scale and repositions the label.
   */
  onPointerOut(e) {
    this.scale.set(1, 1, 1);
    this.isHovered = false;
    this.star.scale.set(1, 1, 1);
    // Restore the label to its normal (unscaled) position
    this.nameText.position.set(
      this.position.x + (this.nodeSize + 0.01) * Math.sin(this.fi) * this.scale.x,
      this.position.y - this.centerOffset,
      this.position.z + (this.nodeSize + 0.01) * Math.cos(this.fi) * this.scale.z
    );
  }
 
  /**
   * Called when the player clicks on this node.
   *
   * Logic:
   *  - If already active AND no other active node depends on this one → deactivate (refund cost).
   *  - If not active AND enough perk points AND all requirements met AND mutual-exclusion allows → activate.
   *  - Always pans the camera toward this node after the click.
   */
  onClick(e) {
    /**
     * Checks whether any currently-active node lists `id` as a required prerequisite.
     * Used to prevent deactivating a node that another node depends on.
     * Special case: node ID 1 (the root "Adventurer" node) cannot be treated as a
     * dependency for negative-ID nodes (origin/lifestyle nodes).
     *
     * @param {string|number} id - The nodeId being considered for deactivation
     * @returns {boolean} True if at least one active node requires this node
     */
    function isNextActive(id) {
      for (let i = 0; i < tr.nodes.length; i++) {
        for (let j = 0; j < tr.nodes[i].requires.length; j++) {
          if (tr.nodes[i].requires[j].includes("o") && tr.nodes[i].requires[0] != "o1") {
            // OR group: this node locks if it's the only remaining active node in the group
            var a = tr.nodes[i].requires[j].split("o");
            var b = 0;   // Count of inactive nodes in the OR group
            var c = false; // True if `id` is in this OR group AND the parent node is active
            for (let k = 0; k < a.length; k++) {
              if (a[k] == id && tr.nodes[i].nodeActive && !(id == 1 && tr.nodes[i].nodeId < 0)) {
                c = true;
              } else if (!tr.nodes[tr.nodeIDs[a[k]]].nodeActive) {
                b++;
              }
            }
            // If all other nodes in the OR group are already inactive, this is the sole satisfier
            if (b == a.length - 1 && c) { return true; }
          } else {
            // AND requirement: a direct dependency
            if (tr.nodes[i].requires[j] == id && tr.nodes[i].nodeActive && !(id == 1 && tr.nodes[i].nodeId < 0)) {
              return true;
            }
          }
        }
      }
      return false;
    }
 
    /**
     * Checks whether activating `passedIdNum` would violate any mutual-exclusion rule.
     * The excl array for a node lists all mutual-exclusion groups it belongs to.
     * Format of each group: [maxAllowed, label, nodeId1, nodeId2, ...]
     * Returns false if the maximum number of active nodes in any group has already been reached.
     *
     * @param {string|number} passedIdNum - The nodeId to check
     * @returns {boolean} True if activating is allowed; false if it would exceed the group limit
     */
    function isMutExclCritMet(passedIdNum) {
      var arr = tr.nodes[tr.nodeIDs[passedIdNum]].excl;
      if (arr == [] || arr == undefined || arr == 0) { return true; } // No exclusion groups
      var count = 0;
      // Count how many nodes in the exclusion group (indices 2+) are currently active
      for (let i = 2; i < arr.length; i++) {
        if (tr.nodes[tr.nodeIDs[arr[i]]].nodeActive) { count++; }
      }
      // arr[0] is the maximum number of simultaneously active nodes allowed in the group
      if (count >= arr[0]) { return false; }
      return true;
    }
 
    if (this.nodeActive == true && !isNextActive(this.nodeId)) {
      // Deactivate: refund cost and restore the invisible (black) star material
      this.nodeActive = false;
      perkPoints += Number(this.nodeCost);
      this.star.material = new THREE.MeshBasicMaterial({ color: 0x000000, opacity: 0.0, transparent: true, depthWrite: false });
    } else if (perkPoints >= this.nodeCost && areReqsMet(this.requires) && isMutExclCritMet(this.nodeId) && this.nodeActive == false) {
      // Activate: spend cost and apply the animated lava-shader star material
      this.nodeActive = true;
      perkPoints -= Number(this.nodeCost);
      this.star.material = starClasses[this.starID].customMaterial;
    }
 
    // Update the perk points display in the UI
    document.getElementById("perkPoints").textContent = perkPoints;
 
    // Pan the camera to face this node
    if (panCamBool == false && zoomCamBool == false) {
      panCamBool = true;
      computePanCamera(camera.rotation.x, camera.rotation.y, this.theta, this.fi - Math.PI / 2);
    }
  }
 
  /** Returns the node's fi (longitude) angle. Used by Tree helpers. */
  getFi() { return this.fi; }
 
  /** Returns the node's theta (latitude) angle. Used by Tree helpers. */
  getTheta() { return this.theta; }
}
 
 
// ============================================================
// CLASS: StarModel
// Manages the animated lava-shader material applied to a skill
// node's star mesh when that node is activated.
//
// Pipeline:
//   1. Load 'sun.jpg' (surface texture) and 'cloud.png' (noise texture) asynchronously.
//   2. Recolour sun.jpg to match the blackbody temperature of this star using
//      a full CIE colour-science pipeline (spectrum → XYZ → RGB → HSL).
//   3. Build a custom ShaderMaterial with the recoloured textures.
//   4. Set isReady = true so the animate() loop can start updating the time uniform.
// ============================================================
class StarModel {
  /**
   * @param {number} temperature - Blackbody temperature in Kelvin (e.g. 3000 = red, 10000 = blue-white)
   */
  constructor(temperature) {
    this.temperature = temperature;
 
    // Shader animation parameters (passed as GLSL uniforms)
    this.baseSpeed  = 0.0001; // How fast the surface texture scrolls
    this.repeatS    = 1.0;    // UV tiling in the S direction
    this.repeatT    = 1.0;    // UV tiling in the T direction
    this.noiseScale = 0.9;    // How strongly the noise texture distorts the surface UVs
    this.blendSpeed = 0.03;   // Speed of the secondary (blend) texture scroll
    this.blendOffset = 0.6;   // Brightness offset subtracted from the blend layer
    this.bumpSpeed  = 0.06;   // Speed of the vertex displacement (bump) scroll
    this.bumpScale  = 0.0025; // Magnitude of vertex displacement
 
    this.isReady = false; // Becomes true once textures are loaded and material is built
 
    // Begin async texture loading; material is created inside the .then() callback
    this.loadTextures().then(() => {
      this.createMaterial();
      this.isReady = true;
    }).catch(err => {
      console.error("Error loading textures:", err);
    });
  }
 
  /**
   * Loads 'sun.jpg' and 'cloud.png', recolours sun.jpg to the correct star temperature,
   * assigns the results to instance properties, and sets all textures to repeat-wrap.
   * @returns {Promise<void>}
   */
  loadTextures() {
    return new Promise((resolve, reject) => {
      Promise.all([
        this.loadTexture('sun.jpg'),   // Base surface texture (fire/lava look)
        this.loadTexture('cloud.png')  // Noise texture used for UV distortion and vertex bumping
      ])
      .then(([lavaTexture, noiseTexture]) => {
        // Recolour the lava texture to match this star's blackbody temperature
        this.modifyLavaTexture(lavaTexture, this.temperature).then(modifiedLavaTexture => {
          this.lavaTexture   = modifiedLavaTexture;
          this.noiseTexture  = noiseTexture;
          this.blendTexture  = this.lavaTexture;  // The blend layer reuses the colour-shifted surface texture
          this.bumpTexture   = this.noiseTexture; // The bump layer reuses the noise texture
 
          // All four textures must repeat seamlessly for the scrolling shader to work
          this.lavaTexture.wrapS  = this.lavaTexture.wrapT  = THREE.RepeatWrapping;
          this.noiseTexture.wrapS = this.noiseTexture.wrapT = THREE.RepeatWrapping;
          this.blendTexture.wrapS = this.blendTexture.wrapT = THREE.RepeatWrapping;
          this.bumpTexture.wrapS  = this.bumpTexture.wrapT  = THREE.RepeatWrapping;
 
          resolve();
        }).catch(reject);
      })
      .catch(reject);
    });
  }
 
  /**
   * Wraps THREE.TextureLoader in a Promise for use with async/await.
   * @param {string} url - Path to the texture file
   * @returns {Promise<THREE.Texture>}
   */
  loadTexture(url) {
    return new Promise((resolve, reject) => {
      new THREE.TextureLoader().load(
        url,
        texture => resolve(texture),
        undefined,
        err => reject(new Error(`Failed to load texture: ${url}`))
      );
    });
  }
 
  /**
   * Recolours a texture to match a given blackbody temperature.
   *
   * Algorithm (based on John Walker's "Colour Rendering of Spectra"):
   *   1. Use Planck's law (bbSpectrum) to compute the spectral power distribution.
   *   2. Integrate against CIE 1931 colour-matching functions to get CIE XYZ.
   *   3. Convert XYZ → linear RGB using SMPTE colour-system matrices (xyzToRgb).
   *   4. Normalise so the brightest channel = 1.0 (normRgb), then quantise to 0–255.
   *   5. Convert the target colour to HSL.
   *   6. For every pixel in the texture, compute a brightness factor from the original
   *      pixel's greyscale value and apply hslToRgb using that brightness as the lightness.
   *      This preserves the surface detail (bright/dark patterns) while changing the hue.
   *
   * @param {THREE.Texture} texture     - The source texture to recolour
   * @param {number}        temperature - Blackbody temperature in Kelvin
   * @returns {Promise<THREE.CanvasTexture>}
   */
  modifyLavaTexture(texture, temperature) {
    return new Promise((resolve, reject) => {
      // Draw the source texture onto an off-screen canvas so we can read/write pixel data
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      canvas.width  = texture.image.width;
      canvas.height = texture.image.height;
      ctx.drawImage(texture.image, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data; // Flat RGBA array
 
      // ---- CIE Colour Science Helpers ----
      // These implement the pipeline described in John Walker's "Colour Rendering of Spectra"
      // Reference: https://www.fourmilab.ch/documents/specrend/
 
      /** Represents an RGB colour primaries + white point for a display standard. */
      class ColourSystem {
        constructor(name, xRed, yRed, xGreen, yGreen, xBlue, yBlue, xWhite, yWhite, gamma) {
          this.name = name;
          this.xRed = xRed; this.yRed = yRed;
          this.xGreen = xGreen; this.yGreen = yGreen;
          this.xBlue = xBlue; this.yBlue = yBlue;
          this.xWhite = xWhite; this.yWhite = yWhite;
          this.gamma = gamma;
        }
      }
 
      // CIE standard illuminant chromaticities
      const IlluminantC   = [0.3101, 0.3162];
      const IlluminantD65 = [0.3127, 0.3291];
      const IlluminantE   = [0.33333333, 0.33333333];
 
      const GAMMA_REC709 = 0; // Special sentinel: use Rec. 709 transfer function instead of a plain gamma
 
      // Pre-built colour system definitions (only SMPTEsystem is used below)
      const NTSCsystem  = new ColourSystem("NTSC",          0.67,   0.33,   0.21,  0.71,  0.14,  0.08,  ...IlluminantC,   GAMMA_REC709);
      const EBUsystem   = new ColourSystem("EBU (PAL/SECAM)",0.64,   0.33,   0.29,  0.60,  0.15,  0.06,  ...IlluminantD65, GAMMA_REC709);
      const SMPTEsystem = new ColourSystem("SMPTE",          0.630,  0.340,  0.310, 0.595, 0.155, 0.070, ...IlluminantD65, GAMMA_REC709);
      const HDTVsystem  = new ColourSystem("HDTV",           0.670,  0.330,  0.210, 0.710, 0.150, 0.060, ...IlluminantD65, GAMMA_REC709);
      const CIEsystem   = new ColourSystem("CIE",            0.7355, 0.2645, 0.2658,0.7243,0.1669,0.0085,...IlluminantE,   GAMMA_REC709);
      const Rec709system= new ColourSystem("CIE REC 709",    0.64,   0.33,   0.30,  0.60,  0.15,  0.06,  ...IlluminantD65, GAMMA_REC709);
 
      // CIE u'v' ↔ xy chromaticity conversions (not currently used in the main path, kept for completeness)
      function upvpToXY(up, vp) {
        const xc = (9 * up) / ((6 * up) - (16 * vp) + 12);
        const yc = (4 * vp) / ((6 * up) - (16 * vp) + 12);
        return [xc, yc];
      }
      function xyToUpvp(xc, yc) {
        const up = (4 * xc) / ((-2 * xc) + (12 * yc) + 3);
        const vp = (9 * yc) / ((-2 * xc) + (12 * yc) + 3);
        return [up, vp];
      }
 
      /**
       * Converts CIE XYZ to linear RGB using the specified ColourSystem's primary matrices.
       * Builds a 3×3 chromatic adaptation matrix and applies it.
       */
      function xyzToRgb(cs, xc, yc, zc) {
        const xr = cs.xRed,   yr = cs.yRed,   zr = 1 - (xr + yr);
        const xg = cs.xGreen, yg = cs.yGreen, zg = 1 - (xg + yg);
        const xb = cs.xBlue,  yb = cs.yBlue,  zb = 1 - (xb + yb);
        const xw = cs.xWhite, yw = cs.yWhite, zw = 1 - (xw + yw);
 
        var rx = (yg * zb) - (yb * zg), ry = (xb * zg) - (xg * zb), rz = (xg * yb) - (xb * yg);
        var gx = (yb * zr) - (yr * zb), gy = (xr * zb) - (xb * zr), gz = (xb * yr) - (xr * yb);
        var bx = (yr * zg) - (yg * zr), by = (xg * zr) - (xr * zg), bz = (xr * yg) - (xg * yr);
 
        const rw = ((rx * xw) + (ry * yw) + (rz * zw)) / yw;
        const gw = ((gx * xw) + (gy * yw) + (gz * zw)) / yw;
        const bw = ((bx * xw) + (by * yw) + (bz * zw)) / yw;
 
        // Normalise rows by white-point weights
        rx /= rw; ry /= rw; rz /= rw;
        gx /= gw; gy /= gw; gz /= gw;
        bx /= bw; by /= bw; bz /= bw;
 
        const r = (rx * xc) + (ry * yc) + (rz * zc);
        const g = (gx * xc) + (gy * yc) + (gz * zc);
        const b = (bx * xc) + (by * yc) + (bz * zc);
        return [r, g, b];
      }
 
      /** Returns true if all channels are non-negative (i.e. the colour is within the display gamut). */
      function insideGamut(r, g, b) {
        return (r >= 0) && (g >= 0) && (b >= 0);
      }
 
      /**
       * Shifts an out-of-gamut colour toward white until all channels are ≥ 0.
       * Returns true if a correction was applied.
       */
      function constrainRgb(r, g, b) {
        const w = Math.min(0, r, g, b);
        if (w > 0) { r += w; g += w; b += w; return true; }
        return false;
      }
 
      /**
       * Applies Rec. 709 gamma correction (or a plain power-law gamma) to a single channel.
       * @param {ColourSystem} cs - The colour system (for its gamma value)
       * @param {number} c        - Linear channel value [0, 1]
       * @returns {number} Gamma-corrected channel value
       */
      function gammaCorrect(cs, c) {
        const gamma = cs.gamma;
        if (gamma === GAMMA_REC709) {
          const cc = 0.018;
          if (c < cc) { c *= ((1.099 * Math.pow(cc, 0.45)) - 0.099) / cc; }
          else        { c = (1.099 * Math.pow(c, 0.45)) - 0.099; }
        } else {
          c = Math.pow(c, 1.0 / gamma);
        }
        return c;
      }
 
      /** Applies gamma correction to all three RGB channels. */
      function gammaCorrectRgb(cs, r, g, b) {
        return [gammaCorrect(cs, r), gammaCorrect(cs, g), gammaCorrect(cs, b)];
      }
 
      /**
       * Normalises RGB so the brightest channel becomes 1.0.
       * Ensures the colour is as vivid as possible on screen while preserving hue.
       */
      function normRgb(r, g, b) {
        const greatest = Math.max(r, g, b);
        if (greatest > 0) { return [r / greatest, g / greatest, b / greatest]; }
        return [r, g, b];
      }
 
      /**
       * Integrates a spectral power distribution against CIE 1931 colour-matching functions
       * to produce normalised CIE xy chromaticity (z = 1 - x - y implicit).
       *
       * The colour-matching table covers 380–780 nm in 5 nm steps (80 entries).
       *
       * @param {function} specIntens - Function(wavelength_nm) → spectral radiance
       * @returns {number[]} [x, y, z] normalised chromaticity
       */
      function spectrumToXyz(specIntens) {
        // CIE 1931 2° standard observer colour-matching functions, 380–780 nm in 5 nm steps
        const cieColourMatch = [
          [0.0014,0.0000,0.0065],[0.0022,0.0001,0.0105],[0.0042,0.0001,0.0201],
          [0.0076,0.0002,0.0362],[0.0143,0.0004,0.0679],[0.0232,0.0006,0.1102],
          [0.0435,0.0012,0.2074],[0.0776,0.0022,0.3713],[0.1344,0.0040,0.6456],
          [0.2148,0.0073,1.0391],[0.2839,0.0116,1.3856],[0.3285,0.0168,1.6230],
          [0.3483,0.0230,1.7471],[0.3481,0.0298,1.7826],[0.3362,0.0380,1.7721],
          [0.3187,0.0480,1.7441],[0.2908,0.0600,1.6692],[0.2511,0.0739,1.5281],
          [0.1954,0.0910,1.2876],[0.1421,0.1126,1.0419],[0.0956,0.1390,0.8130],
          [0.0580,0.1693,0.6162],[0.0320,0.2080,0.4652],[0.0147,0.2586,0.3533],
          [0.0049,0.3230,0.2720],[0.0024,0.4073,0.2123],[0.0093,0.5030,0.1582],
          [0.0291,0.6082,0.1117],[0.0633,0.7100,0.0782],[0.1096,0.7932,0.0573],
          [0.1655,0.8620,0.0422],[0.2257,0.9149,0.0298],[0.2904,0.9540,0.0203],
          [0.3597,0.9803,0.0134],[0.4334,0.9950,0.0087],[0.5121,1.0000,0.0057],
          [0.5945,0.9950,0.0039],[0.6784,0.9786,0.0027],[0.7621,0.9520,0.0021],
          [0.8425,0.9154,0.0018],[0.9163,0.8700,0.0017],[0.9786,0.8163,0.0014],
          [1.0263,0.7570,0.0011],[1.0567,0.6949,0.0010],[1.0622,0.6310,0.0008],
          [1.0456,0.5668,0.0006],[1.0026,0.5030,0.0003],[0.9384,0.4412,0.0002],
          [0.8544,0.3810,0.0002],[0.7514,0.3210,0.0001],[0.6424,0.2650,0.0000],
          [0.5419,0.2170,0.0000],[0.4479,0.1750,0.0000],[0.3608,0.1382,0.0000],
          [0.2835,0.1070,0.0000],[0.2187,0.0816,0.0000],[0.1649,0.0610,0.0000],
          [0.1212,0.0446,0.0000],[0.0874,0.0320,0.0000],[0.0636,0.0232,0.0000],
          [0.0468,0.0170,0.0000],[0.0329,0.0119,0.0000],[0.0227,0.0082,0.0000],
          [0.0158,0.0057,0.0000],[0.0114,0.0041,0.0000],[0.0081,0.0029,0.0000],
          [0.0058,0.0021,0.0000],[0.0041,0.0015,0.0000],[0.0029,0.0010,0.0000],
          [0.0020,0.0007,0.0000],[0.0014,0.0005,0.0000],[0.0010,0.0004,0.0000],
          [0.0007,0.0002,0.0000],[0.0005,0.0002,0.0000],[0.0003,0.0001,0.0000],
          [0.0002,0.0001,0.0000],[0.0002,0.0001,0.0000],[0.0001,0.0000,0.0000],
          [0.0001,0.0000,0.0000],[0.0001,0.0000,0.0000],[0.0000,0.0000,0.0000]
        ];
 
        let X = 0, Y = 0, Z = 0;
        for (let i = 0, lambda = 380; lambda < 780.1; i++, lambda += 5) {
          const Me = specIntens(lambda);
          X += Me * cieColourMatch[i][0];
          Y += Me * cieColourMatch[i][1];
          Z += Me * cieColourMatch[i][2];
        }
        const XYZ = (X + Y + Z);
        return [X / XYZ, Y / XYZ, Z / XYZ]; // Normalised chromaticity coordinates
      }
 
      /**
       * Planck's law: spectral radiance of a blackbody at a given wavelength and temperature.
       * Returns relative radiance (absolute scale doesn't matter for colour computation).
       *
       * @param {number} wavelength - Wavelength in nanometres
       * @param {number} bbTemp     - Temperature in Kelvin
       * @returns {number} Spectral radiance (arbitrary units)
       */
      function bbSpectrum(wavelength, bbTemp) {
        const wlm = wavelength * 1e-9; // Convert nm to metres
        return (3.74183e-16 * Math.pow(wlm, -5.0)) / (Math.exp(1.4388e-2 / (wlm * bbTemp)) - 1.0);
      }
 
      // ---- Compute the target star colour from its blackbody temperature ----
      const cs = SMPTEsystem; // Use SMPTE primaries for the colour conversion
      const bbTemp = this.temperature;
      const [x, y, z] = spectrumToXyz(lambda => bbSpectrum(lambda, bbTemp));
      var [r, g, b] = xyzToRgb(cs, x, y, z);
      [r, g, b] = normRgb(r, g, b);                               // Normalise to [0, 1]
      [r, g, b] = [Math.floor(255 * r), Math.floor(255 * g), Math.floor(255 * b)]; // Scale to 0–255
 
      // Convert the target colour to HSL so we can apply it pixel-by-pixel
      // while preserving the original texture's lightness variation.
      function rgbToHsl(r, g, b) {
        r /= 255; g /= 255; b /= 255;
        var max = Math.max(r, g, b), min = Math.min(r, g, b);
        var h, s, l = (max + min) / 2;
        if (max == min) {
          h = s = 0; // Achromatic (grey)
        } else {
          var d = max - min;
          s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
          switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
          }
          h /= 6;
        }
        return [h, s, l];
      }
 
      function hslToRgb(h, s, l) {
        var r, g, b;
        if (s == 0) {
          r = g = b = l; // Achromatic
        } else {
          // Helper to wrap the hue channel into the correct sextant
          function hue2rgb(p, q, t) {
            if (t < 0) t += 1;
            if (t > 1) t -= 1;
            if (t < 1 / 6) return p + (q - p) * 6 * t;
            if (t < 1 / 2) return q;
            if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
            return p;
          }
          var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
          var p = 2 * l - q;
          r = hue2rgb(p, q, h + 1 / 3);
          g = hue2rgb(p, q, h);
          b = hue2rgb(p, q, h - 1 / 3);
        }
        return [r, g, b];
      }
 
      let h, s, l;
      [h, s, l] = rgbToHsl(r, g, b);
 
      // Recolour every pixel: keep the original brightness (greyscale value) but swap to the
      // star's hue and saturation. This tints the texture to the correct stellar colour
      // while keeping all the surface detail (bright spots, dark patches) intact.
      for (let i = 0; i < data.length; i += 4) {
        var bri = (((data[i] + data[i + 1] + data[i + 2]) / 3) / 255); // Greyscale brightness [0, 1]
        [r, g, b] = hslToRgb(h, s, l * bri); // Apply star hue/saturation, scale lightness by original brightness
        [r, g, b] = [Math.floor(255 * r), Math.floor(255 * g), Math.floor(255 * b)];
        data[i]     = r; // R
        data[i + 1] = g; // G
        data[i + 2] = b; // B
        // Alpha channel (data[i + 3]) is left unchanged
      }
 
      ctx.putImageData(imageData, 0, 0);
      const newTexture = new THREE.CanvasTexture(canvas); // Wrap the modified canvas as a Three.js texture
      resolve(newTexture);
    });
  }
 
  /**
   * Builds the custom GLSL ShaderMaterial used to render the animated star surface.
   *
   * Vertex shader:
   *   Samples the noise texture to compute a per-vertex displacement along the normal,
   *   creating a subtle animated "churning" surface. Poles are handled with a fixed wobble
   *   to avoid UV singularity artifacts.
   *
   * Fragment shader:
   *   Samples the base (colour) texture through two independent noise-distorted UV sets
   *   scrolling at different speeds and directions, then additively blends them.
   *   The `time` uniform is incremented each frame by the animate() loop.
   */
  createMaterial() {
    this.customUniforms = {
      baseTexture:  { type: "t", value: this.lavaTexture },    // Star surface colour texture
      baseSpeed:    { type: "f", value: this.baseSpeed },      // Speed of base texture UV scroll
      repeatS:      { type: "f", value: this.repeatS },        // UV tiling
      repeatT:      { type: "f", value: this.repeatT },
      noiseTexture: { type: "t", value: this.noiseTexture },   // Noise used for UV distortion and bumping
      noiseScale:   { type: "f", value: this.noiseScale },     // Distortion strength
      blendTexture: { type: "t", value: this.blendTexture },   // Second layer (same as base, different scroll)
      blendSpeed:   { type: "f", value: this.blendSpeed },     // Speed of blend texture scroll
      blendOffset:  { type: "f", value: this.blendOffset },    // Darkening offset applied to blend layer
      bumpTexture:  { type: "t", value: this.bumpTexture },    // Texture driving vertex displacement
      bumpSpeed:    { type: "f", value: this.bumpSpeed },      // Speed of bump texture scroll
      bumpScale:    { type: "f", value: this.bumpScale },      // Vertex displacement magnitude
      alpha:        { type: "f", value: 1.0 },                 // Global opacity
      time:         { type: "f", value: 1.0 }                  // Elapsed time (incremented in animate())
    };
 
    this.customMaterial = new THREE.ShaderMaterial({
      uniforms: this.customUniforms,
      vertexShader: `
        uniform sampler2D noiseTexture;
        uniform float noiseScale;
        
        uniform sampler2D bumpTexture;
        uniform float bumpSpeed;
        uniform float bumpScale;
        
        uniform float time;
        
        varying vec2 vUv;
        
        void main() 
        { 
            vUv = uv;
          
          // Scroll the bump texture UVs over time to animate the displacement
          vec2 uvTimeShift = vUv + vec2( 1.1, 1.9 ) * time * bumpSpeed;
          vec4 noiseGeneratorTimeShift = texture2D( noiseTexture, uvTimeShift );
          vec2 uvNoiseTimeShift = vUv + noiseScale * vec2( noiseGeneratorTimeShift.r, noiseGeneratorTimeShift.g );
          vec4 bumpData = texture2D( bumpTexture, uvTimeShift );
        
          // At the poles (vUv.y ≈ 0 or 1) use a simple sinusoidal wobble instead
          // of the texture sample, which degenerates near UV singularities
          float displacement = ( vUv.y > 0.999 || vUv.y < 0.001 ) ? 
            bumpScale * (0.3 + 0.02 * sin(time)) :  
            bumpScale * bumpData.r;
          
          // Push each vertex outward along its normal by the displacement amount
          vec3 newPosition = position + normal * displacement;
        
          gl_Position = projectionMatrix * modelViewMatrix * vec4( newPosition, 1.0 );
        }`,
      fragmentShader: `
          uniform sampler2D baseTexture;
          uniform float baseSpeed;
          uniform float repeatS;
          uniform float repeatT;
          
          uniform sampler2D noiseTexture;
          uniform float noiseScale;
          
          uniform sampler2D blendTexture;
          uniform float blendSpeed;
          uniform float blendOffset;
          
          uniform float time;
          uniform float alpha;
          
          varying vec2 vUv;
          
          void main() 
          {
            // Base layer: scroll UVs and distort through noise in one direction
            vec2 uvTimeShift = vUv + vec2( -0.7, 1.5 ) * time * baseSpeed;	
            vec4 noiseGeneratorTimeShift = texture2D( noiseTexture, uvTimeShift );
            vec2 uvNoiseTimeShift = vUv + noiseScale * vec2( noiseGeneratorTimeShift.r, noiseGeneratorTimeShift.b );
            vec4 baseColor = texture2D( baseTexture, uvNoiseTimeShift * vec2(repeatS, repeatT) );
          
            // Blend layer: scroll in a different direction and distort through the green/blue noise channels
            vec2 uvTimeShift2 = vUv + vec2( 1.3, -1.7 ) * time * blendSpeed;	
            vec4 noiseGeneratorTimeShift2 = texture2D( noiseTexture, uvTimeShift2 );
            vec2 uvNoiseTimeShift2 = vUv + noiseScale * vec2( noiseGeneratorTimeShift2.g, noiseGeneratorTimeShift2.b );
            // blendOffset darkens the blend layer so it doesn't wash everything out
            vec4 blendColor = texture2D( blendTexture, uvNoiseTimeShift2 * vec2(repeatS, repeatT) ) - blendOffset * vec4(1.0, 1.0, 1.0, 1.0);
          
            // Additive blend: bright regions in either layer shine through
            vec4 theColor = baseColor + blendColor;
            theColor.a = alpha;
            gl_FragColor = theColor;
          } 
        `
    });
 
    this.customMaterial.transparent = true;
    this.customMaterial.opacity = 0.9;
    this.customMaterial.needsUpdate = true;
  }
 
  /** Returns true once all textures are loaded and the ShaderMaterial has been built. */
  isModelReady() { return this.isReady; }
}
 
 
// ============================================================
// RAYCASTER / HOVER TRACKING
// intersects: the list of objects hit by the raycaster this frame
// hovered: dict of uuid → hit for objects currently under the pointer
// ============================================================
let intersects = [];
let hovered = {};
 
// Parse the bundled Helvetiker font once; reused by all TreeNode text labels
const theFontLoader = new FontLoader();
const hellishFont = theFontLoader.parse(HelvetikerFont);
 
 
// ============================================================
// SCENE SETUP
// ============================================================
var container = document.getElementById('canvas'); // The <div> that hosts the Three.js canvas
var scene = new THREE.Scene();
 
// Main (skill-tree) camera — fixed at the origin, looks outward.
// The skill tree sphere is around it; rotating the camera is how the player "navigates".
var camera = new THREE.PerspectiveCamera(30, container.clientWidth / container.clientHeight, 1, 100000);
camera.position.set(0, 0, 0);
camera.rotation.order = "YXZ"; // YXZ order prevents gimbal lock for typical sky-looking rotations
camera.layers.enableAll(); // Must see all layers including the bloom layer
 
// Free camera — a separate camera the player can move freely with WASD + mouse drag (toggle with key "2")
var freeCamera = new THREE.PerspectiveCamera(30, container.clientWidth / container.clientHeight, 0.00001, 100000);
freeCamera.position.set(0, 0, 0);
freeCamera.rotation.order = "YXZ";
freeCamera.layers.enableAll();
 
let activeCamera = camera; // Whichever camera is currently rendering (switchable with "1"/"2")
 
// Raycaster setup — updated every pointer-move event
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
raycaster.setFromCamera(mouse, camera);
intersects = raycaster.intersectObjects(scene.children, true);
 
// Clocks for time-delta calculations in different subsystems
var clock = new THREE.Clock();       // General per-frame delta (shader time, star animation)
var cameraClock = new THREE.Clock(); // Delta for free-camera momentum calculations
var panclock = new THREE.Clock();    // Elapsed time for pan animations
var zoomclock = new THREE.Clock();   // Elapsed time for zoom animations
var animclock = new THREE.Clock();   // Reserved for future hover animations (currently unused)
 
const stats = new Stats();  // FPS/memory overlay; appended to DOM when Tab is pressed
var statsShown = false;
 
 
// ============================================================
// RENDERER & POST-PROCESSING PIPELINE
// Order: scene → RenderPass → SelectiveBloomEffect → screen
// ============================================================
const renderer = new WebGLRenderer({
  powerPreference: "high-performance",
  antialias: false, // Disabled for performance; bloom softens edges anyway
  stencil: false,
  depth: false
});
container.appendChild(renderer.domElement);
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.outputColorSpace = THREE.SRGBColorSpace;
 
const composer = new EffectComposer(renderer);
let rendek = new RenderPass(scene, activeCamera); // Standard scene render pass
composer.addPass(rendek);
 
// Selective bloom: only objects in the bloom selection (added via addToBloom()) glow.
const bloomEffect = new SelectiveBloomEffect(scene, activeCamera, {
  intensity: 2,
  mipmapBlur: true,
  luminanceThreshold: 0,
  luminanceSmoothing: 0.2,
  levels: 3,
  radius: 0.9,
  ignoreBackground: true
});
 
/**
 * Moves an object onto the bloom layer and registers it with the bloom effect's selection set.
 * Only objects registered here will emit glow.
 * @param {THREE.Object3D} obj
 */
function addToBloom(obj) {
  obj.layers.set(BLOOM_LAYER);
  bloomEffect.selection.add(obj);
}
 
const effectPass = new EffectPass(activeCamera, bloomEffect); // Applies bloom and renders to screen
effectPass.renderToScreen = true;
composer.addPass(effectPass);
 
 
// ============================================================
// TREE DATA LOADING
// Fetches the node data and mutually-exclusive group data from
// GitHub, then instantiates all TreeNode objects.
// ============================================================
/**
 * Fetches node data and mutually-exclusive group definitions, then populates
 * the given Tree with TreeNode instances placed on a sphere.
 *
 * Node data format (pipe-delimited, one node per line):
 *   nodeId | name | description | hoverText | fi_coord | theta_coord | requires (space-sep) | cost | (unused) | temperature
 *
 * The fi/theta values in the file are raw grid coordinates; this function maps
 * them linearly onto the angular range defined by TREEE.span.
 *
 * Mutually-exclusive data format (one group per line):
 *   maxAllowed label nodeId1 nodeId2 ...
 *
 * @param {Tree} TREEE - The Tree instance to populate
 */
async function treeGen(TREEE) {
  // ---- Fetch and parse node data ----
  const response1 = await fetch("https://raw.githubusercontent.com/Dat-guy-test/project/refs/heads/main/test");
  const data1 = await response1.text();
  const lines = data1.split("\n"); // One node per line
  var atrs = [['', '', '', '', '', '', [], '']];
  for (let i = 0; i < lines.length - 1; i++) {
    atrs[i] = lines[i].split(" | ");        // Split into fields
    atrs[i][6] = atrs[i][6].split(" ");     // Field 6 (requires) is space-separated; convert to array
  }
 
  // Find the min/max fi and theta grid coordinates so we can normalise them
  var bigFi = 0, lowFi = 0, bigTh = 0, lowTh = 0;
  for (let i = 0; i < atrs.length; i++) {
    if (atrs[i][4] > bigFi) bigFi = atrs[i][4];
    if (atrs[i][4] < lowFi) lowFi = atrs[i][4];
    if (atrs[i][5] > bigTh) bigTh = atrs[i][5];
    if (atrs[i][5] < lowTh) lowTh = atrs[i][5];
  }
  var fiSteps = bigFi - lowFi; // Total span of fi grid coordinates
  var thSteps = bigTh - lowTh; // Total span of theta grid coordinates
 
  // Convert the Tree's angular span (degrees) to radians
  var minKorFi = TREEE.span[0] * (Math.PI / 180);
  var maxKorFi = TREEE.span[1] * (Math.PI / 180);
  var minKorTh = TREEE.span[2] * (Math.PI / 180);
  var maxKorTh = TREEE.span[3] * (Math.PI / 180);
 
  // ---- Fetch and parse mutually-exclusive group data ----
  const response2 = await fetch("https://raw.githubusercontent.com/Dat-guy-test/project/refs/heads/main/mutuallyExclusive");
  const data2 = await response2.text();
  const lines2 = data2.split("\n");
  var exclIDs = [];
  for (let i = 0; i < lines2.length - 1; i++) {
    TREEE.mutExcl[i] = lines2[i];
    exclIDs = lines2[i].split(" ");
    // For each node ID listed in this group, stamp the full group array onto that node's atrs[k][8]
    for (let j = 2; j < exclIDs.length; j++) {
      for (let k = 0; k < lines.length - 1; k++) {
        if (atrs[k][0] == exclIDs[j]) { atrs[k][8] = exclIDs; }
      }
    }
  }
 
  // ---- Instantiate all TreeNodes ----
  for (let i = 0; i < lines.length - 1; i++) {
    // Map the node's grid coordinates onto spherical angles
    var fi = minKorFi + (atrs[i][4] - lowFi) * (maxKorFi - minKorFi) / fiSteps;
    var th = minKorTh + (atrs[i][5] - lowTh) * (maxKorTh - minKorTh) / thSteps;
 
    // Convert spherical (fi, theta) to Cartesian (x, y, z) on the skill-tree sphere
    var iks  = TREEE.sphereRadius * Math.cos(th) * Math.cos(fi); // x
    var igrek = TREEE.sphereRadius * Math.sin(th);               // y
    var zet  = TREEE.sphereRadius * Math.cos(th) * Math.sin(fi); // z
 
    TREEE.nodes[i] = new TreeNode(
      atrs[i][0],  // nodeId
      atrs[i][1],  // nodeName
      atrs[i][2],  // nodeDesc
      atrs[i][3],  // hoverText
      iks, igrek, zet, // world position
      fi, th,      // spherical angles
      atrs[i][6],  // requires array
      atrs[i][7],  // cost
      atrs[i][8],  // mutual-exclusion group (may be undefined if node has no group)
      atrs[i][9]   // blackbody temperature (Kelvin)
    );
    scene.add(TREEE.nodes[i]);
  }
  cameraRotationOffsetFromTree = -Math.PI / 2; // Rotate camera so it faces into the tree correctly
}
 
// Instantiate the skill tree with its angular span (degrees):
//   fi: 0° – 40°, theta: 20° – 60°
var tr = new Tree(0, 40, 20, 60);
 
 
// ============================================================
// REQUIREMENT CHECK HELPER
// Used globally by TreeNode.onClick to verify that all
// prerequisite nodes are active before allowing activation.
// ============================================================
/**
 * Returns true if all requirements in `reqs` are satisfied by currently-active nodes.
 *
 * Requirement formats:
 *   "nodeId"        - AND: that specific node must be active
 *   "idAoidB"       - OR: at least one of idA, idB must be active
 *
 * @param {string[]} reqs - The node's requires array
 * @returns {boolean}
 */
function areReqsMet(reqs) {
  for (var i = 0; i < reqs.length; i++) {
    if (reqs[i].includes("o")) {
      // OR group: split on "o", at least one must be active
      var a = reqs[i].split("o");
      var b = 0; // Count of inactive nodes in this OR group
      for (let k = 0; k < a.length; k++) {
        if (tr.nodes[tr.nodeIDs[a[k]]].nodeActive == false) { b++; }
      }
      if (b == a.length) { return false; } // All are inactive → OR condition fails
    } else {
      // AND requirement: this specific node must be active
      if (tr.nodes[tr.nodeIDs[reqs[i]]].nodeActive == false) { return false; }
    }
  }
  return true;
}
 
 
// ============================================================
// INITIALISATION SEQUENCE
// Waits for tree data to load, then builds the arc connections
// and orients the camera toward the root node.
// ============================================================
var cameraRotationOffsetFromTree = 0; // Set to -π/2 after loading to face the tree correctly
 
async function sec() {
  await treeGen(tr);  // Load data and create all TreeNode meshes
  tr.init();          // Build nodeIDs map and draw all connecting arcs
 
  // Point the main camera at node ID 1 (the root "Adventurer" node)
  var vec = tr.getNodeSphericalCoordinates(1);
  camera.rotation.set(vec.y, vec.x + cameraRotationOffsetFromTree, 0);
  camera.fov = iniPanCamFov;
  camera.updateProjectionMatrix();
}
sec();
console.log(tr.nodes); // Expose the nodes array in the browser console for debugging
 
 
// ============================================================
// SKYBOX (procedural gradient)
// A giant sphere surrounding everything, rendered on the inside
// (BackSide), with a GLSL gradient from dark teal at the
// bottom to black at the top.
// ============================================================
var skyGeo = new THREE.SphereGeometry(100000, 25, 25);
const skyMat = new THREE.ShaderMaterial({
  vertexShader: `
    varying vec3 vPosition;
    void main() {
      vPosition = position;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform vec3 color1;
    uniform vec3 color2;
    varying vec3 vPosition;
    void main() {
      // Map Y position of the sphere to a [0, 1] gradient value
      float gradient = (vPosition.y + 100000.0) / 200000.0;
      // Smooth the transition
      gradient = smoothstep(-1.0, 1.0, gradient);
      // Interpolate between the two sky colours (bottom → top)
      vec3 color = mix(color1, color2, gradient);
      gl_FragColor = vec4(color, 1.0);
    }
  `,
  uniforms: {
    color1: { value: new THREE.Color(0x002f2f) }, // Dark teal (horizon / bottom)
    color2: { value: new THREE.Color(0x000000) }  // Black (zenith / top)
  }
});
var sky = new THREE.Mesh(skyGeo, skyMat);
sky.material.side = THREE.BackSide; // Render the inside of the sphere
scene.add(sky);
 
 
// ============================================================
// GROUND PLANE (horizon / grass)
// A flat textured plane sitting just below the origin,
// giving the impression of standing on ground while looking
// up at the star skill tree.
// ============================================================
const horizonTexture = new THREE.TextureLoader().load('grass.jpg');
horizonTexture.wrapS = horizonTexture.wrapT = THREE.RepeatWrapping;
horizonTexture.repeat.set(50, 50); // Tile the texture 50×50 across the plane
 
const horizonMaterial = new THREE.MeshBasicMaterial({
  map: horizonTexture,
  side: THREE.DoubleSide,
  transparent: false,
  opacity: 1.0
});
const horizonGeometry = new THREE.PlaneGeometry(50, 50, 1, 1);
const horizon = new THREE.Mesh(horizonGeometry, horizonMaterial);
horizon.rotation.x = -Math.PI / 2; // Rotate the plane flat (horizontal)
horizon.position.set(0, -1, 0);    // Sink it 1 unit below the camera origin
horizon.layers.set(0);             // Keep on the default layer (not bloomed)
bloomEffect.selection.delete(horizon); // Explicitly exclude from bloom
scene.add(horizon);
 
 
// ============================================================
// POINTER MOVE — HOVER DETECTION
// Raycasts every frame to find which scene objects are under
// the pointer, then calls onPointerOver / onPointerOut on the
// relevant objects.
// ============================================================
window.addEventListener('pointermove', (e) => {
  // Convert pointer position to normalised device coordinates [-1, 1]
  mouse.set((e.offsetX / container.clientWidth) * 2 - 1, -(e.offsetY / container.clientHeight) * 2 + 1);
  raycaster.setFromCamera(mouse, camera);
  intersects = raycaster.intersectObjects(scene.children, true);
 
  // For each previously-hovered object that's no longer in the hit list, fire onPointerOut
  Object.keys(hovered).forEach((key) => {
    const hit = intersects.find((hit) => hit.object.uuid === key);
    if (hit === undefined) {
      const hoveredItem = hovered[key];
      if (hoveredItem.object.onPointerOver) { hoveredItem.object.onPointerOut(hoveredItem); }
      delete hovered[key];
    }
  });
 
  // For each newly-hit object, fire onPointerOver; for all hit objects, fire onPointerMove
  intersects.forEach((hit) => {
    if (!hovered[hit.object.uuid]) {
      hovered[hit.object.uuid] = hit;
      if (hit.object.onPointerOver) { hit.object.onPointerOver(hit); }
    }
    if (hit.object.onPointerMove) { hit.object.onPointerMove(hit); }
  });
});
 
 
// ============================================================
// SCENE LIGHTING
// ============================================================
const ambientLight = new THREE.AmbientLight(0xffffff, 1); // Soft fill light (no shadows)
scene.add(ambientLight);
 
const directionalLight = new THREE.DirectionalLight(0xffffff, 2.0); // Key light from default direction
scene.add(directionalLight);
 
 
// ============================================================
// TELESCOPE MODEL
// Loads a decorative GLB model placed at the scene origin.
// ============================================================
const loader = new GLTFLoader();
loader.load(
  'Telescope.glb',
  function (gltf) {
    scene.add(gltf.scene);
    gltf.scene.scale.set(0.05, 0.05, 0.05);      // Scale down to scene units
    gltf.scene.position.set(0, -1, 0);            // Place at ground level
    gltf.scene.rotation.set(0, Math.PI / 2, 0);  // Rotate to face the correct direction
  },
  function (xhr) {
    console.log((xhr.loaded / xhr.total * 100) + '% loaded'); // Loading progress
  },
  function (error) {
    console.error('An error happened while loading the model:', error);
  }
);
 
 
// ============================================================
// CLICK — NODE ACTIVATION
// Fires onClick on any hit object that has one (TreeNodes and
// invisible tube halves on arcs).
// ============================================================
window.addEventListener('click', (e) => {
  intersects.forEach((hit) => {
    if (hit.object.onClick) { hit.object.onClick(hit); }
  });
});
 
 
// ============================================================
// KEYBOARD INPUT STATE
// Tracks which keys are currently held down for per-frame
// movement in the animate() loop.
// ============================================================
const keys = {
  ArrowUp: false,
  ArrowDown: false,
  ArrowLeft: false,
  ArrowRight: false
};
window.addEventListener("keyup", function (event) {
  if (event.key in keys) { keys[event.key] = false; }
});
 
// Keyboard controls:
//   Escape    - Print camera rotation and first node angles to console (debug)
//   =         - Zoom in (decrease FOV by 1 step)
//   -         - Zoom out (increase FOV by 1 step, max 60 steps)
//   Tab       - Toggle the Stats (FPS) overlay
//   1         - Switch to the main skill-tree camera
//   2         - Switch to the free-fly camera
//   Arrow keys- Accelerate the main camera rotation (with momentum)
//   WASD      - Move the free camera forward/back/left/right
//   Space     - Move the free camera up
//   Shift     - Move the free camera down
window.addEventListener("keydown", function (event) {
  if (event.defaultPrevented) { return; }
  if (event.key in keys) { keys[event.key] = true; }
  switch (event.key) {
    case "Escape":
      // Print current camera state to console (useful for debugging node positions)
      console.log(camera.rotation.x, camera.rotation.y, tr.nodes[0].theta, tr.nodes[0].fi);
      break;
    case "=":
      // Zoom in: decrease the zoom stage counter and trigger a FOV reduction animation
      if (zoomStage > 0) {
        if (zoomCamBool == false && panCamBool == false) { zoomCamBool = true; zoomStage -= 1; computeZoomCamera(-1); }
        camera.updateProjectionMatrix();
      }
      break;
    case "-":
      // Zoom out: increase the zoom stage counter and trigger a FOV increase animation
      if (zoomStage >= 0 && zoomStage < 60) {
        if (zoomCamBool == false && panCamBool == false) { zoomCamBool = true; zoomStage += 1; computeZoomCamera(1); }
        camera.updateProjectionMatrix();
      }
      break;
    case "Tab":
      // Toggle the three.js Stats performance overlay
      if (statsShown == false) { statsShown = true; document.body.appendChild(stats.dom); }
      break;
    case "1":
      // Switch to the main skill-tree camera and re-bind it to all render passes
      activeCamera = camera;
      console.log("Activating main camera...", activeCamera == camera);
      rendek.camera = activeCamera;
      bloomEffect.camera = activeCamera;
      effectPass.camera = activeCamera;
      break;
    case "2":
      // Switch to the free-fly camera and re-bind it to all render passes
      activeCamera = freeCamera;
      console.log("Activating free camera...", activeCamera == freeCamera);
      rendek.camera = activeCamera;
      bloomEffect.camera = activeCamera;
      effectPass.camera = activeCamera;
      break;
    default:
      return; // Ignore all other keys
  }
  event.preventDefault(); // Prevent browser default (e.g. Tab focusing next element)
}, true);
 
 
// ============================================================
// FREE CAMERA MOVEMENT (arrow keys with momentum)
// Arrow keys build up cameraAcceleration; the values decay
// multiplicatively each frame so the camera glides to a stop.
// Note: this currently applies to `camera` (the main camera),
// not `freeCamera` — this may be a bug.
// ============================================================
function freeCameraMovement() {
  var DT = cameraClock.getDelta(); // Time since last frame
 
  // Build acceleration from held arrow keys
  if (keys.ArrowUp)    { cameraAccelerationX += 1.05 * DT; }
  if (keys.ArrowDown)  { cameraAccelerationX -= 1.05 * DT; }
  if (keys.ArrowLeft)  { cameraAccelerationY += 1.05 * DT; }
  if (keys.ArrowRight) { cameraAccelerationY -= 1.05 * DT; }
 
  // Apply accumulated acceleration to the main camera's rotation
  camera.rotation.x += cameraAccelerationX * DT;
  camera.rotation.y += cameraAccelerationY * DT;
 
  // Snap very small accelerations to zero to prevent endless micro-drift
  if (cameraAccelerationX > -0.01 && cameraAccelerationX < 0.01) { cameraAccelerationX = 0; }
  if (cameraAccelerationY > -0.01 && cameraAccelerationY < 0.01) { cameraAccelerationY = 0; }
 
  // Exponential decay: reduce acceleration by 1.5× its current value each frame
  cameraAccelerationX -= 1.5 * cameraAccelerationX * DT;
  cameraAccelerationY -= 1.5 * cameraAccelerationY * DT;
}
 
 
// ============================================================
// PAN CAMERA — SETUP
// Called to begin a smooth rotation animation from the current
// camera orientation to a target orientation.
// ============================================================
/**
 * Prepares the parameters for a pan animation and starts the clock.
 * The actual interpolation is performed each frame by panCamera().
 *
 * @param {number} iniFi - Current camera.rotation.x (vertical angle)
 * @param {number} iniTh - Current camera.rotation.y (horizontal angle)
 * @param {number} finFi - Target camera.rotation.x
 * @param {number} finTh - Target camera.rotation.y
 */
function computePanCamera(iniFi, iniTh, finFi, finTh) {
  iniPanCamFov = camera.fov; // Remember starting FOV so we can restore it
  panX  = iniFi;
  dPanX = finFi - iniFi;    // Delta to apply to rotation.x
  panY  = iniTh;
  dPanY = finTh - iniTh;    // Delta to apply to rotation.y
  panCamFov = iniPanCamFov;
  panComputeBool = true;
  panclock.start();
}
 
 
// ============================================================
// ZOOM CAMERA — SETUP
// Called to begin a smooth FOV animation step.
// ============================================================
/**
 * Prepares the parameters for a zoom animation and starts the clock.
 * The actual interpolation is performed each frame by zoomCamera().
 *
 * @param {number} amount - Change in FOV to apply (positive = zoom out, negative = zoom in)
 */
function computeZoomCamera(amount) {
  zoomDelta   = amount;
  initialZoom = camera.fov;
  finalZoom   = initialZoom + zoomDelta;
  zoomCamFov  = camera.fov;
  zoomComputeBool = true;
  zoomclock.start();
}
 
 
// ============================================================
// PAN CAMERA — PER-FRAME INTERPOLATION
// Linearly interpolates camera rotation over `panTime` seconds.
// Also applies a small FOV "zoom-out" effect proportional to
// the rotation distance, creating a slight dolly impression.
// ============================================================
function panCamera() {
  const panTime = 1; // Total duration of the pan animation in seconds
  var panDT = panclock.getElapsedTime();
 
  // Proportional FOV nudge: larger pans produce a more pronounced temporary zoom-out
  var fac = 1.5 * (Math.abs(dPanX) + Math.abs(dPanY));
  if (fac > 0.01) {
    panCamFov -= fac * (panDT - panTime / 2); // Creates a smooth arc in FOV (in then out)
    camera.fov = panCamFov;
    camera.updateProjectionMatrix();
  }
 
  // When the animation completes, restore FOV and stop the clock
  if (panDT >= panTime) {
    panComputeBool = false;
    panCamFov = iniPanCamFov;
    camera.fov = panCamFov;
    camera.updateProjectionMatrix();
    panDT = panTime;
    panclock.stop();
    panCamBool = false;
  }
 
  // Linear interpolation of camera rotation toward the target
  camera.rotation.set(
    panX + (panDT / panTime) * dPanX,
    panY + (panDT / panTime) * dPanY,
    0
  );
}
 
 
// ============================================================
// ZOOM CAMERA — PER-FRAME INTERPOLATION
// Linearly interpolates the camera FOV over `zoomTime` seconds.
// ============================================================
function zoomCamera() {
  const zoomTime = 0.05; // Duration of the zoom animation in seconds (very fast)
  var zoomDT = zoomclock.getElapsedTime();
 
  // Linear interpolation of FOV
  zoomCamFov = initialZoom + (zoomDelta / zoomTime) * zoomDT;
  camera.fov = zoomCamFov;
  camera.updateProjectionMatrix();
 
  // When complete, snap to the exact final value and stop the clock
  if (zoomDT >= zoomTime) {
    zoomComputeBool = false;
    camera.fov = finalZoom;
    zoomCamFov = initialZoom;
    camera.updateProjectionMatrix();
    zoomDT = zoomTime;
    zoomclock.stop();
    zoomCamBool = false;
  }
}
 
 
// ============================================================
// HOVER ANIMATION — STUB
// Placeholder for future node hover animations (e.g. pulsing
// scale, rotating star). Currently does nothing.
// ============================================================
function hoverAnimation() {
  const animtime = 2;  // Intended animation duration (unused)
  const animSize = 0;  // Intended animation scale target (unused)
  animclock.getDelta(); // Consuming the delta prevents time from accumulating if this is later used
}
 
 
// ============================================================
// WINDOW RESIZE HANDLER
// Updates camera aspect ratio and renderer dimensions when the
// browser window changes size.
// ============================================================
window.addEventListener('resize', onWindowResize, false);
function onWindowResize() {
  activeCamera.aspect = container.clientWidth / container.clientHeight;
  activeCamera.updateProjectionMatrix();
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
}
 
 
// ============================================================
// FREE CAMERA — MOUSE DRAG ROTATION
// While the left mouse button is held, mouse movement rotates
// the free camera. Vertical rotation is clamped to ±90°.
// ============================================================
let isMouseDown = false;
let lastMousePosition = { x: 0, y: 0 };
 
window.addEventListener('mousedown', (e) => { isMouseDown = true; });
window.addEventListener('mouseup',   (e) => { isMouseDown = false; });
window.addEventListener('mousemove', (e) => {
  if (isMouseDown) {
    let deltaX = e.clientX - lastMousePosition.x;
    let deltaY = e.clientY - lastMousePosition.y;
 
    freeCamera.rotation.y -= deltaX * 0.005; // Horizontal drag → yaw
    freeCamera.rotation.x -= deltaY * 0.005; // Vertical drag → pitch
 
    // Clamp pitch to prevent the camera from flipping upside-down
    freeCamera.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, freeCamera.rotation.x));
  }
  lastMousePosition = { x: e.clientX, y: e.clientY };
});
 
// Also track WASD and special keys for free-camera movement in the animate() loop
window.addEventListener('keydown', (e) => { keys[e.key] = true; });
window.addEventListener('keyup',   (e) => { keys[e.key] = false; });
 
 
// ============================================================
// MAIN ANIMATION LOOP
// Runs every frame via requestAnimationFrame.
// Order of operations:
//   1. Camera animations (pan and zoom)
//   2. Arrow-key camera momentum (freeCameraMovement)
//   3. Star shader time uniform updates
//   4. Free-camera WASD position movement
//   5. Render via the post-processing composer
// ============================================================
function animate() {
  stats.begin(); // Start FPS measurement for this frame
  var delta = clock.getDelta(); // Time in seconds since the last frame
 
  // Run camera animations if they're active
  if (panComputeBool == true) { panCamera(); }
 
  // If a zoom-out was queued (couldn't start because another animation was running), fire it now
  if (queuedZoomOut == true && zoomComputeBool == false && panCamBool == false) {
    queuedZoomOut = false;
    computeZoomCamera(-zoomDelta);
  }
  if (zoomComputeBool == true) { zoomCamera(); }
 
  // Apply arrow-key momentum to the main camera
  freeCameraMovement();
 
  // Advance the time uniform for every star that has finished loading its textures
  for (let i = 0; i < starClasses.length; i++) {
    if (starClasses[i].isModelReady()) {
      starClasses[i].customUniforms.time.value += delta;
    }
  }
 
  // Free camera WASD translation (fixed speed, no momentum)
  const speed = 0.05;
  if (keys['w'])     { freeCamera.position.z -= speed; }
  if (keys['s'])     { freeCamera.position.z += speed; }
  if (keys['a'])     { freeCamera.position.x -= speed; }
  if (keys['d'])     { freeCamera.position.x += speed; }
  if (keys[' '])     { freeCamera.position.y += speed; } // Space → up
  if (keys['Shift']) { freeCamera.position.y -= speed; } // Shift → down
 
  requestAnimationFrame(animate); // Schedule next frame
  composer.render();              // Render scene through the bloom post-processing pipeline
  stats.end();                    // End FPS measurement for this frame
}
animate(); // Kick off the loop
 
// ============================================================
// REFERENCES
// Lava / fireball shader technique:
//   https://stemkoski.github.io/Three.js/Shader-Fireball.html
// Great-circle arc on a sphere in Three.js:
//   https://stackoverflow.com/questions/42663182
// Post-processing library:
//   https://github.com/pmndrs/postprocessing
// ============================================================