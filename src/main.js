import './style.css';
import { AppState } from './appState.js';
import { initScene } from './sceneSetup.js';
import { treeGen } from './Tree.js';
import { panCamera, zoomCamera, freeCameraMovement } from './cameraControls.js';
import './inputHandlers.js'; // Running purely for side-effects (attaching listeners)

/**
 * Application Entry Initialization Point.
 * Sets up core system components, kicks off asynchronous tree map construction,
 * and boots up the frame-synchronized game loop engine.
 */

// Initialize primary components and map structural tree paths
initScene();
treeGen();

/**
 * Frame-Synchronized Animation Engine Loop.
 * Handles performance monitoring cycles, advances calculation clocks, dispatches
 * camera updates, shifts shader parameters, and passes image compositions to the screen.
 */
function animate() {
  // Capture performance markers if logging overlays are visible
  if (AppState.statsShown && AppState.stats) AppState.stats.begin();

  // Calculate elapsed time segments since the previous frame execution
  let delta = AppState.clock.getDelta();

  // Operational Router for Camera Panning Lerps
  if (AppState.panComputeBool === true) {
    panCamera();
  }

  // Operational Router for Zoom Interpolation Sequences
  if (AppState.zoomComputeBool === true) {
    zoomCamera();
  }

  // Evaluate flying spectator translation shifts and apply physics momentum curves
  freeCameraMovement();

  // Progress internal time uniforms across active shaders to update star surface animations
  for (let i = 0; i < AppState.starClasses.length; i++) {
    if (AppState.starClasses[i].isModelReady()) {
      AppState.starClasses[i].customUniforms.time.value += delta;
    }
  }

  // Queue upcoming animation ticks aligned with monitor refresh rates
  requestAnimationFrame(animate);

  // Render full graphic compositions through the active post-processing pipeline
  AppState.composer.render();

  // Conclude telemetry measurements for the processed frame execution
  if (AppState.statsShown && AppState.stats) AppState.stats.end();
}

// Fire off the processing cycle loop
animate();
