// Cube Breakers: glossy candy block material with procedural face patterns, hit flash and frost.

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export const blockUniforms = { uTime: { value: 0 } };

export function createBlockGeometry() {
  return new RoundedBoxGeometry(0.985, 0.985, 0.985, 2, 0.085);
}

export function createBlockMaterial() {
  const mat = new THREE.MeshPhysicalMaterial({
    color: '#ffffff',
    roughness: 0.42,
    metalness: 0,
    clearcoat: 0.55,
    clearcoatRoughness: 0.2,
    envMapIntensity: 0.45,
  });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = blockUniforms.uTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute float aPattern;
        attribute vec3 aFx;
        varying vec3 vLocal;
        varying vec3 vLocalN;
        varying float vPattern;
        varying vec3 vFx;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vLocal = position;
        vLocalN = normal;
        vPattern = aPattern;
        vFx = aFx;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uTime;
        varying vec3 vLocal;
        varying vec3 vLocalN;
        varying float vPattern;
        varying vec3 vFx;
        float hex21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec3 an = abs(vLocalN);
        vec2 fuv = (an.x > an.y && an.x > an.z) ? vLocal.zy : ((an.y > an.z) ? vLocal.xz : vLocal.xy);
        float edgeD = max(abs(fuv.x), abs(fuv.y));
        vec3 base = diffuseColor.rgb;
        float pat = vPattern;
        if (pat > 1.5 && pat < 2.5) {
          float frame = smoothstep(0.325, 0.335, edgeD);
          float st = smoothstep(0.45, 0.55, fract((fuv.x - fuv.y) * 3.3));
          base *= mix(mix(1.0, 0.7, st), 1.06, frame);
          base *= 1.0 - 0.22 * (smoothstep(0.30, 0.32, edgeD) - smoothstep(0.34, 0.36, edgeD));
        } else if (pat > 2.5 && pat < 3.5) {
          vec2 q = fuv;
          float head = length((q - vec2(0.0, -0.07)) / vec2(0.23, 0.19)) - 1.0;
          float earL = length((q - vec2(-0.1, 0.17)) / vec2(0.055, 0.14)) - 1.0;
          float earR = length((q - vec2(0.1, 0.17)) / vec2(0.055, 0.14)) - 1.0;
          float sil = min(head, min(earL, earR));
          float inS = 1.0 - smoothstep(-0.06, 0.04, sil);
          base *= mix(1.0, 0.6, inS);
          float eyes = min(length(q - vec2(-0.085, -0.04)), length(q - vec2(0.085, -0.04)));
          base = mix(base, base * 1.55 + 0.04, (1.0 - smoothstep(0.024, 0.034, eyes)) * inS);
          float nose = length((q - vec2(0.0, -0.11)) / vec2(0.03, 0.02)) - 1.0;
          base = mix(base, base * 1.4, (1.0 - smoothstep(-0.2, 0.2, nose)) * inS);
          base *= 1.0 - 0.12 * (smoothstep(0.41, 0.43, edgeD));
        } else if (pat > 3.5 && pat < 4.5) {
          float inset = smoothstep(0.29, 0.31, edgeD) - smoothstep(0.35, 0.37, edgeD);
          base *= 1.0 - 0.32 * inset;
          vec2 rq = abs(fuv) - vec2(0.385);
          float rivet = 1.0 - smoothstep(0.03, 0.042, length(rq));
          base = mix(base, base * 1.7 + 0.06, rivet);
          float cross = (1.0 - smoothstep(0.012, 0.022, abs(fuv.x - fuv.y))) + (1.0 - smoothstep(0.012, 0.022, abs(fuv.x + fuv.y)));
          base *= 1.0 - 0.18 * clamp(cross, 0.0, 1.0) * step(edgeD, 0.29);
        } else if (pat > 4.5 && pat < 5.5) {
          float rings = 0.5 + 0.5 * sin(edgeD * 42.0 - uTime * 4.0);
          base = mix(base, base * 1.6 + 0.12, rings * 0.45);
        } else if (pat > 5.5 && pat < 6.5) {
          float band = 1.0 - smoothstep(0.15, 0.165, abs(fuv.y));
          float hz = smoothstep(0.45, 0.55, fract((fuv.x + fuv.y) * 4.0));
          base = mix(base, vec3(0.05, 0.04, 0.05), band * hz);
          float dot0 = 1.0 - smoothstep(0.07, 0.085, length(fuv - vec2(0.0, 0.3)));
          base = mix(base, vec3(0.05, 0.04, 0.05), dot0);
          base *= 1.0 - 0.15 * smoothstep(0.41, 0.43, edgeD);
        } else if (pat > 6.5 && pat < 7.5) {
          float bev = smoothstep(0.3, 0.33, edgeD) - smoothstep(0.36, 0.39, edgeD);
          base *= 1.0 - 0.25 * bev;
          float star = abs(fuv.x) + abs(fuv.y);
          base = mix(base, base * 1.25, 1.0 - smoothstep(0.12, 0.14, star));
        } else if (pat > 7.5) {
          vec2 g = fract(fuv * 2.0 + 0.5) - 0.5;
          float ball = 1.0 - smoothstep(0.26, 0.29, length(g));
          vec3 bc = mix(vec3(0.18, 0.58, 1.0), vec3(1.0, 0.6, 0.15), step(0.5, hex21(floor(fuv * 2.0 + 0.5))));
          base = mix(base, bc, ball * 0.85);
          base = mix(base, vec3(1.0), (1.0 - smoothstep(0.05, 0.08, length(g - vec2(-0.08, 0.09)))) * ball * 0.7);
          base *= 1.0 - 0.2 * (smoothstep(0.43, 0.45, edgeD));
        }
        float frost = vFx.y;
        if (frost > 0.001) {
          float cr = abs(sin(fuv.x * 31.0 + fuv.y * 17.0)) * abs(sin(fuv.y * 27.0 - fuv.x * 13.0));
          vec3 ice = mix(vec3(0.82, 0.95, 1.0), vec3(1.0), smoothstep(0.6, 0.95, cr));
          base = mix(base, ice, frost * 0.62);
        }
        diffuseColor.rgb = base;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        if (vPattern > 6.5 && vPattern < 7.5) roughnessFactor = 0.2;
        roughnessFactor = mix(roughnessFactor, 0.12, vFx.y);`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
        if (vPattern > 6.5 && vPattern < 7.5) metalnessFactor = 1.0;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += vec3(1.0, 0.97, 0.9) * vFx.x * 0.85;
        if (vPattern > 4.5 && vPattern < 5.5) totalEmissiveRadiance += diffuseColor.rgb * (0.45 + 0.25 * sin(uTime * 3.0));
        if (vPattern > 5.5 && vPattern < 6.5) totalEmissiveRadiance += vec3(0.25, 0.08, 0.0) * (0.5 + 0.5 * sin(uTime * 7.0));`);
  };
  mat.customProgramCacheKey = () => 'cb-block-v1';
  return mat;
}

export function addBlockAttributes(mesh, capacity) {
  const pattern = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1);
  const fx = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
  pattern.setUsage(THREE.DynamicDrawUsage);
  fx.setUsage(THREE.DynamicDrawUsage);
  mesh.geometry.setAttribute('aPattern', pattern);
  mesh.geometry.setAttribute('aFx', fx);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  return { pattern, fx };
}
