import { useEffect, useId, useRef, useState, type RefObject } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { Container, useReducedMotion, useReveal, Wordmark } from '../components/ui';
import { KineticHeadline, Marquee, Roll } from '../components/motion';
import { useStore } from '../store';
import { clamp } from '../lib/spring';

export const GUIDE_STEPS = [
  ['Open Instagram', 'Settings and activity'],
  ['Accounts Center', 'Top of the list'],
  ['Your information', 'and permissions'],
  ['Download your information', 'Choose your account'],
  ['Followers and following', 'JSON · All time'],
  ['Drop the ZIP here', 'It arrives by email'],
] as const;

const FEATURES: [string, string, string][] = [
  ['Not following back', 'Exact. Celebrities filtered out.', '/not-following-back'],
  ['Social Universe', 'Your network in 3D.', '/universe'],
  ['Social Replay', 'Watch it change over time.', '/replay'],
  ['Followly Wrapped', 'Your year, in slides.', '/wrapped'],
  ['Network Fingerprint', 'Art made from your numbers.', '/fingerprint'],
  ['World Map', 'Where your audience is.', '/world'],
  ['Memory Vault', 'Every export, kept and named.', '/vault'],
  ['Smart Search', 'Ask in plain English.', 'search'],
];

export default function Home() {
  const { analysis } = useStore();
  const ref = useReveal<HTMLDivElement>();
  return (
    <div ref={ref}>
      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="relative flex min-h-[100svh] flex-col justify-end pb-10 pt-28 sm:pb-16">
        <Container>
          <p className="eyebrow mb-8 text-muted fade-in" style={{ animationDelay: '200ms' }}>Understand your social world.</p>
          <KineticHeadline className="display hero-title" lines={['Your following.', 'Your connections.', 'Your control.']} />
          <div className="mt-12 flex flex-col gap-8 sm:mt-16 md:flex-row md:items-end md:justify-between">
            <p className="lede max-w-md text-lg text-graphite fade-in sm:text-xl" style={{ animationDelay: '900ms' }}>
              Discover your Instagram network. Understand your connections. See the bigger picture.
            </p>
            <div className="flex flex-wrap items-center gap-3 fade-in" style={{ animationDelay: '1050ms' }}>
              <Link to={analysis ? '/dashboard' : '/analyze'} className="btn btn-primary h-14 px-9">
                <Roll>{analysis ? 'Open my dashboard' : 'Analyze my account'}</Roll>
              </Link>
              <a href="#features" className="btn btn-outline h-14 px-7"><Roll>Explore Followly</Roll></a>
            </div>
          </div>
        </Container>
      </section>

      <Marquee words={['Following', 'Followers', 'Mutual', 'Not following back']} />

      {/* ── How it works ───────────────────────────────────── */}
      <section id="how" className="scroll-mt-20 py-24 sm:py-36">
        <Container>
          <h2 data-reveal className="display text-[2.75rem] sm:text-7xl lg:text-8xl">Six steps.<br />No password.</h2>
          <ol className="mt-14 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {GUIDE_STEPS.map(([t, b], i) => (
              <li
                key={t}
                data-reveal
                style={{ ['--reveal-delay' as string]: `${i * 60}ms` }}
                className="group rounded-[28px] bg-mist p-7 transition-[transform,background-color,box-shadow] duration-500 [transition-timing-function:var(--ease-spring)] hover:-translate-y-1.5 hover:bg-paper hover:shadow-[inset_0_0_0_1px_#EAEAEA,0_24px_48px_-24px_rgba(0,0,0,0.25)]"
              >
                <span className="numeral block text-5xl text-muted transition-colors duration-300 group-hover:text-ink">{String(i + 1).padStart(2, '0')}</span>
                <p className="headline mt-10 text-lg">{t}</p>
                <p className="mt-2 text-sm font-light text-muted">{b}</p>
              </li>
            ))}
          </ol>
          <div data-reveal className="mt-10">
            <Link to="/analyze" className="btn btn-primary"><Roll>Upload my export</Roll><ArrowRight size={14} strokeWidth={1.5} /></Link>
          </div>
        </Container>
      </section>

      {/* ── Features ───────────────────────────────────────── */}
      <section id="features" className="scroll-mt-20 pb-24 sm:pb-36">
        <Container>
          <h2 data-reveal className="display text-[2.75rem] sm:text-7xl lg:text-8xl">More than<br />a list.</h2>
          <ul className="mt-14 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map(([t, b, to], i) => {
              const cls = `group flex h-full flex-col justify-between rounded-[28px] p-7 text-left transition-[transform,box-shadow] duration-500 [transition-timing-function:var(--ease-spring)] hover:-translate-y-1.5 hover:shadow-[0_24px_48px_-24px_rgba(0,0,0,0.3)] active:scale-[0.98] ${i === 0 ? 'bg-ink text-paper' : 'bg-mist'}`;
              const body = (
                <>
                  <span>
                    <span className="headline block text-lg">{t}</span>
                    <span className={`mt-2 block text-sm font-light ${i === 0 ? 'text-paper/60' : 'text-muted'}`}>{b}</span>
                  </span>
                  <ArrowRight size={16} strokeWidth={1.5} className="mt-8 -translate-x-1 opacity-40 transition-[transform,opacity] duration-500 [transition-timing-function:var(--ease-spring)] group-hover:translate-x-0 group-hover:opacity-100" />
                </>
              );
              return (
                <li key={t} data-reveal style={{ ['--reveal-delay' as string]: `${(i % 4) * 60}ms` }}>
                  {to === 'search' ? (
                    <button className={`${cls} w-full`} onClick={() => window.dispatchEvent(new Event('followly:search'))}>{body}</button>
                  ) : (
                    <Link to={analysis ? to : '/analyze'} className={cls}>{body}</Link>
                  )}
                </li>
              );
            })}
          </ul>
        </Container>
      </section>

      {/* ── Social Universe preview ────────────────────────── */}
      <section data-header-theme="dark" className="relative overflow-hidden bg-ink py-28 text-paper sm:py-40">
        <UniversePreview />
        <Container className="relative">
          <p data-reveal className="eyebrow text-paper/50">Social Universe</p>
          <h2 data-reveal className="display mt-6 text-[2.75rem] sm:text-7xl lg:text-8xl">Your network,<br />as a universe.</h2>
          <div data-reveal className="mt-12">
            <Link to={analysis ? '/universe' : '/analyze'} className="btn btn-inverse h-14 px-8"><Roll>{analysis ? 'Enter your universe' : 'Build yours'}</Roll></Link>
          </div>
        </Container>
      </section>

      {/* ── Analytics preview: the maths, explained ─────────── */}
      <PrincipleStory />

      {/* ── Privacy ────────────────────────────────────────── */}
      <section id="privacy" data-header-theme="dark" className="scroll-mt-20 bg-ink py-24 text-paper sm:py-36">
        <Container>
          <h2 data-reveal className="display text-[2.75rem] sm:text-7xl lg:text-8xl">Your data<br />stays yours.</h2>
          <div className="mt-14 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ['No login', 'Never your password.'],
              ['On-device', 'Nothing is uploaded.'],
              ['Minimal', 'Only usernames and dates.'],
              ['Erasable', 'Clear it all in one tap.'],
            ].map(([t, b], i) => (
              <div key={t} data-reveal style={{ ['--reveal-delay' as string]: `${i * 70}ms` }} className="glass-dark rounded-[28px] p-7">
                <p className="headline text-base tracking-[0.12em]">{t}</p>
                <p className="mt-3 text-sm font-light text-paper/60">{b}</p>
              </div>
            ))}
          </div>
        </Container>
      </section>

      {/* ── Closing CTA ────────────────────────────────────── */}
      <section className="py-24 sm:py-36">
        <Container className="text-center">
          <div data-reveal className="join-mark flex justify-center">
            <svg width="62" height="40" viewBox="0 0 31 20" aria-hidden="true">
              <circle cx="10" cy="10" r="8.6" fill="#000" />
              <circle className="join-ring" cx="21" cy="10" r="8.6" fill="none" stroke="#000" strokeWidth="1.2" />
            </svg>
          </div>
          <h2 data-reveal className="display mx-auto mt-10 max-w-4xl text-[2.5rem] sm:text-7xl">Know where you stand.</h2>
          <div data-reveal className="mt-12">
            <Link to="/analyze" className="btn btn-primary h-14 px-9"><Roll>Analyze my account</Roll></Link>
          </div>
        </Container>
      </section>

      <Footer />
    </div>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-line py-10">
      <Container className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        <Wordmark />
        <p className="text-xs font-light text-muted">Not affiliated with Instagram or Meta. Never unfollows anyone.</p>
        <div className="flex gap-6">
          <Link to="/settings" className="label link-underline text-[0.625rem]">Settings</Link>
          <a href="/#privacy" className="label link-underline text-[0.625rem]">Privacy</a>
        </div>
      </Container>
    </footer>
  );
}

/* ── Scroll-linked explainer: the brand mark is the product's maths ─────── */

const STEPS = [
  { title: 'Everyone you follow.', body: 'Straight from your export.' },
  { title: 'Everyone who follows you.', body: 'The overlap is mutual.' },
  { title: 'The rest doesn’t follow back.', body: 'Minus verified and 100K+ accounts.' },
];

function useScrollProgress(ref: RefObject<HTMLElement>) {
  const [p, setP] = useState(0);
  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      const el = ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const total = r.height - window.innerHeight;
      setP(total > 0 ? clamp(-r.top / total, 0, 1) : 1);
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [ref]);
  return p;
}

const ease = (x: number) => 1 - Math.pow(1 - x, 3);

function PrincipleStory() {
  const ref = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();
  const raw = useScrollProgress(ref);
  const t = reduce ? 1 : raw;
  const seg = (a: number, b: number) => clamp((t - a) / (b - a), 0, 1);
  const draw = ease(seg(0.02, 0.22));
  const join = ease(seg(0.3, 0.58));
  const fill = ease(seg(0.66, 0.84));
  const step = t < 0.3 ? 0 : t < 0.64 ? 1 : 2;
  const R = 150, CY = 210, LX = 240;
  const rx = 400 + (1 - join) * 230; // the followers circle slides in from the right
  const C = 2 * Math.PI * R;
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const pct = (v: number, of: number) => `${(v / of) * 100}%`;
  const label = 'label absolute whitespace-nowrap text-[0.625rem] sm:text-[0.6875rem]';

  return (
    <section ref={ref} className="relative bg-mist" style={{ height: reduce ? undefined : '280vh' }}>
      <div className={`${reduce ? 'py-24' : 'sticky top-0 h-[100svh] py-16'} flex items-center overflow-hidden`}>
        <Container>
          <div className="grid items-center gap-10 lg:grid-cols-12 lg:gap-16">
            <div className="lg:col-span-5">
              {reduce ? (
                <ol className="space-y-8">
                  {STEPS.map((s) => (
                    <li key={s.title}>
                      <h2 className="headline text-2xl leading-[1.05] sm:text-4xl">{s.title}</h2>
                      <p className="lede mt-3 max-w-md text-[0.9375rem] text-graphite">{s.body}</p>
                    </li>
                  ))}
                </ol>
              ) : (
                <>
                  <div className="relative min-h-[11rem] sm:min-h-[14rem]">
                    {STEPS.map((s, i) => (
                      <div
                        key={s.title}
                        aria-hidden={step !== i}
                        className="absolute inset-x-0 top-0 transition-[opacity,transform] duration-700 ease-sheet"
                        style={{ opacity: step === i ? 1 : 0, transform: step === i ? 'none' : `translateY(${i < step ? -18 : 18}px)` }}
                      >
                        <h2 className="headline text-[1.75rem] leading-[1.05] sm:text-5xl">{s.title}</h2>
                        <p className="lede mt-4 max-w-md text-[0.9375rem] text-graphite sm:mt-5 sm:text-base">{s.body}</p>
                      </div>
                    ))}
                  </div>
                  <div className="mt-6 flex items-center gap-2 sm:mt-10" aria-hidden="true">
                    {STEPS.map((s, i) => (
                      <span key={s.title} className="h-px w-10 transition-colors duration-500" style={{ background: i <= step ? '#000' : '#C4C4C4' }} />
                    ))}
                    <span className="label ml-3 text-[0.625rem] tabular-nums text-muted">0{step + 1} / 03</span>
                  </div>
                </>
              )}
            </div>

            <div className="row-start-1 lg:col-span-7 lg:row-start-auto">
              <div className="relative mx-auto aspect-[640/440] w-full max-w-[320px] sm:max-w-[560px]">
                <svg viewBox="0 0 640 440" className="absolute inset-0 h-full w-full" aria-hidden="true">
                  <defs>
                    <clipPath id={`${id}l`}><circle cx={LX} cy={CY} r={R} /></clipPath>
                    <mask id={`${id}m`}>
                      <rect width="640" height="440" fill="#fff" />
                      <circle cx={rx} cy={CY} r={R} fill="#000" />
                    </mask>
                  </defs>
                  {/* mutual: the lens where both circles overlap */}
                  <circle cx={rx} cy={CY} r={R} fill="#E3E3E3" clipPath={`url(#${id}l)`} opacity={join} />
                  {/* not following back: following minus followers */}
                  <circle cx={LX} cy={CY} r={R} fill="#000" mask={`url(#${id}m)`} opacity={fill} />
                  <circle
                    cx={LX} cy={CY} r={R} fill="none" stroke="#000" strokeWidth="1.5"
                    strokeDasharray={C} strokeDashoffset={C * (1 - draw)} transform={`rotate(-90 ${LX} ${CY})`}
                  />
                  <circle cx={rx} cy={CY} r={R} fill="none" stroke="#000" strokeWidth="1.5" opacity={join} />
                  <line x1="170" y1="318" x2="170" y2="396" stroke="#000" strokeWidth="1" opacity={fill} />
                </svg>
                <span className={label} style={{ left: pct(LX, 640), top: '1%', transform: 'translateX(-50%)', opacity: draw }}>Following</span>
                <span className={label} style={{ left: pct(rx, 640), top: '1%', transform: 'translateX(-50%)', opacity: join }}>Followers</span>
                <span className={label} style={{ left: pct((rx + LX) / 2, 640), top: pct(CY, 440), transform: 'translate(-50%, -50%)', opacity: clamp((join - 0.6) / 0.4, 0, 1) }}>Mutual</span>
                <span className={label} style={{ left: pct(170, 640), top: pct(404, 440), transform: 'translateX(-50%)', opacity: fill }}>Not following back</span>
              </div>
            </div>
          </div>
        </Container>
      </div>
    </section>
  );
}

/** Decorative, abstract star field for the homepage — not account data. */
function UniversePreview() {
  const ref = useRef<HTMLCanvasElement>(null);
  const reduce = useReducedMotion();
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext('2d')!;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const pts = Array.from({ length: 520 }, (_, i) => {
      const shell = i % 3;
      const y = 1 - (2 * (i + 0.5)) / 520;
      const r = Math.sqrt(1 - y * y);
      const th = i * 2.399963;
      const R = [120, 200, 300][shell] * (0.9 + ((i * 7919) % 100) / 500);
      return { x: Math.cos(th) * r * R, y: y * R * 0.8, z: Math.sin(th) * r * R, s: [1.8, 1.4, 1][shell], a: [1, 0.7, 0.4][shell] };
    });
    let raf = 0, angle = 0, visible = true;
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible && !raf) raf = requestAnimationFrame(draw); });
    io.observe(c);
    function draw() {
      raf = 0;
      const W = (c!.width = c!.clientWidth * dpr), H = (c!.height = c!.clientHeight * dpr);
      ctx.clearRect(0, 0, W, H);
      const cx = W * (W > 1100 * dpr ? 0.8 : 0.72), cy = H * 0.5, f = 600 * dpr;
      const ca = Math.cos(angle), sa = Math.sin(angle);
      for (const p of pts) {
        const x = p.x * ca - p.z * sa, z = p.x * sa + p.z * ca + 700;
        const k = f / z;
        ctx.globalAlpha = p.a * Math.min(1, 900 / z);
        ctx.beginPath();
        ctx.arc(cx + x * k * 0.6, cy + p.y * k * 0.6, p.s * k * 0.6, 0, Math.PI * 2);
        ctx.fillStyle = '#fff';
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, 7 * dpr, 0, Math.PI * 2);
      ctx.fill();
      if (!reduce) angle += 0.0025;
      if (visible && !reduce) raf = requestAnimationFrame(draw);
    }
    raf = requestAnimationFrame(draw);
    return () => { io.disconnect(); cancelAnimationFrame(raf); };
  }, [reduce]);
  return <canvas ref={ref} className="pointer-events-none absolute inset-0 h-full w-full opacity-80" aria-hidden="true" />;
}
