import './style.css';
import { AppState } from './appState.js';
import { initScene } from './sceneSetup.js';
import { treeGen } from './Tree.js';
import { panCamera, zoomCamera, freeCameraMovement } from './cameraControls.js';
import './inputHandlers.js'; // Running purely for side-effects (attaching listeners)

initScene();
treeGen();

function animate() {
  if (AppState.statsShown) AppState.stats.begin();
  
  var delta = AppState.clock.getDelta();

  if (AppState.panComputeBool == true) { 
      panCamera(); 
  }
  
  if (AppState.queuedZoomOut == true && AppState.zoomComputeBool == false) {
     // Run queued zoom outs
  }

  if (AppState.zoomComputeBool == true) { 
      zoomCamera(); 
  }

  freeCameraMovement();

  for (let i = 0; i < AppState.starClasses.length; i++) {
    if (AppState.starClasses[i].isModelReady()) {
      AppState.starClasses[i].customUniforms.time.value += delta;
    }
  }

  requestAnimationFrame(animate); 
  AppState.composer.render();              
  if (AppState.statsShown) AppState.stats.end();                    
}

animate();