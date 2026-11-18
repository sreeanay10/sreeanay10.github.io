import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, Check, FileArchive, FileJson, Lock, X } from 'lucide-react';
import { Container, Segmented, useCoarsePointer } from '../components/ui';
import { Odometer, Roll } from '../components/motion';
import { burst } from '../lib/burst';
import { HealthReport } from '../components/Health';
import { GUIDE_STEPS } from './Home';
import { useStore } from '../store';
import { ImportError, parseFiles, parseZip, type ProgressUpdate } from '../lib/parse';
import type { ParseResult } from '../lib/types';
import { fmtNumber } from '../lib/format';

type Mode = 'zip' | 'files';
type Phase =
  | { k: 'idle' }
  | { k: 'working'; p: ProgressUpdate }
  | { k: 'done'; r: ParseResult }
  | { k: 'error'; message: string };

const STAGES: { id: ProgressUpdate['stage']; label: string }[] = [
  { id: 'reading', label: 'Reading files' },
  { id: 'parsing', label: 'Extracting data' },
  { id: 'analyzing', label: 'Analyzing connections' },
  { id: 'done', label: 'Generating your report' },
];

export default function Analyze() {
  const { addSnapshot, settings } = useStore();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>('zip');
  const [phase, setPhase] = useState<Phase>({ k: 'idle' });
  const [followersFiles, setFollowersFiles] = useState<File[]>([]);
  const [followingFiles, setFollowingFiles] = useState<File[]>([]);
  const coarse = useCoarsePointer();

  const finish = useCallback(async (run: () => Promise<ParseResult>, source: 'zip' | 'files', name: string) => {
    setPhase({ k: 'working', p: { stage: 'reading', progress: 0.02 } });
    try {
      const r = await run();
      setPhase({ k: 'working', p: { stage: 'analyzing', progress: 0.9, detail: `${fmtNumber(r.following.length)} following × ${fmtNumber(r.followers.length)} followers` } });
      await new Promise((res) => setTimeout(res, 450));
      setPhase({ k: 'working', p: { stage: 'done', progress: 0.97 } });
      await addSnapshot(r, source, name);
      await new Promise((res) => setTimeout(res, 450));
      setPhase({ k: 'done', r });
    } catch (e) {
      const message = e instanceof ImportError ? e.message : 'Something went wrong while reading this export. Please try again, or upload the files individually.';
      if (!(e instanceof ImportError)) console.error(e);
      setPhase({ k: 'error', message });
    }
  }, [addSnapshot]);

  const onProgress = (p: ProgressUpdate) => setPhase({ k: 'working', p });

  const handleZip = (file: File) => finish(() => parseZip(file, onProgress), 'zip', file.name);

  /** Smart drop: a ZIP goes straight in; loose files are sorted by name. */
  const handleAny = (files: File[]) => {
    const zip = files.find((f) => /\.zip$/i.test(f.name));
    if (zip) return handleZip(zip);
    const fol = files.filter((f) => /follower/i.test(f.name));
    const ing = files.filter((f) => /following/i.test(f.name));
    const other = files.filter((f) => !fol.includes(f) && !ing.includes(f));
    setMode('files');
    setFollowersFiles((p) => [...p, ...fol, ...other]);
    setFollowingFiles((p) => [...p, ...ing]);
  };

  const processFiles = () =>
    finish(() => parseFiles(followersFiles, followingFiles, onProgress), 'files', [...followersFiles, ...followingFiles].map((f) => f.name).join(', '));

  const doneRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (phase.k !== 'done') return;
    const r = doneRef.current?.getBoundingClientRect();
    if (r) burst(r.left + r.width / 2, r.top + 40, { count: 64, power: 1.1 });
  }, [phase.k]);

  useEffect(() => {
    if (phase.k !== 'done' || phase.r.health.checks.some((c) => c.level === 'warn' || c.level === 'error')) return;
    const t = setTimeout(() => navigate('/dashboard'), 3200);
    return () => clearTimeout(t);
  }, [phase, navigate]);

  return (
    <Container className="page-enter pb-24">
      <div className="grid gap-16 pt-12 sm:pt-20 lg:grid-cols-12 lg:gap-12">
        <div className="lg:col-span-7">
          <h1 className="display text-[2.75rem] sm:text-7xl">Upload<br />your export.</h1>
          <p className="lede mt-6 max-w-lg text-lg text-graphite">Drop the ZIP from Instagram. We do the rest.</p>

          {phase.k === 'idle' && (
            <>
              <div className="mt-10">
                <Segmented
                  label="Upload type"
                  value={mode}
                  onChange={setMode}
                  options={[{ value: 'zip', label: 'ZIP archive' }, { value: 'files', label: 'Single files' }]}
                />
              </div>

              {mode === 'zip' ? (
                <Dropzone
                  key="zip"
                  accept=".zip,application/zip,application/x-zip-compressed,.json,.html,.htm"
                  multiple
                  onFiles={handleAny}
                  icon={<FileArchive size={28} strokeWidth={1} />}
                  title={coarse ? 'Choose your Instagram ZIP' : 'Drop your Instagram ZIP'}
                  hint="JSON or HTML"
                  cta={coarse ? 'Choose file' : 'Browse files'}
                  tall
                />
              ) : (
                <div className="fade-in mt-8 space-y-6">
                  <FileSlot label="Followers" hint="followers_1.json — add every part" files={followersFiles} setFiles={setFollowersFiles} />
                  <FileSlot label="Following" hint="following.json" files={followingFiles} setFiles={setFollowingFiles} />
                  <button className="btn btn-primary w-full sm:w-auto" disabled={!followersFiles.length && !followingFiles.length} onClick={processFiles}>
                    <Roll>Analyze files</Roll>
                  </button>
                </div>
              )}
              <p className="mt-6 flex items-center gap-2 text-xs font-light text-muted">
                <Lock size={12} strokeWidth={1.5} /> Stays on your device.
                {!settings.historyEnabled && ' History is off.'}
              </p>
            </>
          )}

          {phase.k === 'working' && <Progress p={phase.p} />}

          {phase.k === 'done' && (
            <div ref={doneRef} className="page-enter mt-12 rounded-[32px] bg-mist p-8 sm:p-10" aria-live="polite">
              <p className="eyebrow flex items-center gap-2"><Check size={14} /> Done</p>
              <div className="mt-8 grid grid-cols-2 gap-8">
                <div>
                  <p className="numeral text-5xl sm:text-6xl"><Odometer id={`up-f-${phase.r.followers.length}-${Date.now() >> 12}`} value={fmtNumber(phase.r.followers.length)} /></p>
                  <p className="eyebrow mt-3 text-muted">Followers</p>
                </div>
                <div>
                  <p className="numeral text-5xl sm:text-6xl"><Odometer id={`up-g-${phase.r.following.length}-${Date.now() >> 12}`} value={fmtNumber(phase.r.following.length)} /></p>
                  <p className="eyebrow mt-3 text-muted">Following</p>
                </div>
              </div>
              <div className="mt-8 border-t border-line pt-6">
                <p className="eyebrow mb-4 text-muted">Data health</p>
                <HealthReport report={phase.r.health} />
              </div>
              <button className="btn btn-primary mt-8" onClick={() => navigate('/dashboard')}><Roll>View dashboard</Roll></button>
            </div>
          )}

          {phase.k === 'error' && (
            <div className="page-enter mt-12 rounded-[32px] bg-mist p-8 sm:p-10" role="alert">
              <p className="eyebrow flex items-center gap-2"><AlertCircle size={14} /> Couldn't read that</p>
              <p className="lede mt-5 max-w-lg text-lg text-graphite">{phase.message}</p>
              <button className="btn btn-primary mt-8" onClick={() => setPhase({ k: 'idle' })}><Roll>Try again</Roll></button>
            </div>
          )}
        </div>

        <aside className="lg:col-span-5 lg:pl-8">
          <p className="eyebrow mb-4 text-muted">Get your export</p>
          <ol className="space-y-2">
            {GUIDE_STEPS.map(([t, b], i) => (
              <li
                key={t}
                className="flex items-center gap-4 rounded-[20px] bg-mist px-5 py-4 transition-transform duration-500 [transition-timing-function:var(--ease-spring)] hover:translate-x-1"
                style={{ animation: `rise 600ms var(--ease-sheet) ${200 + i * 60}ms backwards` }}
              >
                <span className="numeral w-6 text-xl text-muted">{i + 1}</span>
                <div>
                  <p className="text-[0.9375rem] font-medium">{t}</p>
                  <p className="text-[0.8125rem] font-light text-muted">{b}</p>
                </div>
              </li>
            ))}
          </ol>
        </aside>
      </div>
    </Container>
  );
}

function Dropzone({ accept, multiple, onFiles, icon, title, hint, tall = false, cta }: {
  accept: string;
  multiple?: boolean;
  onFiles: (f: File[]) => void;
  icon: React.ReactNode;
  title: string;
  hint: string;
  tall?: boolean;
  cta?: string;
}) {
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const depth = useRef(0);
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    depth.current = 0;
    setOver(false);
    const files = [...e.dataTransfer.files];
    if (files.length) onFiles(files);
  };
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => input.current?.click()}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), input.current?.click())}
      onDragEnter={(e) => { e.preventDefault(); depth.current++; setOver(true); }}
      onDragLeave={() => { depth.current--; if (depth.current <= 0) setOver(false); }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
      className={`group relative mt-6 flex cursor-pointer flex-col items-center justify-center px-6 text-center transition-[background-color,color,transform,box-shadow] duration-500 [transition-timing-function:var(--ease-spring)] active:scale-[0.98] focus-visible:outline-offset-4 ${
        tall ? 'min-h-[18rem] sm:min-h-[24rem]' : 'min-h-[8rem]'
      } ${over ? 'blob scale-[1.02] bg-ink text-paper shadow-[0_40px_80px_-30px_rgba(0,0,0,0.5)]' : 'rounded-[32px] bg-mist shadow-[inset_0_0_0_1px_#EAEAEA] hover:bg-[#F2F2F2]'}`}
    >
      <span className="transition-transform duration-500 ease-sheet" style={{ transform: over ? 'translateY(-8px) scale(1.08)' : 'none' }}>{icon}</span>
      <p className={`headline mt-6 ${tall ? 'text-xl sm:text-2xl' : 'text-base sm:text-lg'}`}>{over ? 'Release to analyze' : title}</p>
      <p className={`mt-2 text-[0.8125rem] font-light transition-colors ${over ? 'text-paper/60' : 'text-muted'}`}>{hint}</p>
      {cta && (
        <span className={`label mt-8 inline-flex h-10 items-center rounded-full bg-ink px-6 text-[0.625rem] text-paper transition-[opacity,transform] duration-500 [transition-timing-function:var(--ease-spring)] group-hover:scale-105 ${over ? 'scale-50 opacity-0' : ''}`}>
          {cta}
        </span>
      )}
      <input
        ref={input}
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        onChange={(e) => { const f = [...(e.target.files ?? [])]; e.target.value = ''; if (f.length) onFiles(f); }}
      />
    </div>
  );
}

function FileSlot({ label, hint, files, setFiles }: { label: string; hint: string; files: File[]; setFiles: (f: File[]) => void }) {
  return (
    <div>
      <p className="eyebrow mb-1 text-muted">{label}</p>
      {files.length > 0 ? (
        <ul className="space-y-2">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className="flex items-center gap-3 rounded-[16px] bg-mist px-4 py-3" style={{ animation: 'rise 500ms var(--ease-spring) backwards' }}>
              <FileJson size={18} strokeWidth={1.25} />
              <span className="flex-1 truncate text-sm">{f.name}</span>
              <span className="text-xs text-muted tabular-nums">{(f.size / 1024).toFixed(0)} KB</span>
              <button className="icon-btn h-8 w-8" aria-label={`Remove ${f.name}`} onClick={() => setFiles(files.filter((_, j) => j !== i))}>
                <X size={14} />
              </button>
            </li>
          ))}
          <li>
            <label className="label link-underline mt-3 inline-block cursor-pointer text-[0.625rem]">
              Add another part
              <input type="file" accept=".json,.html,.htm" multiple className="hidden" onChange={(e) => { const f = [...(e.target.files ?? [])]; e.target.value = ''; setFiles([...files, ...f]); }} />
            </label>
          </li>
        </ul>
      ) : (
        <Dropzone accept=".json,.html,.htm" multiple onFiles={(f) => setFiles([...files, ...f])} icon={<FileJson size={22} strokeWidth={1} />} title={`Add ${label.toLowerCase()} file`} hint={hint} />
      )}
    </div>
  );
}

function Progress({ p }: { p: ProgressUpdate }) {
  // Stage-based: we show which step is running, never a made-up percentage.
  const stage = p.stage === 'locating' ? 'parsing' : p.stage;
  const current = Math.max(0, STAGES.findIndex((s) => s.id === stage));
  const draw = Math.min(1, (current + (stage === 'parsing' ? 0.5 : 0)) / 2);
  const join = current >= 2 ? 1 : 0;
  const C = 2 * Math.PI * 150;
  const rx = 400 + (1 - join) * 230;
  return (
    <div className="page-enter mt-10 rounded-[32px] bg-mist p-8 sm:p-10" aria-live="polite" aria-busy="true">
      <div className="mx-auto aspect-[640/400] w-full max-w-[300px]">
        <svg viewBox="0 30 640 380" className="h-full w-full overflow-visible" aria-hidden="true">
          <defs><clipPath id="prog-l"><circle cx="240" cy="210" r="150" /></clipPath></defs>
          <circle cx={rx} cy="210" r="150" fill="#E3E3E3" clipPath="url(#prog-l)" opacity={join} style={{ transition: 'all 900ms var(--ease-spring)' }} />
          <circle cx="240" cy="210" r="150" fill="none" stroke="#000" strokeWidth="3" strokeDasharray={C} strokeDashoffset={C * (1 - draw)} transform="rotate(-90 240 210)" style={{ transition: 'stroke-dashoffset 900ms var(--ease-sheet)' }} />
          <circle cx={rx} cy="210" r="150" fill="none" stroke="#000" strokeWidth="3" opacity={join} style={{ transition: 'all 900ms var(--ease-spring)' }} />
        </svg>
      </div>
      <ol className="mt-8 space-y-3">
        {STAGES.map((s, i) => (
          <li key={s.id} className={`flex items-center gap-3 transition-opacity duration-500 ${i > current ? 'opacity-30' : ''}`}>
            <span className="flex h-5 w-5 items-center justify-center">
              {i < current ? <Check size={15} strokeWidth={2} /> : i === current ? <span className="spinner" /> : <span className="h-1.5 w-1.5 rounded-full bg-ink" />}
            </span>
            <span className="label text-[0.6875rem]">{s.label}</span>
          </li>
        ))}
      </ol>
      {p.detail && <p className="mt-4 truncate text-xs font-light text-muted">{p.detail}</p>}
    </div>
  );
}
