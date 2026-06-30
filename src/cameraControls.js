import { AppState } from './appState.js';

export function computePanCamera(curX, curY, tarX, tarY) {
  // Update AppState.dPanX, AppState.dPanY, AppState.panComputeBool etc.
}

export function panCamera() {
  // Frame-by-frame pan interpolation mutating AppState.camera.rotation
}

export function computeZoomCamera(direction) {
  // Update AppState.finalZoom, AppState.initialZoom, AppState.zoomComputeBool etc.
}

export function zoomCamera() {
  // Frame-by-frame zoom manipulation using AppState.zoomclock
}

export function freeCameraMovement() {
  const speed = 0.05;
  if (AppState.keys['w'])     { AppState.freeCamera.position.z -= speed; }
  if (AppState.keys['s'])     { AppState.freeCamera.position.z += speed; }
  if (AppState.keys['a'])     { AppState.freeCamera.position.x -= speed; }
  if (AppState.keys['d'])     { AppState.freeCamera.position.x += speed; }
  if (AppState.keys[' '])     { AppState.freeCamera.position.y += speed; } 
  if (AppState.keys['Shift']) { AppState.freeCamera.position.y -= speed; } 

  // Momentum decay logic goes here...
}