import { AppState } from './appState.js';
import { computeZoomCamera } from './cameraControls.js';

/**
 * Global User Input Bridge.
 * Binds browser window event targets directly to properties inside AppState, converting
 * key taps, scrolling, and cursor tracking metrics into application actions.
 */

window.addEventListener('keydown', (event) => {
  AppState.keys[event.key] = true;

  switch (event.key) {
    case "Escape":
      // Diagnostics interface printing system matrices out to logs
      console.log("Diagnostic Log Coordinates:", AppState.camera.rotation.x, AppState.camera.rotation.y);
      break;

    case "=":
      // Step tracking values downwards to increase lens depth profiles
      if (AppState.zoomStage > 0 && !AppState.zoomCamBool && !AppState.panCamBool) {
        AppState.zoomCamBool = true;
        AppState.zoomStage -= 1;
        computeZoomCamera(-1);
      }
      break;

    case "-":
      // Step tracking values upwards to pull lens view fields wide
      if (AppState.zoomStage < 60 && !AppState.zoomCamBool && !AppState.panCamBool) {
        AppState.zoomCamBool = true;
        AppState.zoomStage += 1;
        computeZoomCamera(1);
      }
      break;

    case "Tab":
      // Swap operational monitoring widget visibility settings on the HUD
      AppState.statsShown = !AppState.statsShown;
      if (AppState.statsShown) {
        document.body.appendChild(AppState.stats.dom);
      } else {
        AppState.stats.dom.remove();
      }
      break;
  }
});

window.addEventListener('keyup', (event) => {
  if (event.key in AppState.keys) {
    AppState.keys[event.key] = false;
  }
});

window.addEventListener("wheel", function (event) {
  event.preventDefault(); // Lock core page scroll defaults

  if (event.deltaY < 0) {
    // Scroll Up actions trigger deep magnification pipelines
    if (AppState.zoomStage > 0 && !AppState.zoomCamBool && !AppState.panCamBool) {
      AppState.zoomCamBool = true;
      AppState.zoomStage -= 1;
      computeZoomCamera(-1);
    }
  } else if (event.deltaY > 0) {
    // Scroll Down actions widen peripheral perspectives
    if (AppState.zoomStage < 60 && !AppState.zoomCamBool && !AppState.panCamBool) {
      AppState.zoomCamBool = true;
      AppState.zoomStage += 1;
      computeZoomCamera(1);
    }
  }
}, { passive: false }); // Explicitly mark non-passive to allow calling preventDefault()

// Additional Raycaster collision logic blocks should be placed here
