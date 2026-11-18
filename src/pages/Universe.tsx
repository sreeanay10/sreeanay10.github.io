import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { ArrowUpRight, History, Search, Star, X } from 'lucide-react';
import { useStore } from '../store';
import { Avatar, EmptyData, Container, Segmented, VerifiedBadge } from '../components/ui';
import { HEADER_APP } from '../components/Header';
import { layoutNetwork, RING_LABEL, RING_ORDER, type Ring, type Node } from '../lib/layout';
import { fmtCompact, fmtNumber } from '../lib/format';
import { profileUrl } from '../lib/username';

const STYLE: Record<Ring, { size: number; bright: number; ring: boolean }> = {
  mutual: { size: 4.6, bright: 1, ring: false },
  'not-following-back': { size: 5.6, bright: 1, ring: true },
  'needs-review': { size: 5, bright: 0.6, ring: true },
  excluded: { size: 6.2, bright: 0.55, ring: false },
  fans: { size: 3.6, bright: 0.6, ring: false },
};

const VERT = /* glsl */ `
  attribute vec3 pos2;
  attribute float size;
  attribute float kind;
  attribute float bright;
  attribute float vis;
  uniform float uMix;
  uniform float uPixel;
  varying float vKind;
  varying float vBright;
  varying float vVis;
  void main() {
    vec3 p = mix(position, pos2, uMix);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = size * uPixel * (320.0 / -mv.z);
    vKind = kind; vBright = bright; vVis = vis;
  }`;
const FRAG = /* glsl */ `
  varying float vKind;
  varying float vBright;
  varying float vVis;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    if (d > 0.5) discard;
    float a;
    if (vKind > 0.5) {
      a = smoothstep(0.5, 0.42, d) * smoothstep(0.24, 0.32, d);
    } else {
      a = pow(smoothstep(0.5, 0.0, d), 0.7);
    }
    gl_FragColor = vec4(vec3(vBright), a * vVis);
  }`;
const LINE_VERT = /* glsl */ `
  attribute vec3 pos2;
  attribute float vis;
  uniform float uMix;
  varying float vVis;
  void main() {
    vVis = vis;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(mix(position, pos2, uMix), 1.0);
  }`;
const LINE_FRAG = /* glsl */ `
  varying float vVis;
  void main() { gl_FragColor = vec4(1.0, 1.0, 1.0, 0.13 * vVis); }`;

interface Api {
  setMode(m: '3d' | '2d'): void;
  setVisibility(fn: (n: Node) => number): void;
  focus(i: number): void;
  select(i: number | null): void;
  setLines(on: boolean): void;
}

/**
 * Social Universe: you at the centre; mutual followers in an inner sphere, accounts
 * that don't follow back on a tilted orbit, followers you don't follow in an outer
 * shell. Every point is a real account from your export; nothing is inferred
 * between accounts. Drag to rotate, scroll/pinch to zoom, right-drag to pan.
 */
export default function Universe() {
  const { analysis, groups, watchlist, toggleWatch } = useStore();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const circle = groups.find((g) => g.id === params.get('circle')) ?? null;
  const nodes = useMemo(() => (analysis ? layoutNetwork(analysis) : []), [analysis]);
  const [mode, setMode] = useState<'3d' | '2d'>('3d');
  const [hidden, setHidden] = useState<Set<Ring>>(() => new Set());
  const [selected, setSelected] = useState<number | null>(null);
  const [lines, setLines] = useState(true);
  const [q, setQ] = useState('');
  const [failed, setFailed] = useState(false);
  const mount = useRef<HTMLDivElement>(null);
  const hoverLabel = useRef<HTMLDivElement>(null);
  const youLabel = useRef<HTMLDivElement>(null);
  const api = useRef<Api | null>(null);
  const selectRef = useRef(setSelected);
  selectRef.current = setSelected;

  const counts = useMemo(() => {
    const c = Object.fromEntries(RING_ORDER.map((r) => [r, 0])) as Record<Ring, number>;
    for (const n of nodes) c[n.ring]++;
    return c;
  }, [nodes]);

  /* ── Scene ─────────────────────────────────────────────────────────────── */
  useEffect(() => {
    const host = mount.current;
    if (!host || !nodes.length) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    } catch {
      setFailed(true);
      return;
    }
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    renderer.setPixelRatio(dpr);
    renderer.setClearColor(0x000000, 1);
    host.appendChild(renderer.domElement);
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.touchAction = 'none';

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 3000);
    camera.position.set(0, 55, 215);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; // momentum after a drag, like a thrown object settling
    controls.dampingFactor = 0.055;
    controls.rotateSpeed = 0.55;
    controls.zoomSpeed = 0.9;
    controls.minDistance = 25;
    controls.maxDistance = 700;
    controls.autoRotate = !reduce;
    controls.autoRotateSpeed = 0.35;

    const n = nodes.length;
    const pos = new Float32Array(n * 3), pos2 = new Float32Array(n * 3);
    const size = new Float32Array(n), kind = new Float32Array(n), bright = new Float32Array(n);
    const vis = new Float32Array(n).fill(0), visTarget = new Float32Array(n).fill(1);
    nodes.forEach((nd, i) => {
      pos.set(nd.p3, i * 3);
      pos2.set([nd.p2[0], nd.p2[1], 0], i * 3);
      const st = STYLE[nd.ring];
      const fc = nd.account.meta?.followerCount;
      size[i] = fc ? Math.min(14, st.size + Math.log10(Math.max(10, fc)) * 0.7) : st.size;
      kind[i] = st.ring ? 1 : 0;
      bright[i] = st.bright;
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('pos2', new THREE.BufferAttribute(pos2, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(size, 1));
    geo.setAttribute('kind', new THREE.BufferAttribute(kind, 1));
    geo.setAttribute('bright', new THREE.BufferAttribute(bright, 1));
    const visAttr = new THREE.BufferAttribute(vis, 1);
    geo.setAttribute('vis', visAttr);
    const uniforms = { uMix: { value: 0 }, uPixel: { value: dpr } };
    const mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    scene.add(points);

    // You, at the centre
    const youGeo = new THREE.BufferGeometry();
    youGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0]), 3));
    youGeo.setAttribute('pos2', new THREE.BufferAttribute(new Float32Array([0, 0, 0]), 3));
    youGeo.setAttribute('size', new THREE.BufferAttribute(new Float32Array([22]), 1));
    youGeo.setAttribute('kind', new THREE.BufferAttribute(new Float32Array([0]), 1));
    youGeo.setAttribute('bright', new THREE.BufferAttribute(new Float32Array([1]), 1));
    youGeo.setAttribute('vis', new THREE.BufferAttribute(new Float32Array([1]), 1));
    const you = new THREE.Points(youGeo, mat);
    scene.add(you);

    // Faint lines from you to each mutual follower
    const mutualIdx = nodes.map((nd, i) => (nd.ring === 'mutual' ? i : -1)).filter((i) => i >= 0).slice(0, 6000);
    const lp = new Float32Array(mutualIdx.length * 6), lp2 = new Float32Array(mutualIdx.length * 6), lv = new Float32Array(mutualIdx.length * 2);
    mutualIdx.forEach((idx, k) => {
      lp.set([0, 0, 0, ...nodes[idx].p3], k * 6);
      lp2.set([0, 0, 0, nodes[idx].p2[0], nodes[idx].p2[1], 0], k * 6);
    });
    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', new THREE.BufferAttribute(lp, 3));
    lineGeo.setAttribute('pos2', new THREE.BufferAttribute(lp2, 3));
    const lineVis = new THREE.BufferAttribute(lv, 1);
    lineGeo.setAttribute('vis', lineVis);
    const lineMat = new THREE.ShaderMaterial({ vertexShader: LINE_VERT, fragmentShader: LINE_FRAG, uniforms: { uMix: uniforms.uMix }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const lineMesh = new THREE.LineSegments(lineGeo, lineMat);
    lineMesh.frustumCulled = false;
    scene.add(lineMesh);
    let linesOn = true;

    // Selection halo
    const haloGeo = new THREE.BufferGeometry();
    const haloPos = new Float32Array(3);
    haloGeo.setAttribute('position', new THREE.BufferAttribute(haloPos, 3));
    haloGeo.setAttribute('pos2', new THREE.BufferAttribute(haloPos, 3));
    haloGeo.setAttribute('size', new THREE.BufferAttribute(new Float32Array([14]), 1));
    haloGeo.setAttribute('kind', new THREE.BufferAttribute(new Float32Array([1]), 1));
    haloGeo.setAttribute('bright', new THREE.BufferAttribute(new Float32Array([1]), 1));
    const haloVis = new THREE.BufferAttribute(new Float32Array([0]), 1);
    haloGeo.setAttribute('vis', haloVis);
    const haloMat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: { uMix: { value: 0 }, uPixel: uniforms.uPixel }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const halo = new THREE.Points(haloGeo, haloMat);
    halo.frustumCulled = false;
    scene.add(halo);
    let selectedIdx: number | null = null;

    // State animated each frame
    let mix = 0, mixTarget = 0, visDirty = true;
    let fly: { target: THREE.Vector3; cam: THREE.Vector3 } | null = null;
    let idleTimer = 0;

    const mixed = (i: number, out = new THREE.Vector3()) =>
      out.set(pos[i * 3] + (pos2[i * 3] - pos[i * 3]) * mix, pos[i * 3 + 1] + (pos2[i * 3 + 1] - pos[i * 3 + 1]) * mix, pos[i * 3 + 2] * (1 - mix));

    let framed = false;
    const resize = () => {
      const w = host.clientWidth, h = host.clientHeight;
      if (!framed && w && h) {
        framed = true;
        const aspect = w / h;
        if (aspect < 1) camera.position.multiplyScalar(Math.min(1.9, 1 / Math.max(0.5, aspect)) * 0.9);
      }
      renderer.setSize(w, h, false);
      renderer.domElement.style.width = `${w}px`;
      renderer.domElement.style.height = `${h}px`;
      camera.aspect = w / Math.max(1, h);
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(host);

    // Pause the slow drift while the user is steering; resume after a rest.
    const interact = () => {
      controls.autoRotate = false;
      fly = null;
      clearTimeout(idleTimer);
      idleTimer = window.setTimeout(() => { if (mixTarget === 0 && !reduce) controls.autoRotate = true; }, 7000);
    };
    controls.addEventListener('start', interact);

    /* Screen-space picking (works for both the 3D and the flattened layout) */
    const v = new THREE.Vector3();
    const pick = (cx: number, cy: number): number | null => {
      const rect = renderer.domElement.getBoundingClientRect();
      let best = -1, bestD = 16 * 16;
      for (let i = 0; i < n; i++) {
        if (vis[i] < 0.5) continue;
        mixed(i, v).project(camera);
        if (v.z > 1) continue;
        const sx = (v.x * 0.5 + 0.5) * rect.width + rect.left, sy = (-v.y * 0.5 + 0.5) * rect.height + rect.top;
        const d = (sx - cx) ** 2 + (sy - cy) ** 2;
        if (d < bestD) { bestD = d; best = i; }
      }
      return best >= 0 ? best : null;
    };

    let hovered: number | null = null, mx = 0, my = 0, pickRaf = 0;
    const onMove = (e: PointerEvent) => {
      mx = e.clientX; my = e.clientY;
      if (!pickRaf) pickRaf = requestAnimationFrame(() => {
        pickRaf = 0;
        hovered = pick(mx, my);
        renderer.domElement.style.cursor = hovered !== null ? 'pointer' : 'grab';
      });
    };
    let down: { x: number; y: number } | null = null;
    const onDown = (e: PointerEvent) => { down = { x: e.clientX, y: e.clientY }; };
    const onUp = (e: PointerEvent) => {
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) { down = null; return; }
      down = null;
      const i = pick(e.clientX, e.clientY);
      selectRef.current(i);
    };
    renderer.domElement.addEventListener('pointermove', onMove);
    renderer.domElement.addEventListener('pointerdown', onDown);
    renderer.domElement.addEventListener('pointerup', onUp);
    renderer.domElement.addEventListener('pointerleave', () => { hovered = null; });

    /* Loop */
    let raf = 0, last = performance.now(), t = 0;
    const tmp = new THREE.Vector3();
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      t += dt;
      const k = reduce ? 1 : 1 - Math.exp(-dt * 5);
      if (Math.abs(mixTarget - mix) > 0.0005) { mix += (mixTarget - mix) * k; uniforms.uMix.value = mix; }
      if (visDirty) {
        let moving = false;
        for (let i = 0; i < n; i++) {
          const d = visTarget[i] - vis[i];
          if (Math.abs(d) > 0.004) { vis[i] += d * (reduce ? 1 : 1 - Math.exp(-dt * 7)); moving = true; } else vis[i] = visTarget[i];
        }
        visAttr.needsUpdate = true;
        mutualIdx.forEach((idx, j) => { const val = linesOn ? vis[idx] : 0; lv[j * 2] = val; lv[j * 2 + 1] = val; });
        lineVis.needsUpdate = true;
        visDirty = moving;
      }
      if (selectedIdx !== null) {
        mixed(selectedIdx, tmp);
        haloPos[0] = tmp.x; haloPos[1] = tmp.y; haloPos[2] = tmp.z;
        (haloGeo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
        haloVis.array[0] = 0.6 + 0.4 * Math.sin(t * 3);
        haloVis.needsUpdate = true;
      }
      if (fly) {
        const f = reduce ? 1 : 1 - Math.exp(-dt * 3.2);
        controls.target.lerp(fly.target, f);
        camera.position.lerp(fly.cam, f);
        if (camera.position.distanceTo(fly.cam) < 0.5) fly = null;
      }
      controls.update();
      // Labels
      const rect = renderer.domElement.getBoundingClientRect();
      const place = (el: HTMLDivElement | null, p: THREE.Vector3, show: boolean) => {
        if (!el) return;
        const s = p.clone().project(camera);
        el.style.opacity = show && s.z < 1 ? '1' : '0';
        el.style.transform = `translate3d(${(s.x * 0.5 + 0.5) * rect.width}px, ${(-s.y * 0.5 + 0.5) * rect.height}px, 0)`;
      };
      place(youLabel.current, tmp.set(0, 0, 0), true);
      if (hoverLabel.current) {
        const show = hovered !== null && hovered !== selectedIdx;
        if (show) {
          hoverLabel.current.textContent = `@${nodes[hovered!].account.username}`;
          place(hoverLabel.current, mixed(hovered!, tmp), true);
        } else hoverLabel.current.style.opacity = '0';
      }
      renderer.render(scene, camera);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    api.current = {
      setMode(m) {
        mixTarget = m === '2d' ? 1 : 0;
        controls.enableRotate = m === '3d';
        controls.autoRotate = m === '3d' && !reduce;
        fly = m === '2d'
          ? { target: new THREE.Vector3(0, 0, 0), cam: new THREE.Vector3(0, 0.01, 260) }
          : { target: new THREE.Vector3(0, 0, 0), cam: new THREE.Vector3(0, 55, 215) };
      },
      setVisibility(fn) { nodes.forEach((nd, i) => { visTarget[i] = fn(nd); }); visDirty = true; },
      focus(i) {
        const target = mixed(i, new THREE.Vector3());
        const dir = camera.position.clone().sub(controls.target).normalize();
        controls.autoRotate = false;
        fly = { target, cam: target.clone().add(dir.multiplyScalar(70)) };
      },
      select(i) {
        selectedIdx = i;
        haloVis.array[0] = i === null ? 0 : 1;
        haloVis.needsUpdate = true;
      },
      setLines(on) { linesOn = on; visDirty = true; },
    };

    return () => {
      cancelAnimationFrame(raf);
      cancelAnimationFrame(pickRaf);
      clearTimeout(idleTimer);
      ro.disconnect();
      controls.dispose();
      [geo, youGeo, lineGeo, haloGeo].forEach((g) => g.dispose());
      [mat, lineMat, haloMat].forEach((m) => m.dispose());
      renderer.dispose();
      renderer.domElement.remove();
      api.current = null;
    };
  }, [nodes]);

  // React → scene
  useEffect(() => { api.current?.setMode(mode); }, [mode]);
  useEffect(() => { api.current?.setLines(lines); }, [lines]);
  useEffect(() => {
    const members = circle ? new Set(circle.members) : null;
    api.current?.setVisibility((nd) => (hidden.has(nd.ring) ? 0 : members ? (members.has(nd.account.username) ? 1 : 0.1) : 1));
  }, [hidden, circle, nodes]);
  useEffect(() => { api.current?.select(selected); }, [selected]);

  const matches = useMemo(() => {
    const term = q.trim().toLowerCase().replace(/^@/, '');
    if (!term) return [];
    const out: number[] = [];
    for (let i = 0; i < nodes.length; i++) if (nodes[i].account.username.includes(term)) out.push(i);
    const u = (i: number) => nodes[i].account.username;
    return out.sort((x, y) => Number(u(y) === term) - Number(u(x) === term) || Number(u(y).startsWith(term)) - Number(u(x).startsWith(term)) || u(x).localeCompare(u(y))).slice(0, 7);
  }, [q, nodes]);

  if (!analysis) return <Container><EmptyData /></Container>;
  const sel = selected !== null ? nodes[selected] : null;
  const top = HEADER_APP + 8;

  return (
    <div className="fixed inset-0 bg-ink text-paper" data-header-theme="dark">
      <div ref={mount} className="absolute inset-0" />
      {failed && <div className="absolute inset-0 flex items-center justify-center p-8 text-center text-sm text-paper/70">Your browser can’t draw 3D graphics right now.</div>}

      {/* Floating labels */}
      <div ref={youLabel} className="label pointer-events-none absolute left-0 top-0 -ml-[1.1rem] mt-5 text-[0.625rem] text-paper/80">You</div>
      <div ref={hoverLabel} className="glass-dark label pointer-events-none absolute left-0 top-0 ml-3 mt-3 rounded-full px-3 py-1.5 text-[0.625rem] opacity-0 transition-opacity duration-150" />

      {/* Controls */}
      <div className="pointer-events-none absolute inset-x-0 flex flex-wrap items-start justify-between gap-3 px-4 sm:px-6" style={{ top }}>
        <div className="pointer-events-auto relative w-full max-w-xs">
          <label className="glass-dark relative flex items-center rounded-full">
            <Search size={15} strokeWidth={1.5} className="pointer-events-none absolute left-4 text-paper/60" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && matches[0] !== undefined) { setSelected(matches[0]); api.current?.focus(matches[0]); setQ(''); } }}
              placeholder="Find an account"
              aria-label="Find an account"
              className="h-11 w-full rounded-full bg-transparent pl-10 pr-4 text-sm font-light text-paper placeholder:text-paper/50 focus:outline-none"
              autoCapitalize="none"
              spellCheck={false}
            />
          </label>
          {matches.length > 0 && (
            <ul className="glass-dark glass-thick absolute inset-x-0 top-full mt-2 rounded-[20px] p-1.5" style={{ animation: 'rise 380ms var(--ease-spring) backwards' }}>
              {matches.map((i) => (
                <li key={i}>
                  <button className="w-full rounded-[14px] px-3 py-2 text-left text-sm hover:bg-white/10" onClick={() => { setSelected(i); api.current?.focus(i); setQ(''); }}>
                    @{nodes[i].account.username}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="pointer-events-auto flex items-center gap-2">
          <button
            onClick={() => setLines((l) => !l)}
            className={`label h-11 rounded-full px-4 text-[0.625rem] transition-colors ${lines ? 'bg-paper text-ink' : 'glass-dark text-paper'}`}
            aria-pressed={lines}
          >
            Lines
          </button>
          <Segmented dark label="View" value={mode} onChange={setMode} options={[{ value: '3d', label: '3D' }, { value: '2d', label: '2D' }]} />
        </div>
      </div>

      {/* Legend + filters */}
      <div className="absolute bottom-[max(1rem,env(safe-area-inset-bottom))] left-0 right-0 flex flex-col-reverse items-stretch gap-2 sm:left-6 sm:right-6 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <div className="flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] sm:flex-wrap sm:overflow-visible sm:px-0 [&::-webkit-scrollbar]:hidden">
          {RING_ORDER.filter((r) => counts[r] > 0).map((r) => {
            const off = hidden.has(r);
            return (
              <button
                key={r}
                onClick={() => setHidden((h) => { const s = new Set(h); if (s.has(r)) s.delete(r); else s.add(r); return s; })}
                className={`glass-dark flex h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-4 text-xs transition-[opacity,transform] duration-300 [transition-timing-function:var(--ease-spring)] active:scale-95 ${off ? 'opacity-40' : ''}`}
                aria-pressed={!off}
              >
                <span className={`h-2.5 w-2.5 rounded-full ${STYLE[r].ring ? 'ring-[1.5px] ring-paper' : 'bg-paper'}`} style={{ opacity: STYLE[r].bright }} />
                {RING_LABEL[r]} <span className="tabular-nums text-paper/50">{fmtCompact(counts[r])}</span>
              </button>
            );
          })}
        </div>
        {circle && (
          <div className="glass-dark mx-4 flex h-10 items-center gap-2 self-start rounded-full pl-4 pr-1 text-xs sm:mx-0">
            Circle: {circle.name}
            <button className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-white/10" onClick={() => navigate('/universe')} aria-label="Clear circle"><X size={14} /></button>
          </div>
        )}
      </div>

      {/* Selected account */}
      {sel && (
        <aside
          key={sel.account.username}
          className="glass-dark glass-thick absolute inset-x-3 bottom-[calc(max(1rem,env(safe-area-inset-bottom))+3.25rem)] rounded-[26px] p-5 sm:inset-x-auto sm:bottom-auto sm:right-6 sm:top-[var(--panel-top)] sm:w-80"
          style={{ ['--panel-top' as string]: `${top + 56}px`, animation: 'rise 520ms var(--ease-spring) backwards' }}
        >
          <div className="flex items-start justify-between gap-3">
            <Avatar name={sel.account.username} size={44} />
            <button className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-white/10" onClick={() => setSelected(null)} aria-label="Close"><X size={15} /></button>
          </div>
          <p className="mt-4 flex items-center gap-1.5 break-all text-lg font-medium">@{sel.account.username} {sel.account.meta?.verified && <span className="invert"><VerifiedBadge /></span>}</p>
          {sel.account.meta?.displayName && <p className="text-sm text-paper/60">{sel.account.meta.displayName}</p>}
          <p className="label mt-3 text-[0.625rem] text-paper/60">{RING_LABEL[sel.ring]}</p>
          {sel.account.meta?.followerCount !== undefined && <p className="mt-2 text-sm">{fmtNumber(sel.account.meta.followerCount)} followers</p>}
          <div className="mt-5 flex flex-wrap gap-2">
            <a href={profileUrl(sel.account.username)} target="_blank" rel="noopener noreferrer" className="btn btn-inverse btn-sm">Profile <ArrowUpRight size={13} /></a>
            <Link to={`/watchlist?u=${encodeURIComponent(sel.account.username)}`} className="btn glass-dark btn-sm text-paper"><History size={13} /> History</Link>
            <button className="btn glass-dark btn-sm text-paper" onClick={() => toggleWatch(sel.account.username)} aria-pressed={watchlist.includes(sel.account.username)}>
              <Star size={13} fill={watchlist.includes(sel.account.username) ? '#fff' : 'none'} />
            </button>
          </div>
        </aside>
      )}
    </div>
  );
}
