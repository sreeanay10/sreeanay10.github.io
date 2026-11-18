import { useEffect, useId, useRef, useState, type RefObject } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { Container, useReducedMotion, useReveal, Wordmark } from '../components/ui';
import { KineticHeadline, Roll } from '../components/motion';
import { useStore } from '../store';
import { clamp } from '../lib/spring';

const HOW_STEPS = [
  ['Request your download', 'Accounts Center · Followers and following · JSON · All time'],
  ['Get the ZIP', 'Instagram emails it to you.'],
  ['Upload it here', 'Your three lists appear instantly.'],
] as const;

const FEATURES: [string, string, string][] = [
  ['Don’t follow you back', 'You follow them. They don’t.', '/not-following-back'],
  ['You don’t follow back', 'They follow you. You don’t.', '/you-dont-follow-back'],
  ['Mutual', 'You follow each other.', '/mutual'],
];

export default function Home() {
  const { analysis } = useStore();
  const ref = useReveal<HTMLDivElement>();
  return (
    <div ref={ref}>
      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="relative pb-16 pt-32 sm:pb-24 sm:pt-44">
        <Container className="text-center">
          <p className="eyebrow mb-6 text-muted fade-in" style={{ animationDelay: '150ms' }}>For Instagram</p>
          <KineticHeadline className="display hero-title" lines={['See who doesn’t', 'follow you back.']} />
          <p className="lede mx-auto mt-8 max-w-md text-lg text-graphite fade-in sm:text-xl" style={{ animationDelay: '700ms' }}>
            Upload your Instagram download. Get three simple lists. No password.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-3 fade-in" style={{ animationDelay: '850ms' }}>
            <Link to={analysis ? '/dashboard' : '/analyze'} className="btn btn-primary h-14 px-9">
              <Roll>{analysis ? 'Open my overview' : 'Get started'}</Roll>
            </Link>
            <a href="#how" className="btn btn-outline h-14 px-7"><Roll>How it works</Roll></a>
          </div>
        </Container>
        <Container className="mt-16 sm:mt-24">
          <ProductShot />
        </Container>
      </section>

      {/* ── How it works ───────────────────────────────────── */}
      <section id="how" className="scroll-mt-20 py-24 sm:py-36">
        <Container>
          <h2 data-reveal className="display text-[2.75rem] sm:text-7xl lg:text-8xl">No password.<br />Just a download.</h2>
          <ol className="mt-14 grid gap-3 sm:grid-cols-3">
            {HOW_STEPS.map(([t, b], i) => (
              <li
                key={t}
                data-reveal
                style={{ ['--reveal-delay' as string]: `${i * 60}ms` }}
                className="rounded-[28px] bg-mist p-7"
              >
                <span className="numeral block text-5xl text-muted">{String(i + 1).padStart(2, '0')}</span>
                <p className="headline mt-10 text-lg">{t}</p>
                <p className="mt-2 text-sm font-light text-muted">{b}</p>
              </li>
            ))}
          </ol>
          <div data-reveal className="mt-10 flex flex-wrap gap-3">
            <Link to="/analyze" className="btn btn-primary"><Roll>See every step</Roll><ArrowRight size={14} strokeWidth={1.5} /></Link>
          </div>
        </Container>
      </section>

      {/* ── Features ───────────────────────────────────────── */}
      <section id="features" className="scroll-mt-20 pb-24 sm:pb-36">
        <Container>
          <h2 data-reveal className="display text-[2.75rem] sm:text-7xl lg:text-8xl">Three lists.<br />That’s it.</h2>
          <ul className="mt-14 grid gap-3 sm:grid-cols-3">
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
                <li key={t} data-reveal style={{ ['--reveal-delay' as string]: `${i * 60}ms` }}>
                  <Link to={analysis ? to : '/analyze'} className={cls}>{body}</Link>
                </li>
              );
            })}
          </ul>
        </Container>
      </section>

      {/* ── The comparison, explained ─────────────────────────── */}
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
  { title: 'The rest doesn’t follow back.', body: 'Everyone you follow who doesn’t follow you.' },
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


/** A picture of the Overview, like a product shot. Example numbers, clearly labelled. */
function ProductShot() {
  const totals: [string, string][] = [['Followers', '412'], ['Following', '538']];
  const lists: [string, string][] = [['Don’t follow you back', '158'], ['You don’t follow back', '32'], ['Mutual', '380']];
  const rows = ['alex.morgan', 'jamie.lee', 'sam_rivera'];
  return (
    <figure data-reveal className="mx-auto max-w-5xl">
      <div aria-hidden="true" className="overflow-hidden rounded-[32px] bg-paper shadow-[inset_0_0_0_1px_#EAEAEA,0_60px_120px_-60px_rgba(0,0,0,0.45)]">
        <div className="flex items-center gap-1.5 border-b border-line px-6 py-4">
          {[0, 1, 2].map((i) => <span key={i} className="h-2.5 w-2.5 rounded-full bg-line" />)}
        </div>
        <div className="px-6 pb-8 pt-8 text-left sm:px-12 sm:pb-12 sm:pt-12">
          <p className="display text-3xl sm:text-5xl">Overview</p>
          <div className="mt-8 grid grid-cols-2 gap-px border-y border-t-ink border-b-line bg-line">
            {totals.map(([l, v], i) => (
              <div key={l} className={`bg-paper py-6 ${i ? 'pl-5 sm:pl-8' : ''}`}>
                <p className="eyebrow text-[0.625rem] text-muted">{l}</p>
                <p className="numeral mt-3 text-4xl sm:text-6xl">{v}</p>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-px border-b border-line bg-line">
            {lists.map(([l, v], i) => (
              <div key={l} className={`bg-paper py-6 pr-3 ${i ? 'pl-3 sm:pl-8' : ''}`}>
                <p className="eyebrow text-[0.5625rem] leading-snug text-muted sm:text-[0.625rem]">{l}</p>
                <p className="numeral mt-3 text-3xl sm:text-5xl">{v}</p>
              </div>
            ))}
          </div>
          <ul className="mt-6 hidden sm:block">
            {rows.map((u) => (
              <li key={u} className="flex items-center gap-4 border-b border-line py-3.5 last:border-0">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-mist text-xs uppercase text-muted">{u[0]}</span>
                <span className="text-[0.9375rem] font-medium">{u}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <figcaption className="mt-4 text-center text-xs font-light text-muted">Example numbers.</figcaption>
    </figure>
  );
}
