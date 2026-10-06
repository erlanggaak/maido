import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { EMOTION_ICON } from './Sidebar';
import type { Message } from './types';

export default function Transcript({
  name,
  messages,
  onClose,
}: {
  name: string;
  messages: Message[];
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
    end.current?.scrollIntoView();
  }, []);
  return (
    <dialog
      ref={dialog}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === dialog.current) onClose();
      }}
      aria-labelledby="transcript-title"
      className="m-0 ml-auto h-dvh max-h-dvh w-[min(560px,100vw)] max-w-none overflow-hidden border-0 bg-[#fdfbfe] p-0 text-ink shadow-[0_0_80px_#4a355833] backdrop:bg-[#342a40]/25 backdrop:backdrop-blur-sm"
    >
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-[#f0eaf3] px-6 py-5">
          <div>
            <p className="text-[10px] font-semibold tracking-[.18em] text-faint">CONVERSATION</p>
            <h2 id="transcript-title" className="font-serif text-2xl">
              You &amp; {name}
            </h2>
          </div>
          <button
            className="inline-flex size-8 items-center justify-center rounded-lg text-soft hover:bg-mist"
            onClick={onClose}
            aria-label="Close transcript"
          >
            <X size={19} />
          </button>
        </div>
        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-6">
          {!messages.length && (
            <p className="pt-20 text-center font-serif text-lg text-faint italic">
              Nothing here yet. Say hi to {name}.
            </p>
          )}
          {messages.map((message, i) => (
            <article
              key={i}
              className={message.role === 'user' ? 'ml-auto max-w-[85%]' : 'max-w-[92%]'}
            >
              <span
                className={`mb-1.5 block text-[10px] font-semibold tracking-[.12em] ${message.role === 'user' ? 'text-right text-faint' : 'text-lilac'}`}
              >
                {message.role === 'user' ? (
                  'YOU'
                ) : (
                  <>
                    {name.toUpperCase()}{' '}
                    {message.beats?.length ? (
                      <span className="font-normal tracking-normal text-faint normal-case">
                        ·{' '}
                        {message.beats
                          .map(
                            (b) =>
                              `${EMOTION_ICON[b.emotion]} ${b.emotion}${b.gesture !== 'none' ? ` + ${b.gesture}` : ''}`,
                          )
                          .join(' → ')}
                      </span>
                    ) : null}
                  </>
                )}
              </span>
              <p
                className={`text-sm leading-relaxed break-words whitespace-pre-wrap ${message.role === 'user' ? 'rounded-2xl rounded-br-sm bg-mist px-4 py-3 text-soft' : 'text-ink'}`}
              >
                {message.content}
              </p>
            </article>
          ))}
          <div ref={end} />
        </div>
      </div>
    </dialog>
  );
}
