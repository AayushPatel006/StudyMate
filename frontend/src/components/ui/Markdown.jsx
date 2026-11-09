/**
 * Tiny, safe markdown renderer for assistant replies: paragraphs, bullet and
 * numbered lists, headings, **bold**, *italic* and `code`. Produces React
 * elements only (no innerHTML), so model output can't inject markup.
 */
function inline(text, keyPrefix) {
  const parts = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*)/g;
  let last = 0;
  let m;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const tok = m[0];
    const key = `${keyPrefix}-${i++}`;
    if (tok.startsWith('**')) parts.push(<strong key={key} className="font-semibold text-slate-900">{tok.slice(2, -2)}</strong>);
    else if (tok.startsWith('`')) parts.push(<code key={key} className="rounded bg-slate-100 px-1 py-0.5 text-[0.85em]">{tok.slice(1, -1)}</code>);
    else parts.push(<em key={key}>{tok.slice(1, -1)}</em>);
    last = m.index + tok.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

export default function Markdown({ text }) {
  const lines = String(text).replace(/\r/g, '').split('\n');
  const blocks = [];
  let list = null;

  const flush = () => {
    if (list) blocks.push(list);
    list = null;
  };

  lines.forEach((raw, idx) => {
    const line = raw.trimEnd();
    const bullet = /^\s*[-*•]\s+(.*)$/.exec(line);
    const numbered = /^\s*(\d+)[.)]\s+(.*)$/.exec(line);
    const heading = /^#{1,6}\s+(.*)$/.exec(line);
    if (bullet || numbered) {
      const type = bullet ? 'ul' : 'ol';
      if (!list || list.type !== type) {
        flush();
        list = { type, items: [] };
      }
      list.items.push(bullet ? bullet[1] : numbered[2]);
      return;
    }
    flush();
    if (!line.trim()) return;
    if (heading) blocks.push({ type: 'h', text: heading[1], idx });
    else blocks.push({ type: 'p', text: line, idx });
  });
  flush();

  return (
    <div className="space-y-2.5">
      {blocks.map((b, i) => {
        if (b.type === 'ul' || b.type === 'ol') {
          const Tag = b.type;
          return (
            <Tag key={i} className={b.type === 'ul' ? 'list-disc space-y-1 pl-5 marker:text-slate-400' : 'list-decimal space-y-1 pl-5 marker:text-slate-400'}>
              {b.items.map((it, j) => (
                <li key={j}>{inline(it, `${i}-${j}`)}</li>
              ))}
            </Tag>
          );
        }
        if (b.type === 'h') return <p key={i} className="font-semibold text-slate-900">{inline(b.text, i)}</p>;
        return <p key={i}>{inline(b.text, i)}</p>;
      })}
    </div>
  );
}
