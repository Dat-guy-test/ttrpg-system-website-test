import './style.css'
import HelvetikerFont from "three/examples/fonts/helvetiker_regular.typeface.json";
import Stats from '/node_modules/three/examples/jsm/libs/stats.module.js'
import * as THREE from 'three';
import { WebGLRenderer } from "three";
import { EffectComposer, EffectPass, RenderPass, SelectiveBloomEffect } from "postprocessing";
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';

//Structure


//Cosmetics
//Add the tome and the telescope physically
//Add stars

//Add particles to nodes
//Remake description panel
//Add background music/sound effects on hover, zoom and click
//Make lines out of particles
//Change site icon

//Mechanics
//Add panels
//Add stats panel
//Add equipment panel
//Add horizon
//Add leveling (including character creation [start stars set after creation])
//Add spellcrafting tab

//Optimisation
//Batch/Instance star meshes / particles

//General
//Cleanup code
//Comment code
//Add proper window resize code
//Add "planning mode"

//Bugs
//Fix "phantom window" bug
//Fix zooming bug

//Optimisation
//Make nodeId positions compute at start

//Misc
//Have actually working requirements (logical or, and)
//Animate stuff (stars forming from gas/exploding) (stars getting bigger and rotating more when hovered) (stars rotating when node is idle) (gas mixing when node is idle)
//Add mutually exclusive perks


//Done
//Add proper movement (using invisible tubular arrows)
//Class to describe a node in the skill tree
//Add different textures and sizes to nodes
//Implement sky gradient

var zoomStage = 0;

var zoomDelta = 0;
var initialZoom = 0;
var finalZoom = 0;
var zoomCamBool = false, zoomComputeBool = false;
var zoomCamFov = 0;
var queuedZoomOut = false;

const BLOOM_LAYER = 2;

var perkPoints = 20;
var panCamBool = false, panComputeBool = false;
var panX = 0;
var panY = 0;
var dPanX = 0;
var dPanY = 0;
var panSpeed = 0;
var iniPanCamFov = 1;
var panCamFov = 0;
//var animatedNodesIDs = [];
//var statsHP = [];

var cameraAccelerationX = 0;
var cameraAccelerationY = 0;

var starClasses = [];

class Tree {
  constructor(smolFi, highFi, smolTh, highTh) {
    this.nodes = []
    this.mutExcl = [] //Each value of the array is a block of ids of mutually exclusive nodes. The 0-th element of each value corresponds to maximum allowable nodes gained in the block.
    this.nodeIDs = []
    this.span = [smolFi, highFi, smolTh, highTh]
    this.sphereRadius = 30;
    this.treesphere = new THREE.Mesh(new THREE.SphereGeometry(this.sphereRadius, 32, 16), new THREE.MeshBasicMaterial({
      color: "purple",
      transparent: true,
      opacity: 0.25
    }));
    scene.add(this.treesphere);
  }
  createLinesNTubes(pointStart, pointEnd, smoothness, clockWise, dashed, a, b, kej, ej) {
    // calculate a normal ( taken from Geometry().computeFaceNormals() )
    var cb = new THREE.Vector3(), ab = new THREE.Vector3(), normal = new THREE.Vector3();
    cb.subVectors(new THREE.Vector3(), pointEnd);
    ab.subVectors(pointStart, pointEnd);
    cb.cross(ab);
    normal.copy(cb).normalize();


    var angle = pointStart.angleTo(pointEnd); // get the angle between vectors
    if (clockWise) angle = angle - Math.PI * 2;  // if clockWise is true, then we'll go the longest path
    var angleDelta = angle / (smoothness - 1); // increment
    const pnts = [];
    for (var i = 0; i < smoothness; i++) {
      pnts.push(pointStart.clone().applyAxisAngle(normal, angleDelta * i))  // this is the key operation
    }

    const path = new THREE.CatmullRomCurve3(pnts);
    const pathGeometry = new THREE.BufferGeometry().setFromPoints(path.getPoints(50));
    if (dashed) {
      const pathMaterial = new THREE.LineDashedMaterial({ color: 0x666666, dashSize: 0.01, gapSize: 0.01 });
      const arc = new THREE.Line(pathGeometry, pathMaterial);
      scene.add(arc);
      arc.computeLineDistances();
      this.nodes[a].skyLines.push(arc);
    } else {
      const pathMaterial = new THREE.LineBasicMaterial({ color: 0x666666 });
      const arc = new THREE.Line(pathGeometry, pathMaterial);
      scene.add(arc);
      this.nodes[a].skyLines.push(arc);
    }


    const pnts1h = []
    const pnts2h = []
    for (let i = 0; i < pnts.length / 2 + 2; i++) {
      pnts1h.push(pnts[i]);
    }
    for (let i = pnts.length / 2 + 1; i < pnts.length; i++) {
      pnts2h.push(pnts[i]);
    }

    const path1h = new THREE.CatmullRomCurve3(pnts1h);
    const geometry1h = new THREE.TubeGeometry(path1h, 20, 0.02, 8, false);
    const material1h = new THREE.MeshBasicMaterial({ color: 0x00ff00, wireframe: true, opacity: 0.0, transparent: true, depthWrite: false });
    const mesh1h = new THREE.Mesh(geometry1h, material1h);


    const path2h = new THREE.CatmullRomCurve3(pnts2h);
    const geometry2h = new THREE.TubeGeometry(path2h, 20, 0.01, 8, false);
    const material2h = new THREE.MeshBasicMaterial({ color: 0x0000ff, wireframe: true, opacity: 0.0, transparent: true, depthWrite: false });
    const mesh2h = new THREE.Mesh(geometry2h, material2h);
    if (kej == -1) {
      mesh1h.onClick = function (e) {
        if (!tr.nodes[tr.nodeIDs[tr.nodes[a].requires[b]]].isHovered && panCamBool == false && zoomCamBool == false) { panCamBool = true; computePanCamera(camera.rotation.x, camera.rotation.y, tr.nodes[a].theta, tr.nodes[a].fi - Math.PI / 2); }
      }
      mesh2h.onClick = function (e) {
        if (!tr.nodes[a].isHovered && panCamBool == false && zoomCamBool == false) { panCamBool = true; computePanCamera(camera.rotation.x, camera.rotation.y, tr.nodes[tr.nodeIDs[tr.nodes[a].requires[b]]].theta, tr.nodes[tr.nodeIDs[tr.nodes[a].requires[b]]].fi - Math.PI / 2); }
      }

    } else {

      mesh1h.onClick = function (e) {

        if (!tr.nodes[tr.nodeIDs[ej[kej]]].isHovered && panCamBool == false && zoomCamBool == false) { panCamBool = true; computePanCamera(camera.rotation.x, camera.rotation.y, tr.nodes[a].theta, tr.nodes[a].fi - Math.PI / 2); }
      }
      mesh2h.onClick = function (e) {

        if (!tr.nodes[a].isHovered && panCamBool == false && zoomCamBool == false) { panCamBool = true; computePanCamera(camera.rotation.x, camera.rotation.y, tr.nodes[tr.nodeIDs[ej[kej]]].theta, tr.nodes[tr.nodeIDs[ej[kej]]].fi - Math.PI / 2); }
      }

    }
    scene.add(mesh1h);
    scene.add(mesh2h);
    this.nodes[a].reqTubes.push([mesh1h, mesh2h])
  }
  init() {


    for (let i = 0; i < this.nodes.length; i++) {//This loop makes the this.nodeIds array
      this.nodeIDs[this.nodes[i].nodeId] = i;
    }
    for (let i = 0; i < this.nodes.length; i++) {//This loop draws all of the visible lines between nodes
      for (let j = 0; j < this.nodes[i].requires.length; j++) {
        var startT = new THREE.Vector3()//W każdym przypadku linia ma początek i koniec
        var endD = new THREE.Vector3()
        this.nodes[i].star.getWorldPosition(endD)

        if (this.nodes[i].requires[j].includes("o")) {//Jeżeli mamy blok "or" (linie przeywane)
          var a = this.nodes[i].requires[j].split("o")
          for (let k = 0; k < a.length; k++) {
            var startT = new THREE.Vector3()
            var endD = new THREE.Vector3()
            this.nodes[i].star.getWorldPosition(endD)
            this.nodes[this.nodeIDs[a[k]]].star.getWorldPosition(startT);
            this.createLinesNTubes(startT, endD, 50, false, true, i, j, k, a);
          }
        } else {//Jeżeli mamy same and (linie nieprzerywane)
          this.nodes[this.nodeIDs[this.nodes[i].requires[j]]].star.getWorldPosition(startT);
          this.createLinesNTubes(startT, endD, 50, false, false, i, j, -1, 0);
        }
      }
    }

  }
  getNodeSphericalCoordinates(ID) {
    return new THREE.Vector2(this.nodes[this.nodeIDs[ID]].getFi(), this.nodes[this.nodeIDs[ID]].getTheta());
  }
  getNodeWorldPosition(ID) {
    var vSpecVec = new THREE.Vector3();
    this.nodes[this.nodeIDs[ID]].getWorldPosition(vSpecVec);
    return vSpecVec;
  }
}

class TreeNode extends THREE.Mesh {
  constructor(anodeId, anodeName, anodeDesc, ahoverText, posX, posY, posZ, afi, atheta, requires, anodeCost, exclStuff, temperature) {
    super()
    this.temperature = temperature;
    this.isHovered = false;
    this.skyLines = [];
    this.reqTubes = []; //Array storing invisible tubes used to pan camera when "lines are clicked"
    if(anodeCost < 1){
    this.nodeSize = 0.05; //0.035 and 0.05 are fine
    }else{
    this.nodeSize = 0.05*((anodeCost)^(1/3));
    }
    
    this.excl = [];
    this.excl = exclStuff; //All blocks of mutually exclusive nodes containing this node
    this.fi = -afi;
    this.theta = atheta;
    this.geometry = new THREE.SphereGeometry(this.nodeSize, 16, 16)
    this.material = new THREE.MeshBasicMaterial({ color: 0x999999, wireframe: true, opacity: 0.002, transparent: true, depthWrite: false });
    this.position.set(posX, posY, posZ);
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
      new THREE.MeshBasicMaterial({ color: 0xfafafa }), // front
      new THREE.MeshBasicMaterial({ color: 0x00aaaa }) // side
    ]

    this.nameText = new THREE.Mesh(this.nameTextGeometry, this.nameTextMaterials);
    this.nameTextGeometry.computeBoundingBox();
    this.centerOffset = 0.5 * (this.nameTextGeometry.boundingBox.max.y - this.nameTextGeometry.boundingBox.min.y);
    this.nameText.position.set(this.position.x + (this.nodeSize + 0.01) * (Math.sin(this.fi)), this.position.y - this.centerOffset, this.position.z + (this.nodeSize + 0.01) * (Math.cos(this.fi)));
    this.nameText.rotation.set(0, -Math.PI * 1 / 2 + this.fi, 0);
    //this.nameText.rotation.set(this.theta, -Math.PI * 1 / 2 + this.fi, this.theta);

    scene.add(this.nameText);

    //Add a starClass and save it
    this.starID = starClasses.length;
    starClasses.push(new StarModel(this.temperature));

    this.nodeName = anodeName
    this.nodeDesc = anodeDesc
    this.nodeCost = anodeCost
    this.nodeActive = false
    this.sphereSize = 1

    this.star = new THREE.Mesh(new THREE.SphereGeometry(this.nodeSize/4, 16, 16), new THREE.MeshBasicMaterial({ color: 0x000000, opacity: 0.0, transparent: true, depthWrite: false }));

    //this.starColour = '0xee0707';
    //this.star.layers.isEnabled(x);
    addToBloom(this.star);
    //bloomEffect.selection.add(this.star);
    //this.star.layers.enable(BLOOM_SCENE);
    this.hovertext = ahoverText
    this.nodeName = anodeName
    this.nodeDesc = anodeDesc
    this.nodeId = anodeId
    //this.requires = requires
    if (requires[0] === "-") { this.requires = []; }
    else { this.requires = requires }
    //else {this.requires = reqs.split(" ");}
    this.star.position.set(posX, posY, posZ)
    scene.add(this.star)
  }
  onPointerOver(e) {
    this.scale.set(2.0, 2.0, 2.0);
    this.star.scale.set(2.0, 2.0, 2.0);
    var selectedNode = true;
    //if(zoomCamBool == false && this.isHovered == false && selectedNode == true){console.log(zoomCamBool, this.isHovered); computeZoomCamera(-camera.fov/2);}

    this.isHovered = true;
    this.nameText.position.set(this.position.x + (this.nodeSize + 0.01) * (Math.sin(this.fi)) * this.scale.x, this.position.y - this.centerOffset, this.position.z + (this.nodeSize + 0.01) * this.scale.z * (Math.cos(this.fi))); //The sin and cos functions correct for different points on the sphere


    document.getElementById("nodeName").textContent = this.nodeName;
    const nodeDescNode = document.getElementById("nodeDesc")
    nodeDescNode.textContent = '';
    var nodeDescSplit = this.nodeDesc.split("<D>");
    var mybr = document.createElement('br');
    for (let i = 0; i < nodeDescSplit.length; i++) {
      //mybr.textContent = nodeDescSplit[i]; 
      nodeDescNode.innerText += nodeDescSplit[i];
      if (i == nodeDescSplit.length - 1) { break; }
      nodeDescNode.appendChild(mybr);
    }


    document.getElementById("nodeCost").textContent = "Cost: " + this.nodeCost;
    document.getElementById("perkPoints").textContent = perkPoints;
  }

  onPointerOut(e) {
    //if(zoomCamBool == false && this.isHovered == true){computeZoomCamera(-zoomDelta);}
    //else{queuedZoomOut = true;}
    this.scale.set(1, 1, 1);
    this.isHovered = false;
    this.star.scale.set(1, 1, 1);
    this.nameText.position.set(this.position.x + (this.nodeSize + 0.01) * (Math.sin(this.fi)) * this.scale.x, this.position.y - this.centerOffset, this.position.z + (this.nodeSize + 0.01) * this.scale.z * (Math.cos(this.fi)));

  }

  onClick(e) {
    function isNextActive(id) {
      for (let i = 0; i < tr.nodes.length; i++) {
        for (let j = 0; j < tr.nodes[i].requires.length; j++) {
          if (tr.nodes[i].requires[j].includes("o") && tr.nodes[i].requires[0] != "o1") {
            var a = tr.nodes[i].requires[j].split("o");
            var b = 0;
            var c = false;
            for (let k = 0; k < a.length; k++) {
              if (a[k] == id && tr.nodes[i].nodeActive && !(id == 1 && tr.nodes[i].nodeId < 0)) {
                c = true
              } else if (!tr.nodes[tr.nodeIDs[a[k]]].nodeActive) {
                b++
              }
            }
            if (b == a.length - 1 && c) { return true; };
          } else {
            if (tr.nodes[i].requires[j] == id && tr.nodes[i].nodeActive && !(id == 1 && tr.nodes[i].nodeId < 0)) { return true; };
          }
        }
      }
      return false;
    }

    function isMutExclCritMet(passedIdNum) {
      var arr = tr.nodes[tr.nodeIDs[passedIdNum]].excl;
      if (arr == [] || arr == undefined || arr == 0) {return true;}
      //console.log(arr, tr.nodeIDs[passedIdNum], tr.nodes[tr.nodeIDs[passedIdNum]])
      var count = 0;
      for (let i = 2; i < arr.length; i++) {
        if (tr.nodes[tr.nodeIDs[arr[i]]].nodeActive) { count++; }
      }
      if (count >= arr[0]) {
        return false;
      } else {
        return true;
      }
    }

    if (this.nodeActive == true && !isNextActive(this.nodeId)) { this.nodeActive = false; perkPoints += Number(this.nodeCost); this.star.material = new THREE.MeshBasicMaterial({ color: 0x000000, opacity: 0.0, transparent: true, depthWrite: false }); }
    else if (perkPoints >= this.nodeCost && areReqsMet(this.requires) && isMutExclCritMet(this.nodeId) && this.nodeActive == false) { this.nodeActive = true; perkPoints -= Number(this.nodeCost); this.star.material = starClasses[this.starID].customMaterial; };

    document.getElementById("perkPoints").textContent = perkPoints;

    if(panCamBool == false && zoomCamBool == false){panCamBool = true; computePanCamera(camera.rotation.x, camera.rotation.y, this.theta, this.fi - Math.PI / 2);}

  }
  getFi() {
    return this.fi;
  }
  getTheta() {
    return this.theta;
  }
}

class StarModel {
  constructor(temperature) {
    this.temperature = temperature;
    this.baseSpeed = 0.0001;
    this.repeatS = 1.0;
    this.repeatT = 1.0;
    this.noiseScale = 0.9;
    this.blendSpeed = 0.03;
    this.blendOffset = 0.6;
    this.bumpSpeed = 0.06;
    this.bumpScale = 0.0025;

    // Add a ready flag to indicate when the model is fully initialized
    this.isReady = false;

    // Start loading textures and wait for them to load
    this.loadTextures().then(() => {
      // Initialize uniforms and material once textures are loaded
      this.createMaterial();

      // Mark as ready
      this.isReady = true;
    }).catch(err => {
      console.error("Error loading textures:", err);
    });
  }

  // Function to load textures asynchronously
  loadTextures() {
    return new Promise((resolve, reject) => {
      Promise.all([
        this.loadTexture('sun.jpg'),
        this.loadTexture('cloud.png')
      ])
      .then(([lavaTexture, noiseTexture]) => {
        // After loading textures, modify lavaTexture before using it
        this.modifyLavaTexture(lavaTexture, this.temperature).then(modifiedLavaTexture => {
          this.lavaTexture = modifiedLavaTexture;  // Use modified texture
          this.noiseTexture = noiseTexture;
          this.blendTexture = this.lavaTexture;  // Assume we use lavaTexture for blending as well
          this.bumpTexture = this.noiseTexture;

          this.lavaTexture.wrapS = this.lavaTexture.wrapT = THREE.RepeatWrapping;
          this.noiseTexture.wrapS = this.noiseTexture.wrapT = THREE.RepeatWrapping;
          this.blendTexture.wrapS = this.blendTexture.wrapT = THREE.RepeatWrapping;
          this.bumpTexture.wrapS = this.bumpTexture.wrapT = THREE.RepeatWrapping;

          // Textures are loaded and modified, resolve the promise
          resolve();
        }).catch(reject);  // Handle any errors in modifying the lava texture
      })
      .catch(reject);
    });
  }

  // Helper function to load a single texture
  loadTexture(url) {
    return new Promise((resolve, reject) => {
      new THREE.TextureLoader().load(url, texture => {
        resolve(texture);
      }, undefined, err => {
        reject(new Error(`Failed to load texture: ${url}`));
      });
    });
  }

  // Function to modify lava texture (turn everything red in this case)
  modifyLavaTexture(texture, temperature) {
    return new Promise((resolve, reject) => {
      // Create a canvas and draw the texture on it
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      // Set canvas size to match the texture
      canvas.width = texture.image.width;
      canvas.height = texture.image.height;

      // Draw the texture on the canvas
      ctx.drawImage(texture.image, 0, 0);

      // Get the image data
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      
      //Next we need to choose what colour we'd like to colour our stars
      //This algorithm is based on thw work of John Walker "Colour Rendering of Spectra"
      //MAGIC COLOUR CONVERSION BOX: START
class ColourSystem {
    constructor(name, xRed, yRed, xGreen, yGreen, xBlue, yBlue, xWhite, yWhite, gamma) {
        this.name = name;
        this.xRed = xRed;
        this.yRed = yRed;
        this.xGreen = xGreen;
        this.yGreen = yGreen;
        this.xBlue = xBlue;
        this.yBlue = yBlue;
        this.xWhite = xWhite;
        this.yWhite = yWhite;
        this.gamma = gamma;
    }
}

// White point chromaticities
const IlluminantC = [0.3101, 0.3162];
const IlluminantD65 = [0.3127, 0.3291];
const IlluminantE = [0.33333333, 0.33333333];

// Gamma of nonlinear correction
const GAMMA_REC709 = 0;  // Rec. 709

// Colour Systems
const NTSCsystem = new ColourSystem("NTSC", 0.67, 0.33, 0.21, 0.71, 0.14, 0.08, ...IlluminantC, GAMMA_REC709);
const EBUsystem = new ColourSystem("EBU (PAL/SECAM)", 0.64, 0.33, 0.29, 0.60, 0.15, 0.06, ...IlluminantD65, GAMMA_REC709);
const SMPTEsystem = new ColourSystem("SMPTE", 0.630, 0.340, 0.310, 0.595, 0.155, 0.070, ...IlluminantD65, GAMMA_REC709);
const HDTVsystem = new ColourSystem("HDTV", 0.670, 0.330, 0.210, 0.710, 0.150, 0.060, ...IlluminantD65, GAMMA_REC709);
const CIEsystem = new ColourSystem("CIE", 0.7355, 0.2645, 0.2658, 0.7243, 0.1669, 0.0085, ...IlluminantE, GAMMA_REC709);
const Rec709system = new ColourSystem("CIE REC 709", 0.64, 0.33, 0.30, 0.60, 0.15, 0.06, ...IlluminantD65, GAMMA_REC709);

// UPVP_TO_XY
function upvpToXY(up, vp) {
    const xc = (9 * up) / ((6 * up) - (16 * vp) + 12);
    const yc = (4 * vp) / ((6 * up) - (16 * vp) + 12);
    return [xc, yc];
}

// XY_TO_UPVP
function xyToUpvp(xc, yc) {
    const up = (4 * xc) / ((-2 * xc) + (12 * yc) + 3);
    const vp = (9 * yc) / ((-2 * xc) + (12 * yc) + 3);
    return [up, vp];
}

// XYZ_TO_RGB
function xyzToRgb(cs, xc, yc, zc) {
    const xr = cs.xRed, yr = cs.yRed, zr = 1 - (xr + yr);
    const xg = cs.xGreen, yg = cs.yGreen, zg = 1 - (xg + yg);
    const xb = cs.xBlue, yb = cs.yBlue, zb = 1 - (xb + yb);

    const xw = cs.xWhite, yw = cs.yWhite, zw = 1 - (xw + yw);

    var rx = (yg * zb) - (yb * zg);
    var ry = (xb * zg) - (xg * zb);
    var rz = (xg * yb) - (xb * yg);

    var gx = (yb * zr) - (yr * zb);
    var gy = (xr * zb) - (xb * zr);
    var gz = (xb * yr) - (xr * yb);

    var bx = (yr * zg) - (yg * zr);
    var by = (xg * zr) - (xr * zg);
    var bz = (xr * yg) - (xg * yr);

    const rw = ((rx * xw) + (ry * yw) + (rz * zw)) / yw;
    const gw = ((gx * xw) + (gy * yw) + (gz * zw)) / yw;
    const bw = ((bx * xw) + (by * yw) + (bz * zw)) / yw;

    rx = rx / rw;
    ry = ry / rw;
    rz = rz / rw;

    gx = gx / gw;
    gy = gy / gw;
    gz = gz / gw;

    bx = bx / bw;
    by = by / bw;
    bz = bz / bw;

  //console.log(rx, ry, rz, xc, yc, zc,);

    const r = (rx * xc) + (ry * yc) + (rz * zc);
    const g = (gx * xc) + (gy * yc) + (gz * zc);
    const b = (bx * xc) + (by * yc) + (bz * zc);

    return [r, g, b];
}

// INSIDE_GAMUT
function insideGamut(r, g, b) {
    return (r >= 0) && (g >= 0) && (b >= 0);
}

// CONSTRAIN_RGB
function constrainRgb(r, g, b) {
    const w = Math.min(0, r, g, b);
    if (w > 0) {
        r += w;
        g += w;
        b += w;
        return true;
    }
    return false;
}

// GAMMA_CORRECT_RGB
function gammaCorrect(cs, c) {
    const gamma = cs.gamma;
    if (gamma === GAMMA_REC709) {
        const cc = 0.018;
        if (c < cc) {
            c *= ((1.099 * Math.pow(cc, 0.45)) - 0.099) / cc;
        } else {
            c = (1.099 * Math.pow(c, 0.45)) - 0.099;
        }
    } else {
        c = Math.pow(c, 1.0 / gamma);
    }
    return c;
}

// GAMMA_CORRECT_RGB
function gammaCorrectRgb(cs, r, g, b) {
    return [
        gammaCorrect(cs, r),
        gammaCorrect(cs, g),
        gammaCorrect(cs, b)
    ];
}

// NORM_RGB
function normRgb(r, g, b) {
    const greatest = Math.max(r, g, b);
    if (greatest > 0) {
        return [r / greatest, g / greatest, b / greatest];
    }
    return [r, g, b];
}

// SPECTRUM_TO_XYZ
function spectrumToXyz(specIntens) {
const cieColourMatch = [
    [0.0014, 0.0000, 0.0065], [0.0022, 0.0001, 0.0105], [0.0042, 0.0001, 0.0201],
    [0.0076, 0.0002, 0.0362], [0.0143, 0.0004, 0.0679], [0.0232, 0.0006, 0.1102],
    [0.0435, 0.0012, 0.2074], [0.0776, 0.0022, 0.3713], [0.1344, 0.0040, 0.6456],
    [0.2148, 0.0073, 1.0391], [0.2839, 0.0116, 1.3856], [0.3285, 0.0168, 1.6230],
    [0.3483, 0.0230, 1.7471], [0.3481, 0.0298, 1.7826], [0.3362, 0.0380, 1.7721],
    [0.3187, 0.0480, 1.7441], [0.2908, 0.0600, 1.6692], [0.2511, 0.0739, 1.5281],
    [0.1954, 0.0910, 1.2876], [0.1421, 0.1126, 1.0419], [0.0956, 0.1390, 0.8130],
    [0.0580, 0.1693, 0.6162], [0.0320, 0.2080, 0.4652], [0.0147, 0.2586, 0.3533],
    [0.0049, 0.3230, 0.2720], [0.0024, 0.4073, 0.2123], [0.0093, 0.5030, 0.1582],
    [0.0291, 0.6082, 0.1117], [0.0633, 0.7100, 0.0782], [0.1096, 0.7932, 0.0573],
    [0.1655, 0.8620, 0.0422], [0.2257, 0.9149, 0.0298], [0.2904, 0.9540, 0.0203],
    [0.3597, 0.9803, 0.0134], [0.4334, 0.9950, 0.0087], [0.5121, 1.0000, 0.0057],
    [0.5945, 0.9950, 0.0039], [0.6784, 0.9786, 0.0027], [0.7621, 0.9520, 0.0021],
    [0.8425, 0.9154, 0.0018], [0.9163, 0.8700, 0.0017], [0.9786, 0.8163, 0.0014],
    [1.0263, 0.7570, 0.0011], [1.0567, 0.6949, 0.0010], [1.0622, 0.6310, 0.0008],
    [1.0456, 0.5668, 0.0006], [1.0026, 0.5030, 0.0003], [0.9384, 0.4412, 0.0002],
    [0.8544, 0.3810, 0.0002], [0.7514, 0.3210, 0.0001], [0.6424, 0.2650, 0.0000],
    [0.5419, 0.2170, 0.0000], [0.4479, 0.1750, 0.0000], [0.3608, 0.1382, 0.0000],
    [0.2835, 0.1070, 0.0000], [0.2187, 0.0816, 0.0000], [0.1649, 0.0610, 0.0000],
    [0.1212, 0.0446, 0.0000], [0.0874, 0.0320, 0.0000], [0.0636, 0.0232, 0.0000],
    [0.0468, 0.0170, 0.0000], [0.0329, 0.0119, 0.0000], [0.0227, 0.0082, 0.0000],
    [0.0158, 0.0057, 0.0000], [0.0114, 0.0041, 0.0000], [0.0081, 0.0029, 0.0000],
    [0.0058, 0.0021, 0.0000], [0.0041, 0.0015, 0.0000], [0.0029, 0.0010, 0.0000],
    [0.0020, 0.0007, 0.0000], [0.0014, 0.0005, 0.0000], [0.0010, 0.0004, 0.0000],
    [0.0007, 0.0002, 0.0000], [0.0005, 0.0002, 0.0000], [0.0003, 0.0001, 0.0000],
    [0.0002, 0.0001, 0.0000], [0.0002, 0.0001, 0.0000], [0.0001, 0.0000, 0.0000],
    [0.0001, 0.0000, 0.0000], [0.0001, 0.0000, 0.0000], [0.0000, 0.0000, 0.0000]
];


    let X = 0, Y = 0, Z = 0;
    for (let i = 0, lambda = 380; lambda < 780.1; i++, lambda += 5) {
        const Me = specIntens(lambda);
        X += Me * cieColourMatch[i][0];
        Y += Me * cieColourMatch[i][1];
        Z += Me * cieColourMatch[i][2];
    }

    const XYZ = (X + Y + Z);
    return [X / XYZ, Y / XYZ, Z / XYZ];
}

// BB_SPECTRUM
function bbSpectrum(wavelength, bbTemp) {
    const wlm = wavelength * 1e-9; // Wavelength in meters
    return (3.74183e-16 * Math.pow(wlm, -5.0)) / (Math.exp(1.4388e-2 / (wlm * bbTemp)) - 1.0);
}

    const cs = SMPTEsystem;
    //MAGIC COLOUR CONVERSION BOX: END

    let t = this.temperature; 
    const bbTemp = t;
    
    const [x, y, z] = spectrumToXyz(lambda => bbSpectrum(lambda, bbTemp));
    var [r, g, b] = xyzToRgb(cs, x, y, z);
    [r, g, b] = normRgb(r, g, b);
    [r, g, b] = [Math.floor(255*r), Math.floor(255*g), Math.floor(255*b)];

    //console.log(`  ${t} K ${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)}`);

      function rgbToHsl(r, g, b) {
        r /= 255, g /= 255, b /= 255;

        var max = Math.max(r, g, b), min = Math.min(r, g, b);
        var h, s, l = (max + min) / 2;

        if (max == min) {
          h = s = 0; // achromatic
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
       return [ h, s, l ];
      }
      let h, s, l;
      [h, s, l] = rgbToHsl(r, g, b);
      
      function hslToRgb(h, s, l) {
      var r, g, b;

      if (s == 0) {
        r = g = b = l; // achromatic
      } else {
        function hue2rgb(p, q, t) {
          if (t < 0) t += 1;
          if (t > 1) t -= 1;
          if (t < 1/6) return p + (q - p) * 6 * t;
          if (t < 1/2) return q;
          if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
          return p;
        }

        var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        var p = 2 * l - q;

        r = hue2rgb(p, q, h + 1/3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1/3);
      }

      return [r, g, b];
    }
      //console.log([r, g, b], [h, s, l])
      // Loop through each pixel and change its color (turn everything red)
      for (let i = 0; i < data.length; i += 4) {
        // Modify color channels to make the image red
        var bri = (((data[i]+data[i+1]+data[i+2])/3)/255);
        [r, g, b] = hslToRgb(h, s, l*bri);
        [r, g, b] = [Math.floor(255*r), Math.floor(255*g), Math.floor(255*b)];
        data[i] = r; // Red channel
        data[i + 1] = g; // Green channel
        data[i + 2] = b; // Blue channel
        // data[i + 3] is the alpha (opacity), keep it the same
      }

      // Put the modified image data back to the canvas
      ctx.putImageData(imageData, 0, 0);

      // Create a new texture from the modified canvas
      const newTexture = new THREE.CanvasTexture(canvas);
      
      // Resolve the promise with the new texture
      resolve(newTexture);
    });
  }

  // Function to create material after textures are loaded
  createMaterial() {
    // Initialize the custom uniforms after textures are loaded
    this.customUniforms = {
      baseTexture: { type: "t", value: this.lavaTexture },
      baseSpeed: { type: "f", value: this.baseSpeed },
      repeatS: { type: "f", value: this.repeatS },
      repeatT: { type: "f", value: this.repeatT },
      noiseTexture: { type: "t", value: this.noiseTexture },
      noiseScale: { type: "f", value: this.noiseScale },
      blendTexture: { type: "t", value: this.blendTexture },
      blendSpeed: { type: "f", value: this.blendSpeed },
      blendOffset: { type: "f", value: this.blendOffset },
      bumpTexture: { type: "t", value: this.bumpTexture },
      bumpSpeed: { type: "f", value: this.bumpSpeed },
      bumpScale: { type: "f", value: this.bumpScale },
      alpha: { type: "f", value: 1.0 },
      time: { type: "f", value: 1.0 }
    };

    // Create the custom shader material after the textures are ready
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

  // Method to check if the model is ready
  isModelReady() {
    return this.isReady;
  }
}

let intersects = []
let hovered = {}
const theFontLoader = new FontLoader();
const hellishFont = theFontLoader.parse(HelvetikerFont);

//General setup
var container = document.getElementById('canvas'); //Find div in which we put the entire thing in
var scene = new THREE.Scene(); //New scene
var camera = new THREE.PerspectiveCamera(30, container.clientWidth / container.clientHeight, 1, 100000); //Camera config
camera.position.set(0, 0, 0);
camera.rotation.order = "YXZ"; //VERY IMPORTANT
camera.layers.enableAll();2
//camera.rotation.set(0, -Math.PI/2, 0)

var freeCamera = new THREE.PerspectiveCamera(30, container.clientWidth / container.clientHeight, 0.00001, 100000); //Camera config
freeCamera.position.set(0,0,0);
freeCamera.rotation.order = "YXZ"; //VERY IMPORTANT
freeCamera.layers.enableAll();

let activeCamera = camera;

const raycaster = new THREE.Raycaster() //raycaster code to enable
const mouse = new THREE.Vector2()
raycaster.setFromCamera(mouse, camera)
intersects = raycaster.intersectObjects(scene.children, true)
var clock = new THREE.Clock();
var cameraClock = new THREE.Clock();
var panclock = new THREE.Clock();
var zoomclock = new THREE.Clock();
var animclock = new THREE.Clock();
const stats = new Stats()
var statsShown = false

//Rendering
const renderer = new WebGLRenderer({
  powerPreference: "high-performance",
  antialias: false,
  stencil: false,
  depth: false
});
container.appendChild(renderer.domElement);
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.setPixelRatio(window.devicePixelRatio);
//renderer.setAnimationLoop(animate);
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
function addToBloom(obj) {
  obj.layers.set(BLOOM_LAYER);
  bloomEffect.selection.add(obj);
}
const effectPass = new EffectPass(activeCamera, bloomEffect)
effectPass.renderToScreen = true;
composer.addPass(effectPass);

//Add test nodes
async function treeGen(TREEE) {

  const response1 = await fetch("https://raw.githubusercontent.com/Dat-guy-test/project/refs/heads/main/test");
  const data1 = await response1.text();
  const lines = data1.split("\n"); //array of lines (starting at 0)
  var atrs = [['', '', '', '', '', '', [], '']]
  for (let i = 0; i < lines.length - 1; i++) {
    atrs[i] = lines[i].split(" | ");
    atrs[i][6] = atrs[i][6].split(" ");
  }

  var bigFi = 0;
  var lowFi = 0;
  var bigTh = 0;
  var lowTh = 0;

  for (let i = 0; i < atrs.length; i++) {
    if (atrs[i][4] > bigFi) bigFi = atrs[i][4];
    if (atrs[i][4] < lowFi) lowFi = atrs[i][4];
    if (atrs[i][5] > bigTh) bigTh = atrs[i][5];
    if (atrs[i][5] < lowTh) lowTh = atrs[i][5];
  }
  var fiSteps = bigFi - lowFi;
  var thSteps = bigTh - lowTh;

  var minKorFi = ((TREEE.span[0]) * (Math.PI / 180));
  var maxKorFi = ((TREEE.span[1]) * (Math.PI / 180));
  var minKorTh = ((TREEE.span[2]) * (Math.PI / 180));
  var maxKorTh = ((TREEE.span[3]) * (Math.PI / 180));

  const response2 = await fetch("https://raw.githubusercontent.com/Dat-guy-test/project/refs/heads/main/mutuallyExclusive");
  const data2 = await response2.text();
  const lines2 = data2.split("\n"); //array of lines (starting at 0)
  var exclIDs = [];
  for (let i = 0; i < lines2.length - 1; i++) {
    TREEE.mutExcl[i] = lines2[i];
    exclIDs = lines2[i].split(" ");
    for (let j = 2; j < exclIDs.length; j++) {
      for (let k = 0; k < lines.length - 1; k++) {
        if (atrs[k][0] == exclIDs[j]) { atrs[k][8] = exclIDs };
      }
    }
  }

  for (let i = 0; i < lines.length - 1; i++) {

    var fi = minKorFi + (atrs[i][4] - lowFi) * (maxKorFi - minKorFi) / fiSteps;
    var th = minKorTh + (atrs[i][5] - lowTh) * (maxKorTh - minKorTh) / thSteps;
    var iks = TREEE.sphereRadius * Math.cos(th) * Math.cos(fi);
    var igrek = TREEE.sphereRadius * Math.sin(th);
    var zet = TREEE.sphereRadius * Math.cos(th) * Math.sin(fi);

    TREEE.nodes[i] = new TreeNode(atrs[i][0], atrs[i][1], atrs[i][2], atrs[i][3], iks, igrek, zet, fi, th, atrs[i][6], atrs[i][7], atrs[i][8], atrs[i][9]);
    scene.add(TREEE.nodes[i]);
  }
  cameraRotationOffsetFromTree = - Math.PI / 2


};

var tr = new Tree(0, 40, 20, 60);


function areReqsMet(reqs) {
  for (var i = 0; i < reqs.length; i++) {
    if (reqs[i].includes("o")) {
      var a = reqs[i].split("o");
      var b = 0;
      for (let k = 0; k < a.length; k++) {
        if (tr.nodes[tr.nodeIDs[a[k]]].nodeActive == false) { b++ };
      }
      if (b == a.length) { return false; };
    } else {
      if (tr.nodes[tr.nodeIDs[reqs[i]]].nodeActive == false) { return false };
    }
  }
  return true;
}

var cameraRotationOffsetFromTree = 0;
async function sec() {
  await treeGen(tr);
  tr.init();

  //Set camera looking at the starting node
  var vec = tr.getNodeSphericalCoordinates(1);
  //console.log(vec, tr.nodes[0].fi, tr.nodes[0].theta, tr.nodes[0].position);
  camera.rotation.set(vec.y, vec.x + cameraRotationOffsetFromTree, 0);
  camera.fov = iniPanCamFov;
  camera.updateProjectionMatrix();

}
sec();
console.log(tr.nodes)

var skyGeo = new THREE.SphereGeometry(100000, 25, 25);
/*
var skyloader = new THREE.TextureLoader(),
  skytexture = skyloader.load("space.png");
var skymaterial = new THREE.MeshPhongMaterial({
  map: skytexture,
  lightMap: skytexture,
  lightMapIntensity: 5,
});
*/
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
          // Calculate gradient based on Y position of the sphere
          float gradient = (vPosition.y + 100000.0) / 200000.0; // Normalize y between -3 and 3

          // Optionally smooth the transition using smoothstep
          gradient = smoothstep(-1.0, 1.0, gradient);
          // Interpolate between two colors
          vec3 color = mix(color1, color2, gradient);

          gl_FragColor = vec4(color, 1.0);
        }
      `,
      uniforms: {
        color1: { value: new THREE.Color(0x002f2f) }, // Dark Blue
        color2: { value: new THREE.Color(0x000000) }  // Black
      }
    });

var sky = new THREE.Mesh(skyGeo, skyMat);
sky.material.side = THREE.BackSide;
scene.add(sky);


const horizonTexture = new THREE.TextureLoader().load('grass.jpg'); // Texture with gradient (dark to light)

horizonTexture.wrapS = horizonTexture.wrapT = THREE.RepeatWrapping;
horizonTexture.repeat.set(50, 50); // Tiling across the plane
const horizonMaterial = new THREE.MeshBasicMaterial({
  map: horizonTexture,
  side: THREE.DoubleSide,
  transparent: false,
  opacity: 1.0 // You can adjust this for more subtlety
});
const horizonGeometry = new THREE.PlaneGeometry(50, 50, 1, 1);  // Large plane
const horizon = new THREE.Mesh(horizonGeometry, horizonMaterial);
horizon.rotation.x = -Math.PI / 2; // Rotate to lay flat on the ground
horizon.position.set(0, -1, 0);  // Position it slightly below the camera (ground level)
horizon.layers.set(0);
bloomEffect.selection.delete(horizon);
scene.add(horizon);


//Fist part of click implementation
window.addEventListener('pointermove', (e) => {
  mouse.set((e.offsetX / container.clientWidth) * 2 - 1, -(e.offsetY / container.clientHeight) * 2 + 1)
  raycaster.setFromCamera(mouse, camera)
  intersects = raycaster.intersectObjects(scene.children, true)

  // If a previously hovered item is not among the hits we must call onPointerOut
  Object.keys(hovered).forEach((key) => {
    const hit = intersects.find((hit) => hit.object.uuid === key)
    if (hit === undefined) {
      const hoveredItem = hovered[key]
      if (hoveredItem.object.onPointerOver) hoveredItem.object.onPointerOut(hoveredItem)
      delete hovered[key]
    }
  })

  intersects.forEach((hit) => {
    // If a hit has not been flagged as hovered we must call onPointerOver
    if (!hovered[hit.object.uuid]) {
      hovered[hit.object.uuid] = hit
      if (hit.object.onPointerOver) hit.object.onPointerOver(hit)
    }
    // Call onPointerMove
    if (hit.object.onPointerMove) hit.object.onPointerMove(hit)
  })
})
    const ambientLight = new THREE.AmbientLight(0xffffff, 1); // Soft white light
    scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight( 0xffffff, 2.0 );
scene.add( directionalLight );
const loader = new GLTFLoader();
loader.load(
  'Telescope.glb',  // Path to your GLB file
  function (gltf) {
    // This is called when the model is loaded successfully

    // Add the loaded model to your scene
    scene.add(gltf.scene);
    
    // Optionally scale, position, or rotate the model:
    gltf.scene.scale.set(0.05, 0.05, 0.05);  // Scale model
    gltf.scene.position.set(0, -1, 0);  // Position model
    gltf.scene.rotation.set(0, Math.PI / 2, 0);  // Rotate model
  },
  function (xhr) {
    // This is called during the loading process to show progress
    console.log((xhr.loaded / xhr.total * 100) + '% loaded');
  },
  function (error) {
    // This is called if an error occurs
    console.error('An error happened while loading the model:', error);
  }
);

//Second part of click implementation
window.addEventListener('click', (e) => {
  intersects.forEach((hit) => {
    // Call onClick
    if (hit.object.onClick) hit.object.onClick(hit)
  })
})

const keys = {
  ArrowUp: false,
  ArrowDown: false,
  ArrowLeft: false,
  ArrowRight: false
};
window.addEventListener("keyup", function (event) {
  if (event.key in keys) {
    keys[event.key] = false;
  }
});
//Debug controls
window.addEventListener("keydown", function (event) {
  if (event.defaultPrevented) {
    return; // Do nothing if the event was already processed
  }
  if (event.key in keys) {
    keys[event.key] = true;
  }
  switch (event.key) {
    case "Escape":
      console.log(camera.rotation.x, camera.rotation.y, tr.nodes[0].theta, tr.nodes[0].fi)
      // code for "down arrow" key press.
      break;
    case "=":
      if (zoomStage > 0) {
        if (zoomCamBool == false && panCamBool == false) { zoomCamBool = true; zoomStage -= 1; computeZoomCamera(-1); }
        //camera.far = (1/camera.fov)*(3000*30)
        camera.updateProjectionMatrix();
      }
      break;
    case "-":
      if (zoomStage >= 0 && zoomStage < 60) {

        if (zoomCamBool == false && panCamBool == false) { zoomCamBool = true; zoomStage += 1; computeZoomCamera(1); }
        //camera.far = (1/camera.fov)*(3000*30) 
        camera.updateProjectionMatrix();
      }
      break;
    case "Tab":

      if (statsShown == false) {
        statsShown = true;
        document.body.appendChild(stats.dom);
      }
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
      return; // Quit when this doesn't handle the key event.
  }

  // Cancel the default action to avoid it being handled twice
  event.preventDefault();
}, true);


function freeCameraMovement() {
    var DT = cameraClock.getDelta();
  if (keys.ArrowUp) {
    cameraAccelerationX += 1.05*DT;
  }
  if (keys.ArrowDown) {
    cameraAccelerationX -= 1.05*DT;
  }
  if (keys.ArrowLeft) {
    cameraAccelerationY += 1.05*DT;
  }
  if (keys.ArrowRight) {
    cameraAccelerationY -= 1.05*DT;
  }


  camera.rotation.x += cameraAccelerationX * DT;
  camera.rotation.y += cameraAccelerationY * DT;
  if ((cameraAccelerationX > -0.01 && cameraAccelerationX < 0.01)) {
    cameraAccelerationX = 0;
  }
  if ((cameraAccelerationY > -0.01 && cameraAccelerationY < 0.01)) {
    cameraAccelerationY = 0;
  }
  //console.log(cameraAccelerationX, cameraAccelerationY);
  cameraAccelerationX -= 1.5 * cameraAccelerationX * DT;
  cameraAccelerationY -= 1.5 * cameraAccelerationY * DT;
}

function computePanCamera(iniFi, iniTh, finFi, finTh) {
  iniPanCamFov = camera.fov;
  panX = iniFi;
  dPanX = finFi - iniFi;
  panY = iniTh;
  dPanY = finTh - iniTh;
  panCamFov = iniPanCamFov;
  panComputeBool = true;
  panclock.start();
}

function computeZoomCamera(amount) {
  zoomDelta = amount;
  initialZoom = camera.fov;
  finalZoom = initialZoom + zoomDelta;
  zoomCamFov = camera.fov;
  zoomComputeBool = true;
  zoomclock.start();
}

function panCamera() {
  const panTime = 1; //Pan animation time in seconds
  var panDT = panclock.getElapsedTime();
    
  var fac = 1.5 * (Math.abs(dPanX) + Math.abs(dPanY));
  if (fac > 0.01) {
    panCamFov -= fac * (panDT - panTime / 2);
    camera.fov = panCamFov;
    camera.updateProjectionMatrix();
  }
  if (panDT >= panTime) { panComputeBool = false; panCamFov = iniPanCamFov; camera.fov = panCamFov; camera.updateProjectionMatrix(); panDT = panTime; panclock.stop(); panCamBool = false;};
  camera.rotation.set(panX + (panDT / panTime) * dPanX, panY + (panDT / panTime) * dPanY, 0);
}

function zoomCamera() {
  const zoomTime = 0.05; //Zoom animation time in seconds
  var zoomDT = zoomclock.getElapsedTime();
  zoomCamFov = initialZoom + (zoomDelta / zoomTime) * (zoomDT);
  camera.fov = zoomCamFov;
  camera.updateProjectionMatrix();
  if (zoomDT >= zoomTime) { zoomComputeBool = false; camera.fov = finalZoom; zoomCamFov = initialZoom; camera.updateProjectionMatrix(); zoomDT = zoomTime; zoomclock.stop(); zoomCamBool = false;};
}

function hoverAnimation() {
  const animtime = 2;
  const animSize = 0;
  animclock.getDelta();
}

window.addEventListener('resize', onWindowResize, false);

function onWindowResize() {
  activeCamera.aspect = container.clientWidth / container.clientHeight;
  activeCamera.updateProjectionMatrix();

  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
}
window.addEventListener('keydown', (e) => {
  keys[e.key] = true;
});
window.addEventListener('keyup', (e) => {
  keys[e.key] = false;
});
// Mouse movement for rotating the camera
let isMouseDown = false;
let lastMousePosition = { x: 0, y: 0 };

window.addEventListener('mousedown', (e) => {
  isMouseDown = true;
});
window.addEventListener('mouseup', (e) => {
  isMouseDown = false;
});
window.addEventListener('mousemove', (e) => {
  if (isMouseDown) {
    let deltaX = e.clientX - lastMousePosition.x;
    let deltaY = e.clientY - lastMousePosition.y;

    // Rotate camera based on mouse movement
    freeCamera.rotation.y -= deltaX * 0.005; // Y axis (horizontal rotation)
    freeCamera.rotation.x -= deltaY * 0.005; // X axis (vertical rotation)

    // Clamp vertical rotation to avoid flipping
    freeCamera.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, freeCamera.rotation.x));
  }

  lastMousePosition = { x: e.clientX, y: e.clientY };
});

//Main loop
function animate() {
  stats.begin();
  var delta = clock.getDelta();
  //console.log(camera.fov);
  //console.log(cameraAccelerationX, cameraAccelerationY, cameraSpeedX, cameraSpeedY)
  if (panComputeBool == true) { panCamera(); }
  if (queuedZoomOut == true && zoomComputeBool == false && panCamBool == false) { queuedZoomOut = false; computeZoomCamera(-zoomDelta); }
  if (zoomComputeBool == true) { zoomCamera(); }
  freeCameraMovement();
  for(let i = 0; i < starClasses.length; i++){
    if (starClasses[i].isModelReady()) {
    // Now you can safely modify the uniforms, for example:
    starClasses[i].customUniforms.time.value += delta;
  } else {
    //console.log("Model not ready yet...");
  }
  }
  const speed = 0.05;
  if (keys['w']) {
    freeCamera.position.z -= speed;
  }
  if (keys['s']) {
    freeCamera.position.z += speed;
  }
  if (keys['a']) {
    freeCamera.position.x -= speed;
  }
  if (keys['d']) {
    freeCamera.position.x += speed;
  }
  if (keys[' ']) { // Space for moving up
    freeCamera.position.y += speed;
  }
  if (keys['Shift']) { // Shift for moving down
    freeCamera.position.y -= speed;
  }
  //AStar.customUniforms.time.value += delta; //customUniforms.time.value += delta;
  requestAnimationFrame(animate);
  composer.render();
  stats.end();
}
animate();
//code used: https://stemkoski.github.io/Three.js/Shader-Fireball.html
//arc on sphere: https://stackoverflow.com/questions/42663182/draw-curved-line-in-three-js-from-vector3-to-vector3-on-surface-of-spheregeometr?rq=4
//https://github.com/pmndrs/postprocessing