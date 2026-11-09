import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Sparkles, CalendarDays, ShieldCheck, Zap } from 'lucide-react';
import { Button, Field, Logo, cx } from '../components/ui/index.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { errorMessage, fieldErrors } from '../api/client.js';

const PREVIEW = [
  { day: 'Mon', time: '6:00 PM', title: 'ML Assignment — backprop', color: 'bg-rose-400' },
  { day: 'Mon', time: '7:45 PM', title: 'Quiz 4 practice set', color: 'bg-amber-400' },
  { day: 'Tue', time: '6:00 PM', title: 'SE Midterm — UML review', color: 'bg-rose-400' },
  { day: 'Wed', time: '6:30 PM', title: 'Read Ch. 7 consensus', color: 'bg-emerald-400' },
];

export default function AuthPage({ mode }) {
  const isLogin = mode === 'login';
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    setFormError('');
    try {
      if (isLogin) await login(form.email, form.password);
      else await register(form.name, form.email, form.password);
      navigate('/');
    } catch (err) {
      setErrors(fieldErrors(err));
      setFormError(errorMessage(err, isLogin ? 'Could not log in' : 'Could not create your account'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      {/* Brand panel */}
      <div className="relative hidden overflow-hidden bg-slate-950 p-12 text-white lg:flex lg:flex-col">
        <div className="absolute -top-40 -left-32 size-[520px] rounded-full bg-indigo-600/30 blur-3xl" />
        <div className="absolute -right-24 bottom-0 size-[420px] rounded-full bg-fuchsia-600/20 blur-3xl" />
        <div className="relative flex items-center gap-2.5">
          <div className="ai-gradient flex size-9 items-center justify-center rounded-lg">
            <svg viewBox="0 0 32 32" className="size-[70%]"><path d="M8 11h16M8 16h10M8 21h7" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" /><circle cx="22.5" cy="21" r="2.8" fill="#fde68a" /></svg>
          </div>
          <span className="text-lg font-semibold">StudyMate</span>
        </div>
        <div className="relative mt-auto max-w-lg">
          <p className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-medium text-indigo-200">
            <Sparkles className="size-3.5" /> AI study planning, powered by Gemini
          </p>
          <h1 className="text-4xl leading-tight font-semibold tracking-tight">
            Plan smarter.
            <br />
            Study better.
            <br />
            <span className="bg-gradient-to-r from-indigo-300 via-violet-300 to-fuchsia-300 bg-clip-text text-transparent">Achieve more.</span>
          </h1>
          <p className="mt-4 text-[15px] leading-relaxed text-slate-300">
            Add your assignments and exams, tell StudyMate when you're free, and get a realistic weekly study schedule — checked against every deadline.
          </p>

          <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur">
            <div className="mb-3 flex items-center justify-between text-xs text-slate-400">
              <span className="font-medium text-slate-200">This week</span>
              <span className="inline-flex items-center gap-1"><CalendarDays className="size-3.5" /> 4 sessions · 5.5h</span>
            </div>
            <div className="space-y-2">
              {PREVIEW.map((p) => (
                <div key={p.title} className="flex items-center gap-3 rounded-lg bg-white/[0.06] px-3 py-2">
                  <span className={cx('h-7 w-1 rounded-full', p.color)} />
                  <span className="w-9 text-xs font-medium text-slate-400">{p.day}</span>
                  <span className="flex-1 truncate text-sm text-slate-100">{p.title}</span>
                  <span className="text-xs text-slate-400">{p.time}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-8 flex gap-6 text-sm text-slate-400">
            <span className="inline-flex items-center gap-1.5"><ShieldCheck className="size-4 text-emerald-400" /> Deadline-validated</span>
            <span className="inline-flex items-center gap-1.5"><Zap className="size-4 text-amber-300" /> Works without AI too</span>
          </div>
        </div>
      </div>

      {/* Form */}
      <div className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm animate-fade-in">
          <div className="mb-8 lg:hidden">
            <Logo size="lg" />
          </div>
          <h2 className="text-2xl font-semibold tracking-tight">{isLogin ? 'Welcome back' : 'Create your account'}</h2>
          <p className="mt-1.5 text-sm text-slate-500">{isLogin ? 'Log in to see your study plan.' : 'Start planning your week in under a minute.'}</p>

          <form onSubmit={submit} className="mt-8 space-y-4" noValidate>
            {!isLogin && (
              <Field label="Full name" htmlFor="name" error={errors.name}>
                <input id="name" className={cx('input', errors.name && 'input-error')} value={form.name} onChange={set('name')} autoComplete="name" placeholder="Alex Rivera" />
              </Field>
            )}
            <Field label="Email" htmlFor="email" error={errors.email}>
              <input id="email" type="email" className={cx('input', errors.email && 'input-error')} value={form.email} onChange={set('email')} autoComplete="email" placeholder="you@university.edu" />
            </Field>
            <Field label="Password" htmlFor="password" error={errors.password} hint={!isLogin ? 'At least 8 characters' : undefined}>
              <input id="password" type="password" className={cx('input', errors.password && 'input-error')} value={form.password} onChange={set('password')} autoComplete={isLogin ? 'current-password' : 'new-password'} placeholder="••••••••" />
            </Field>
            {formError && !Object.keys(errors).length && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{formError}</p>}
            <Button type="submit" size="lg" className="w-full" loading={busy}>
              {isLogin ? 'Log in' : 'Create account'}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-500">
            {isLogin ? "Don't have an account? " : 'Already have an account? '}
            <Link to={isLogin ? '/register' : '/login'} className="font-medium text-brand-600 hover:text-brand-700">
              {isLogin ? 'Sign up' : 'Log in'}
            </Link>
          </p>
          {isLogin && (
            <p className="mt-8 rounded-lg border border-dashed border-slate-200 px-3 py-2.5 text-center text-xs text-slate-500">
              Demo account (after <code className="rounded bg-slate-100 px-1">npm run seed</code>): demo@studymate.app / demo1234
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
