/**
 * Tiny physics toolkit for direct-manipulation UI, after Apple's
 * "Designing Fluid Interfaces" (WWDC 2018):
 *   • springs are parameterised by damping ratio + response, not mass/stiffness
 *   • a spring can be re-targeted or grabbed at any moment and keeps its velocity
 *   • release velocity is handed off to the spring, and momentum is projected
 */

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export interface SpringConfig {
  /** Roughly how long (s) the value takes to reach the target. Not a fixed duration. */
  response?: number;
  /** 1 = critically damped (no overshoot). Below 1 overshoots; use only after a momentum gesture. */
  dampingRatio?: number;
  /** Initial velocity in units per second. Omit to keep the current velocity (interruption). */
  velocity?: number;
}

export class Spring {
  value: number;
  velocity = 0;
  private target: number;
  private stiffness = 0;
  private damping = 0;
  private raf = 0;
  private last = 0;
  private onRest?: () => void;
  private readonly onUpdate: (v: number) => void;

  constructor(initial: number, onUpdate: (v: number) => void) {
    this.value = initial;
    this.target = initial;
    this.onUpdate = onUpdate;
  }

  get isAnimating() {
    return this.raf !== 0;
  }

  /** Move to a value immediately (e.g. while the finger is tracking 1:1). */
  set(v: number, notify = true) {
    this.stop();
    this.value = v;
    this.target = v;
    this.velocity = 0;
    if (notify) this.onUpdate(v);
  }

  /** Animate toward `target`, starting from the current on-screen value. */
  to(target: number, { response = 0.4, dampingRatio = 1, velocity }: SpringConfig = {}, onRest?: () => void) {
    this.target = target;
    if (velocity !== undefined) this.velocity = velocity;
    this.stiffness = Math.pow((2 * Math.PI) / response, 2);
    this.damping = (4 * Math.PI * dampingRatio) / response;
    this.onRest = onRest;
    if (prefersReducedMotion()) {
      this.set(target);
      this.finish();
      return;
    }
    if (!this.raf) {
      this.last = performance.now();
      this.raf = requestAnimationFrame(this.step);
    }
  }

  /** Freeze where it is (the presentation value), keeping `value` for a grab. */
  stop() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  private finish() {
    const cb = this.onRest;
    this.onRest = undefined;
    cb?.();
  }

  private step = (now: number) => {
    let dt = Math.min(0.064, (now - this.last) / 1000);
    this.last = now;
    // Fixed small sub-steps keep the integration stable for stiff springs.
    while (dt > 0) {
      const h = Math.min(1 / 240, dt);
      const accel = -this.stiffness * (this.value - this.target) - this.damping * this.velocity;
      this.velocity += accel * h;
      this.value += this.velocity * h;
      dt -= h;
    }
    if (Math.abs(this.velocity) < 4 && Math.abs(this.value - this.target) < 0.3) {
      this.value = this.target;
      this.velocity = 0;
      this.raf = 0;
      this.onUpdate(this.value);
      this.finish();
      return;
    }
    this.onUpdate(this.value);
    this.raf = requestAnimationFrame(this.step);
  };
}

/** Velocity from the last ~100ms of pointer samples (units per second). */
export class VelocityTracker {
  private samples: { t: number; v: number }[] = [];

  add(v: number, t = performance.now()) {
    this.samples.push({ t, v });
    while (this.samples.length > 2 && t - this.samples[0].t > 100) this.samples.shift();
  }

  velocity(now = performance.now()): number {
    const recent = this.samples.filter((s) => now - s.t <= 120);
    if (recent.length < 2) return 0;
    const a = recent[0], b = recent[recent.length - 1];
    const dt = (b.t - a.t) / 1000;
    return dt > 0 ? (b.v - a.v) / dt : 0;
  }

  reset() {
    this.samples = [];
  }
}

/** Where a flick would come to rest (Apple's scroll-deceleration projection). */
export function project(velocity: number, decelerationRate = 0.998): number {
  return ((velocity / 1000) * decelerationRate) / (1 - decelerationRate);
}

/** Progressive resistance past a boundary: the further you pull, the less it follows. */
export function rubberband(overshoot: number, dimension: number, constant = 0.55): number {
  return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot));
}

export const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
