// Cube Breakers: glossy candy block material with face patterns, hit flash, frost, poison, gold rush and pixel cracks that show lost HP.

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export const blockUniforms = { uTime: { value: 0 }, uGold: { value: 0 }, uFreeze: { value: 0 } };
const still = { uGold: { value: 0 }, uFreeze: { value: 0 } };

export function createBlockGeometry() {
  return new RoundedBoxGeometry(0.985, 0.985, 0.985, 2, 0.085);
}

export function createBlockMaterial(world = true) {
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
    sh.uniforms.uGold = world ? blockUniforms.uGold : still.uGold;
    sh.uniforms.uFreeze = world ? blockUniforms.uFreeze : still.uFreeze;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute float aPattern;
        attribute vec4 aFx;
        varying vec3 vLocal;
        varying vec3 vLocalN;
        varying float vPattern;
        varying vec4 vFx;
        varying float vSeed;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vLocal = position;
        vLocalN = normal;
        vPattern = aPattern;
        vFx = aFx;
        #ifdef USE_INSTANCING_COLOR
          vSeed = fract(dot(instanceColor, vec3(41.37, 17.91, 73.13)) * 7.0);
        #else
          vSeed = 0.0;
        #endif`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uTime;
        uniform float uGold;
        uniform float uFreeze;
        varying vec3 vLocal;
        varying vec3 vLocalN;
        varying float vPattern;
        varying vec4 vFx;
        varying float vSeed;
        float hex21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        vec2 hex22(vec2 p) { return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453); }`)
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
        float poison = vFx.w;
        if (poison > 0.001) {
          float bub = smoothstep(0.82, 0.9, hex21(floor((fuv + 0.5) * 8.0) + floor(uTime * 3.0 + vSeed * 9.0)));
          vec3 tox = mix(vec3(0.22, 0.85, 0.3), vec3(0.75, 1.0, 0.5), bub);
          base = mix(base, tox * (0.6 + 0.4 * dot(base, vec3(0.33))), poison * 0.62);
        }
        float frost = max(vFx.y, uFreeze);
        if (frost > 0.001) {
          float cr = abs(sin(fuv.x * 31.0 + fuv.y * 17.0)) * abs(sin(fuv.y * 27.0 - fuv.x * 13.0));
          vec3 ice = mix(vec3(0.82, 0.95, 1.0), vec3(1.0), smoothstep(0.6, 0.95, cr));
          base = mix(base, ice, frost * 0.62);
        }
        float gold = uGold;
        if (gold > 0.001) {
          float l = dot(base, vec3(0.3, 0.55, 0.15));
          vec3 gc = vec3(1.0, 0.74, 0.16) * (0.62 + 0.75 * l);
          float sweep = smoothstep(0.92, 1.0, sin(uTime * 2.2 + (vLocal.x + vLocal.y) * 2.5 + vSeed * 6.28));
          base = mix(base, gc + sweep * 0.35, gold * (1.0 - 0.35 * max(vFx.y, uFreeze)));
        }
        float dmgF = vFx.z;
        if (dmgF > 0.08) {
          float stage = min(9.0, floor(dmgF * 10.0));
          vec2 q = (floor((fuv + 0.5) * 16.0) + 0.5) / 16.0;
          vec2 g = q * 2.6 + vec2(vSeed * 11.0) + vLocalN.xy * 3.7 + vLocalN.z * 5.3;
          vec2 gi = floor(g), gf = fract(g);
          float f1 = 8.0, f2 = 8.0;
          for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
            vec2 o = vec2(float(i), float(j));
            vec2 r = o + hex22(gi + o) - gf;
            float d = dot(r, r);
            if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) f2 = d;
          }
          float edge = sqrt(f2) - sqrt(f1);
          vec2 c0 = vec2(0.5) + (hex22(vec2(vSeed * 31.0, vLocalN.x + vLocalN.y * 2.0)) - 0.5) * 0.25;
          float reach = 0.1 + stage * 0.075;
          float crack = (1.0 - step(0.1 + stage * 0.012, edge)) * step(length(q - c0), reach);
          float chip = step(0.93 - stage * 0.025, hex21(floor(q * 16.0) + vSeed * 17.0)) * step(length(q - c0), reach * 0.9);
          base = mix(base, base * 0.16, clamp(crack + chip * 0.6, 0.0, 1.0) * 0.92);
        }
        diffuseColor.rgb = base;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        if (vPattern > 6.5 && vPattern < 7.5) roughnessFactor = 0.2;
        roughnessFactor = mix(roughnessFactor, 0.12, max(vFx.y, uFreeze));
        roughnessFactor = mix(roughnessFactor, 0.22, uGold);`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
        if (vPattern > 6.5 && vPattern < 7.5) metalnessFactor = 1.0;
        metalnessFactor = mix(metalnessFactor, 0.85, uGold);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += vec3(1.0, 0.97, 0.9) * vFx.x * 0.85;
        totalEmissiveRadiance += vec3(0.15, 0.6, 0.12) * vFx.w * (0.35 + 0.25 * sin(uTime * 5.0 + vSeed * 20.0));
        totalEmissiveRadiance += vec3(0.32, 0.2, 0.02) * uGold;
        if (vPattern > 4.5 && vPattern < 5.5) totalEmissiveRadiance += diffuseColor.rgb * (0.45 + 0.25 * sin(uTime * 3.0));
        if (vPattern > 5.5 && vPattern < 6.5) totalEmissiveRadiance += vec3(0.25, 0.08, 0.0) * (0.5 + 0.5 * sin(uTime * 7.0));`);
  };
  mat.customProgramCacheKey = () => (world ? 'cb-block-v2w' : 'cb-block-v2d');
  return mat;
}

export function addBlockAttributes(mesh, capacity) {
  const pattern = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1);
  const fx = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
  pattern.setUsage(THREE.DynamicDrawUsage);
  fx.setUsage(THREE.DynamicDrawUsage);
  mesh.geometry.setAttribute('aPattern', pattern);
  mesh.geometry.setAttribute('aFx', fx);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  return { pattern, fx };
}
