import * as THREE from 'three';

const SCROLL_THRESHOLD = 10;

export default class InteractiveControls {
  constructor(camera, el) {
    this.camera = camera;
    this.el = el;
    this.enabled = false;
    this.plane = new THREE.Plane();
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.offset = new THREE.Vector3();
    this.intersection = new THREE.Vector3();
    this.objects = [];
    this.hovered = null;
    this.listeners = new Map();
    this.activePointerId = null;
    this.pendingPointer = null;
  }

  on(event, fn) {
    if (!this.listeners.has(event)) this.listeners.set(event, []);
    this.listeners.get(event).push(fn);
  }

  off(event, fn) {
    const list = this.listeners.get(event);
    if (!list) return;
    const i = list.indexOf(fn);
    if (i >= 0) list.splice(i, 1);
  }

  emit(event, data) {
    const list = this.listeners.get(event);
    if (list) for (const fn of list) fn(data);
  }

  enable() {
    if (this.enabled) return;
    this.handlerDown = this.onDown.bind(this);
    this.handlerMove = this.onMove.bind(this);
    this.handlerUp = this.onUp.bind(this);
    this.handlerLeave = this.onLeave.bind(this);
    this.handlerCancel = this.onCancel.bind(this);

    this.el.addEventListener('pointerdown', this.handlerDown);
    this.el.addEventListener('pointermove', this.handlerMove);
    this.el.addEventListener('pointerup', this.handlerUp);
    this.el.addEventListener('pointercancel', this.handlerCancel);
    this.el.addEventListener('pointerleave', this.handlerLeave);
    this.enabled = true;
  }

  disable() {
    if (!this.enabled) return;
    this.el.removeEventListener('pointerdown', this.handlerDown);
    this.el.removeEventListener('pointermove', this.handlerMove);
    this.el.removeEventListener('pointerup', this.handlerUp);
    this.el.removeEventListener('pointercancel', this.handlerCancel);
    this.el.removeEventListener('pointerleave', this.handlerLeave);
    this.activePointerId = null;
    this.pendingPointer = null;
    this.enabled = false;
  }

  resize() {
    if (this.el === window) {
      this.rect = { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight };
    } else {
      this.rect = this.el.getBoundingClientRect();
    }
  }

  clearHover() {
    this.intersectionData = null;
    if (this.hovered !== null) {
      this.emit('interactive-out', { object: this.hovered });
      this.hovered = null;
    }
  }

  isTouchLike(pointerType) {
    return pointerType === 'touch' || pointerType === 'pen';
  }

  resolvePendingPointer(e) {
    if (!this.pendingPointer || e.pointerId !== this.pendingPointer.id) {
      return false;
    }

    const dx = e.clientX - this.pendingPointer.x;
    const dy = e.clientY - this.pendingPointer.y;

    if (Math.hypot(dx, dy) < SCROLL_THRESHOLD) {
      return false;
    }

    this.pendingPointer = null;

    if (Math.abs(dy) > Math.abs(dx)) {
      return false;
    }

    this.beginInteraction(e);
    return true;
  }

  processMove(e) {
    this.mouse.x = ((e.clientX - this.rect.x) / this.rect.width) * 2 - 1;
    this.mouse.y = -((e.clientY - this.rect.y) / this.rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);

    const intersects = this.raycaster.intersectObjects(this.objects);

    if (intersects.length > 0) {
      const object = intersects[0].object;
      this.intersectionData = intersects[0];
      this.plane.setFromNormalAndCoplanarPoint(
        this.camera.getWorldDirection(this.plane.normal),
        object.position
      );

      if (this.hovered !== object) {
        this.emit('interactive-out', { object: this.hovered });
        this.emit('interactive-over', { object });
        this.hovered = object;
      } else {
        this.emit('interactive-move', {
          object,
          intersectionData: this.intersectionData,
        });
      }
    } else {
      this.clearHover();
    }
  }

  beginInteraction(e) {
    this.activePointerId = e.pointerId;

    if (e.pointerType === 'mouse') {
      this.el.setPointerCapture(e.pointerId);
    }

    this.processMove(e);
    this.emit('interactive-down', {
      object: this.hovered,
      intersectionData: this.intersectionData,
    });
    this.selected = this.hovered;
    if (this.selected && this.raycaster.ray.intersectPlane(this.plane, this.intersection)) {
      this.offset.copy(this.intersection).sub(this.selected.position);
    }
  }

  endInteraction(e) {
    if (e.pointerType === 'mouse' && this.el.hasPointerCapture(e.pointerId)) {
      this.el.releasePointerCapture(e.pointerId);
    }

    this.activePointerId = null;
    this.emit('interactive-up', { object: this.hovered });

    if (this.isTouchLike(e.pointerType)) {
      this.clearHover();
    }
  }

  onMove(e) {
    if (this.pendingPointer) {
      this.resolvePendingPointer(e);
      if (!this.activePointerId) return;
    }

    if (this.activePointerId !== null) {
      if (e.pointerId !== this.activePointerId) return;
      this.processMove(e);
      return;
    }

    if (e.pointerType === 'mouse') {
      this.processMove(e);
    }
  }

  onDown(e) {
    if (this.activePointerId !== null || this.pendingPointer) return;

    if (this.isTouchLike(e.pointerType)) {
      this.pendingPointer = {
        id: e.pointerId,
        x: e.clientX,
        y: e.clientY,
      };
      return;
    }

    this.beginInteraction(e);
  }

  onUp(e) {
    if (this.pendingPointer?.id === e.pointerId) {
      this.pendingPointer = null;
      this.beginInteraction(e);
      this.endInteraction(e);
      return;
    }

    if (e.pointerId !== this.activePointerId) return;
    this.endInteraction(e);
  }

  onCancel(e) {
    if (this.pendingPointer?.id === e.pointerId) {
      this.pendingPointer = null;
      return;
    }

    if (e.pointerId !== this.activePointerId) return;

    if (e.pointerType === 'mouse' && this.el.hasPointerCapture(e.pointerId)) {
      this.el.releasePointerCapture(e.pointerId);
    }

    this.activePointerId = null;
    this.clearHover();
  }

  onLeave(e) {
    if (this.activePointerId !== null && e.pointerId !== this.activePointerId) {
      return;
    }

    if (this.activePointerId === null) {
      this.clearHover();
    }
  }
}
