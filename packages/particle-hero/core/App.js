import * as THREE from 'three';
import InteractiveControls from './InteractiveControls.js';
import Particles from './Particles.js';

export const CANVAS_SIZE = 900;

export default class App {
  constructor(container) {
    this.container = container;
    this.clock = new THREE.Clock();
    this.initThree();
    this.initParticles();
    this.initControls();
  }

  initThree() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(50, 1, 1, 10000);
    this.camera.position.z = 300;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(1);
    this.container.appendChild(this.renderer.domElement);
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
    const delta = this.clock.getDelta();
    if (this.particles) this.particles.update(delta);
  }

  draw() {
    this.renderer.render(this.scene, this.camera);
  }

  resize() {
    const w = CANVAS_SIZE;
    const h = CANVAS_SIZE;
    this.camera.aspect = 1;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);

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
