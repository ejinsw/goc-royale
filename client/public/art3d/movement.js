import * as THREE from 'three';
import { GLTFLoader } from './vendor/GLTFLoader.js';
import { OrbitControls } from './vendor/OrbitControls.js';

const byId = (id) => document.getElementById(id);
const canvas = byId('stage');
const modelUrl = new URL('./brandon-v4/brandon-rig.glb', import.meta.url);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#e6e3dc');
const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 100);
const orbit = new OrbitControls(camera, canvas);
orbit.enableDamping = true;
orbit.dampingFactor = 0.09;
orbit.maxPolarAngle = Math.PI * 0.49;
orbit.enablePan = false;
scene.add(new THREE.HemisphereLight('#fff7e9', '#718497', 2.1));
const key = new THREE.DirectionalLight('#fff6e5', 2.7);
key.position.set(-3, 6, 5);
key.castShadow = true;
key.shadow.mapSize.set(1024, 1024);
key.shadow.bias = -0.0002;
key.shadow.normalBias = 0.025;
scene.add(key, key.target);
const fill = new THREE.DirectionalLight('#d8e4f4', 1.2);
fill.position.set(3, 3, -4);
scene.add(fill);

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(1, 1),
  new THREE.MeshStandardMaterial({ color: '#e2dfd8', roughness: 0.95 }),
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

let model;
let mixer;
let activeAction;
let skeletonHelper;
let clips = [];
let paused = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let currentView = 'front';
let height = 2;
let width = 1;
let frameRequest;
let lastFrame = performance.now();
let previousWidth = 0;
let previousHeight = 0;
let disposed = false;

function setStatus(text, kind = '') {
  byId('status').textContent = text;
  byId('status').dataset.kind = kind;
}

function showNotice(title, detail, retry = false) {
  byId('notice').hidden = false;
  byId('notice').dataset.kind = retry ? 'error' : '';
  byId('notice-title').textContent = title;
  byId('notice-detail').textContent = detail;
  byId('retry').hidden = !retry;
}

function setView(view) {
  currentView = view;
  const verticalFov = THREE.MathUtils.degToRad(camera.fov);
  const framing = Math.max(height * 0.65, width * 0.62 / camera.aspect);
  const distance = framing / Math.tan(verticalFov / 2);
  const directions = {
    front: new THREE.Vector3(0, 0.05, 1),
    side: new THREE.Vector3(1, 0.05, 0),
    game: new THREE.Vector3(0.45, 1.1, 0.8),
  };
  orbit.target.set(0, height * 0.5, 0);
  camera.position.copy(orbit.target).addScaledVector(directions[view].normalize(), distance);
  camera.lookAt(orbit.target);
  orbit.minDistance = height * 0.6;
  orbit.maxDistance = Math.max(height * 8, distance * 1.5);
  orbit.update();
  byId('view-label').textContent = view === 'game' ? 'Game view · inspection angle' : `${view} view`;
  document.querySelectorAll('[data-view]').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.view === view));
  });
}

function updatePlaybackControls() {
  const playable = Boolean(activeAction && activeAction.getClip().duration > 0);
  byId('play-pause').disabled = !playable;
  byId('restart').disabled = !playable;
  byId('timeline').disabled = !playable;
  byId('speed').disabled = !playable;
  byId('play-pause').textContent = paused ? 'Play' : 'Pause';
  byId('play-pause').setAttribute('aria-label', paused ? 'Play animation' : 'Pause animation');
}

function updateTimeline() {
  const duration = activeAction?.getClip().duration || 0;
  const time = Math.min(activeAction?.time || 0, duration);
  byId('timeline').value = String(time);
  byId('time').textContent = `${time.toFixed(2)} / ${duration.toFixed(2)} s`;
  byId('timeline').setAttribute('aria-valuetext', `${time.toFixed(2)} seconds of ${duration.toFixed(2)} seconds`);
}

function playClip(index) {
  const clip = clips[index];
  if (!clip || !mixer) return;
  mixer.stopAllAction();
  activeAction = mixer.clipAction(clip);
  activeAction.reset().setEffectiveTimeScale(1).setEffectiveWeight(1);
  activeAction.setLoop(THREE.LoopRepeat, Infinity).play();
  mixer.update(0);
  byId('timeline').max = String(clip.duration || 1);
  updatePlaybackControls();
  updateTimeline();
}

function seek(time) {
  if (!activeAction || !mixer) return;
  const duration = activeAction.getClip().duration;
  activeAction.time = Math.max(0, Math.min(time, Math.max(0, duration - 0.000001)));
  mixer.update(0);
  updateTimeline();
}

function setMetrics(metrics) {
  const list = byId('metrics');
  list.replaceChildren();
  for (const [label, value] of metrics) {
    const term = document.createElement('dt');
    const description = document.createElement('dd');
    term.textContent = label;
    description.textContent = String(value);
    list.append(term, description);
  }
  list.hidden = false;
}

async function loadModel() {
  setStatus('Loading model…');
  showNotice('Opening movement study', 'Loading Brandon’s model and available animation clips.');
  try {
    const gltf = await new GLTFLoader().loadAsync(modelUrl.href);
    if (disposed) return;
    model = gltf.scene;
    model.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(model);
    if (bounds.isEmpty()) throw new Error('The model contains no visible geometry.');
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    height = Math.max(size.y, 0.1);
    width = Math.max(size.x, size.z, height * 0.4);
    const wrapper = new THREE.Group();
    wrapper.position.set(-center.x, -bounds.min.y, -center.z);
    wrapper.add(model);
    scene.add(wrapper);

    let triangles = 0;
    let skins = 0;
    const bones = new Set();
    model.traverse((object) => {
      if (object.isMesh) {
        object.castShadow = true;
        object.receiveShadow = true;
        triangles += (object.geometry.index?.count || object.geometry.attributes.position?.count || 0) / 3;
      }
      if (object.isSkinnedMesh) {
        skins += 1;
        object.skeleton.bones.forEach((bone) => bones.add(bone));
        // Use animated geometry instead of a rest-pose bounding volume for visibility.
        object.frustumCulled = false;
      }
    });
    wrapper.updateMatrixWorld(true);
    skeletonHelper = new THREE.SkeletonHelper(model);
    skeletonHelper.visible = false;
    skeletonHelper.material.depthTest = false;
    skeletonHelper.material.depthWrite = false;
    skeletonHelper.renderOrder = 10;
    scene.add(skeletonHelper);
    byId('skeleton').disabled = bones.size === 0;

    ground.scale.setScalar(height * 30);
    ground.position.y = -height * 0.004;
    key.position.set(-height * 1.5, height * 3, height * 2.5);
    key.target.position.set(0, height * 0.5, 0);
    Object.assign(key.shadow.camera, {
      left: -height * 2, right: height * 2, top: height * 2,
      bottom: -height * 2, near: 0.01, far: height * 12,
    });
    key.shadow.camera.updateProjectionMatrix();
    camera.near = Math.max(0.001, height / 200);
    camera.far = height * 80;
    camera.updateProjectionMatrix();

    const rank = (name) => name === 'joint_demo' ? 0 : name === 'idle' ? 1 : 2;
    clips = [...gltf.animations].sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name));
    const clipSelect = byId('clip');
    clipSelect.replaceChildren();
    clips.forEach((clip, index) => {
      const option = document.createElement('option');
      option.value = String(index);
      option.textContent = (clip.name || `Clip ${index + 1}`).replaceAll('_', ' ');
      clipSelect.append(option);
    });
    clipSelect.disabled = clips.length === 0;
    if (clips.length) {
      mixer = new THREE.AnimationMixer(model);
      playClip(0);
    } else {
      clipSelect.append(new Option('No clips in this model', ''));
      updatePlaybackControls();
    }
    setMetrics([
      ['Triangles', Math.round(triangles).toLocaleString()],
      ['Skeleton bones', bones.size],
      ['Skinned meshes', skins],
      ['Available clips', clips.length],
    ]);
    byId('notice').hidden = true;
    setStatus(clips.length
      ? `${skins ? 'Skinned model' : 'Model'} loaded · movement review available.`
      : 'Model loaded without animation clips. You can still orbit and inspect it.');
    resize();
    setView(currentView || 'front');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    showNotice('Movement model unavailable', `The Brandon v4 study could not be opened. ${message}`, true);
    setStatus('Model could not load. Use Try again after the study is available.', 'error');
    byId('clip').replaceChildren(new Option('Model unavailable', ''));
    console.error('Movement study:', error);
  }
}

function resize() {
  const widthPx = Math.max(1, canvas.clientWidth);
  const heightPx = Math.max(1, canvas.clientHeight);
  if (widthPx === previousWidth && heightPx === previousHeight) return;
  previousWidth = widthPx;
  previousHeight = heightPx;
  renderer.setSize(widthPx, heightPx, false);
  camera.aspect = widthPx / heightPx;
  camera.updateProjectionMatrix();
  if (currentView) setView(currentView);
}

byId('retry').addEventListener('click', () => location.reload());
byId('clip').addEventListener('change', (event) => playClip(Number(event.target.value)));
byId('play-pause').addEventListener('click', () => {
  paused = !paused;
  updatePlaybackControls();
});
byId('restart').addEventListener('click', () => seek(0));
byId('timeline').addEventListener('input', (event) => {
  paused = true;
  seek(Number(event.target.value));
  updatePlaybackControls();
});
byId('skeleton').addEventListener('change', (event) => {
  if (skeletonHelper) skeletonHelper.visible = event.target.checked;
});
document.querySelectorAll('[data-view]').forEach((button) => {
  button.addEventListener('click', () => setView(button.dataset.view));
});
orbit.addEventListener('start', () => {
  currentView = null;
  byId('view-label').textContent = 'Free orbit';
  document.querySelectorAll('[data-view]').forEach((button) => button.setAttribute('aria-pressed', 'false'));
});
canvas.addEventListener('keydown', (event) => {
  if (event.code === 'Space' && activeAction && !event.repeat) {
    event.preventDefault();
    paused = !paused;
    updatePlaybackControls();
  }
});
canvas.addEventListener('webglcontextlost', (event) => {
  event.preventDefault();
  paused = true;
  updatePlaybackControls();
  showNotice('Graphics interrupted', 'The browser lost its graphics context. Reload the study to continue.', true);
  setStatus('Graphics unavailable. Reload to continue.', 'error');
});
document.addEventListener('visibilitychange', () => { lastFrame = performance.now(); });

function frame(now) {
  if (disposed) return;
  frameRequest = requestAnimationFrame(frame);
  const delta = Math.min((now - lastFrame) / 1000, 0.05);
  lastFrame = now;
  resize();
  if (mixer && !paused && !document.hidden) {
    mixer.update(delta * Number(byId('speed').value));
    updateTimeline();
  }
  orbit.update();
  renderer.render(scene, camera);
}

window.addEventListener('pagehide', (event) => {
  if (event.persisted) return;
  disposed = true;
  cancelAnimationFrame(frameRequest);
  orbit.dispose();
  mixer?.stopAllAction();
  if (model) mixer?.uncacheRoot(model);
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();
  scene.traverse((object) => {
    if (object.geometry) geometries.add(object.geometry);
    if (object.material) {
      (Array.isArray(object.material) ? object.material : [object.material]).forEach((material) => materials.add(material));
    }
  });
  materials.forEach((material) => {
    Object.values(material).forEach((value) => { if (value?.isTexture) textures.add(value); });
    material.dispose();
  });
  textures.forEach((texture) => texture.dispose());
  geometries.forEach((geometry) => geometry.dispose());
  renderer.dispose();
});

resize();
updatePlaybackControls();
frameRequest = requestAnimationFrame(frame);
await loadModel();
