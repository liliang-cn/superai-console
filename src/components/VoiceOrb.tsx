import { useEffect, useRef } from "react";
import * as THREE from "three";

// The shape that listens.
//
// An icosahedron displaced along its own normals by layered noise: loud makes
// it larger and spikier, quiet lets it settle back to a sphere that is still
// moving. The breathing is not decoration — a shape that goes perfectly still
// when nobody is speaking reads as a crash, and this panel's whole job is to
// say the microphone is open.
//
// Two inputs, and they are kept apart. `level` is the microphone and drives
// amplitude; `activity` is the agent working and drives colour and spin. So
// the orb says two things at once without either being able to fake the
// other: it swells when you speak, and it burns when SuperAI is thinking.

const VERT = /* glsl */ `
uniform float uTime;
uniform float uLevel;
varying float vDisp;
varying vec3 vNormal;

// Classic simplex-ish value noise. Cheap, and this is one mesh.
vec3 mod289(vec3 x){ return x - floor(x * (1.0/289.0)) * 289.0; }
vec4 mod289(vec4 x){ return x - floor(x * (1.0/289.0)) * 289.0; }
vec4 permute(vec4 x){ return mod289(((x*34.0)+1.0)*x); }
vec4 taylorInvSqrt(vec4 r){ return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v){
  const vec2 C = vec2(1.0/6.0, 1.0/3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i  = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(
             i.z + vec4(0.0, i1.z, i2.z, 1.0))
           + i.y + vec4(0.0, i1.y, i2.y, 1.0))
           + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}

void main() {
  // The floor is what makes it breathe: even at zero input the surface is
  // still moving, slowly, so an open microphone never looks like a frozen
  // frame. Everything above the floor is the voice.
  float breath = 0.5 + 0.5 * sin(uTime * 0.9);
  float amp = 0.055 + breath * 0.035 + uLevel * 0.45;
  // Two octaves: a slow swell and a fast ripple that only shows when loud.
  float n = snoise(normal * 1.6 + uTime * 0.28) * 0.7
          + snoise(normal * 4.1 - uTime * 0.55) * 0.3 * (0.25 + uLevel);
  vDisp = n;
  vNormal = normalize(normalMatrix * normal);
  vec3 p = position + normal * n * amp;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
`;

const FRAG = /* glsl */ `
uniform vec3 uCold;
uniform vec3 uHot;
uniform float uActivity;
varying float vDisp;
varying vec3 vNormal;

void main() {
  // Rim light, so the thing reads as a volume against a black page rather
  // than as a flat disc.
  float rim = pow(1.0 - abs(dot(normalize(vNormal), vec3(0.0, 0.0, 1.0))), 2.2);
  vec3 base = mix(uCold, uHot, clamp(uActivity, 0.0, 1.0));
  float ridge = smoothstep(-0.2, 0.9, vDisp);
  vec3 c = base * (0.34 + ridge * 0.85) + base * rim * 1.9;
  gl_FragColor = vec4(c, 0.5 + rim * 0.5);
}
`;

export default function VoiceOrb({
  level,
  activity,
}: {
  /** 0..1 microphone loudness, read every frame. */
  level: () => number;
  /** 0..1 how hard the agent is working. */
  activity: number;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  // Read through a ref inside the render loop: three.js runs on rAF and must
  // not be re-created every time this number changes.
  const activityRef = useRef(activity);
  activityRef.current = activity;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    // Distance is set from the aspect in resize(), not fixed here: the panel
    // this sits in is taller than it is wide, and a camera placed for a square
    // cuts the sphere off at both sides.

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    // setSize's third argument is `updateStyle`, and resize() passes false so
    // the drawing buffer can be sized independently of the layout. That means
    // nothing sets the element's CSS size, and a canvas with none lays out at
    // its buffer's pixel count — which overflows its container. These two
    // lines are what keep it inside the panel.
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.display = "block";
    host.appendChild(renderer.domElement);

    const uniforms = {
      uTime: { value: 0 },
      uLevel: { value: 0 },
      uActivity: { value: 0 },
      uCold: { value: new THREE.Color("#5b8398") },
      uHot: { value: new THREE.Color("#7fe3d0") },
    };

    const mesh = new THREE.Mesh(
      // Detail 5 is where the displacement stops looking faceted. Higher costs
      // vertices for a difference nobody can see at this size.
      new THREE.IcosahedronGeometry(1, 5),
      new THREE.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        uniforms,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    scene.add(mesh);

    // A wireframe twin, a touch larger, so the silhouette has an edge. One
    // draw call, and it is what keeps the orb from reading as fog.
    const cage = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1.015, 3),
      new THREE.MeshBasicMaterial({
        color: 0x35505e,
        wireframe: true,
        transparent: true,
        opacity: 0.28,
      }),
    );
    scene.add(cage);

    // The widest the mesh gets: radius 1, plus the displacement ceiling, plus
    // the cage outside it, plus a margin so the rim glow is not clipped.
    const REACH = 1.45;
    const HALF_FOV = Math.tan((45 / 2) * (Math.PI / 180));

    const resize = () => {
      const { clientWidth: w, clientHeight: h } = host;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      const aspect = w / h;
      camera.aspect = aspect;
      // Fit the smaller dimension: vertically the half-angle is HALF_FOV, and
      // horizontally it is HALF_FOV * aspect, so a portrait panel needs the
      // camera further back than a square one.
      camera.position.z = REACH / (HALF_FOV * Math.min(1, aspect));
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(host);
    resize();

    const clock = new THREE.Clock();
    let raf = 0;
    const loop = () => {
      const t = clock.getElapsedTime();
      uniforms.uTime.value = t;
      uniforms.uLevel.value = level();
      // Ease towards the target so a burst of tool calls does not strobe.
      uniforms.uActivity.value += (activityRef.current - uniforms.uActivity.value) * 0.05;
      const spin = 0.05 + uniforms.uActivity.value * 0.35;
      mesh.rotation.y += spin * 0.01;
      mesh.rotation.x = Math.sin(t * 0.2) * 0.15;
      cage.rotation.copy(mesh.rotation);
      cage.rotation.y *= -0.6;
      renderer.render(scene, camera);
      raf = requestAnimationFrame(loop);
    };
    loop();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      // WebGL contexts are a limited resource and React will mount this twice
      // in StrictMode, so everything allocated above is released by hand.
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
      cage.geometry.dispose();
      (cage.material as THREE.Material).dispose();
      renderer.dispose();
      host.removeChild(renderer.domElement);
    };
  }, [level]);

  return <div ref={hostRef} className="absolute inset-0" />;
}
