import * as THREE from 'three';
import { WebGLRenderer } from "three";
import { EffectComposer, EffectPass, RenderPass, SelectiveBloomEffect } from "postprocessing";
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import HelvetikerFont from "three/examples/fonts/helvetiker_regular.typeface.json";
import Stats from '/node_modules/three/examples/jsm/libs/stats.module.js';
import { AppState } from './appState.js';

// Layer identifier flag; layer 2 is explicitly configured for selective post processing blooming
const BLOOM_LAYER = 2;

/**
 * Configures an Object to pass through the Selective Bloom Renderer.
 * @param {THREE.Object3D} obj - Target mesh intended to receive bloom glow profiles
 */
export function addToBloom(obj) {
  obj.layers.set(BLOOM_LAYER);
  if (AppState.bloomEffect) {
    AppState.bloomEffect.selection.add(obj);
  }
}

/**
 * Initializes Core 3D Ecosystem Structures.
 * Binds canvas contexts to host DOM containers, builds primary perspective systems,
 * links lighting environments, and attaches tracking telemetry layouts.
 */
export function initScene() {
  AppState.container = document.getElementById('canvas');
  AppState.scene = new THREE.Scene();

  // Main Tree Tracking Perspective Camera
  AppState.camera = new THREE.PerspectiveCamera(30, AppState.container.clientWidth / AppState.container.clientHeight, 1, 100000);
  AppState.camera.position.set(0, 0, 0);
  AppState.camera.rotation.order = "YXZ"; // Order mapping prevents gimbal lock conditions
  AppState.camera.layers.enableAll();

  // Detached Flying Spectator Camera
  AppState.freeCamera = new THREE.PerspectiveCamera(30, AppState.container.clientWidth / AppState.container.clientHeight, 0.00001, 100000);
  AppState.freeCamera.position.set(0, 0, 0);
  AppState.freeCamera.rotation.order = "YXZ";
  AppState.freeCamera.layers.enableAll();

  // Assign initial target default camera perspective
  AppState.activeCamera = AppState.camera;

  // Decode bundled typographic configurations for 3D label builders
  const theFontLoader = new FontLoader();
  AppState.hellishFont = theFontLoader.parse(HelvetikerFont);

  // Instantiate performance monitor panels
  AppState.stats = new Stats();

  // WebGL Renderer pipeline declarations
  AppState.renderer = new WebGLRenderer({ powerPreference: "high-performance", antialias: false, stencil: false, depth: false });
  AppState.renderer.setSize(AppState.container.clientWidth, AppState.container.clientHeight);
  AppState.renderer.setPixelRatio(window.devicePixelRatio);
  AppState.renderer.outputColorSpace = THREE.SRGBColorSpace;
  AppState.container.appendChild(AppState.renderer.domElement);

  // Construct Post Processing Chain via EffectComposer
  AppState.composer = new EffectComposer(AppState.renderer);
  AppState.rendek = new RenderPass(AppState.scene, AppState.activeCamera);
  AppState.composer.addPass(AppState.rendek);

  // Isolate Selective Bloom configurations
  AppState.bloomEffect = new SelectiveBloomEffect(AppState.scene, AppState.activeCamera, {
    intensity: 2, mipmapBlur: true, luminanceThreshold: 0, luminanceSmoothing: 0.2, levels: 3, radius: 0.9, ignoreBackground: true
  });

  AppState.effectPass = new EffectPass(AppState.activeCamera, AppState.bloomEffect);
  AppState.effectPass.renderToScreen = true;
  AppState.composer.addPass(AppState.effectPass);

  // Inject fill lighting layouts
  const ambientLight = new THREE.AmbientLight(0xffffff, 1);
  AppState.scene.add(ambientLight);
  const directionalLight = new THREE.DirectionalLight(0xffffff, 2.0);
  AppState.scene.add(directionalLight);

  // Fetch decorative environment art structures
  const loader = new GLTFLoader();
  loader.load('Telescope.glb', function (gltf) {
    AppState.scene.add(gltf.scene);
    gltf.scene.scale.set(0.05, 0.05, 0.05);
    gltf.scene.position.set(0, -1, 0);
    gltf.scene.rotation.set(0, Math.PI / 2, 0);
  });
}
