import * as THREE from 'three';
import vertexShader from './shaders/particle.vert';
import fragmentShader from './shaders/particle.frag';
import shadowVertexShader from './shaders/particle-shadow.vert';
import shadowFragmentShader from './shaders/particle-shadow.frag';
import TouchTexture from './TouchTexture.js';
import { lerp } from './utils/easing.js';
import { getCategoryColor, getPostYear, hexToRgb, normalizePostPositions } from '../postsData.ts';
import {
  drawImageCoverCenter,
  PARTICLE_LAYOUT_LANDSCAPE,
} from '../layout.ts';
const ALPHA_THRESHOLD = 16;
const SIZE_MIN = 0.3;
const SIZE_MAX = 0.85;
/** Multiplier for colored post particles (uDataMode) */
const DATA_PARTICLE_SIZE_SCALE = 1.0;
/** 1 = full contrast; lower softens the flat background plane only */
const BACKGROUND_CONTRAST = 0.5;
/** 1 = original texture; ~0.9 = slightly softer silhouette particles */
const PARTICLE_CONTRAST = 0.92;

function isParticlePixel(data, i) {
  return data[i * 4 + 3] > ALPHA_THRESHOLD;
}

function createWhiteTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 1, 1);
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

export function loadImageTexture(url, width, height) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      drawImageCoverCenter(ctx, img, width, height);
      const texture = new THREE.CanvasTexture(canvas);
      texture.flipY = true;
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.needsUpdate = true;
      resolve(texture);
    };
    img.onerror = reject;
    img.src = url;
  });
}

export default class Particles {
  constructor(webgl) {
    this.webgl = webgl;
    this.container = new THREE.Object3D();
    this.touch = new TouchTexture();
    this.tweens = null;
    this.backgroundContrast = BACKGROUND_CONTRAST;
    this.particleContrast = PARTICLE_CONTRAST;
    this.isDataMode = false;
    this.posts = null;
    this.onHoverPost = null;
    this.postMeta = null;
    this.activeFilter = null;
    this.targetWidth = PARTICLE_LAYOUT_LANDSCAPE.width;
    this.targetHeight = PARTICLE_LAYOUT_LANDSCAPE.height;
    this.lastLoad = null;
  }

  setTargetSize(width, height) {
    this.targetWidth = width;
    this.targetHeight = height;
  }

  async reloadLast() {
    if (!this.lastLoad) return this;
    if (this.lastLoad.kind === 'posts') {
      return this.loadPosts(this.lastLoad.posts);
    }
    return this.load(this.lastLoad.url, this.lastLoad.posts);
  }

  async load(src, posts = null) {
    await this.destroy();
    this.isDataMode = false;
    const w = this.targetWidth;
    const h = this.targetHeight;
    this.posts = posts ? normalizePostPositions(posts, w, h) : null;
    const texture = await loadImageTexture(src, w, h);
    this.texture = texture;
    this.width = w;
    this.height = h;
    this.lastLoad = { kind: 'image', url: src, posts };
    this.initBackground();
    this.buildMesh(true);
    if (this.posts) this.buildPostsMesh(this.posts);
    this.initHitArea();
    this.attachTouchUniform();
    this.resize();
    this.startShowTween();
    this.addListeners();
    return this;
  }

  async loadPosts(posts) {
    await this.destroy();
    this.isDataMode = true;
    const w = this.targetWidth;
    const h = this.targetHeight;
    this.posts = normalizePostPositions(posts, w, h);
    this.texture = createWhiteTexture();
    this.width = w;
    this.height = h;
    this.lastLoad = { kind: 'posts', posts };
    this.buildPostsMesh(this.posts);
    this.initHitArea();
    this.attachTouchUniform();
    this.resize();
    this.startShowTween();
    this.addListeners();
    return this;
  }

  setBackgroundContrast(value) {
    this.backgroundContrast = THREE.MathUtils.clamp(value, 0, 1);
    if (this.backgroundMesh) {
      this.backgroundMesh.material.uniforms.uContrast.value = this.backgroundContrast;
    }
  }

  setParticleContrast(value) {
    this.particleContrast = THREE.MathUtils.clamp(value, 0, 1);
    for (const mesh of [this.object3D, this.shadowObject3D]) {
      if (mesh?.material.uniforms.uContrast) {
        mesh.material.uniforms.uContrast.value = this.particleContrast;
      }
    }
  }

  initBackground() {
    const geometry = new THREE.PlaneGeometry(this.width, this.height);
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uTexture: { value: this.texture },
        uContrast: { value: this.backgroundContrast },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D uTexture;
        uniform float uContrast; // 对比度系数：0.0 到 1.0 之间降低对比度
        varying vec2 vUv;
        void main() {
          vec4 c = texture2D(uTexture, vUv);
          float g = dot(c.rgb, vec3(0.299, 0.587, 0.114));
          g = clamp((g - 0.5) * uContrast + 0.5, 0.0, 1.0);
          gl_FragColor = vec4(vec3(g), c.a);
        }
      `,
      transparent: true,
      depthTest: false,
    });
    this.backgroundMesh = new THREE.Mesh(geometry, material);
    this.backgroundMesh.renderOrder = 0;
    this.container.add(this.backgroundMesh);
  }

  buildMesh(discard) {
    this.numPoints = this.width * this.height;

    let numVisible = this.numPoints;
    let originalColors;

    if (discard) {
      numVisible = 0;
      const canvas = this.texture.image;
      const ctx = canvas.getContext('2d');
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      originalColors = imgData.data;

      for (let i = 0; i < this.numPoints; i++) {
        if (isParticlePixel(originalColors, i)) numVisible++;
      }
    }

    const uniforms = {
      uTime: { value: 0 },
      uRandom: { value: 1.0 },
      uDepth: { value: 2.0 },
      uSize: { value: 0.0 },
      uDataMode: { value: 0.0 },
      uContrast: { value: this.particleContrast },
      uSizeScale: { value: 1.0 },
      uTextureSize: { value: new THREE.Vector2(this.width, this.height) },
      uTexture: { value: this.texture },
      uTouch: { value: this.touch.texture },
    };

    const shadowUniforms = {
      ...uniforms,
      uShadowOffset: { value: new THREE.Vector2(0.18, -0.18) },
    };

    const material = new THREE.RawShaderMaterial({
      uniforms,
      vertexShader,
      fragmentShader,
      depthTest: false,
      transparent: true,
    });

    const shadowMaterial = new THREE.RawShaderMaterial({
      uniforms: shadowUniforms,
      vertexShader: shadowVertexShader,
      fragmentShader: shadowFragmentShader,
      depthTest: false,
      transparent: true,
    });

    const geometry = new THREE.InstancedBufferGeometry();

    const positions = new THREE.BufferAttribute(new Float32Array(4 * 3), 3);
    positions.setXYZ(0, -0.5, 0.5, 0.0);
    positions.setXYZ(1, 0.5, 0.5, 0.0);
    positions.setXYZ(2, -0.5, -0.5, 0.0);
    positions.setXYZ(3, 0.5, -0.5, 0.0);
    geometry.setAttribute('position', positions);

    const uvs = new THREE.BufferAttribute(new Float32Array(4 * 2), 2);
    uvs.setXY(0, 0.0, 0.0);
    uvs.setXY(1, 1.0, 0.0);
    uvs.setXY(2, 0.0, 1.0);
    uvs.setXY(3, 1.0, 1.0);
    geometry.setAttribute('uv', uvs);

    geometry.setIndex(new THREE.BufferAttribute(new Uint16Array([0, 2, 1, 2, 3, 1]), 1));

    const indices = new Uint16Array(numVisible);
    const offsets = new Float32Array(numVisible * 3);
    const angles = new Float32Array(numVisible);
    const colors = new Float32Array(numVisible * 3);
    const visibles = new Float32Array(numVisible);

    for (let i = 0, j = 0; i < this.numPoints; i++) {
      if (discard && !isParticlePixel(originalColors, i)) continue;

      offsets[j * 3] = i % this.width;
      offsets[j * 3 + 1] = this.height - 1 - Math.floor(i / this.width);
      indices[j] = i;
      angles[j] = Math.random() * Math.PI;
      colors[j * 3] = 1.0;
      colors[j * 3 + 1] = 1.0;
      colors[j * 3 + 2] = 1.0;
      visibles[j] = 1.0;
      j++;
    }

    geometry.setAttribute('pindex', new THREE.InstancedBufferAttribute(indices, 1));
    geometry.setAttribute('offset', new THREE.InstancedBufferAttribute(offsets, 3));
    geometry.setAttribute('angle', new THREE.InstancedBufferAttribute(angles, 1));
    geometry.setAttribute('aColor', new THREE.InstancedBufferAttribute(colors, 3));
    geometry.setAttribute('aVisible', new THREE.InstancedBufferAttribute(visibles, 1));

    // this.shadowObject3D = new THREE.Mesh(geometry, shadowMaterial);
    // this.container.add(this.shadowObject3D);

    this.object3D = new THREE.Mesh(geometry, material);
    this.object3D.renderOrder = 1;
    this.container.add(this.object3D);
  }

  buildPostsMesh(posts) {
    const numVisible = posts.length;

    const uniforms = {
      uTime: { value: 0 },
      uRandom: { value: 1.0 },
      uDepth: { value: 2.0 },
      uSize: { value: 0.0 },
      uDataMode: { value: 1.0 },
      uContrast: { value: 1.0 },
      uSizeScale: { value: DATA_PARTICLE_SIZE_SCALE },
      uTextureSize: { value: new THREE.Vector2(this.width, this.height) },
      uTexture: { value: this.texture },
      uTouch: { value: this.touch.texture },
    };

    const material = new THREE.RawShaderMaterial({
      uniforms,
      vertexShader,
      fragmentShader,
      depthTest: false,
      transparent: true,
    });

    const geometry = new THREE.InstancedBufferGeometry();

    const positions = new THREE.BufferAttribute(new Float32Array(4 * 3), 3);
    positions.setXYZ(0, -0.5, 0.5, 0.0);
    positions.setXYZ(1, 0.5, 0.5, 0.0);
    positions.setXYZ(2, -0.5, -0.5, 0.0);
    positions.setXYZ(3, 0.5, -0.5, 0.0);
    geometry.setAttribute('position', positions);

    const uvs = new THREE.BufferAttribute(new Float32Array(4 * 2), 2);
    uvs.setXY(0, 0.0, 0.0);
    uvs.setXY(1, 1.0, 0.0);
    uvs.setXY(2, 0.0, 1.0);
    uvs.setXY(3, 1.0, 1.0);
    geometry.setAttribute('uv', uvs);

    geometry.setIndex(new THREE.BufferAttribute(new Uint16Array([0, 2, 1, 2, 3, 1]), 1));

    const indices = new Uint16Array(numVisible);
    const offsets = new Float32Array(numVisible * 3);
    const angles = new Float32Array(numVisible);
    const colors = new Float32Array(numVisible * 3);
    const visibles = new Float32Array(numVisible);

    this.postMeta = posts.map((post) => ({
      category: post.category?.label ?? '',
      year: getPostYear(post),
    }));

    for (let j = 0; j < numVisible; j++) {
      const post = posts[j];
      offsets[j * 3] = post.x;
      offsets[j * 3 + 1] = post.y;
      offsets[j * 3 + 2] = 0.0;
      indices[j] = j;
      angles[j] = Math.random() * Math.PI;
      const [r, g, b] = hexToRgb(getCategoryColor(post.category?.label));
      colors[j * 3] = r / 255;
      colors[j * 3 + 1] = g / 255;
      colors[j * 3 + 2] = b / 255;
      visibles[j] = 1.0;
    }

    geometry.setAttribute('pindex', new THREE.InstancedBufferAttribute(indices, 1));
    geometry.setAttribute('offset', new THREE.InstancedBufferAttribute(offsets, 3));
    geometry.setAttribute('angle', new THREE.InstancedBufferAttribute(angles, 1));
    geometry.setAttribute('aColor', new THREE.InstancedBufferAttribute(colors, 3));
    geometry.setAttribute('aVisible', new THREE.InstancedBufferAttribute(visibles, 1));

    this.postsObject3D = new THREE.Mesh(geometry, material);
    this.postsObject3D.renderOrder = 2;
    this.container.add(this.postsObject3D);

    if (this.activeFilter) {
      this.setPostFilter(this.activeFilter);
    }
  }

  setPostFilter({ category, year }) {
    this.activeFilter = { category, year };
    if (!this.postsObject3D || !this.postMeta) return;

    const attr = this.postsObject3D.geometry.attributes.aVisible;
    for (let i = 0; i < this.postMeta.length; i++) {
      const meta = this.postMeta[i];
      const categoryMatch = category === 'all' || meta.category === category;
      const yearMatch = Number(meta.year) <= Number(year);
      attr.array[i] = categoryMatch && yearMatch ? 1.0 : 0.0;
    }
    attr.needsUpdate = true;
  }

  isPostVisible(index) {
    if (!this.activeFilter || !this.postMeta?.[index]) return true;
    const { category, year } = this.activeFilter;
    const meta = this.postMeta[index];
    const categoryMatch = category === 'all' || meta.category === category;
    return categoryMatch && Number(meta.year) <= Number(year);
  }

  /** Raycast UV → post layout coords (matches Three.js PlaneGeometry: v=1 at +Y). */
  raycastUvToPostCoords(uv) {
    return {
      x: uv.x * this.width,
      y: uv.y * this.height,
    };
  }

  findNearestPost(uv) {
    if (!this.posts) return null;

    const { x, y } = this.raycastUvToPostCoords(uv);
    const threshold = 12 * Math.sqrt(DATA_PARTICLE_SIZE_SCALE);
    const thresholdSq = threshold * threshold;

    let nearest = null;
    let minDistSq = thresholdSq;

    for (let i = 0; i < this.posts.length; i++) {
      if (!this.isPostVisible(i)) continue;
      const post = this.posts[i];
      const dx = post.x - x;
      const dy = post.y - y;
      const distSq = dx * dx + dy * dy;
      if (distSq < minDistSq) {
        minDistSq = distSq;
        nearest = post;
      }
    }

    return nearest;
  }

  attachTouchUniform() {
    if (this.object3D) {
      this.object3D.material.uniforms.uTouch.value = this.touch.texture;
    }
    if (this.postsObject3D) {
      this.postsObject3D.material.uniforms.uTouch.value = this.touch.texture;
    }
    if (this.shadowObject3D) {
      this.shadowObject3D.material.uniforms.uTouch.value = this.touch.texture;
    }
  }

  initHitArea() {
    const geometry = new THREE.PlaneGeometry(this.width, this.height, 1, 1);
    const material = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      wireframe: true,
      depthTest: false,
      visible: false,
    });
    this.hitArea = new THREE.Mesh(geometry, material);
    this.container.add(this.hitArea);
  }

  addListeners() {
    this.handlerInteractiveMove = this.onInteractiveMove.bind(this);
    this.handlerInteractiveOut = this.onInteractiveOut.bind(this);
    this.webgl.interactive.on('interactive-move', this.handlerInteractiveMove);
    this.webgl.interactive.on('interactive-out', this.handlerInteractiveOut);
    if (!this.webgl.interactive.objects.includes(this.hitArea)) {
      this.webgl.interactive.objects.push(this.hitArea);
    }
    this.webgl.interactive.enable();
  }

  removeListeners() {
    if (this.handlerInteractiveMove) {
      this.webgl.interactive.off('interactive-move', this.handlerInteractiveMove);
    }
    if (this.handlerInteractiveOut) {
      this.webgl.interactive.off('interactive-out', this.handlerInteractiveOut);
    }
    const idx = this.webgl.interactive.objects.indexOf(this.hitArea);
    if (idx >= 0) this.webgl.interactive.objects.splice(idx, 1);
  }

  startShowTween(duration = 1.0) {
    const meshes = [this.object3D, this.postsObject3D].filter(Boolean);
    if (!meshes.length) return;

    const u = meshes[0].material.uniforms;
    const shadowU = this.shadowObject3D?.material.uniforms;
    this.tweens = {
      duration,
      elapsed: 0,
      uSize: { from: 0.5, to: 3.0 },
      uRandom: { from: u.uRandom.value, to: 5.0 },
      uDepth: { from: 40.0, to: 4.0 },
      uDepthDuration: duration * 1.5,
    };

    for (const mesh of meshes) {
      const uniforms = mesh.material.uniforms;
      uniforms.uSize.value = SIZE_MIN;
      uniforms.uRandom.value = 1.0;
      uniforms.uDepth.value = 40.0;
    }

    if (shadowU) {
      shadowU.uSize.value = SIZE_MIN;
      shadowU.uRandom.value = 1.0;
      shadowU.uDepth.value = 40.0;
    }
  }

  updateTweens(dt) {
    if (!this.tweens) return;
    const meshes = [this.object3D, this.postsObject3D].filter(Boolean);
    if (!meshes.length) return;

    const shadowU = this.shadowObject3D?.material.uniforms;
    this.tweens.elapsed += dt;
    const t = Math.min(this.tweens.elapsed / this.tweens.duration, 1);
    const td = Math.min(this.tweens.elapsed / this.tweens.uDepthDuration, 1);

    const size = lerp(this.tweens.uSize.from, this.tweens.uSize.to, t);
    const random = lerp(this.tweens.uRandom.from, this.tweens.uRandom.to, t);
    const depth = lerp(this.tweens.uDepth.from, this.tweens.uDepth.to, td);

    for (const mesh of meshes) {
      const uniforms = mesh.material.uniforms;
      uniforms.uSize.value = size;
      uniforms.uRandom.value = random;
      uniforms.uDepth.value = depth;
    }

    if (shadowU) {
      shadowU.uSize.value = size;
      shadowU.uRandom.value = random;
      shadowU.uDepth.value = depth;
    }

    if (t >= 1 && td >= 1) this.tweens = null;
  }

  update(delta) {
    const meshes = [this.object3D, this.postsObject3D].filter(Boolean);
    if (!meshes.length) return;
    this.touch.update();
    this.updateTweens(delta);
    for (const mesh of meshes) {
      mesh.material.uniforms.uTime.value += delta;
    }
    if (this.shadowObject3D) {
      this.shadowObject3D.material.uniforms.uTime.value += delta;
    }
  }

  resize() {
    if (!this.webgl.fovHeight) return;
    const scale = this.webgl.fovHeight / this.height;
    if (this.backgroundMesh) this.backgroundMesh.scale.set(scale, scale, 1);
    if (this.object3D) this.object3D.scale.set(scale, scale, 1);
    if (this.postsObject3D) this.postsObject3D.scale.set(scale, scale, 1);
    if (this.shadowObject3D) this.shadowObject3D.scale.set(scale, scale, 1);
    if (this.hitArea) this.hitArea.scale.set(scale, scale, 1);
  }

  onInteractiveMove(e) {
    const uv = e.intersectionData.uv;
    this.touch.addTouch(uv);

    if (this.posts && this.onHoverPost) {
      const post = this.findNearestPost(uv);
      this.onHoverPost(post, e);
    }
  }

  onInteractiveOut() {
    if (this.posts && this.onHoverPost) {
      this.onHoverPost(null);
    }
  }

  async destroy() {
    this.removeListeners();
    this.tweens = null;

    if (this.backgroundMesh) {
      this.container.remove(this.backgroundMesh);
      this.backgroundMesh.geometry.dispose();
      this.backgroundMesh.material.dispose();
      this.backgroundMesh = null;
    }

    if (this.shadowObject3D) {
      this.container.remove(this.shadowObject3D);
      this.shadowObject3D.material.dispose();
      this.shadowObject3D = null;
    }

    if (this.object3D) {
      this.container.remove(this.object3D);
      this.object3D.geometry.dispose();
      this.object3D.material.dispose();
      this.object3D = null;
    }

    if (this.postsObject3D) {
      this.container.remove(this.postsObject3D);
      this.postsObject3D.geometry.dispose();
      this.postsObject3D.material.dispose();
      this.postsObject3D = null;
    }

    if (this.hitArea) {
      this.container.remove(this.hitArea);
      this.hitArea.geometry.dispose();
      this.hitArea.material.dispose();
      this.hitArea = null;
    }

    if (this.texture) {
      this.texture.dispose();
      this.texture = null;
    }

    this.touch.reset();
    this.posts = null;
    this.postMeta = null;
    this.isDataMode = false;
    // lastLoad kept for layout-mode reload
  }
}
