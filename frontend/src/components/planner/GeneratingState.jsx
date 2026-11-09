import { useEffect, useState } from 'react';
import { Check, LoaderCircle } from 'lucide-react';
import { cx } from '../ui/index.jsx';

const STEPS = ['Reading your tasks and deadlines', 'Checking your weekly availability', 'Prioritizing work and breaking it into sessions', 'Validating every session against your rules'];

export default function GeneratingState({ aiEnabled }) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), aiEnabled ? 1800 : 450);
    return () => clearInterval(t);
  }, [aiEnabled]);

  return (
    <div className="relative overflow-hidden rounded-xl border border-brand-100 bg-white p-8 sm:p-10">
      <div className="ai-gradient absolute -top-24 -right-24 size-64 rounded-full opacity-10 blur-3xl" />
      <div className="relative mx-auto max-w-md text-center">
        <div className="ai-gradient relative mx-auto flex size-14 items-center justify-center rounded-2xl shadow-[0_8px_30px_-8px_rgb(99_102_241/0.8)]">
          <div className="shimmer absolute inset-0 rounded-2xl" />
          <LoaderCircle className="relative size-6 animate-spin text-white" />
        </div>
        <h2 className="mt-5 text-lg font-semibold text-slate-900">{aiEnabled ? 'Gemini is planning your week…' : 'Building your study plan…'}</h2>
        <p className="mt-1 text-sm text-slate-500">{aiEnabled ? 'This usually takes 5–20 seconds on the free tier.' : 'Using StudyMate’s built-in scheduling algorithm.'}</p>
        <ol className="mt-7 space-y-3 text-left">
          {STEPS.map((label, i) => (
            <li key={label} className={cx('flex items-center gap-3 text-sm transition', i <= step ? 'text-slate-800' : 'text-slate-400')}>
              <span className={cx('flex size-6 shrink-0 items-center justify-center rounded-full border', i < step ? 'border-emerald-500 bg-emerald-500 text-white' : i === step ? 'border-brand-400 text-brand-500' : 'border-slate-200')}>
                {i < step ? <Check className="size-3.5" strokeWidth={3} /> : i === step ? <LoaderCircle className="size-3.5 animate-spin" /> : null}
              </span>
              {label}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
