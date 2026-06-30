import { AppState } from './appState.js';
import { computeZoomCamera } from './cameraControls.js';

window.addEventListener('keydown', (event) => {
  AppState.keys[event.key] = true;
  // ... switch statements parsing hotkeys (+/-/Escape/1/2/Tab) updating AppState fields ...
});

window.addEventListener('keyup', (event) => {
  if (event.key in AppState.keys) {
      AppState.keys[event.key] = false;
  }
});

window.addEventListener("wheel", function (event) {
  event.preventDefault();
  // ... zoom logic updating AppState.zoomStage and calling computeZoomCamera() ...
});

// Implement pointerMove, onClick raycasting here, leveraging AppState.intersects and AppState.hovered