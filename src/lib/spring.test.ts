import { beforeAll, describe, expect, it } from 'vitest';
import { project, rubberband, Spring, VelocityTracker } from './spring';

beforeAll(() => {
  // Node has no display clock; drive frames with timers.
  (globalThis as any).requestAnimationFrame = (cb: (t: number) => void) => setTimeout(() => cb(performance.now()), 8) as unknown as number;
  (globalThis as any).cancelAnimationFrame = (id: number) => clearTimeout(id);
});

const settle = (s: Spring, target: number, cfg: Parameters<Spring['to']>[1]) =>
  new Promise<{ max: number; min: number }>((resolve) => {
    let max = -Infinity, min = Infinity;
    const orig = (s as any).onUpdate;
    (s as any).onUpdate = (v: number) => { max = Math.max(max, v); min = Math.min(min, v); orig(v); };
    s.to(target, cfg, () => resolve({ max, min }));
  });

describe('spring physics', () => {
  it('critically damped spring settles exactly on target without overshoot', async () => {
    const s = new Spring(0, () => {});
    const { max } = await settle(s, 100, { response: 0.2, dampingRatio: 1 });
    expect(s.value).toBe(100);
    expect(max).toBeLessThanOrEqual(100.5);
  });

  it('under-damped spring overshoots, then rests on target', async () => {
    const s = new Spring(0, () => {});
    const { max } = await settle(s, 100, { response: 0.2, dampingRatio: 0.5 });
    expect(max).toBeGreaterThan(105);
    expect(s.value).toBe(100);
  });

  it('carries handed-off velocity (moves past the start in the throw direction first)', async () => {
    const s = new Spring(0, () => {});
    const { min } = await settle(s, 100, { response: 0.3, dampingRatio: 1, velocity: -2000 });
    expect(min).toBeLessThan(-5); // it first travels against the target, in the direction it was thrown
    expect(s.value).toBe(100);
  });

  it('can be interrupted and keeps its presentation value', async () => {
    const s = new Spring(0, () => {});
    s.to(100, { response: 0.5 });
    await new Promise((r) => setTimeout(r, 60));
    s.stop();
    const v = s.value;
    expect(v).toBeGreaterThan(0);
    expect(v).toBeLessThan(100);
    await new Promise((r) => setTimeout(r, 40));
    expect(s.value).toBe(v);
  });

  it('projects momentum like scroll deceleration', () => {
    expect(project(0)).toBe(0);
    expect(project(1000)).toBeCloseTo(499, 0);
    expect(project(-1000)).toBeCloseTo(-499, 0);
  });

  it('rubber-bands with diminishing returns', () => {
    const a = rubberband(50, 400), b = rubberband(500, 400);
    expect(a).toBeLessThan(50);
    expect(b).toBeLessThan(400 * 0.55 + 1);
    expect(b / 500).toBeLessThan(a / 50);
    expect(rubberband(-50, 400)).toBeCloseTo(-a);
  });

  it('measures release velocity from recent samples only', () => {
    const t = new VelocityTracker();
    t.add(0, 0); t.add(10, 50); t.add(30, 100);
    expect(t.velocity(100)).toBeCloseTo(300, 0);
    expect(t.velocity(400)).toBe(0); // finger paused before lifting → no throw
  });
});
