import { AppState } from './appState.js';

/**
 * Camera Navigation Physics Engine.
 * Manages calculations for pan transitions, linear zoom interpolation (Field of View shifts),
 * and WASD/arrow keys translation physics for separate exploration viewports.
 */

/**
 * Sets target destination angles and saves the pre-pan FOV configuration.
 */
export function computePanCamera(curX, curY, tarX, tarY) {
  AppState.panX = curX;
  AppState.panY = curY;
  AppState.dPanX = tarX - curX;
  AppState.dPanY = tarY - curY;
  AppState.iniPanCamFov = AppState.camera.fov;
  AppState.panComputeBool = true;
  AppState.panclock.start();
}

/**
 * Interpolates camera angles smoothly frame by frame using an internal clock.
 * Employs a tracking formula to adjust the view fields during transitions.
 */
export function panCamera() {
  const panDuration = 0.5; // Smooth camera adjustment duration set to half a second
  let panDT = AppState.panclock.getElapsedTime();

  // Simple linear ratio multiplier mapping duration segments
  let progress = panDT / panDuration;

  if (progress >= 1.0) {
    progress = 1.0;
    AppState.panComputeBool = false;
    AppState.panclock.stop();
    AppState.panCamBool = false;
    AppState.camera.fov = AppState.iniPanCamFov; // Restore previous zoom levels
  }

  // Adjust camera spherical rotation channels directly
  AppState.camera.rotation.x = AppState.panX + AppState.dPanX * progress;
  AppState.camera.rotation.y = AppState.panY + AppState.dPanY * progress;

  // Compute parabolic lens modifications to simulate a professional tracking/dolly zoom effect
  AppState.camera.fov = AppState.iniPanCamFov + 5.0 * sin(progress * Math.PI);
  AppState.camera.updateProjectionMatrix();
}

/**
 * Formulates target boundaries resolving upcoming zoom requests.
 * @param {number} direction - Input modifier context value (-1 updates zooming in, 1 updates zooming out)
 */
export function computeZoomCamera(direction) {
  AppState.initialZoom = AppState.camera.fov;
  AppState.zoomDelta = direction * 5.0;
  AppState.finalZoom = AppState.initialZoom + AppState.zoomDelta;
  AppState.zoomComputeBool = true;
  AppState.zoomclock.start();
}

/**
 * Progresses field adjustments sequentially based on active step clocks.
 */
export function zoomCamera() {
  const zoomTime = 0.05; // Quick zoom transitions taking exactly 50 milliseconds
  let zoomDT = AppState.zoomclock.getElapsedTime();

  AppState.zoomCamFov = AppState.initialZoom + (AppState.zoomDelta / zoomTime) * zoomDT;
  AppState.camera.fov = AppState.zoomCamFov;
  AppState.camera.updateProjectionMatrix();

  if (zoomDT >= zoomTime) {
    AppState.zoomComputeBool = false;
    AppState.camera.fov = AppState.finalZoom;
    AppState.camera.updateProjectionMatrix();
    AppState.zoomclock.stop();
    AppState.zoomCamBool = false;
  }
}

/**
 * Handles independent WASD spatial tracking controls for detached viewports.
 * Computes fluid deceleration mechanics when manual direction keys are cleared.
 */
export function freeCameraMovement() {
  const speed = 0.05; // Core translation step distance

  // Directly manipulate alternate camera structures inside the global state
  if (AppState.keys['w'])     { AppState.freeCamera.position.z -= speed; }
  if (AppState.keys['s'])     { AppState.freeCamera.position.z += speed; }
  if (AppState.keys['a'])     { AppState.freeCamera.position.x -= speed; }
  if (AppState.keys['d'])     { AppState.freeCamera.position.x += speed; }
  if (AppState.keys[' '])     { AppState.freeCamera.position.y += speed; }  // Move up
  if (AppState.keys['Shift']) { AppState.freeCamera.position.y -= speed; }  // Move down

  // Decay momentum logic loop
  AppState.cameraAccelerationX *= 0.92;
  AppState.cameraAccelerationY *= 0.92;
}
