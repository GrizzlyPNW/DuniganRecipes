import { useEffect, useRef, useState } from 'react';
import { groupName, isGroup, type Recipe, type Contributor } from '../types';
import { minsLabel, timerMins } from '../lib/util';

/** A running timer. It stores when it ends, so it stays right even if the phone sleeps. */
interface Timer {
  id: number;
  step: number;
  label: string;
  /** When it ends (ms). Null while paused. */
  endAt: number | null;
  /** Seconds left while paused. */
  pausedLeft: number;
  rang: boolean;
}

const secsLeft = (t: Timer, now: number) => (t.endAt === null ? t.pausedLeft : Math.max(0, Math.ceil((t.endAt - now) / 1000)));
const clock = (s: number) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
};

/** A soft three-note chime, repeated until someone taps "Got it". */
function useChime() {
  const ctx = useRef<AudioContext | null>(null);
  const iv = useRef<number | null>(null);
  // Phones only allow sound after a tap, so this runs when a timer is started.
  const unlock = () => {
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!ctx.current && AC) ctx.current = new AC();
      void ctx.current?.resume();
    } catch {
      /* no audio */
    }
  };
  const ring = () => {
    navigator.vibrate?.([300, 150, 300]);
    const c = ctx.current;
    if (!c) return;
    [880, 1109, 1319].forEach((f, i) => {
      const o = c.createOscillator();
      const g = c.createGain();
      const t0 = c.currentTime + i * 0.22;
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.35, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.6);
      o.connect(g).connect(c.destination);
      o.start(t0);
      o.stop(t0 + 0.65);
    });
  };
  const stop = () => {
    if (iv.current !== null) clearInterval(iv.current);
    iv.current = null;
  };
  const start = () => {
    if (iv.current !== null) return;
    ring();
    iv.current = window.setInterval(ring, 2500);
  };
  useEffect(() => stop, []);
  return { unlock, start, stop };
}

export function CookMode({
  recipe: r,
  from,
  close,
  toStories,
}: {
  recipe: Recipe;
  from: Contributor;
  close: () => void;
  toStories: () => void;
  toast: (t: string) => void;
}) {
  // Section headings ("Caramel sauce") aren't steps; each step remembers which section it's in.
  const all = r.steps || [];
  const steps: string[] = [];
  const sections: (string | null)[] = [];
  let section: string | null = null;
  for (const s of all) {
    if (isGroup(s)) section = groupName(s);
    else {
      steps.push(s);
      sections.push(section);
    }
  }
  const ings = r.ingredients || [];
  const [step, setStep] = useState(0);
  const [done, setDone] = useState(false);
  const [timers, setTimers] = useState<Timer[]>([]);
  const [now, setNow] = useState(Date.now());
  const [showIngs, setShowIngs] = useState(false);
  const [got, setGot] = useState<Record<number, boolean>>({});
  const chime = useChime();
  const nextId = useRef(1);

  // Keep the screen awake while cooking, where the phone allows it.
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<typeof lock> } };
    const ask = () => nav.wakeLock?.request('screen').then((l) => (lock = l)).catch(() => {});
    ask();
    // Phones drop the lock when the app is hidden; ask again on return.
    const vis = () => {
      if (document.visibilityState === 'visible') {
        ask();
        setNow(Date.now());
      }
    };
    document.addEventListener('visibilitychange', vis);
    return () => {
      document.removeEventListener('visibilitychange', vis);
      void lock?.release().catch(() => {});
    };
  }, []);

  const ticking = timers.some((t) => t.endAt !== null && !t.rang);
  useEffect(() => {
    if (!ticking) return;
    const iv = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(iv);
  }, [ticking]);

  // Ring when a timer reaches zero.
  useEffect(() => {
    if (timers.some((t) => t.endAt !== null && !t.rang && t.endAt <= now))
      setTimers((ts) => ts.map((t) => (t.endAt !== null && !t.rang && t.endAt <= now ? { ...t, rang: true } : t)));
  }, [now, timers]);
  const ringing = timers.filter((t) => t.rang);
  useEffect(() => {
    if (ringing.length) chime.start();
    else chime.stop();
  }, [ringing.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const startTimer = (mins: number, label: string) => {
    chime.unlock();
    const t = Date.now();
    setNow(t);
    setTimers((ts) => [...ts, { id: nextId.current++, step, label, endAt: t + mins * 60_000, pausedLeft: 0, rang: false }]);
  };
  const toggle = (id: number) =>
    setTimers((ts) =>
      ts.map((t) =>
        t.id !== id
          ? t
          : t.endAt === null
            ? { ...t, endAt: Date.now() + t.pausedLeft * 1000 }
            : { ...t, endAt: null, pausedLeft: secsLeft(t, Date.now()) },
      ),
    );
  const remove = (id: number) => setTimers((ts) => ts.filter((t) => t.id !== id));

  const leave = (fn: () => void) => {
    const live = timers.filter((t) => !t.rang && secsLeft(t, now) > 0).length;
    if (live && !window.confirm(`You have ${live === 1 ? 'a timer' : live + ' timers'} running. Leave cook mode and stop ${live === 1 ? 'it' : 'them'}?`)) return;
    chime.stop();
    fn();
  };

  const ringBox = ringing.length > 0 && (
    <div className="timer-ring" role="alertdialog" aria-label="Timer done">
      <div className="bell" aria-hidden>
        ⏰
      </div>
      <div className="big">Timer done</div>
      <div className="sub">{ringing.map((t) => t.label).join(' · ')}</div>
      <button className="btn btn-block" onClick={() => setTimers((ts) => ts.filter((t) => !t.rang))}>
        Got it
      </button>
    </div>
  );

  if (done) {
    return (
      <div className="cook-mode done-screen">
        <div className="eyebrow" style={{ color: 'var(--cook-accent)', fontSize: 12 }}>
          All done
        </div>
        <div className="big">Enjoy every bite.</div>
        <div className="sub">
          {r.title}
          {r.contributor !== 'none' ? `, from the kitchen of ${from.name}.` : '.'}
        </div>
        <button
          className="btn btn-block"
          style={{ marginTop: 36, height: 58, borderRadius: 18, background: 'var(--cook-accent)', color: 'var(--ink)', fontSize: 16 }}
          onClick={() => leave(toStories)}
        >
          Add a photo or story
        </button>
        <button
          className="btn btn-block"
          style={{ marginTop: 10, height: 52, borderRadius: 18, border: '1.5px solid rgba(247,242,232,.25)', background: 'transparent', color: 'var(--paper)' }}
          onClick={() => leave(close)}
        >
          Back to recipe
        </button>
        {ringBox}
      </div>
    );
  }

  const t = steps[step] || '';
  const mins = timerMins(t);
  const last = step === steps.length - 1;
  const live = timers.filter((x) => !x.rang);
  const stepHasTimer = live.some((x) => x.step === step);

  return (
    <div className="cook-mode">
      <div className="row-between" style={{ alignItems: 'center' }}>
        <button className="x" onClick={() => leave(close)} aria-label="Close cook mode">
          ✕
        </button>
        <div className="ttl">{r.title}</div>
        <div className="ttl" style={{ width: 44, textAlign: 'right', padding: 0 }}>
          {step + 1}/{steps.length}
        </div>
      </div>
      <div className="segs">
        {steps.map((_, i) => (
          <i key={i} className={i <= step ? 'on' : ''} />
        ))}
      </div>
      {live.length > 0 && (
        <div className="timers">
          {live.map((x) => (
            <div key={x.id} className={'timer-chip' + (x.endAt === null ? ' paused' : '')}>
              <button className="tc-main" onClick={() => toggle(x.id)} aria-label={(x.endAt === null ? 'Resume ' : 'Pause ') + x.label + ' timer'}>
                <b>{clock(secsLeft(x, now))}</b>
                <span>
                  {x.endAt === null ? 'Paused · ' : ''}
                  {x.label}
                </span>
              </button>
              <button className="tc-x" onClick={() => remove(x.id)} aria-label={'Stop ' + x.label + ' timer'}>
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="cook-body">
        <div className="eyebrow">
          {sections[step] ? sections[step] + ' · ' : ''}Step {step + 1}
        </div>
        <div className="txt">{t}</div>
        <div className="cook-tools">
          {mins && !stepHasTimer && (
            <button className="timer-start" onClick={() => startTimer(mins, 'Step ' + (step + 1))}>
              Start {minsLabel(mins)} timer
            </button>
          )}
          {ings.length > 0 && (
            <button className="timer-start ghost" onClick={() => setShowIngs(true)}>
              Ingredients
            </button>
          )}
        </div>
      </div>
      <div className="cook-nav">
        <button className="b" style={{ opacity: step === 0 ? 0.35 : 1 }} onClick={() => step > 0 && setStep(step - 1)}>
          Back
        </button>
        <button className="f" onClick={() => (last ? setDone(true) : setStep(step + 1))}>
          {last ? 'Finish' : 'Next step'}
        </button>
      </div>

      {showIngs && (
        <div className="cook-ings" role="dialog" aria-label="Ingredients">
          <div className="row-between" style={{ alignItems: 'center', marginBottom: 12 }}>
            <div className="big">Ingredients</div>
            <button className="x" onClick={() => setShowIngs(false)} aria-label="Close ingredients">
              ✕
            </button>
          </div>
          <div className="cook-ings-list">
            {ings.map((x, i) =>
              isGroup(x) ? (
                <div key={i} className="eyebrow" style={{ color: 'var(--cook-accent)', marginTop: 14 }}>
                  {groupName(x)}
                </div>
              ) : (
                <button key={i} className={'ci' + (got[i] ? ' on' : '')} role="checkbox" aria-checked={!!got[i]} onClick={() => setGot({ ...got, [i]: !got[i] })}>
                  <span className="box">{got[i] ? '✓' : ''}</span>
                  <span>{x}</span>
                </button>
              ),
            )}
          </div>
          <button
            className="btn btn-block"
            style={{ marginTop: 14, height: 54, borderRadius: 18, background: 'var(--cook-accent)', color: 'var(--ink)' }}
            onClick={() => setShowIngs(false)}
          >
            Back to step {step + 1}
          </button>
        </div>
      )}
      {ringBox}
    </div>
  );
}
