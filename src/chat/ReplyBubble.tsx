import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface Props {
  name: string;
  text: string;
  shown: number;
  speaking: boolean;
  folded: boolean;
  onFold: (folded: boolean) => void;
  onSkip: () => void;
}

export default function ReplyBubble({
  name,
  text,
  shown,
  speaking,
  folded,
  onFold,
  onSkip,
}: Props) {
  return (
    <div className="pointer-events-auto animate-rise w-full max-w-2xl rounded-3xl rounded-bl-md bg-white/85 text-ink shadow-[0_10px_40px_#5c427016] ring-1 ring-white backdrop-blur-md">
      <div className={`flex items-center gap-2 px-6 ${folded ? 'py-2.5' : 'pt-3'}`}>
        <span className="text-[10px] font-semibold tracking-[.16em] text-lilac uppercase">
          {name}
        </span>
        {/* Folded: the reply collapses to one line; click it (or the chevron) to read it all. */}
        {folded && (
          <Subtitle name={name} text={text.slice(0, shown)} onClick={() => onFold(false)} />
        )}
        <button
          onClick={() => onFold(!folded)}
          aria-expanded={!folded}
          aria-label={folded ? 'Expand reply' : 'Fold reply to one line'}
          title={folded ? 'Expand' : 'Fold to one line'}
          className="ml-auto inline-flex size-7 shrink-0 items-center justify-center rounded-full text-faint hover:bg-mist hover:text-soft"
        >
          {folded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
      </div>
      {!folded && (
        <button
          onClick={() => onSkip()}
          title={speaking ? 'Click to show the whole reply' : undefined}
          className="block max-h-[32vh] w-full overflow-y-auto px-6 pt-1 pb-4 text-left text-[15px] leading-relaxed whitespace-pre-wrap"
        >
          {text.slice(0, shown)}
          <span className="text-transparent">{text.slice(shown)}</span>
        </button>
      )}
    </div>
  );
}

/** The sentence (or line) she is saying right now, from the revealed part of a reply, plus its number. */
function currentLine(revealed: string) {
  const sentences = revealed
    .split('\n')
    .flatMap((line) => line.match(/[^.!?…]+(?:[.!?…]+|$)/g) ?? [])
    .map((part) => part.trim())
    .filter(Boolean);
  return { line: sentences.at(-1) ?? '', index: sentences.length };
}

/**
 * Folded reply: one line that follows her speech like a subtitle. Long sentences keep their
 * newest words in view (the start fades out on the left instead of the end being cut).
 */
function Subtitle({ name, text, onClick }: { name: string; text: string; onClick: () => void }) {
  const { line, index } = currentLine(text);
  const box = useRef<HTMLButtonElement>(null);
  const [overflowing, setOverflowing] = useState(false);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    el.scrollLeft = el.scrollWidth;
    setOverflowing(el.scrollWidth > el.clientWidth + 1);
  }, [line]);
  return (
    <button
      ref={box}
      onClick={onClick}
      title="Expand reply"
      aria-label={`${name} says: ${line}. Expand reply`}
      className={`min-w-0 flex-1 overflow-hidden text-left text-sm whitespace-nowrap text-soft ${overflowing ? '[mask-image:linear-gradient(to_right,transparent,black_2.5rem)]' : ''}`}
    >
      <span key={index} className="inline-block animate-rise">
        {line}
      </span>
    </button>
  );
}
