import * as THREE from 'three';

export const AppState = {
  scene: null,
  camera: null,
  freeCamera: null,
  activeCamera: null,
  renderer: null,
  composer: null,
  rendek: null,
  bloomEffect: null,
  effectPass: null,
  
  tr: null, // Holds the Tree instance
  starClasses: [],
  perkPoints: 20,

  // Zoom State
  zoomStage: 0,
  zoomDelta: 0,
  initialZoom: 0,
  finalZoom: 0,
  zoomCamBool: false,
  zoomComputeBool: false,
  zoomCamFov: 0,
  queuedZoomOut: false,

  // Pan State
  panCamBool: false,
  panComputeBool: false,
  panX: 0,
  panY: 0,
  dPanX: 0,
  dPanY: 0,
  panSpeed: 0,
  iniPanCamFov: 1,
  panCamFov: 0,

  // Free-Camera Momentum State
  cameraAccelerationX: 0,
  cameraAccelerationY: 0,

  // Utility Objects
  keys: {},
  statsShown: false,
  container: null,
  stats: null,
  
  clock: new THREE.Clock(),
  panclock: new THREE.Clock(),
  zoomclock: new THREE.Clock(),
  
  hellishFont: null,

  // Raycaster State
  hovered: {},
  intersects: []
};