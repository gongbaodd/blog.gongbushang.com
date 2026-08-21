import * as THREE from 'three';
import InteractiveControls from './InteractiveControls.js';
import Particles from './Particles.js';
import { getParticleLayoutDims } from '../layout.ts';

export const CANVAS_WIDTH = 320;
export const CANVAS_HEIGHT = 180;

export default class App {
  constructor(container) {
    this.container = container;
    this.clock = new THREE.Clock();
    this.layoutMode = null;
    this.webglFailed = false;
    if (!this.initThree()) return;
    this.initParticles();
    this.initControls();
  }

  initThree() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(50, 1, 1, 10000);
    this.camera.position.z = 300;

    try {
      this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      if (!this.renderer.getContext()) {
        throw new Error('WebGL context unavailable');
      }
      this.renderer.setPixelRatio(1);
      this.container.appendChild(this.renderer.domElement);
      return true;
    } catch (error) {
      this.webglFailed = true;
      this.renderer = null;
      console.error('ParticleHero: WebGL unavailable', error);
      return false;
    }
  }

  initControls() {
    this.interactive = new InteractiveControls(
      this.camera,
      this.renderer.domElement
    );
  }

  initParticles() {
    this.particles = new Particles(this);
    this.scene.add(this.particles.container);
  }

  /**
   * @param {'landscape' | 'square'} mode
   */
  async setLayoutMode(mode) {
    if (this.webglFailed) return;
    const prevMode = this.layoutMode;
    this.layoutMode = mode;
    const dims = getParticleLayoutDims(mode);
    this.particles.setTargetSize(dims.width, dims.height);

    if (prevMode !== null && prevMode !== mode && this.particles.lastLoad) {
      await this.particles.reloadLast();
    }

    this.resize();
  }

  /**
   * @param {string} url
   * @param {import('../postsData.ts').UmapPost[] | null} [posts]
   */
  async loadImage(url, posts = null) {
    return this.particles.load(url, posts);
  }

  /**
   * @param {import('../postsData.ts').UmapPost[]} posts
   */
  async loadPosts(posts) {
    return this.particles.loadPosts(posts);
  }

  setHoverHandler(fn) {
    this.particles.onHoverPost = fn;
  }

  setPostFilter(filter) {
    this.particles.setPostFilter(filter);
  }

  update() {
    if (this.webglFailed) return;
    const delta = this.clock.getDelta();
    if (this.particles) this.particles.update(delta);
  }

  draw() {
    if (this.webglFailed || !this.renderer) return;
    this.renderer.render(this.scene, this.camera);
  }

  resize() {
    if (this.webglFailed || !this.renderer) return;
    const w = this.container.clientWidth || CANVAS_WIDTH;
    const h = this.container.clientHeight || CANVAS_HEIGHT;
    if (w === 0 || h === 0) return;

    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(w, h, false);

    this.fovHeight =
      2 *
      Math.tan((this.camera.fov * Math.PI) / 180 / 2) *
      this.camera.position.z;

    if (this.interactive) this.interactive.resize();
    if (this.particles) this.particles.resize();
  }

  async dispose() {
    if (this.interactive) this.interactive.disable();
    if (this.particles) await this.particles.destroy();
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer.domElement.remove();
    }
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.particles = null;
    this.interactive = null;
  }
}
