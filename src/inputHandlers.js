// ============================================================
// INPUT HANDLERS
//
// Exports one function:
//   registerInputHandlers() — attaches every DOM event listener.
//                             Call once after initScene().
//
// All state is read / written through AppState.
// Camera animation functions are imported from cameraControls.js.
//
// Listeners registered here:
//   pointermove — raycasting for hover (onPointerOver / onPointerOut)
//   click       — node activation (onClick)
//   keydown     — arrow keys (AppState.keys) + special keys (=, -, Tab, 1, 2, Esc)
//   keyup       — clears AppState.keys
//   wheel       — zoom in/out
//   mousedown   — begin free-camera drag
//   mouseup     — end free-camera drag
//   mousemove   — free-camera drag rotation
//   resize      — camera aspect + renderer size
// ============================================================

import AppState from './appState.js';
import { computeZoomCamera, computePanCamera } from './cameraControls.js';


export function registerInputHandlers() {

  // ============================================================
  // POINTER MOVE — HOVER DETECTION
  // Raycasts every frame to find which objects are under the
  // pointer, then fires onPointerOver / onPointerOut as needed.
  // ============================================================
  window.addEventListener('pointermove', (e) => {
    AppState.mouse.set(
      (e.offsetX / AppState.container.clientWidth)  *  2 - 1,
      (e.offsetY / AppState.container.clientHeight) * -2 + 1
    );
    AppState.raycaster.setFromCamera(AppState.mouse, AppState.camera);
    AppState.intersects = AppState.raycaster.intersectObjects(AppState.scene.children, true);

    // Objects that were hovered last frame but aren't hit this frame → onPointerOut
    Object.keys(AppState.hovered).forEach((key) => {
      const stillHit = AppState.intersects.find(hit => hit.object.uuid === key);
      if (!stillHit) {
        const hoveredItem = AppState.hovered[key];
        if (hoveredItem.object.onPointerOut) hoveredItem.object.onPointerOut(hoveredItem);
        delete AppState.hovered[key];
      }
    });

    // Newly-hit objects → onPointerOver; all hit objects → onPointerMove
    AppState.intersects.forEach((hit) => {
      if (!AppState.hovered[hit.object.uuid]) {
        AppState.hovered[hit.object.uuid] = hit;
        if (hit.object.onPointerOver) hit.object.onPointerOver(hit);
      }
      if (hit.object.onPointerMove) hit.object.onPointerMove(hit);
    });
  });


  // ============================================================
  // CLICK — NODE ACTIVATION
  // Fires onClick on every object under the pointer.
  // ============================================================
  window.addEventListener('click', () => {
    AppState.intersects.forEach((hit) => {
      if (hit.object.onClick) hit.object.onClick(hit);
    });
  });


  // ============================================================
  // KEYDOWN
  // Two responsibilities:
  //   1. Track held keys in AppState.keys (used by freeCameraMovement
  //      and freeCameraPositionUpdate every frame).
  //   2. Handle one-shot special keys via a switch statement.
  // ============================================================
  window.addEventListener('keydown', function (e) {
    if (e.defaultPrevented) return;

    // Track the key for per-frame polling (arrow keys, WASD, Space, Shift, …)
    AppState.keys[e.key] = true;

    switch (e.key) {

      case 'Escape':
        // Debug: print camera orientation + first node angles to console
        console.log(
          AppState.camera.rotation.x,
          AppState.camera.rotation.y,
          AppState.tr.nodes[0].theta,
          AppState.tr.nodes[0].fi
        );
        break;

      case '=':
        // Zoom in — decrease FOV by one step
        if (AppState.zoomStage > 0 && !AppState.zoomCamBool && !AppState.panCamBool) {
          AppState.zoomStage   -= 1;
          AppState.zoomCamBool  = true;
          computeZoomCamera(-1);
          AppState.camera.updateProjectionMatrix();
        }
        break;

      case '-':
        // Zoom out — increase FOV by one step (max 60 steps)
        if (AppState.zoomStage < 60 && !AppState.zoomCamBool && !AppState.panCamBool) {
          AppState.zoomStage   += 1;
          AppState.zoomCamBool  = true;
          computeZoomCamera(1);
          AppState.camera.updateProjectionMatrix();
        }
        break;

      case 'Tab':
        // Toggle the Stats (FPS) performance overlay
        if (!AppState.statsShown) {
          AppState.statsShown = true;
          document.body.appendChild(AppState.stats.dom);
        }
        break;

      case '1':
        // Switch to the main skill-tree camera
        AppState.activeCamera      = AppState.camera;
        AppState.rendek.camera     = AppState.activeCamera;
        AppState.bloomEffect.camera = AppState.activeCamera;
        AppState.effectPass.camera  = AppState.activeCamera;
        console.log('Activating main camera…');
        break;

      case '2':
        // Switch to the free-fly camera
        AppState.activeCamera      = AppState.freeCamera;
        AppState.rendek.camera     = AppState.activeCamera;
        AppState.bloomEffect.camera = AppState.activeCamera;
        AppState.effectPass.camera  = AppState.activeCamera;
        console.log('Activating free camera…');
        break;

      default:
        return; // Let unhandled keys propagate normally
    }

    e.preventDefault(); // Suppress browser default for handled keys (e.g. Tab focus-shift)
  }, true);


  // ============================================================
  // KEYUP — clear AppState.keys
  // ============================================================
  window.addEventListener('keyup', (e) => {
    AppState.keys[e.key] = false;
  });


  // ============================================================
  // MOUSE WHEEL — ZOOM
  // Each wheel tick is treated as one zoom step, identical to
  // pressing = or -. Events are ignored while any animation is
  // running so one tick stays close to one step.
  // ============================================================
  window.addEventListener('wheel', function (e) {
    e.preventDefault();

    if (e.deltaY < 0) {
      // Scroll up → zoom in
      if (AppState.zoomStage > 0 && !AppState.zoomCamBool && !AppState.panCamBool) {
        AppState.zoomStage   -= 1;
        AppState.zoomCamBool  = true;
        computeZoomCamera(-1);
        AppState.camera.updateProjectionMatrix();
      }
    } else if (e.deltaY > 0) {
      // Scroll down → zoom out
      if (AppState.zoomStage < 60 && !AppState.zoomCamBool && !AppState.panCamBool) {
        AppState.zoomStage   += 1;
        AppState.zoomCamBool  = true;
        computeZoomCamera(1);
        AppState.camera.updateProjectionMatrix();
      }
    }
  }, { passive: false }); // passive: false required so preventDefault() works


  // ============================================================
  // MOUSE DRAG — FREE CAMERA ROTATION
  // While LMB is held, horizontal/vertical mouse movement yaws
  // and pitches the free camera. Pitch is clamped to ±90°.
  // ============================================================
  window.addEventListener('mousedown', () => { AppState.isMouseDown = true; });
  window.addEventListener('mouseup',   () => { AppState.isMouseDown = false; });

  window.addEventListener('mousemove', (e) => {
    if (AppState.isMouseDown) {
      const dx = e.clientX - AppState.lastMousePosition.x;
      const dy = e.clientY - AppState.lastMousePosition.y;

      AppState.freeCamera.rotation.y -= dx * 0.005;
      AppState.freeCamera.rotation.x -= dy * 0.005;
      AppState.freeCamera.rotation.x  = Math.max(
        -Math.PI / 2,
        Math.min(Math.PI / 2, AppState.freeCamera.rotation.x)
      );
    }
    AppState.lastMousePosition = { x: e.clientX, y: e.clientY };
  });


  // ============================================================
  // WINDOW RESIZE
  // Updates camera aspect ratio and renderer dimensions.
  // ============================================================
  window.addEventListener('resize', () => {
    AppState.activeCamera.aspect =
      AppState.container.clientWidth / AppState.container.clientHeight;
    AppState.activeCamera.updateProjectionMatrix();
    AppState.renderer.setSize(
      AppState.container.clientWidth,
      AppState.container.clientHeight
    );
    AppState.renderer.setPixelRatio(window.devicePixelRatio);
  });
}
