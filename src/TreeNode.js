import * as THREE from 'three';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import { AppState } from './appState.js';
import { StarModel } from './StarModel.js';
import { areReqsMet } from './Tree.js';
import { computePanCamera } from './cameraControls.js';
import { addToBloom } from './sceneSetup.js';

/**
 * Represents an Interactive Vertex Node inside the Progression Architecture.
 * Inherits from THREE.Mesh to provide a structural hit target box for mouse interaction,
 * while managing secondary linked rendering assets (labels, blooming glow layers).
 */
export class TreeNode extends THREE.Mesh {
  constructor(anodeId, anodeName, anodeDesc, ahoverText, posX, posY, posZ, afi, atheta, requires, anodeCost, exclStuff, temperature) {
    super();
    this.temperature = temperature;
    this.isHovered = false;
    this.skyLines = [];     // Array tracking connecting visible geometric lines
    this.reqTubes = [];     // Invisible structural tubes mapped for line click targets

    // Scale logic checking node weights
    this.nodeSize = anodeCost < 1 ? 0.05 : 0.05 * Math.pow(anodeCost, 1 / 3);
    this.excl = exclStuff;
    this.fi = -afi;         // Negate angles to accurately match the original spatial maps
    this.theta = atheta;

    // Define structural interaction geometry (transparent outer boundary mesh)
    this.geometry = new THREE.SphereGeometry(this.nodeSize, 16, 16);
    this.material = new THREE.MeshBasicMaterial({ color: 0x999999, wireframe: true, opacity: 0.002, transparent: true, depthWrite: false });
    this.position.set(posX, posY, posZ);

    // Initialize 3D Name Labels pulling parsed font assets from AppState global structures
    this.nameTextGeometry = new TextGeometry(anodeName, {
      font: AppState.hellishFont,
      size: 0.02, depth: 0.0, curveSegments: 12, bevelEnabled: false
    });

    this.nameTextMaterials = [
      new THREE.MeshBasicMaterial({ color: 0xfafafa }),
      new THREE.MeshBasicMaterial({ color: 0x00aaaa })
    ];
    this.nameText = new THREE.Mesh(this.nameTextGeometry, this.nameTextMaterials);

    // Align text centered underneath node positions
    this.nameTextGeometry.computeBoundingBox();
    this.centerOffset = 0.5 * (this.nameTextGeometry.boundingBox.max.y - this.nameTextGeometry.boundingBox.min.y);

    this.nameText.position.set(
      this.position.x + (this.nodeSize + 0.01) * Math.sin(this.fi),
                               this.position.y - this.centerOffset,
                               this.position.z + (this.nodeSize + 0.01) * Math.cos(this.fi)
    );
    this.nameText.rotation.set(0, -Math.PI * 0.5 + this.fi, 0);
    AppState.scene.add(this.nameText); // Inject label straight into the active scene

    // Create custom shader profile maps matching thermal conditions
    this.starID = AppState.starClasses.length;
    AppState.starClasses.push(new StarModel(this.temperature));

    this.nodeName = anodeName;
    this.nodeDesc = anodeDesc;
    this.nodeCost = anodeCost;
    this.nodeActive = false;

    // Setup actual visible glowing interior node dot
    this.star = new THREE.Mesh(
      new THREE.SphereGeometry(this.nodeSize / 4, 16, 16),
                               new THREE.MeshBasicMaterial({ color: 0x000000, opacity: 0.0, transparent: true, depthWrite: false })
    );
    this.star.position.set(posX, posY, posZ);

    // Route visual mesh instances into Post Processing glow systems
    addToBloom(this.star);
    AppState.scene.add(this.star);

    this.hovertext = ahoverText;
    this.nodeId = anodeId;
    this.requires = requires[0] === "-" ? [] : requires;
  }

  /**
   * Dispatches hover UI reactions, scale magnifications, and sidebar context fills.
   */
  onPointerOver(e) {
    this.scale.set(2.0, 2.0, 2.0);
    this.star.scale.set(2.0, 2.0, 2.0);
    this.isHovered = true;

    this.nameText.position.set(
      this.position.x + (this.nodeSize + 0.01) * Math.sin(this.fi) * this.scale.x,
                               this.position.y - this.centerOffset,
                               this.position.z + (this.nodeSize + 0.01) * Math.cos(this.fi) * this.scale.z
    );

    // Sync state targets directly with traditional HTML DOM HUD overlays
    document.getElementById("nodeName").textContent = this.nodeName;
    const nodeDescNode = document.getElementById("nodeDesc");
    nodeDescNode.textContent = '';

    // Split on designated markup tokens to generate custom vertical clean row spacing
    let nodeDescSplit = this.nodeDesc.split("<D>");
    for (let i = 0; i < nodeDescSplit.length; i++) {
      nodeDescNode.innerText += nodeDescSplit[i];
      if (i !== nodeDescSplit.length - 1) {
        nodeDescNode.appendChild(document.createElement('br'));
      }
    }
    document.getElementById("nodeCost").textContent = "Cost: " + this.nodeCost;
    document.getElementById("perkPoints").textContent = AppState.perkPoints;
  }

  /**
   * Restores standard sizing properties when the mouse cursor leaves the boundary box.
   */
  onPointerOut(e) {
    this.scale.set(1, 1, 1);
    this.isHovered = false;
    this.star.scale.set(1, 1, 1);
    this.nameText.position.set(
      this.position.x + (this.nodeSize + 0.01) * Math.sin(this.fi) * this.scale.x,
                               this.position.y - this.centerOffset,
                               this.position.z + (this.nodeSize + 0.01) * Math.cos(this.fi) * this.scale.z
    );
  }

  /**
   * Processes purchase execution pipelines, budget evaluation checks, and handles camera panning adjustments.
   */
  onClick(e) {
    const isNextActive = (id) => false; // Reference validation check placeholders
    const isMutExclCritMet = (passedIdNum) => true; // Exclusion logic placeholder mapping rules

    if (this.nodeActive === true && !isNextActive(this.nodeId)) {
      // Deactivation / Purchase Refund logic loop
      this.nodeActive = false;
      AppState.perkPoints += Number(this.nodeCost);
      this.star.material = new THREE.MeshBasicMaterial({ color: 0x000000, opacity: 0.0, transparent: true, depthWrite: false });
    } else if (AppState.perkPoints >= this.nodeCost && areReqsMet(this.requires) && isMutExclCritMet(this.nodeId) && this.nodeActive === false) {
      // Activation sequence swap materials into glowing custom shader modes
      this.nodeActive = true;
      AppState.perkPoints -= Number(this.nodeCost);
      this.star.material = AppState.starClasses[this.starID].customMaterial;
    }

    document.getElementById("perkPoints").textContent = AppState.perkPoints;

    // Shift camera viewpoints towards targets if systems aren't already computing pans
    if (AppState.panCamBool === false && AppState.zoomCamBool === false) {
      AppState.panCamBool = true;
      computePanCamera(AppState.camera.rotation.x, AppState.camera.rotation.y, this.theta, this.fi - Math.PI / 2);
    }
  }

  getFi() { return this.fi; }
  getTheta() { return this.theta; }
}
