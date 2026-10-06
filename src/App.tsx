import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { LoaderCircle, Settings2, X } from 'lucide-react';
import { request } from './api';
import { readReplyStream, type ReplyEvent } from './chat/replyStream';
import ReplyBubble from './chat/ReplyBubble';
import ChatComposer from './chat/ChatComposer';
import { useSpeech } from './chat/useSpeech';
import { Director } from './avatar/director';
import Sidebar, { EMOTION_ICON } from './Sidebar';
import Transcript from './Transcript';
import CharacterEditor from './CharacterEditor';
import ProfileEditor, { EMPTY_PROFILE } from './ProfileEditor';
import { readBrainSession, readChat, readPrefs, saveChat, savePrefs, type Prefs } from './storage';
import type {
  AvatarAsset,
  Character,
  ClipAsset,
  Config,
  Message,
  ModelCatalog,
  UserProfile,
} from './types';

const AvatarViewer = lazy(() => import('./AvatarViewer'));
const INITIAL_CONFIG: Config = {
  provider: 'openai',
  model: 'gpt-4.1-mini',
  baseUrl: '',
  configured: false,
  hasKey: false,
};

const ACTIVE_KEY = 'maido.character.v1';
/** A server started before an update lacks the newer endpoints; say how to fix it instead of failing quietly. */
const outdated = (error: unknown) =>
  error instanceof Error && error.message === 'Unknown API endpoint.'
    ? 'The Maido server is running an older version. Restart it (Ctrl+C, then npm run dev) to enable characters and your profile.'
    : error instanceof Error
      ? error.message
      : 'Something went wrong.';

export default function App() {
  const director = useRef<Director>(null as unknown as Director);
  if (!director.current) {
    director.current = new Director();
    // Handy for experimenting from the devtools console: maido.feel('happy'), maido.play('wave').
    if (import.meta.env.DEV) Object.assign(window, { maido: director.current });
  }
  const [config, setConfig] = useState<Config>(INITIAL_CONFIG);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [activeId, setActiveId] = useState(() => {
    try {
      return localStorage.getItem(ACTIVE_KEY) || '';
    } catch {
      return '';
    }
  });
  const [editing, setEditing] = useState<Character | 'new' | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [editingProfile, setEditingProfile] = useState(false);
  const active = characters.find((character) => character.id === activeId) ?? null;
  const name = active?.name ?? 'Maido';
  const [prefs, setPrefs] = useState<Prefs>(readPrefs);
  const [input, setInput] = useState('');
  const [pending, setPending] = useState('');
  const [busy, setBusy] = useState(false);
  const {
    speech,
    speaking,
    beginSpeech,
    appendSpeech,
    endSpeech,
    speak,
    cancelSpeech,
    clearSpeech,
  } = useSpeech(director.current);
  /** The reply has started arriving: she stops "thinking" and starts talking. */
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [asset, setAsset] = useState<AvatarAsset | null>(null);
  const [loadingAvatar, setLoadingAvatar] = useState(false);
  const [models, setModels] = useState<AvatarAsset[]>([]);
  const [refreshingModels, setRefreshingModels] = useState(true);
  const [reset, setReset] = useState(0);
  const [clips, setClips] = useState<ClipAsset[]>([]);
  const [gestures, setGestures] = useState<string[]>([]);
  const [folded, setFolded] = useState(() => {
    try {
      return localStorage.getItem('maido.bubbleFolded') === '1';
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem('maido.bubbleFolded', folded ? '1' : '0');
    } catch {
      /* Per-visit only. */
    }
  }, [folded]);

  const composer = useRef<HTMLTextAreaElement>(null);
  const requestController = useRef<AbortController | null>(null);
  const inFlight = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    void request<Config>('/api/config', undefined, controller.signal)
      .then(async (current) => {
        // The local server forgets keys when it restarts; reconnect with this session's saved brain.
        const session = readBrainSession();
        const entry = session.active && session.entries[session.active];
        if (!current.configured && session.active && entry) {
          try {
            current = await request<Config>(
              '/api/config',
              {
                provider: session.active,
                model: entry.model,
                baseUrl: entry.baseUrl,
                ...(entry.apiKey ? { apiKey: entry.apiKey } : {}),
              },
              controller.signal,
            );
            setNotice('Reconnected your brain from this session.');
          } catch {
            /* Leave it disconnected; Settings shows the saved values to retry. */
          }
        }
        setConfig(current);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    let active = true;
    void request<ModelCatalog>('/api/models', undefined, controller.signal)
      .then((catalog) => {
        if (active) setModels(catalog.models);
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setRefreshingModels(false);
      });
    void request<UserProfile>('/api/profile', undefined, controller.signal)
      .then((result) => {
        if (active) setProfile(result);
      })
      .catch(() => {
        /* Editable anyway; saving reports the problem. */
      });
    void request<{ characters: Character[] }>('/api/characters', undefined, controller.signal)
      .then((result) => {
        if (!active) return;
        setCharacters(result.characters);
        setActiveId((current) =>
          result.characters.some((c) => c.id === current)
            ? current
            : (result.characters.find((c) => c.id === 'maido')?.id ??
              result.characters[0]?.id ??
              ''),
        );
      })
      .catch((e) => {
        if (active) setError(outdated(e));
      });
    void request<{ animations: ClipAsset[] }>('/api/animations', undefined, controller.signal)
      .then((result) => {
        if (active) setClips(result.animations);
      })
      .catch(() => {
        /* Procedural motion still works. */
      });
    return () => {
      active = false;
      controller.abort();
      requestController.current?.abort();
    };
  }, []);
  useEffect(() => {
    const d = director.current;
    d.autoEmotion = prefs.autoEmotion;
    d.idleLife = prefs.idleLife;
    savePrefs(prefs);
  }, [prefs]);
  useEffect(() => {
    director.current.setThinking(busy && !streaming);
  }, [busy, streaming]);
  // Clips load asynchronously inside the viewer; read the playable gesture list when settings open.
  useEffect(() => {
    if (sidebarOpen) setGestures(director.current.gestures());
  }, [sidebarOpen, clips]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 5000);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && sidebarOpen && !transcriptOpen) setSidebarOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sidebarOpen, transcriptOpen]);

  // Switching character: her resting mood, her conversation, and (if new) her greeting.
  useEffect(() => {
    if (!active) return;
    try {
      localStorage.setItem(ACTIVE_KEY, active.id);
    } catch {
      /* Remembered for this visit only. */
    }
    director.current.bodyStyle = active.gender === 'male' ? 'masculine' : 'feminine';
    director.current.setBaseline(active.restingMood, 0.55, active.restingFace || null);
    director.current.skip();
    clearSpeech();
    setError('');
    const controller = new AbortController();
    void (async () => {
      let history = (
        await request<{ messages: Message[] }>(
          `/api/characters/${active.id}/history`,
          undefined,
          controller.signal,
        )
      ).messages;
      // v0.2 kept one conversation in the browser; hand it to Maido the first time.
      const legacy = readChat();
      if (!history.length && legacy.length && active.id === 'maido') {
        await request(
          `/api/characters/maido/history/import`,
          { messages: legacy },
          controller.signal,
        );
        history = (
          await request<{ messages: Message[] }>(
            `/api/characters/maido/history`,
            undefined,
            controller.signal,
          )
        ).messages;
        try {
          saveChat([]);
        } catch {
          /* Harmless: import only runs while her history is empty. */
        }
      }
      setMessages(history);
      if (!history.length && active.greeting)
        speak(personalise(active.greeting), [
          { at: 0, emotion: 'happy', intensity: 0.7, gesture: 'wave' },
        ]);
    })().catch((e) => {
      if (!controller.signal.aborted)
        setError(e instanceof Error ? e.message : 'Could not load this conversation.');
    });
    return () => controller.abort();
    // Reload only when the character itself changes, not on every edit of her card.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.id]);
  useEffect(() => {
    if (!active) return;
    director.current.bodyStyle = active.gender === 'male' ? 'masculine' : 'feminine';
    director.current.setBaseline(active.restingMood, 0.55, active.restingFace || null);
  }, [active?.restingMood, active?.restingFace, active?.gender]);
  // Her body: the VRM named on her card.
  useEffect(() => {
    if (!active || refreshingModels) return;
    const model = models.find((m) => m.name === active.model) ?? null;
    if (model?.name === asset?.name) return;
    setLoadingAvatar(Boolean(model));
    setAsset(model);
    if (active.model && !model)
      setNotice(`${active.name}'s body (${active.model}) isn't in models/. Showing the mascot.`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.model, models, refreshingModels]);

  /** Greetings may say {user}: the name you asked to be called. Without one, it's dropped ("Hi, {user}!" → "Hi!"). */
  function personalise(text: string) {
    const you = profile?.callMe || profile?.name;
    return you ? text.replace(/\{user\}/g, you) : text.replace(/[ ,]*\{user\}/g, '');
  }

  async function send(question = input.trim()) {
    if (!question || inFlight.current) return;
    if (!config.configured) {
      setSidebarOpen(true);
      setNotice('Connect a brain first.');
      return;
    }
    if (question.length > 12000) {
      setError('Please keep your message under 12,000 characters.');
      return;
    }
    director.current.skip();
    inFlight.current = true;
    setBusy(true);
    setStreaming(false);
    setPending(question);
    setInput('');
    setError('');
    clearSpeech();
    const controller = new AbortController();
    requestController.current = controller;
    let started = false;
    try {
      if (!active) throw new Error('Choose a character in Settings first.');
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ characterId: active.id, message: question }),
        signal: controller.signal,
      });
      if (!response.ok || !response.body) {
        const data = await response.json().catch(() => ({}));
        throw new Error(
          outdated(new Error(data.error || 'Something went wrong. Please try again.')),
        );
      }
      // Newline-delimited JSON: text pieces and beats while she speaks, then done (or error).
      let final: Extract<ReplyEvent, { type: 'done' }> | null = null;
      for await (const event of readReplyStream(response.body)) {
        if (event.type === 'error') throw new Error(event.error);
        if (event.type === 'done') {
          final = event;
          continue;
        }
        if (!started) {
          started = true;
          setStreaming(true);
          beginSpeech();
        }
        if (event.type === 'text') appendSpeech(event.text);
        else appendSpeech('', [event.beat]);
      }
      if (!final) throw new Error('The reply was cut off. Please try again.');
      if (!started) beginSpeech();
      endSpeech(final);
      const at = new Date().toISOString();
      setMessages((current) => [
        ...current,
        { role: 'user', content: question, at },
        { role: 'assistant', content: final.text, beats: final.beats, at },
      ]);
      if (final.remembered.length)
        setNotice(
          `💭 ${name} will remember: ${final.remembered.map((memory) => memory.text).join(' · ')}`,
        );
    } catch (e) {
      // Nothing was saved for this turn, so take back the half-spoken reply too.
      if (started) {
        cancelSpeech();
      }
      setInput(question);
      if (controller.signal.aborted) setNotice('Stopped. Your message is back in the composer.');
      else {
        setError(e instanceof Error ? e.message : 'Could not send this message.');
        director.current.feel('sad', 0.5, 4);
      }
    } finally {
      inFlight.current = false;
      requestController.current = null;
      setBusy(false);
      setStreaming(false);
      setPending('');
      setTimeout(() => composer.current?.focus(), 0);
    }
  }
  function avatarLoaded(loaded: AvatarAsset | null) {
    if (loaded) setLoadingAvatar(false);
  }
  async function refreshModels() {
    setRefreshingModels(true);
    setError('');
    try {
      const [catalog, animations] = await Promise.all([
        request<ModelCatalog>('/api/models'),
        request<{ animations: ClipAsset[] }>('/api/animations'),
      ]);
      setModels(catalog.models);
      setClips(animations.animations);
      // Reload her body too, in case the file was replaced.
      const current = catalog.models.find((model) => model.name === active?.model);
      if (current) {
        setLoadingAvatar(true);
        setAsset({ ...current });
      }
      const clipCount = animations.animations.length;
      setNotice(
        catalog.warning ||
          (catalog.models.length
            ? `Found ${catalog.models.length} model${catalog.models.length === 1 ? '' : 's'} and ${clipCount} animation${clipCount === 1 ? '' : 's'}.`
            : 'Add a .vrm file to the models folder, then refresh.'),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read the models folder.');
    } finally {
      setRefreshingModels(false);
    }
  }
  function exportChat() {
    const url = URL.createObjectURL(
      new Blob(
        [
          JSON.stringify(
            {
              app: 'Maido',
              version: 3,
              character: active,
              exportedAt: new Date().toISOString(),
              messages,
            },
            null,
            2,
          ),
        ],
        { type: 'application/json' },
      ),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = `${active?.id ?? 'maido'}-chat-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function clearChat() {
    if (!active) return;
    try {
      await request(`/api/characters/${active.id}/history`, undefined, undefined, 'DELETE');
      setMessages([]);
      clearSpeech();
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not clear this conversation.');
    }
  }
  function switchCharacter(id: string) {
    if (busy || id === activeId) return;
    setActiveId(id);
    setTranscriptOpen(false);
  }
  async function reloadCharacters() {
    const result = await request<{ characters: Character[] }>('/api/characters');
    setCharacters(result.characters);
    return result.characters;
  }

  const mood =
    busy && !streaming
      ? 'thinking'
      : (speech?.beats.findLast((b) => b.at <= speech.shown)?.emotion ??
        active?.restingMood ??
        'neutral');

  const bg = prefs.background;
  return (
    <div
      className="relative h-dvh w-full overflow-clip font-sans text-ink antialiased transition-[background] duration-500 selection:bg-[#e4d7ef]"
      style={{
        background: `radial-gradient(ellipse at 50% 38%, color-mix(in oklab, ${bg} 35%, white) 0%, ${bg} 52%, color-mix(in oklab, ${bg} 88%, black) 100%)`,
      }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute top-[42%] left-1/2 size-[min(78vh,720px)] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#8080801f]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute top-[42%] left-1/2 size-[min(96vh,900px)] -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed border-[#80808017]"
      />

      <Suspense
        fallback={
          <div className="absolute inset-0 flex items-center justify-center gap-3 text-sm text-lilac">
            <LoaderCircle className="animate-spin" size={22} />
            Making room for {name}…
          </div>
        }
      >
        <AvatarViewer
          asset={asset}
          director={director.current}
          clips={clips}
          physics={{ style: prefs.physics, wind: prefs.wind }}
          manpu={prefs.manpu}
          lighting={prefs.lighting}
          fps={prefs.fps}
          reset={reset}
          onLoaded={avatarLoaded}
          onError={(message) => {
            setLoadingAvatar(false);
            setError(message);
          }}
        />
      </Suspense>
      {loadingAvatar && (
        <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-[#f4eef9]/80 text-lilac backdrop-blur-sm">
          <LoaderCircle className="animate-spin" size={28} />
          <strong className="font-medium">Meeting {name}…</strong>
        </div>
      )}

      <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between p-5 sm:p-7">
        <p
          className="pointer-events-auto flex items-center gap-1.5 rounded-full bg-white/70 px-3.5 py-2 text-xs text-soft capitalize shadow-sm ring-1 ring-white backdrop-blur"
          role="status"
          aria-label={`Mood: ${mood}`}
        >
          <span aria-hidden className={busy && !streaming ? 'animate-pulse' : ''}>
            {EMOTION_ICON[mood]}
          </span>
          {mood}
        </p>
        <button
          className="pointer-events-auto inline-flex items-center gap-2 rounded-full bg-white/70 px-4 py-2.5 text-xs text-soft shadow-sm ring-1 ring-white backdrop-blur hover:bg-white"
          onClick={() => setSidebarOpen(true)}
          aria-label="Open settings"
          aria-expanded={sidebarOpen}
        >
          <Settings2 size={16} />
          Settings
        </button>
      </header>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex flex-col items-center gap-3 px-4 pb-5 sm:pb-7">
        {busy && !streaming && pending && (
          <p className="animate-rise max-w-xl truncate rounded-full bg-white/60 px-4 py-1.5 text-xs text-soft backdrop-blur">
            You: {pending}
          </p>
        )}
        {busy && !streaming && (
          <div className="flex gap-1.5 py-2" aria-label={`${name} is thinking`}>
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="size-1.5 animate-dot rounded-full bg-lilac/60"
                style={{ animationDelay: `${i * 0.15}s` }}
              />
            ))}
          </div>
        )}
        {speech && (!busy || streaming) && (
          <ReplyBubble
            name={name}
            text={speech.text}
            shown={speech.shown}
            speaking={speaking}
            folded={folded}
            onFold={setFolded}
            onSkip={() => director.current.skip()}
          />
        )}
        {error && (
          <div
            role="alert"
            className="pointer-events-auto flex w-full max-w-2xl items-center gap-2 rounded-xl bg-[#fbefee]/95 px-4 py-2.5 text-sm text-[#a06b70]"
          >
            <span className="flex-1">{error}</span>
            <button aria-label="Dismiss error" onClick={() => setError('')}>
              <X size={15} />
            </button>
          </div>
        )}
        <ChatComposer
          name={name}
          connected={config.configured}
          busy={busy}
          input={input}
          inputRef={composer}
          onInput={setInput}
          onSend={() => void send()}
          onStop={() => requestController.current?.abort()}
        />
      </div>

      {notice && (
        <div
          role="status"
          className="animate-rise absolute top-20 left-1/2 z-40 flex max-w-[calc(100vw-32px)] -translate-x-1/2 items-center gap-2 rounded-xl bg-white/95 px-4 py-2.5 text-xs text-soft shadow-lg ring-1 ring-[#e9dfee]"
        >
          <span>{notice}</span>
          <button aria-label="Dismiss notification" onClick={() => setNotice('')}>
            <X size={13} />
          </button>
        </div>
      )}

      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 sm:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden
        />
      )}
      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        config={config}
        onConfig={(next, message) => {
          setConfig(next);
          setNotice(message);
        }}
        profile={profile}
        onEditProfile={() => setEditingProfile(true)}
        characters={characters}
        activeId={activeId}
        onSwitch={switchCharacter}
        onEdit={(character) => setEditing(character)}
        onCreate={() => setEditing('new')}
        modelBusy={loadingAvatar || refreshingModels}
        onRefreshModels={() => void refreshModels()}
        onResetCamera={() => setReset(reset + 1)}
        prefs={prefs}
        onPrefs={setPrefs}
        onFeel={(emotion) => director.current.feel(emotion, 0.85, 5)}
        onGesture={(gesture) => director.current.play(gesture)}
        onFace={(face) => director.current.showFace(face)}
        gestures={gestures}
        clips={clips}
        onPlayClip={(name) => director.current.playClip(name)}
        messageCount={messages.length}
        busy={busy}
        onTranscript={() => setTranscriptOpen(true)}
        onExport={exportChat}
        onClear={() => void clearChat()}
      />
      {transcriptOpen && (
        <Transcript name={name} messages={messages} onClose={() => setTranscriptOpen(false)} />
      )}
      {editingProfile && (
        <ProfileEditor
          profile={profile ?? EMPTY_PROFILE}
          onClose={() => setEditingProfile(false)}
          onSaved={(saved) => {
            setProfile(saved);
            setEditingProfile(false);
            setNotice(
              `Saved. Every character now knows you${saved.callMe || saved.name ? ` as ${saved.callMe || saved.name}` : ''}.`,
            );
          }}
        />
      )}
      {editing && (
        <CharacterEditor
          key={editing === 'new' ? 'new' : editing.id}
          character={editing === 'new' ? null : editing}
          models={models}
          canDelete={characters.length > 1}
          onClose={() => setEditing(null)}
          onSaved={(saved) => {
            void reloadCharacters();
            setEditing(null);
            if (editing === 'new') switchCharacter(saved.id);
            setNotice(`${saved.name} saved.`);
          }}
          onDeleted={(id) => {
            void reloadCharacters().then((list) => {
              if (id === activeId) setActiveId(list[0]?.id ?? '');
            });
            setEditing(null);
          }}
          onMemoriesChanged={() => {}}
        />
      )}
    </div>
  );
}
