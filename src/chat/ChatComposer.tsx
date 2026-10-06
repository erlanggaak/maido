import type { RefObject } from 'react';
import { ArrowUp, Square } from 'lucide-react';

interface Props {
  name: string;
  connected: boolean;
  busy: boolean;
  input: string;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  onInput: (input: string) => void;
  onSend: () => void;
  onStop: () => void;
}

export default function ChatComposer({
  name,
  connected,
  busy,
  input,
  inputRef,
  onInput,
  onSend,
  onStop,
}: Props) {
  return (
    <form
      className="pointer-events-auto flex w-full max-w-2xl items-end gap-2 rounded-3xl bg-white/80 p-2 pl-5 shadow-[0_10px_40px_#5c42701a] ring-1 ring-white backdrop-blur-md focus-within:ring-[#d8c6e6]"
      onSubmit={(event) => {
        event.preventDefault();
        onSend();
      }}
    >
      <textarea
        ref={inputRef}
        aria-label={`Message ${name}`}
        rows={1}
        maxLength={12000}
        disabled={busy}
        value={input}
        placeholder={connected ? 'Talk to me…' : 'Connect a brain in Settings to start talking'}
        onChange={(e) => {
          onInput(e.target.value);
          e.target.style.height = 'auto';
          e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            onSend();
          }
        }}
        className="max-h-40 min-h-10 flex-1 resize-none bg-transparent py-2.5 text-sm text-ink outline-none placeholder:text-faint disabled:opacity-60"
      />
      {busy ? (
        <button
          type="button"
          onClick={() => onStop()}
          aria-label="Stop response"
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#9c7c83] text-white"
        >
          <Square size={14} fill="currentColor" />
        </button>
      ) : (
        <button
          disabled={!input.trim()}
          aria-label="Send message"
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-lilac text-white transition hover:bg-lilac-dark disabled:bg-[#d8ccdf]"
        >
          <ArrowUp size={18} />
        </button>
      )}
    </form>
  );
}
