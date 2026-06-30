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

import { BLOOM_LAYER } from './constants.js';
import { computeStarHSL, hslToRgb } from './colorScience.js';


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
     */
    function isMutExclCritMet(passedIdNum) {
      var arr = tr.nodes[tr.nodeIDs[passedIdNum]].excl;
      if (arr == [] || arr == undefined || arr == 0) { return true; }
      var count = 0;
      for (let i = 2; i < arr.length; i++) {
        if (tr.nodes[tr.nodeIDs[arr[i]]].nodeActive) { count++; }
      }
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
//      computeStarHSL() from colorScience.js.
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
   * Uses computeStarHSL() (from colorScience.js) to get the star's HSL colour,
   * then walks every pixel: replaces its hue/saturation with the star's while
   * scaling lightness by the pixel's original greyscale brightness so all surface
   * detail is preserved.
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

      // Compute the star's target HSL colour from its blackbody temperature.
      // All CIE/Planck math lives in colorScience.js.
      const [h, s, l] = computeStarHSL(temperature);

      // Recolour every pixel: keep the original brightness (greyscale value) but swap to the
      // star's hue and saturation. This tints the texture to the correct stellar colour
      // while keeping all the surface detail (bright spots, dark patches) intact.
      for (let i = 0; i < data.length; i += 4) {
        const bri = ((data[i] + data[i + 1] + data[i + 2]) / 3) / 255; // Greyscale brightness [0, 1]
        let [r, g, b] = hslToRgb(h, s, l * bri); // Apply star hue/saturation, scale lightness by original brightness
        data[i]     = Math.floor(255 * r); // R
        data[i + 1] = Math.floor(255 * g); // G
        data[i + 2] = Math.floor(255 * b); // B
        // Alpha channel (data[i + 3]) is left unchanged
      }

      ctx.putImageData(imageData, 0, 0);
      resolve(new THREE.CanvasTexture(canvas)); // Wrap the modified canvas as a Three.js texture
    });
  }

  /**
   * Builds the custom GLSL ShaderMaterial used to render the animated star surface.
   *
   * Vertex shader:
   *   Samples the noise texture to compute a per-vertex displacement along the normal,
   *   creating a subtle animated "churning" surface.
   *
   * Fragment shader:
   *   Samples the base (colour) texture through two independent noise-distorted UV sets
   *   scrolling at different speeds and directions, then additively blends them.
   *   The `time` uniform is incremented each frame by the animate() loop.
   */
  createMaterial() {
    this.customUniforms = {
      baseTexture:  { type: "t", value: this.lavaTexture },
      baseSpeed:    { type: "f", value: this.baseSpeed },
      repeatS:      { type: "f", value: this.repeatS },
      repeatT:      { type: "f", value: this.repeatT },
      noiseTexture: { type: "t", value: this.noiseTexture },
      noiseScale:   { type: "f", value: this.noiseScale },
      blendTexture: { type: "t", value: this.blendTexture },
      blendSpeed:   { type: "f", value: this.blendSpeed },
      blendOffset:  { type: "f", value: this.blendOffset },
      bumpTexture:  { type: "t", value: this.bumpTexture },
      bumpSpeed:    { type: "f", value: this.bumpSpeed },
      bumpScale:    { type: "f", value: this.bumpScale },
      alpha:        { type: "f", value: 1.0 },
      time:         { type: "f", value: 1.0 }
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
          
          vec2 uvTimeShift = vUv + vec2( 1.1, 1.9 ) * time * bumpSpeed;
          vec4 noiseGeneratorTimeShift = texture2D( noiseTexture, uvTimeShift );
          vec2 uvNoiseTimeShift = vUv + noiseScale * vec2( noiseGeneratorTimeShift.r, noiseGeneratorTimeShift.g );
          vec4 bumpData = texture2D( bumpTexture, uvTimeShift );
        
          float displacement = ( vUv.y > 0.999 || vUv.y < 0.001 ) ? 
            bumpScale * (0.3 + 0.02 * sin(time)) :  
            bumpScale * bumpData.r;
          
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
            vec2 uvTimeShift = vUv + vec2( -0.7, 1.5 ) * time * baseSpeed;	
            vec4 noiseGeneratorTimeShift = texture2D( noiseTexture, uvTimeShift );
            vec2 uvNoiseTimeShift = vUv + noiseScale * vec2( noiseGeneratorTimeShift.r, noiseGeneratorTimeShift.b );
            vec4 baseColor = texture2D( baseTexture, uvNoiseTimeShift * vec2(repeatS, repeatT) );
          
            vec2 uvTimeShift2 = vUv + vec2( 1.3, -1.7 ) * time * blendSpeed;	
            vec4 noiseGeneratorTimeShift2 = texture2D( noiseTexture, uvTimeShift2 );
            vec2 uvNoiseTimeShift2 = vUv + noiseScale * vec2( noiseGeneratorTimeShift2.g, noiseGeneratorTimeShift2.b );
            vec4 blendColor = texture2D( blendTexture, uvNoiseTimeShift2 * vec2(repeatS, repeatT) ) - blendOffset * vec4(1.0, 1.0, 1.0, 1.0);
          
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
// ============================================================
let intersects = [];
let hovered = {};

// Parse the bundled Helvetiker font once; reused by all TreeNode text labels
const theFontLoader = new FontLoader();
const hellishFont = theFontLoader.parse(HelvetikerFont);


// ============================================================
// SCENE SETUP
// ============================================================
var container = document.getElementById('canvas');
var scene = new THREE.Scene();

// Main (skill-tree) camera — fixed at the origin, looks outward.
var camera = new THREE.PerspectiveCamera(30, container.clientWidth / container.clientHeight, 1, 100000);
camera.position.set(0, 0, 0);
camera.rotation.order = "YXZ";
camera.layers.enableAll();

// Free camera — a separate camera the player can move freely (toggle with key "2")
var freeCamera = new THREE.PerspectiveCamera(30, container.clientWidth / container.clientHeight, 0.00001, 100000);
freeCamera.position.set(0, 0, 0);
freeCamera.rotation.order = "YXZ";
freeCamera.layers.enableAll();

let activeCamera = camera;

// Raycaster setup
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
raycaster.setFromCamera(mouse, camera);
intersects = raycaster.intersectObjects(scene.children, true);

// Clocks for time-delta calculations in different subsystems
var clock = new THREE.Clock();
var cameraClock = new THREE.Clock();
var panclock = new THREE.Clock();
var zoomclock = new THREE.Clock();
var animclock = new THREE.Clock();

const stats = new Stats();
var statsShown = false;


// ============================================================
// RENDERER & POST-PROCESSING PIPELINE
// ============================================================
const renderer = new WebGLRenderer({
  powerPreference: "high-performance",
  antialias: false,
  stencil: false,
  depth: false
});
container.appendChild(renderer.domElement);
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.outputColorSpace = THREE.SRGBColorSpace;

const composer = new EffectComposer(renderer);
let rendek = new RenderPass(scene, activeCamera);
composer.addPass(rendek);

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
 * @param {THREE.Object3D} obj
 */
function addToBloom(obj) {
  obj.layers.set(BLOOM_LAYER);
  bloomEffect.selection.add(obj);
}

const effectPass = new EffectPass(activeCamera, bloomEffect);
effectPass.renderToScreen = true;
composer.addPass(effectPass);


// ============================================================
// TREE DATA LOADING
// ============================================================
/**
 * Fetches node data and mutually-exclusive group definitions, then populates
 * the given Tree with TreeNode instances placed on a sphere.
 *
 * Node data format (pipe-delimited, one node per line):
 *   nodeId | name | description | hoverText | fi_coord | theta_coord | requires (space-sep) | cost | (unused) | temperature
 *
 * @param {Tree} TREEE - The Tree instance to populate
 */
async function treeGen(TREEE) {
  const response1 = await fetch("https://raw.githubusercontent.com/Dat-guy-test/project/refs/heads/main/test");
  const data1 = await response1.text();
  const lines = data1.split("\n");
  var atrs = [['', '', '', '', '', '', [], '']];
  for (let i = 0; i < lines.length - 1; i++) {
    atrs[i] = lines[i].split(" | ");
    atrs[i][6] = atrs[i][6].split(" ");
  }

  var bigFi = 0, lowFi = 0, bigTh = 0, lowTh = 0;
  for (let i = 0; i < atrs.length; i++) {
    if (atrs[i][4] > bigFi) bigFi = atrs[i][4];
    if (atrs[i][4] < lowFi) lowFi = atrs[i][4];
    if (atrs[i][5] > bigTh) bigTh = atrs[i][5];
    if (atrs[i][5] < lowTh) lowTh = atrs[i][5];
  }
  var fiSteps = bigFi - lowFi;
  var thSteps = bigTh - lowTh;

  var minKorFi = TREEE.span[0] * (Math.PI / 180);
  var maxKorFi = TREEE.span[1] * (Math.PI / 180);
  var minKorTh = TREEE.span[2] * (Math.PI / 180);
  var maxKorTh = TREEE.span[3] * (Math.PI / 180);

  const response2 = await fetch("https://raw.githubusercontent.com/Dat-guy-test/project/refs/heads/main/mutuallyExclusive");
  const data2 = await response2.text();
  const lines2 = data2.split("\n");
  var exclIDs = [];
  for (let i = 0; i < lines2.length - 1; i++) {
    TREEE.mutExcl[i] = lines2[i];
    exclIDs = lines2[i].split(" ");
    for (let j = 2; j < exclIDs.length; j++) {
      for (let k = 0; k < lines.length - 1; k++) {
        if (atrs[k][0] == exclIDs[j]) { atrs[k][8] = exclIDs; }
      }
    }
  }

  for (let i = 0; i < lines.length - 1; i++) {
    var fi = minKorFi + (atrs[i][4] - lowFi) * (maxKorFi - minKorFi) / fiSteps;
    var th = minKorTh + (atrs[i][5] - lowTh) * (maxKorTh - minKorTh) / thSteps;

    var iks   = TREEE.sphereRadius * Math.cos(th) * Math.cos(fi);
    var igrek = TREEE.sphereRadius * Math.sin(th);
    var zet   = TREEE.sphereRadius * Math.cos(th) * Math.sin(fi);

    TREEE.nodes[i] = new TreeNode(
      atrs[i][0], atrs[i][1], atrs[i][2], atrs[i][3],
      iks, igrek, zet,
      fi, th,
      atrs[i][6], atrs[i][7], atrs[i][8], atrs[i][9]
    );
    scene.add(TREEE.nodes[i]);
  }
  cameraRotationOffsetFromTree = -Math.PI / 2;
}

var tr = new Tree(0, 40, 20, 60);


// ============================================================
// REQUIREMENT CHECK HELPER
// ============================================================
/**
 * Returns true if all requirements in `reqs` are satisfied by currently-active nodes.
 * @param {string[]} reqs
 * @returns {boolean}
 */
function areReqsMet(reqs) {
  for (var i = 0; i < reqs.length; i++) {
    if (reqs[i].includes("o")) {
      var a = reqs[i].split("o");
      var b = 0;
      for (let k = 0; k < a.length; k++) {
        if (tr.nodes[tr.nodeIDs[a[k]]].nodeActive == false) { b++; }
      }
      if (b == a.length) { return false; }
    } else {
      if (tr.nodes[tr.nodeIDs[reqs[i]]].nodeActive == false) { return false; }
    }
  }
  return true;
}


// ============================================================
// INITIALISATION SEQUENCE
// ============================================================
var cameraRotationOffsetFromTree = 0;

async function sec() {
  await treeGen(tr);
  tr.init();

  var vec = tr.getNodeSphericalCoordinates(1);
  camera.rotation.set(vec.y, vec.x + cameraRotationOffsetFromTree, 0);
  camera.fov = iniPanCamFov;
  camera.updateProjectionMatrix();
}
sec();
console.log(tr.nodes);


// ============================================================
// SKYBOX (procedural gradient)
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
      float gradient = (vPosition.y + 100000.0) / 200000.0;
      gradient = smoothstep(-1.0, 1.0, gradient);
      vec3 color = mix(color1, color2, gradient);
      gl_FragColor = vec4(color, 1.0);
    }
  `,
  uniforms: {
    color1: { value: new THREE.Color(0x002f2f) }, // Dark teal (bottom)
    color2: { value: new THREE.Color(0x000000) }  // Black (top)
  }
});
var sky = new THREE.Mesh(skyGeo, skyMat);
sky.material.side = THREE.BackSide;
scene.add(sky);


// ============================================================
// GROUND PLANE (horizon / grass)
// ============================================================
const horizonTexture = new THREE.TextureLoader().load('grass.jpg');
horizonTexture.wrapS = horizonTexture.wrapT = THREE.RepeatWrapping;
horizonTexture.repeat.set(50, 50);

const horizonMaterial = new THREE.MeshBasicMaterial({
  map: horizonTexture,
  side: THREE.DoubleSide,
  transparent: false,
  opacity: 1.0
});
const horizonGeometry = new THREE.PlaneGeometry(50, 50, 1, 1);
const horizon = new THREE.Mesh(horizonGeometry, horizonMaterial);
horizon.rotation.x = -Math.PI / 2;
horizon.position.set(0, -1, 0);
horizon.layers.set(0);
bloomEffect.selection.delete(horizon);
scene.add(horizon);


// ============================================================
// POINTER MOVE — HOVER DETECTION
// ============================================================
window.addEventListener('pointermove', (e) => {
  mouse.set((e.offsetX / container.clientWidth) * 2 - 1, -(e.offsetY / container.clientHeight) * 2 + 1);
  raycaster.setFromCamera(mouse, camera);
  intersects = raycaster.intersectObjects(scene.children, true);

  Object.keys(hovered).forEach((key) => {
    const hit = intersects.find((hit) => hit.object.uuid === key);
    if (hit === undefined) {
      const hoveredItem = hovered[key];
      if (hoveredItem.object.onPointerOver) { hoveredItem.object.onPointerOut(hoveredItem); }
      delete hovered[key];
    }
  });

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
const ambientLight = new THREE.AmbientLight(0xffffff, 1);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 2.0);
scene.add(directionalLight);


// ============================================================
// TELESCOPE MODEL
// ============================================================
const loader = new GLTFLoader();
loader.load(
  'Telescope.glb',
  function (gltf) {
    scene.add(gltf.scene);
    gltf.scene.scale.set(0.05, 0.05, 0.05);
    gltf.scene.position.set(0, -1, 0);
    gltf.scene.rotation.set(0, Math.PI / 2, 0);
  },
  function (xhr) { console.log((xhr.loaded / xhr.total * 100) + '% loaded'); },
  function (error) { console.error('An error happened while loading the model:', error); }
);


// ============================================================
// CLICK — NODE ACTIVATION
// ============================================================
window.addEventListener('click', (e) => {
  intersects.forEach((hit) => {
    if (hit.object.onClick) { hit.object.onClick(hit); }
  });
});


// ============================================================
// KEYBOARD INPUT STATE
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

window.addEventListener("keydown", function (event) {
  if (event.defaultPrevented) { return; }
  if (event.key in keys) { keys[event.key] = true; }
  switch (event.key) {
    case "Escape":
      console.log(camera.rotation.x, camera.rotation.y, tr.nodes[0].theta, tr.nodes[0].fi);
      break;
    case "=":
      if (zoomStage > 0) {
        if (zoomCamBool == false && panCamBool == false) { zoomCamBool = true; zoomStage -= 1; computeZoomCamera(-1); }
        camera.updateProjectionMatrix();
      }
      break;
    case "-":
      if (zoomStage >= 0 && zoomStage < 60) {
        if (zoomCamBool == false && panCamBool == false) { zoomCamBool = true; zoomStage += 1; computeZoomCamera(1); }
        camera.updateProjectionMatrix();
      }
      break;
    case "Tab":
      if (statsShown == false) { statsShown = true; document.body.appendChild(stats.dom); }
      break;
    case "1":
      activeCamera = camera;
      console.log("Activating main camera...", activeCamera == camera);
      rendek.camera = activeCamera;
      bloomEffect.camera = activeCamera;
      effectPass.camera = activeCamera;
      break;
    case "2":
      activeCamera = freeCamera;
      console.log("Activating free camera...", activeCamera == freeCamera);
      rendek.camera = activeCamera;
      bloomEffect.camera = activeCamera;
      effectPass.camera = activeCamera;
      break;
    default:
      return;
  }
  event.preventDefault();
}, true);


// ============================================================
// MOUSE WHEEL — ZOOM
// ============================================================
window.addEventListener("wheel", function (event) {
  event.preventDefault();

  if (event.deltaY < 0) {
    if (zoomStage > 0) {
      if (zoomCamBool == false && panCamBool == false) { zoomCamBool = true; zoomStage -= 1; computeZoomCamera(-1); }
      camera.updateProjectionMatrix();
    }
  } else if (event.deltaY > 0) {
    if (zoomStage >= 0 && zoomStage < 60) {
      if (zoomCamBool == false && panCamBool == false) { zoomCamBool = true; zoomStage += 1; computeZoomCamera(1); }
      camera.updateProjectionMatrix();
    }
  }
}, { passive: false });


// ============================================================
// FREE CAMERA MOVEMENT (arrow keys with momentum)
// ============================================================
function freeCameraMovement() {
  var DT = cameraClock.getDelta();

  if (keys.ArrowUp)    { cameraAccelerationX += 1.05 * DT; }
  if (keys.ArrowDown)  { cameraAccelerationX -= 1.05 * DT; }
  if (keys.ArrowLeft)  { cameraAccelerationY += 1.05 * DT; }
  if (keys.ArrowRight) { cameraAccelerationY -= 1.05 * DT; }

  camera.rotation.x += cameraAccelerationX * DT;
  camera.rotation.y += cameraAccelerationY * DT;

  if (cameraAccelerationX > -0.01 && cameraAccelerationX < 0.01) { cameraAccelerationX = 0; }
  if (cameraAccelerationY > -0.01 && cameraAccelerationY < 0.01) { cameraAccelerationY = 0; }

  cameraAccelerationX -= 1.5 * cameraAccelerationX * DT;
  cameraAccelerationY -= 1.5 * cameraAccelerationY * DT;
}


// ============================================================
// PAN CAMERA — SETUP
// ============================================================
/**
 * Prepares the parameters for a pan animation and starts the clock.
 * @param {number} iniFi @param {number} iniTh  — current camera.rotation.x / .y
 * @param {number} finFi @param {number} finTh  — target camera.rotation.x / .y
 */
function computePanCamera(iniFi, iniTh, finFi, finTh) {
  iniPanCamFov = camera.fov;
  panX  = iniFi;
  dPanX = finFi - iniFi;
  panY  = iniTh;
  dPanY = finTh - iniTh;
  panCamFov = iniPanCamFov;
  panComputeBool = true;
  panclock.start();
}


// ============================================================
// ZOOM CAMERA — SETUP
// ============================================================
/**
 * Prepares the parameters for a zoom animation and starts the clock.
 * @param {number} amount — FOV change to apply (positive = zoom out, negative = zoom in)
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
// ============================================================
function panCamera() {
  const panTime = 1;
  var panDT = panclock.getElapsedTime();

  var fac = 1.5 * (Math.abs(dPanX) + Math.abs(dPanY));
  if (fac > 0.01) {
    panCamFov -= fac * (panDT - panTime / 2);
    camera.fov = panCamFov;
    camera.updateProjectionMatrix();
  }

  if (panDT >= panTime) {
    panComputeBool = false;
    panCamFov = iniPanCamFov;
    camera.fov = panCamFov;
    camera.updateProjectionMatrix();
    panDT = panTime;
    panclock.stop();
    panCamBool = false;
  }

  camera.rotation.set(
    panX + (panDT / panTime) * dPanX,
    panY + (panDT / panTime) * dPanY,
    0
  );
}


// ============================================================
// ZOOM CAMERA — PER-FRAME INTERPOLATION
// ============================================================
function zoomCamera() {
  const zoomTime = 0.05;
  var zoomDT = zoomclock.getElapsedTime();

  zoomCamFov = initialZoom + (zoomDelta / zoomTime) * zoomDT;
  camera.fov = zoomCamFov;
  camera.updateProjectionMatrix();

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
// ============================================================
function hoverAnimation() {
  const animtime = 2;
  const animSize = 0;
  animclock.getDelta();
}


// ============================================================
// WINDOW RESIZE HANDLER
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
// ============================================================
let isMouseDown = false;
let lastMousePosition = { x: 0, y: 0 };

window.addEventListener('mousedown', (e) => { isMouseDown = true; });
window.addEventListener('mouseup',   (e) => { isMouseDown = false; });
window.addEventListener('mousemove', (e) => {
  if (isMouseDown) {
    let deltaX = e.clientX - lastMousePosition.x;
    let deltaY = e.clientY - lastMousePosition.y;

    freeCamera.rotation.y -= deltaX * 0.005;
    freeCamera.rotation.x -= deltaY * 0.005;
    freeCamera.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, freeCamera.rotation.x));
  }
  lastMousePosition = { x: e.clientX, y: e.clientY };
});

window.addEventListener('keydown', (e) => { keys[e.key] = true; });
window.addEventListener('keyup',   (e) => { keys[e.key] = false; });


// ============================================================
// MAIN ANIMATION LOOP
// ============================================================
function animate() {
  stats.begin();
  var delta = clock.getDelta();

  if (panComputeBool == true) { panCamera(); }

  if (queuedZoomOut == true && zoomComputeBool == false && panCamBool == false) {
    queuedZoomOut = false;
    computeZoomCamera(-zoomDelta);
  }
  if (zoomComputeBool == true) { zoomCamera(); }

  freeCameraMovement();

  for (let i = 0; i < starClasses.length; i++) {
    if (starClasses[i].isModelReady()) {
      starClasses[i].customUniforms.time.value += delta;
    }
  }

  const speed = 0.05;
  if (keys['w'])     { freeCamera.position.z -= speed; }
  if (keys['s'])     { freeCamera.position.z += speed; }
  if (keys['a'])     { freeCamera.position.x -= speed; }
  if (keys['d'])     { freeCamera.position.x += speed; }
  if (keys[' '])     { freeCamera.position.y += speed; }
  if (keys['Shift']) { freeCamera.position.y -= speed; }

  requestAnimationFrame(animate);
  composer.render();
  stats.end();
}
animate();

// ============================================================
// REFERENCES
// Lava / fireball shader:  https://stemkoski.github.io/Three.js/Shader-Fireball.html
// Great-circle arc:        https://stackoverflow.com/questions/42663182
// Post-processing:         https://github.com/pmndrs/postprocessing
// CIE colour rendering:    https://www.fourmilab.ch/documents/specrend/
// ============================================================
