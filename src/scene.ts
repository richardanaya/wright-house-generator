import {
  ACESFilmicToneMapping,
  AmbientLight,
  BackSide,
  Color,
  DirectionalLight,
  FogExp2,
  OrthographicCamera,
  HemisphereLight,
  Mesh,
  Object3D,
  PCFSoftShadowMap,
  PerspectiveCamera,
  PMREMGenerator,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildHouse } from './geometry/build';
import { buildLandscape } from './landscape';
import { createPalette, disposePalette, setAnisotropy, type Palette } from './materials';
import type { HousePlan } from './types';

export interface HouseView {
  show(plan: HousePlan, frame: boolean): void;
  dispose(): void;
}

export function createView(canvas: HTMLCanvasElement): HouseView {
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFSoftShadowMap;

  const scene = new Scene();
  scene.background = new Color('#d5e0e4');
  scene.fog = new FogExp2('#d7e0dc', 0.0065);

  const camera = new PerspectiveCamera(36, 1, 0.2, 1600);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.minDistance = 12;
  controls.maxDistance = 220;
  controls.target.set(0, 5, 0);

  const hemi = new HemisphereLight('#d5e4f2', '#8d7a62', 0.72);
  scene.add(hemi);
  const ambient = new AmbientLight('#fff4e8', 0.18);
  scene.add(ambient);
  const sun = new DirectionalLight('#fff1dd', 2.35);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.00025;
  sun.shadow.normalBias = 0.035;
  scene.add(sun);
  scene.add(sun.target);
  const fill = new DirectionalLight('#ffd9b8', 0.38);
  scene.add(fill);

  const sky = new Mesh(new SphereGeometry(900, 32, 20), skyMaterial());
  sky.frustumCulled = false;
  scene.add(sky);

  const pmrem = new PMREMGenerator(renderer);
  const envScene = new Scene();
  envScene.add(new HemisphereLight('#c9daf0', '#b9a48a', 1));
  const envSky = new Mesh(
    new SphereGeometry(20, 16, 12),
    new ShaderMaterial({
      side: BackSide,
      depthWrite: false,
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'varying vec3 vP; void main(){ float h = normalize(vP).y; vec3 c = mix(vec3(0.90,0.82,0.72), vec3(0.55,0.68,0.78), smoothstep(-0.2,0.6,h)); gl_FragColor = vec4(c,1.0); }',
    }),
  );
  envScene.add(envSky);
  scene.environment = pmrem.fromScene(envScene, 0.04).texture;

  let house: Object3D | null = null;
  let landscape: Object3D | null = null;
  let palette: Palette | null = null;
  let framed = false;

  const resize = () => {
    const width = canvas.clientWidth;
    const height = Math.max(1, canvas.clientHeight);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
  };
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  resize();

  let running = true;
  const tick = () => {
    if (!running) return;
    controls.update();
    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  };
  tick();

  return {
    show(plan, frame) {
      if (house) {
        scene.remove(house);
        disposeObject(house);
      }
      if (landscape) {
        scene.remove(landscape);
        disposeObject(landscape);
      }
      if (palette) disposePalette(palette);
      palette = createPalette(plan.seed, plan.style);
      setAnisotropy(palette, renderer.capabilities.getMaxAnisotropy());
      house = buildHouse(plan, palette);
      landscape = buildLandscape(plan, palette);
      scene.add(landscape);
      scene.add(house);
      if (frame || !framed) {
        frameCamera(camera, controls, sun, fill, plan);
        framed = true;
      }
      window.__HOUSE__ = { seed: plan.seed, style: plan.style, planType: plan.planType };
    },
    dispose() {
      running = false;
      observer.disconnect();
      controls.dispose();
      renderer.dispose();
    },
  };
}

function frameCamera(
  camera: PerspectiveCamera,
  controls: OrbitControls,
  sun: DirectionalLight,
  fill: DirectionalLight,
  plan: HousePlan,
): void {
  const terrace = plan.terraces[0];
  const living = plan.volumes.find((volume) => volume.role === 'living');
  const anchor = terrace ?? living;
  const dir = new Vector3(0.8, 0, 1);
  if (anchor) dir.set(anchor.x + anchor.w / 2, 0, anchor.z + anchor.d / 2);
  if (dir.lengthSq() < 1) dir.set(1, 0, 1);
  dir.normalize();
  const span = Math.max(plan.plinth.w, plan.plinth.d);
  const dist = span * 0.78 + 24;
  const look = new Vector3(0, plan.style === 'prairie' ? 6.2 : 4.2, 0);
  camera.position.set(dir.x * dist, span * 0.22 + 16, dir.z * dist);
  controls.target.copy(look);
  controls.update();

  const toCam = camera.position.clone().sub(look).normalize();
  const right = new Vector3().crossVectors(toCam, new Vector3(0, 1, 0)).normalize();
  sun.position.copy(look).add(toCam.clone().multiplyScalar(12)).add(right.clone().multiplyScalar(-42)).add(new Vector3(0, 30, 0));
  sun.target.position.copy(look);
  sun.target.updateMatrixWorld();
  fill.position.copy(look).add(toCam.clone().multiplyScalar(20)).add(right.multiplyScalar(28)).add(new Vector3(0, 12, 0));

  const radius = span * 0.65 + 18;
  const shadow = sun.shadow.camera as OrthographicCamera;
  shadow.left = -radius;
  shadow.right = radius;
  shadow.top = radius;
  shadow.bottom = -radius;
  shadow.near = 1;
  shadow.far = 180;
  shadow.updateProjectionMatrix();
}

function skyMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    side: BackSide,
    depthWrite: false,
    fog: false,
    vertexShader: `
      varying vec3 vWorld;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: `
      varying vec3 vWorld;
      void main() {
        float h = normalize(vWorld).y;
        vec3 zenith = vec3(0.55, 0.69, 0.80);
        vec3 horizon = vec3(0.90, 0.84, 0.74);
        vec3 earth = vec3(0.73, 0.78, 0.70);
        vec3 color = mix(earth, horizon, smoothstep(-0.08, 0.06, h));
        color = mix(color, zenith, smoothstep(0.02, 0.55, h));
        gl_FragColor = vec4(color, 1.0);
      }
    `,
  });
}

function disposeObject(object: Object3D): void {
  object.traverse((child) => {
    if (child instanceof Mesh) {
      child.geometry.dispose();
      const material = child.material;
      if (Array.isArray(material)) material.forEach((item) => item.dispose());
    }
  });
}

declare global {
  interface Window {
    __HOUSE__?: { seed: number; style: string; planType: string };
  }
}
