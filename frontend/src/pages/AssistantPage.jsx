import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Send, Sparkles, Cpu, RefreshCw, CircleAlert, KeyRound } from 'lucide-react';
import { Button, Card, PageHeader, PageLoader, cx } from '../components/ui/index.jsx';
import Markdown from '../components/ui/Markdown.jsx';
import { api, errorMessage, errorCode } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';

const SUGGESTIONS = [
  'What should I study today?',
  'Which assignment should I prioritize?',
  'Help me break my biggest project into smaller tasks.',
  'Do I have enough time to prepare for my upcoming exam?',
  'How should I distribute my study hours this week?',
];

export default function AssistantPage() {
  const { user } = useAuth();
  const [status, setStatus] = useState(null);
  const [messages, setMessages] = useState([]); // { role, content, error? }
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const endRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    api.get('/ai/status').then((r) => setStatus(r.data)).catch(() => setStatus({ configured: false }));
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, busy]);

  async function send(text) {
    const message = (text ?? input).trim();
    if (!message || busy) return;
    const history = messages.filter((m) => !m.error).map(({ role, content }) => ({ role, content }));
    setMessages((m) => [...m, { role: 'user', content: message }]);
    setInput('');
    setBusy(true);
    try {
      const res = await api.post('/assistant/chat', { message, history });
      setMessages((m) => [...m, { role: 'assistant', content: res.data.reply }]);
    } catch (err) {
      const code = errorCode(err);
      setMessages((m) => [...m, { role: 'assistant', content: errorMessage(err, 'The assistant is unavailable right now.'), error: code || 'ERROR' }]);
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  if (!status) return <PageLoader />;

  const disabled = !status.configured;

  return (
    <div className="flex h-[calc(100vh-7rem)] animate-fade-in flex-col lg:h-[calc(100vh-4.5rem)]">
      <PageHeader
        title={
          <span className="flex items-center gap-2.5">
            AI Study Assistant
            <span className={cx('rounded-full px-2 py-0.5 text-[11px] font-semibold', status.configured ? 'bg-violet-100 text-violet-700' : 'bg-amber-100 text-amber-800')}>
              {status.configured ? status.model : 'Not configured'}
            </span>
          </span>
        }
        description="Ask about priorities, time management or how to break work down. The assistant sees your tasks, availability and current plan."
        actions={
          messages.length > 0 && (
            <Button variant="secondary" icon={RefreshCw} onClick={() => setMessages([])}>
              New chat
            </Button>
          )
        }
      />

      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="scrollbar-thin flex-1 overflow-y-auto px-4 py-6 sm:px-8">
          {disabled ? (
            <div className="mx-auto flex max-w-md flex-col items-center py-10 text-center">
              <div className="flex size-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
                <KeyRound className="size-6" />
              </div>
              <h2 className="mt-4 text-lg font-semibold text-slate-900">The AI assistant isn't connected</h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-500">
                StudyMate is running in <strong className="font-medium text-slate-700">fallback mode</strong>. To chat with the assistant, add a free Google AI Studio key as <code className="rounded bg-slate-100 px-1">GEMINI_API_KEY</code> in <code className="rounded bg-slate-100 px-1">backend/.env</code> and restart the server.
              </p>
              <p className="mt-3 text-sm text-slate-500">Everything else — tasks, availability and study plans — works without it.</p>
              <Link to="/settings" className="mt-5">
                <Button variant="secondary">View AI settings</Button>
              </Link>
            </div>
          ) : messages.length === 0 ? (
            <div className="mx-auto flex max-w-xl flex-col items-center py-6 text-center">
              <div className="ai-gradient flex size-14 items-center justify-center rounded-2xl text-white shadow-[0_10px_30px_-10px_rgb(99_102_241/0.9)]">
                <Sparkles className="size-6" />
              </div>
              <h2 className="mt-4 text-lg font-semibold text-slate-900">Hi {user?.name?.split(' ')[0]}, how can I help you study?</h2>
              <p className="mt-1 text-sm text-slate-500">Try one of these:</p>
              <div className="mt-5 grid w-full gap-2 sm:grid-cols-2">
                {SUGGESTIONS.map((s) => (
                  <button key={s} onClick={() => send(s)} className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-left text-sm text-slate-700 transition hover:border-brand-300 hover:bg-brand-50/40 hover:text-slate-900">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="mx-auto max-w-3xl space-y-5">
              {messages.map((m, i) =>
                m.role === 'user' ? (
                  <div key={i} className="flex justify-end">
                    <div className="max-w-[85%] rounded-2xl rounded-br-md bg-slate-900 px-4 py-2.5 text-sm text-white">{m.content}</div>
                  </div>
                ) : (
                  <div key={i} className="flex gap-3">
                    <div className={cx('flex size-8 shrink-0 items-center justify-center rounded-lg', m.error ? 'bg-rose-50 text-rose-500' : 'ai-gradient text-white')}>
                      {m.error ? <CircleAlert className="size-4" /> : <Sparkles className="size-4" />}
                    </div>
                    <div className={cx('min-w-0 max-w-[85%] rounded-2xl rounded-tl-md px-4 py-3 text-sm leading-relaxed', m.error ? 'border border-rose-200 bg-rose-50 text-rose-800' : 'border border-slate-200 bg-white text-slate-700')}>
                      {m.error ? m.content : <Markdown text={m.content} />}
                    </div>
                  </div>
                )
              )}
              {busy && (
                <div className="flex gap-3">
                  <div className="ai-gradient flex size-8 shrink-0 items-center justify-center rounded-lg text-white">
                    <Sparkles className="size-4" />
                  </div>
                  <div className="flex items-center gap-1.5 rounded-2xl rounded-tl-md border border-slate-200 bg-white px-4 py-3.5" aria-label="Assistant is typing">
                    {[0, 150, 300].map((d) => (
                      <span key={d} className="size-1.5 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: `${d}ms` }} />
                    ))}
                  </div>
                </div>
              )}
              <div ref={endRef} />
            </div>
          )}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
          className="border-t border-slate-100 bg-white p-3 sm:p-4"
        >
          <div className="mx-auto flex max-w-3xl items-end gap-2">
            <textarea
              ref={inputRef}
              rows={1}
              value={input}
              disabled={disabled}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder={disabled ? 'Add a Gemini API key to enable the assistant' : 'Ask about your study plan…'}
              className="input max-h-40 min-h-[42px] resize-none py-2.5"
              maxLength={2000}
              aria-label="Message"
            />
            <Button type="submit" variant="brand" className="h-[42px] w-[42px] px-0" disabled={disabled || !input.trim() || busy} aria-label="Send">
              <Send className="size-4" />
            </Button>
          </div>
          <p className="mx-auto mt-2 flex max-w-3xl items-center gap-1.5 text-[11px] text-slate-400">
            <Cpu className="size-3" /> Runs on the Gemini API free tier. AI answers can be wrong — double-check important deadlines.
          </p>
        </form>
      </Card>
    </div>
  );
}
