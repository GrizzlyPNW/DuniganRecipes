import { useEffect, useState } from 'react';
import type { Recipe, Contributor } from '../types';
import { minsLabel, timerMins } from '../lib/util';

export function CookMode({
  recipe: r,
  from,
  close,
  toStories,
  toast,
}: {
  recipe: Recipe;
  from: Contributor;
  close: () => void;
  toStories: () => void;
  toast: (t: string) => void;
}) {
  const steps = r.steps || [];
  const [step, setStep] = useState(0);
  const [done, setDone] = useState(false);
  const [left, setLeft] = useState<number | null>(null);
  const [running, setRunning] = useState(false);

  // Keep the screen awake while cooking, where the phone allows it.
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<typeof lock> } };
    nav.wakeLock?.request('screen').then((l) => (lock = l)).catch(() => {});
    return () => void lock?.release().catch(() => {});
  }, []);

  useEffect(() => {
    if (!running) return;
    const iv = setInterval(() => setLeft((n) => (n && n > 0 ? n - 1 : n)), 1000);
    return () => clearInterval(iv);
  }, [running]);

  useEffect(() => {
    if (left === 0 && running) {
      setRunning(false);
      toast('Timer done');
      navigator.vibrate?.([300, 150, 300]);
    }
  }, [left, running, toast]);

  const goStep = (n: number) => {
    setStep(n);
    setLeft(null);
    setRunning(false);
  };

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
        <button className="btn btn-block" style={{ marginTop: 36, height: 58, borderRadius: 18, background: 'var(--cook-accent)', color: 'var(--ink)', fontSize: 16 }} onClick={toStories}>
          Add a story about today
        </button>
        <button
          className="btn btn-block"
          style={{ marginTop: 10, height: 52, borderRadius: 18, border: '1.5px solid rgba(247,242,232,.25)', background: 'transparent', color: 'var(--paper)' }}
          onClick={close}
        >
          Back to recipe
        </button>
      </div>
    );
  }

  const t = steps[step] || '';
  const mins = timerMins(t);
  const last = step === steps.length - 1;

  return (
    <div className="cook-mode">
      <div className="row-between" style={{ alignItems: 'center' }}>
        <button className="x" onClick={close} aria-label="Close cook mode">
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
      <div className="cook-body">
        <div className="eyebrow">Step {step + 1}</div>
        <div className="txt">{t}</div>
        {mins &&
          (left === null ? (
            <button
              className="timer-start"
              onClick={() => {
                setLeft(mins * 60);
                setRunning(true);
              }}
            >
              Start {minsLabel(mins)} timer
            </button>
          ) : (
            <div className="timer">
              <div className={'clock' + (left === 0 ? ' done' : '')}>
                {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}
              </div>
              <button className="p" onClick={() => setRunning(!running)} disabled={left === 0}>
                {running ? 'Pause' : 'Resume'}
              </button>
              <button className="r" onClick={() => (setLeft(null), setRunning(false))} aria-label="Reset timer">
                ↺
              </button>
            </div>
          ))}
      </div>
      <div className="cook-nav">
        <button className="b" style={{ opacity: step === 0 ? 0.35 : 1 }} onClick={() => step > 0 && goStep(step - 1)}>
          Back
        </button>
        <button className="f" onClick={() => (last ? (setDone(true), setRunning(false)) : goStep(step + 1))}>
          {last ? 'Finish' : 'Next step'}
        </button>
      </div>
    </div>
  );
}
