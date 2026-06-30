import * as THREE from 'three';

/**
 * Centralized Global Application State.
 * This object holds live references to core Three.js systems, camera transitions,
 * game budget mechanics, and interactive raycasting targets. Keeping this in a single
 * shared object prevents window object pollution and cross-import circular dependencies.
 */
export const AppState = {
  // Core Three.js references
  scene: null,        // The global scene graph where all meshes, lines, and lights live
  camera: null,       // Fixed outward-looking player camera used for tree navigation
  freeCamera: null,   // Independent camera allowing detached flying movement (WASD)
  activeCamera: null, // Pointer pointing to either `camera` or `freeCamera` currently rendering
  renderer: null,     // WebGL renderer instance configuring device pixel ratio and canvas sizing

  // Post-processing Pipeline (via 'postprocessing' library)
  composer: null,     // Handles rendering pass chains instead of calling renderer.render directly
  rendek: null,       // Standard base RenderPass for drawing the basic scene elements
  bloomEffect: null,  // SelectiveBloomEffect configuration that enables certain meshes to glow
  effectPass: null,   // The combined pass that layers bloom on top of the rendered scene

  // Skill Tree Core References
  tr: null,           // Live reference to the instantiated Tree management class instance
  starClasses: [],    // Registry of StarModel instances; iterated every frame to animate shaders
  perkPoints: 20,     // Player's remaining perk point budget used to unlock nodes

  /**
   * Zoom State Configuration
   * Manages smooth Field of View (FOV) interpolation transitions.
   */
  zoomStage: 0,        // Discrete step counter (0 = default view, higher = zoomed in further)
  zoomDelta: 0,        // Amount of FOV degrees to alter during the current zoom step transition
  initialZoom: 0,      // The baseline FOV right when the zoom operation was requested
  finalZoom: 0,        // The mathematical target FOV desired at the end of the interpolation
  zoomCamBool: false,  // Operational flag; true while a zoom animation is actively executing
  zoomComputeBool: false, // Internal calculation switch; triggers per-frame FOV modification
  zoomCamFov: 0,       // Intermediary working FOV variable adjusted from frame to frame
  queuedZoomOut: false,// Queued instruction to handle immediate sequential zoom requests smoothly

  /**
   * Pan (Camera Rotation) State Configuration
   * Manages smooth interpolation of spherical camera rotations when a node is chosen.
   */
  panCamBool: false,    // Operational flag; true while camera is turning toward a node
  panComputeBool: false, // Internal calculation switch; triggers per-frame rotation lerping
  panX: 0,              // Initial camera rotation.x value at the beginning of a pan transition
  panY: 0,              // Initial camera rotation.y value at the beginning of a pan transition
  dPanX: 0,             // Total displacement delta required to align rotation.x with target node
  dPanY: 0,             // Total displacement delta required to align rotation.y with target node
  panSpeed: 0,          // Reserved variable intended for implementation of variable panning velocities
  iniPanCamFov: 1,      // Stores camera FOV pre-pan; allows recovery of original zoom level post-pan
  panCamFov: 0,         // Changes dynamically during panning to create a subtle tracking/dolly effect

  /**
   * Free-Camera Momentum Mechanics
   * Handles rotational or positional drift when sliding around via external controls.
   */
  cameraAccelerationX: 0, // Accumulated rotational speed across the X-axis (pitch velocity)
  cameraAccelerationY: 0, // Accumulated rotational speed across the Y-axis (yaw velocity)

  // System Utilities and Inputs
  keys: {},            // Active key dictionary tracking currently pressed keyboard keys
  statsShown: false,   // Tracks visibility state of the Three.js performance monitoring overlay
  container: null,     // HTML DOM container node where the WebGL `<canvas>` is mounted
  stats: null,         // Live performance monitoring widget instance (FPS / frame-time tracking)

  // Independent System Clocks for Frame-Rate Independent Animations
  clock: new THREE.Clock(),     // Main system clock used to compute overall animation delta times
  panclock: new THREE.Clock(),  // Specialized isolated timer tracking elapsed durations of pan transitions
  zoomclock: new THREE.Clock(), // Specialized isolated timer tracking elapsed durations of zoom transitions

  hellishFont: null,   // Cached structure for parsed 3D text font geometries (Helvetiker Font)

  // Pointer Interaction Engine (Raycasting)
  hovered: {},         // Record dictionary tracking UUID keys of objects currently under the cursor
  intersects: []       // Array tracking all collision intersections reported by the raycaster
};
