import * as THREE from 'three';
import { WebGLRenderer } from "three";
import { EffectComposer, EffectPass, RenderPass, SelectiveBloomEffect } from "postprocessing";
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import HelvetikerFont from "three/examples/fonts/helvetiker_regular.typeface.json";
import Stats from '/node_modules/three/examples/jsm/libs/stats.module.js';
import { AppState } from './appState.js';
import { BLOOM_LAYER } from './constants.js';

export function addToBloom(obj) {
  obj.layers.set(BLOOM_LAYER);
  if (AppState.bloomEffect) {
      AppState.bloomEffect.selection.add(obj);
  }
}

export function initScene() {
  AppState.container = document.getElementById('canvas');
  AppState.scene = new THREE.Scene();
  
  AppState.camera = new THREE.PerspectiveCamera(30, AppState.container.clientWidth / AppState.container.clientHeight, 1, 100000);
  AppState.camera.position.set(0, 0, 0);
  AppState.camera.rotation.order = "YXZ";
  AppState.camera.layers.enableAll();

  AppState.freeCamera = new THREE.PerspectiveCamera(30, AppState.container.clientWidth / AppState.container.clientHeight, 0.00001, 100000);
  AppState.freeCamera.position.set(0, 0, 0);
  AppState.freeCamera.rotation.order = "YXZ";
  AppState.freeCamera.layers.enableAll();
  
  AppState.activeCamera = AppState.camera;

  const theFontLoader = new FontLoader();
  AppState.hellishFont = theFontLoader.parse(HelvetikerFont);

  AppState.stats = new Stats();

  // Setup Renderer and Composer
  AppState.renderer = new WebGLRenderer({ powerPreference: "high-performance", antialias: false, stencil: false, depth: false });
  AppState.renderer.setSize(AppState.container.clientWidth, AppState.container.clientHeight);
  AppState.renderer.setPixelRatio(window.devicePixelRatio);
  AppState.renderer.outputColorSpace = THREE.SRGBColorSpace;
  AppState.container.appendChild(AppState.renderer.domElement);

  AppState.composer = new EffectComposer(AppState.renderer);
  AppState.rendek = new RenderPass(AppState.scene, AppState.activeCamera);
  AppState.composer.addPass(AppState.rendek);

  AppState.bloomEffect = new SelectiveBloomEffect(AppState.scene, AppState.activeCamera, {
    intensity: 2, mipmapBlur: true, luminanceThreshold: 0, luminanceSmoothing: 0.2, levels: 3, radius: 0.9, ignoreBackground: true
  });

  AppState.effectPass = new EffectPass(AppState.activeCamera, AppState.bloomEffect);
  AppState.effectPass.renderToScreen = true;
  AppState.composer.addPass(AppState.effectPass);

  // Setup Lights
  const ambientLight = new THREE.AmbientLight(0xffffff, 1);
  AppState.scene.add(ambientLight);
  const directionalLight = new THREE.DirectionalLight(0xffffff, 2.0);
  AppState.scene.add(directionalLight);

  // Setup GLTF Model
  const loader = new GLTFLoader();
  loader.load('Telescope.glb', function (gltf) {
    AppState.scene.add(gltf.scene);
    gltf.scene.scale.set(0.05, 0.05, 0.05);
    gltf.scene.position.set(0, -1, 0);
    gltf.scene.rotation.set(0, Math.PI / 2, 0);
  });
}