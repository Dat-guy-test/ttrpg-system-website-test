import * as THREE from 'three';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import { AppState } from './appState.js';
import { StarModel } from './StarModel.js';
import { areReqsMet } from './Tree.js';
import { computePanCamera } from './cameraControls.js';
import { addToBloom } from './sceneSetup.js';

export class TreeNode extends THREE.Mesh {
  constructor(anodeId, anodeName, anodeDesc, ahoverText, posX, posY, posZ, afi, atheta, requires, anodeCost, exclStuff, temperature) {
    super();
    this.temperature = temperature;
    this.isHovered = false; 
    this.skyLines = [];     
    this.reqTubes = [];     

    this.nodeSize = anodeCost < 1 ? 0.05 : 0.05 * (anodeCost ^ (1 / 3));
    this.excl = exclStuff; 
    this.fi = -afi;
    this.theta = atheta;

    this.geometry = new THREE.SphereGeometry(this.nodeSize, 16, 16);
    this.material = new THREE.MeshBasicMaterial({ color: 0x999999, wireframe: true, opacity: 0.002, transparent: true, depthWrite: false });
    this.position.set(posX, posY, posZ);

    this.nameTextGeometry = new TextGeometry(anodeName, {
      font: AppState.hellishFont,
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
      new THREE.MeshBasicMaterial({ color: 0xfafafa }), 
      new THREE.MeshBasicMaterial({ color: 0x00aaaa })  
    ];
    this.nameText = new THREE.Mesh(this.nameTextGeometry, this.nameTextMaterials);

    this.nameTextGeometry.computeBoundingBox();
    this.centerOffset = 0.5 * (this.nameTextGeometry.boundingBox.max.y - this.nameTextGeometry.boundingBox.min.y);

    this.nameText.position.set(
      this.position.x + (this.nodeSize + 0.01) * Math.sin(this.fi),
      this.position.y - this.centerOffset,
      this.position.z + (this.nodeSize + 0.01) * Math.cos(this.fi)
    );
    this.nameText.rotation.set(0, -Math.PI * 1 / 2 + this.fi, 0);
    AppState.scene.add(this.nameText);

    this.starID = AppState.starClasses.length;
    AppState.starClasses.push(new StarModel(this.temperature));

    this.nodeName = anodeName;
    this.nodeDesc = anodeDesc;
    this.nodeCost = anodeCost;
    this.nodeActive = false; 
    this.sphereSize = 1;     

    this.star = new THREE.Mesh(
      new THREE.SphereGeometry(this.nodeSize / 4, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0x000000, opacity: 0.0, transparent: true, depthWrite: false })
    );

    addToBloom(this.star);

    this.hovertext = ahoverText;
    this.nodeId = anodeId;
    this.requires = requires[0] === "-" ? [] : requires;
    this.star.position.set(posX, posY, posZ);
    AppState.scene.add(this.star);
  }

  onPointerOver(e) {
    this.scale.set(2.0, 2.0, 2.0);
    this.star.scale.set(2.0, 2.0, 2.0);
    this.isHovered = true;

    this.nameText.position.set(
      this.position.x + (this.nodeSize + 0.01) * Math.sin(this.fi) * this.scale.x,
      this.position.y - this.centerOffset,
      this.position.z + (this.nodeSize + 0.01) * Math.cos(this.fi) * this.scale.z
    );

    document.getElementById("nodeName").textContent = this.nodeName;
    const nodeDescNode = document.getElementById("nodeDesc");
    nodeDescNode.textContent = '';
    var nodeDescSplit = this.nodeDesc.split("<D>");
    var mybr = document.createElement('br');
    for (let i = 0; i < nodeDescSplit.length; i++) {
      nodeDescNode.innerText += nodeDescSplit[i];
      if (i == nodeDescSplit.length - 1) { break; }
      nodeDescNode.appendChild(mybr);
    }
    document.getElementById("nodeCost").textContent = "Cost: " + this.nodeCost;
    document.getElementById("perkPoints").textContent = AppState.perkPoints;
  }

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

  onClick(e) {
    function isNextActive(id) {
       // ... Original isNextActive logic utilizing AppState.tr ...
       return false;
    }

    function isMutExclCritMet(passedIdNum) {
      // ... Original isMutExclCritMet logic utilizing AppState.tr ...
      return true;
    }

    if (this.nodeActive == true && !isNextActive(this.nodeId)) {
      this.nodeActive = false;
      AppState.perkPoints += Number(this.nodeCost);
      this.star.material = new THREE.MeshBasicMaterial({ color: 0x000000, opacity: 0.0, transparent: true, depthWrite: false });
    } else if (AppState.perkPoints >= this.nodeCost && areReqsMet(this.requires) && isMutExclCritMet(this.nodeId) && this.nodeActive == false) {
      this.nodeActive = true;
      AppState.perkPoints -= Number(this.nodeCost);
      this.star.material = AppState.starClasses[this.starID].customMaterial;
    }

    document.getElementById("perkPoints").textContent = AppState.perkPoints;

    if (AppState.panCamBool == false && AppState.zoomCamBool == false) {
      AppState.panCamBool = true;
      computePanCamera(AppState.camera.rotation.x, AppState.camera.rotation.y, this.theta, this.fi - Math.PI / 2);
    }
  }

  getFi() { return this.fi; }
  getTheta() { return this.theta; }
}