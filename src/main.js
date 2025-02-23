import './style.css'
import HelvetikerFont from "three/examples/fonts/helvetiker_regular.typeface.json";
import Stats from '/node_modules/three/examples/jsm/libs/stats.module.js'
import * as THREE from 'three';
import { WebGLRenderer } from "three";
import { EffectComposer, EffectPass, RenderPass, SelectiveBloomEffect } from "postprocessing";
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';


//Structure
//Add proper movement (using invisible tubular arrows)

//Cosmetics
//Add hover descriptions
//Add different textures and sizes to nodes
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


//Optimisation
//Make nodeId positions compute at start

//Class to describe a node in the skill tree
//Have actually working requirements (logical or, and)
//Animate stuff (stars forming from gas/exploding) (stars getting bigger and rotating more when hovered) (stars rotating when node is idle) (gas mixing when node is idle)
//Add mutually exclusive perks
//Implement sky from official three.js addon

var perkPoints = 20;
var panCamBool = false, panComputeBool = false;
var panX = 0;
var panY = 0;
var dPanX = 0;
var dPanY = 0;
var panSpeed = 0;
var iniPanCamFov = 5;
var panCamFov = 0;
var animatedNodesIDs = [];

class Tree {
  constructor(smolFi, highFi, smolTh, highTh) {
    this.nodes = []
    this.mutExcl = [] //Each value of the array is a block of ids of mutually exclusive nodes. The 0-th element of each value corresponds to maximum allowable nodes gained in the block.
    this.nodeIDs = []
    this.span = [smolFi, highFi, smolTh, highTh]
    this.sphereRadius = 10;
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
    if (dashed){
      const pathMaterial = new THREE.LineDashedMaterial({ color: 0x666666 ,  dashSize: 0.01, gapSize: 0.01});
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
    for( let i = 0; i < pnts.length/2 +2 ; i++){
        pnts1h.push(pnts[i]);
    }
    for( let i = pnts.length/2 +1; i < pnts.length; i++){
      pnts2h.push(pnts[i]);
    }
    
    const path1h = new THREE.CatmullRomCurve3(pnts1h);
    const geometry1h = new THREE.TubeGeometry( path1h, 20, 0.01, 8, false );
    const material1h = new THREE.MeshBasicMaterial( { color: 0x00ff00, wireframe: true,  opacity: 0.0, transparent: true, depthWrite: false} );
    const mesh1h = new THREE.Mesh( geometry1h, material1h );


    const path2h = new THREE.CatmullRomCurve3(pnts2h);
    const geometry2h = new THREE.TubeGeometry( path2h, 20, 0.01, 8, false );
    const material2h = new THREE.MeshBasicMaterial( { color: 0x0000ff, wireframe: true, opacity: 0.0, transparent: true, depthWrite: false} );
    const mesh2h = new THREE.Mesh( geometry2h, material2h );
    if(kej == -1){
      mesh1h.onClick = function (e){
        if(!tr.nodes[tr.nodeIDs[tr.nodes[a].requires[b]]].isHovered){computePanCamera(camera.rotation.x, camera.rotation.y, tr.nodes[a].theta, tr.nodes[a].fi - Math.PI/2);}
      }
      mesh2h.onClick = function (e){
        if(!tr.nodes[a].isHovered){computePanCamera(camera.rotation.x, camera.rotation.y, tr.nodes[tr.nodeIDs[tr.nodes[a].requires[b]]].theta, tr.nodes[tr.nodeIDs[tr.nodes[a].requires[b]]].fi - Math.PI/2);}
      }
      
    } else {
      
      mesh1h.onClick = function (e){

        if(!tr.nodes[tr.nodeIDs[ej[kej]]].isHovered){computePanCamera(camera.rotation.x, camera.rotation.y, tr.nodes[a].theta, tr.nodes[a].fi - Math.PI/2);}
      }
      mesh2h.onClick = function (e){
      
        if(!tr.nodes[a].isHovered){computePanCamera(camera.rotation.x, camera.rotation.y, tr.nodes[tr.nodeIDs[ej[kej]]].theta, tr.nodes[tr.nodeIDs[ej[kej]]].fi - Math.PI/2);}
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

          if(this.nodes[i].requires[j].includes("o")){//Jeżeli mamy blok "or" (linie przeywane)
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
  getNodeSphericalCoordinates(ID){
    return new THREE.Vector2(this.nodes[this.nodeIDs[ID]].getFi(), this.nodes[this.nodeIDs[ID]].getTheta());
  }
  getNodeWorldPosition(ID){
    var vSpecVec = new THREE.Vector3();
    this.nodes[this.nodeIDs[ID]].getWorldPosition(vSpecVec);
    return vSpecVec;
  }
}

class TreeNode extends THREE.Mesh {
  constructor(anodeId, anodeName, anodeDesc, ahoverText, posX, posY, posZ, afi, atheta, requires, anodeCost, exclStuff) {
    super()
    this.isHovered = false;
    this.skyLines = [];
    this.reqTubes = []; //Array storing invisible tubes used to pan camera when "lines are clicked"
    this.nodeSize = 0.05;
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
    this.nameText.rotation.set(0, -Math.PI*1/2+this.fi, 0);
    this.nameText.position.set(this.position.x+(this.nodeSize+0.01)*(Math.sin(this.fi)), this.position.y-this.centerOffset, this.position.z + (this.nodeSize+0.01)*(Math.cos(this.fi)));
    scene.add(this.nameText);


    this.nodeName = anodeName
    this.nodeDesc = anodeDesc
    this.nodeCost = anodeCost
    this.nodeActive = false
    this.sphereSize = 1

    this.star = new THREE.Mesh(new THREE.SphereGeometry(0.01, 16, 16), new THREE.MeshBasicMaterial({ color: 0x000000, opacity: 0.0, transparent: true, depthWrite: false}));

    this.starColour = '0xee0707';
    bloomEffect.selection.delete(this);
    bloomEffect.selection.add(this.star);
    //this.star.layers.enable(BLOOM_SCENE);
    this.hovertext = ahoverText
    this.nodeName = anodeName
    this.nodeDesc = anodeDesc
    this.nodeId = anodeId
    //this.requires = requires
    if (requires[0] === "-") { this.requires = [];}
    else { this.requires = requires }
    //else {this.requires = reqs.split(" ");}
    this.star.position.set(posX, posY, posZ)
    scene.add(this.star)
  }
  onPointerOver(e) {
    this.scale.set(2.0, 2.0, 2.0);
    this.star.scale.set(2.0, 2.0, 2.0);
    this.isHovered = true;
    this.nameText.position.set(this.position.x + (this.nodeSize+0.01)*(Math.sin(this.fi))*this.scale.x, this.position.y - this.centerOffset, this.position.z + (this.nodeSize + 0.01) * this.scale.z*(Math.cos(this.fi))); //The sin and cos functions correct for different points on the sphere

    document.getElementById("nodeName").textContent = this.nodeName;
    const nodeDescNode = document.getElementById("nodeDesc")
    nodeDescNode.textContent = '';
    var nodeDescSplit = this.nodeDesc.split("<D>");
    var mybr = document.createElement('br');
    for (let i = 0; i < nodeDescSplit.length; i++){
      //mybr.textContent = nodeDescSplit[i]; 
      nodeDescNode.innerText += nodeDescSplit[i];
      if(i ==  nodeDescSplit.length - 1){break;}
      nodeDescNode.appendChild(mybr);
    }

    
    document.getElementById("nodeCost").textContent = "Cost: " + this.nodeCost;
    document.getElementById("perkPoints").textContent = perkPoints;
  }

  onPointerOut(e) {
    this.scale.set(1, 1, 1);
    this.isHovered = false;
    this.star.scale.set(1, 1, 1);
    this.nameText.position.set(this.position.x + (this.nodeSize+0.01)*(Math.sin(this.fi))*this.scale.x, this.position.y - this.centerOffset, this.position.z+(this.nodeSize + 0.01) * this.scale.z*(Math.cos(this.fi)));

  }
  onClick(e) {
    function isNextActive(id){
      for (let i = 0; i < tr.nodes.length; i++) {
        for (let j = 0; j < tr.nodes[i].requires.length; j++) {
          if(tr.nodes[i].requires[j].includes("o") && tr.nodes[i].requires[0] != "o1"){
            var a = tr.nodes[i].requires[j].split("o");
            var b = 0;
            var c = false;
            for(let k=0; k < a.length; k++) {
              if (a[k] == id && tr.nodes[i].nodeActive && !(id == 1 && tr.nodes[i].nodeId < 0)) {
                c = true
              } else if (!tr.nodes[tr.nodeIDs[a[k]]].nodeActive) {
                b++
              }
            }
            if(b == a.length-1 && c){return true;};
          } else {
            if (tr.nodes[i].requires[j] == id && tr.nodes[i].nodeActive && !(id == 1 && tr.nodes[i].nodeId < 0)) {return true;};
         }
        }
      }
      return false;
    }

    function isMutExclCritMet(passedIdNum){
      var arr = tr.nodes[tr.nodeIDs[passedIdNum]].excl;
      if(arr == [] || arr == undefined){return true;}
      console.log(arr, tr.nodeIDs[passedIdNum], tr.nodes[tr.nodeIDs[passedIdNum]])
      var count = 0;
      for (let i = 2; i < arr.length; i++) { 
        if(tr.nodes[tr.nodeIDs[arr[i]]].nodeActive) {count++;}
      }
      if(count >= arr[0]){
        return false;
      } else {
        return true;
      }
    }

    if (this.nodeActive == true && !isNextActive(this.nodeId)) { this.nodeActive = false; perkPoints += Number(this.nodeCost); this.star.material = new THREE.MeshBasicMaterial({ color: 0x000000, opacity: 0.0, transparent: true, depthWrite: false}); }
    else if (perkPoints >= this.nodeCost && areReqsMet(this.requires) && isMutExclCritMet(this.nodeId) && this.nodeActive == false) { this.nodeActive = true; perkPoints -= Number(this.nodeCost); this.star.material = customMaterial; };

    document.getElementById("perkPoints").textContent = perkPoints;

    computePanCamera(camera.rotation.x, camera.rotation.y, this.theta, this.fi - Math.PI/2);

  }
  getFi() {
    return this.fi;
  }
  getTheta() {
    return this.theta;
  }
}


let intersects = []
let hovered = {}
const theFontLoader = new FontLoader();
const hellishFont = theFontLoader.parse(HelvetikerFont);

//General setup
var container = document.getElementById('canvas'); //Find div in which we put the entire thing in
var scene = new THREE.Scene(); //New scene
var scene = new THREE.Scene(); //New scene
var camera = new THREE.PerspectiveCamera(30, container.clientWidth / container.clientHeight, 0.00001, 100000); //Camera config
camera.position.set(0, 0, 0);
camera.rotation.order = "YXZ"; //VERY IMPORTANT
//camera.rotation.set(0, -Math.PI/2, 0)
const raycaster = new THREE.Raycaster() //raycaster code to enable
const mouse = new THREE.Vector2()
raycaster.setFromCamera(mouse, camera)
intersects = raycaster.intersectObjects(scene.children, true)
var clock = new THREE.Clock();
var panclock = new THREE.Clock();
var animclock = new THREE.Clock();
const stats = new Stats()
var statsShown = false
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
      if(atrs[k][0] == exclIDs[j]){ atrs[k][8] = exclIDs};
      }
    }
  }

  for (let i = 0; i < lines.length - 1; i++) {

    var fi = minKorFi + (atrs[i][4] - lowFi) * (maxKorFi - minKorFi) / fiSteps;
    var th = minKorTh + (atrs[i][5] - lowTh) * (maxKorTh - minKorTh) / thSteps;
    var iks = TREEE.sphereRadius * Math.cos(th) * Math.cos(fi);
    var igrek = TREEE.sphereRadius * Math.sin(th);
    var zet = TREEE.sphereRadius * Math.cos(th) * Math.sin(fi);

    TREEE.nodes[i] = new TreeNode(atrs[i][0], atrs[i][1], atrs[i][2], atrs[i][3], iks, igrek, zet, fi, th, atrs[i][6], atrs[i][7], atrs[i][8]);
    scene.add(TREEE.nodes[i]);
  }
  cameraRotationOffsetFromTree = - Math.PI/2


};

var tr = new Tree(-10, 10, -10, 10);


function areReqsMet(reqs) {
    for (var i = 0; i < reqs.length; i++) {
      if(reqs[i].includes("o") ){
        var a = reqs[i].split("o");
        var b = 0;
        for(let k=0; k < a.length; k++) {
          if (tr.nodes[tr.nodeIDs[a[k]]].nodeActive == false) {b++};
        }
        if(b == a.length){return false;};
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
  console.log(vec, tr.nodes[0].fi, tr.nodes[0].theta, tr.nodes[0].position);
  camera.rotation.set(vec.y, vec.x + cameraRotationOffsetFromTree, 0);
  camera.fov = iniPanCamFov;
  camera.updateProjectionMatrix();

}
sec();
console.log(tr.nodes)


var skyGeo = new THREE.SphereGeometry(100000, 25, 25);
var skyloader = new THREE.TextureLoader(),
  skytexture = skyloader.load("space.png");
var skymaterial = new THREE.MeshPhongMaterial({
  map: skytexture,
  lightMap: skytexture,
  lightMapIntensity: 5,
});
var sky = new THREE.Mesh(skyGeo, skymaterial);
sky.material.side = THREE.BackSide;
scene.add(sky);

  var lavaTexture = new THREE.TextureLoader().load('sun.jpg');
  lavaTexture.wrapS = lavaTexture.wrapT = THREE.RepeatWrapping;
  // multiplier for distortion speed 		
  var baseSpeed = 0.0001;
  // number of times to repeat texture in each direction
  var repeatS = 1.0
  var repeatT = 1.0;
  // texture used to generate "randomness", distort all other textures
  var noiseTexture = new THREE.TextureLoader().load('cloud.png');
  noiseTexture.wrapS = noiseTexture.wrapT = THREE.RepeatWrapping;
  // magnitude of noise effect
  var noiseScale = 0.9;
  
  // texture to additively blend with base image texture
  var blendTexture = new THREE.TextureLoader().load('sun.jpg');
  blendTexture.wrapS = blendTexture.wrapT = THREE.RepeatWrapping;
  // multiplier for distortion speed 
  var blendSpeed = 0.03;
  // adjust lightness/darkness of blended texture
  var blendOffset = 0.6; //Kontrast
  // texture to determine normal displacement
  var bumpTexture = noiseTexture;
  bumpTexture.wrapS = bumpTexture.wrapT = THREE.RepeatWrapping;
  // multiplier for distortion speed 		
  var bumpSpeed = 0.06;
  // magnitude of normal displacement
  var bumpScale = 0.0025;
  
  // use "this." to create global object  
  var customUniforms = {
    baseTexture: { type: "t", value: lavaTexture },
    baseSpeed: { type: "f", value: baseSpeed },
    repeatS: { type: "f", value: repeatS },
    repeatT: { type: "f", value: repeatT },
    noiseTexture: { type: "t", value: noiseTexture },
    noiseScale: { type: "f", value: noiseScale },
    blendTexture: { type: "t", value: blendTexture },
    blendSpeed: { type: "f", value: blendSpeed },
    blendOffset: { type: "f", value: blendOffset },
    bumpTexture: { type: "t", value: bumpTexture },
    bumpSpeed: { type: "f", value: bumpSpeed },
    bumpScale: { type: "f", value: bumpScale },
    alpha: { type: "f", value: 1.0 },
    time: { type: "f", value: 1.0 }
  }
  
  // create custom material from the shader code above
  //   that is within specially labeled script tags
  var customMaterial = new THREE.ShaderMaterial(
    {
      uniforms: customUniforms,
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
            // below, using uvTimeShift seems to result in more of a "rippling" effect
            //   while uvNoiseTimeShift seems to result in more of a "shivering" effect
            vec4 bumpData = texture2D( bumpTexture, uvTimeShift );
          
            // move the position along the normal
            //  but displace the vertices at the poles by the same amount
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
  customMaterial.transparent = true;
  customMaterial.opacity = 0.9;

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
composer.addPass(new RenderPass(scene, camera));
const bloomEffect = new SelectiveBloomEffect(scene, camera, {
  intensity: 2,
  mipmapBlur: true,
  luminanceThreshold: 0,
  luminanceSmoothing: 0.2,
  levels: 3,
  radius: 0.9
});
composer.addPass(new EffectPass(camera, bloomEffect));



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

//Second part of click implementation
window.addEventListener('click', (e) => {
  intersects.forEach((hit) => {
    // Call onClick
    if (hit.object.onClick) hit.object.onClick(hit)
  })
})

//Debug controls
window.addEventListener("keydown", function (event) {
  if (event.defaultPrevented) {
    return; // Do nothing if the event was already processed
  }

  switch (event.key) {
    case "ArrowDown":
      camera.rotation.x -= 0.11
      // code for "down arrow" key press.
      break;
    case "Escape":
        console.log(camera.rotation.x, camera.rotation.y, tr.nodes[0].theta, tr.nodes[0].fi)
        // code for "down arrow" key press.
        break;
    case "+":
      if (camera.fov > 2) {
        camera.fov -= 1;
        //camera.far = (1/camera.fov)*(3000*30)
        camera.updateProjectionMatrix();
      }
      if (camera.fov <= 2 && camera.fov > 0.02) {
        camera.fov -= 0.01;
        //camera.far = (1/camera.fov)*(3000*30)
        camera.updateProjectionMatrix();
      }
      break;
    case "-":
      if (camera.fov < 120 && camera.fov > 2) {
        camera.fov += 1;
        //camera.far = (1/camera.fov)*(3000*30) 
        camera.updateProjectionMatrix();
      }
      if (camera.fov < 120 && (camera.fov <= 2)) {
        camera.fov += 0.01;
        //camera.far = (1/camera.fov)*(3000*30)
        camera.updateProjectionMatrix();
      }
      break;
    case "ArrowUp":
      // code for "up arrow" key press.
      camera.rotation.x += 0.11
      break;
    case "ArrowLeft":
      camera.rotation.y += 0.11
      // code for "left arrow" key press.
      break;
    case "ArrowRight":
      camera.rotation.y -= 0.11
      // code for "right arrow" key press.
      break;
    case "Tab":

      if (statsShown == false) {
        statsShown = true;
        document.body.appendChild(stats.dom);
      }
      break;

    default:
      return; // Quit when this doesn't handle the key event.
  }

  // Cancel the default action to avoid it being handled twice
  event.preventDefault();
}, true);




function computePanCamera(iniFi, iniTh, finFi, finTh) {
  panX = iniFi;
  dPanX = finFi - iniFi;
  panY = iniTh;
  dPanY = finTh - iniTh;
  panCamFov = iniPanCamFov;
  panCamBool = true;
  panclock.start();
}

function panCamera (){
  const panTime = 1; //Pan animation time in seconds
  var panDT = panclock.getElapsedTime();
  var fac = 1.5*(Math.abs(dPanX) + Math.abs(dPanY))
  if (fac > 0.01){
  panCamFov -= fac*(panDT - panTime/2);
  camera.fov = panCamFov;
  camera.updateProjectionMatrix();}
  if(panDT >= panTime){panCamBool = false; panCamFov = iniPanCamFov; camera.updateProjectionMatrix(); panDT = panTime; panclock.stop();};
  camera.rotation.set(panX + (panDT/panTime)*dPanX, panY + (panDT/panTime)*dPanY, 0)
}

function hoverAnimation(){
  const animtime = 2;
  const animSize =
  animclock.getDelta();

}

//Main loop
function animate() {
  stats.begin();
  var delta = clock.getDelta();
  if (panCamBool == true){panCamera();}
  customUniforms.time.value += delta;
  requestAnimationFrame(animate);
  composer.render();
  stats.end();
}
animate();
//code used: https://stemkoski.github.io/Three.js/Shader-Fireball.html
//arc on sphere: https://stackoverflow.com/questions/42663182/draw-curved-line-in-three-js-from-vector3-to-vector3-on-surface-of-spheregeometr?rq=4
//https://github.com/pmndrs/postprocessing