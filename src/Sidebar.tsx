import { useState, type ReactNode } from 'react';
import BrainForm, { PROVIDER_LABEL } from './settings/BrainForm';
import {
  ArrowDownToLine,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  ScrollText,
  Trash2,
  X,
} from 'lucide-react';
import { pronouns } from './pronouns';
import { DEFAULT_BACKGROUND, type Prefs } from './storage';
import {
  EMOTIONS,
  FACES,
  type Character,
  type ClipAsset,
  type UserProfile,
  type Config,
  type Emotion,
  type Face,
  type Gesture,
} from './types';

const BACKGROUNDS = [
  { name: 'Lavender', color: DEFAULT_BACKGROUND },
  { name: 'Peach', color: '#f6e1d6' },
  { name: 'Sakura', color: '#f5dbe4' },
  { name: 'Mint', color: '#dcefe6' },
  { name: 'Sky', color: '#dbe8f5' },
  { name: 'Cream', color: '#f4efe4' },
  { name: 'Studio grey', color: '#d9d9de' },
  { name: 'Night', color: '#2a2438' },
  { name: 'Midnight blue', color: '#16213a' },
];
const CLIP_KINDS = [
  { kind: 'intro', label: 'Intro (plays on load)' },
  { kind: 'idle', label: 'Idle loops' },
  { kind: 'talk', label: 'Talking loops' },
  { kind: 'react', label: 'Reactions' },
  { kind: 'gesture', label: 'Gestures' },
  { kind: 'extra', label: 'Unsorted (rename to use)' },
] as const;

export const EMOTION_ICON: Record<Emotion, string> = {
  neutral: '◌',
  happy: '☺',
  excited: '✦',
  sad: '☂',
  angry: '⚡',
  surprised: '!',
  relaxed: '☁',
  thinking: '…',
  shy: '♡',
};
const chip =
  'rounded-full border px-3 py-1.5 text-xs capitalize transition hover:bg-mist disabled:opacity-40';
const iconButton =
  'inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-soft hover:bg-mist disabled:opacity-40';

interface Props {
  open: boolean;
  onClose: () => void;
  config: Config;
  onConfig: (config: Config, notice: string) => void;
  profile: UserProfile | null;
  onEditProfile: () => void;
  characters: Character[];
  activeId: string;
  onSwitch: (id: string) => void;
  onEdit: (character: Character) => void;
  onCreate: () => void;
  modelBusy: boolean;
  onRefreshModels: () => void;
  onResetCamera: () => void;
  prefs: Prefs;
  onPrefs: (prefs: Prefs) => void;
  onFeel: (emotion: Emotion) => void;
  onGesture: (gesture: Gesture) => void;
  onFace: (face: Face) => void;
  gestures: string[];
  clips: ClipAsset[];
  onPlayClip: (name: string) => void;
  messageCount: number;
  busy: boolean;
  onTranscript: () => void;
  onExport: () => void;
  onClear: () => void;
}

export default function Sidebar(props: Props) {
  const { prefs, onPrefs } = props;
  const [confirmClear, setConfirmClear] = useState(false);
  return (
    <aside
      aria-label="Settings"
      aria-hidden={!props.open}
      inert={!props.open}
      className={`fixed inset-y-0 right-0 z-30 flex w-[min(380px,100vw)] flex-col border-l border-white/70 bg-[#fdfbfe]/85 backdrop-blur-xl transition-[translate,box-shadow] duration-300 ${props.open ? 'translate-x-0 shadow-[0_0_80px_#4a35581f]' : 'translate-x-full'}`}
    >
      <div className="flex items-center justify-between px-6 pt-6 pb-3">
        <div>
          <p className="text-[10px] font-semibold tracking-[.18em] text-faint">MAIDO</p>
          <h2 className="font-serif text-2xl text-ink">Settings</h2>
        </div>
        <button className={iconButton} onClick={props.onClose} aria-label="Close settings">
          <X size={19} />
        </button>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto px-4 pb-6">
        <Section
          title="You"
          hint={props.profile?.name ? 'Known to every character' : 'Not set up yet'}
        >
          <button
            onClick={props.onEditProfile}
            className="flex w-full items-center gap-3 rounded-xl bg-white px-3 py-2.5 text-left ring-1 ring-[#ece4f0] hover:bg-mist"
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#e8f1ec] font-serif text-base text-[#6f9a83]">
              {(props.profile?.callMe || props.profile?.name || '?').slice(0, 1).toUpperCase()}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium text-ink">
                {props.profile?.name
                  ? props.profile.callMe && props.profile.callMe !== props.profile.name
                    ? `${props.profile.name} · “${props.profile.callMe}”`
                    : props.profile.name
                  : 'Tell them about yourself'}
              </span>
              <span className="block truncate text-[11px] text-faint">
                {props.profile?.name
                  ? [props.profile.occupation, props.profile.location]
                      .filter(Boolean)
                      .join(' · ') || 'Edit your profile'
                  : 'Name, background, personality, how you like to be treated'}
              </span>
            </span>
            <Pencil size={15} className="shrink-0 text-soft" />
          </button>
        </Section>

        <Section title="Characters" hint={`${props.characters.length} in characters/`}>
          <ul className="space-y-2">
            {props.characters.map((character) => {
              const current = character.id === props.activeId;
              return (
                <li
                  key={character.id}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2.5 ring-1 transition ${current ? 'bg-lilac/10 ring-lilac/40' : 'bg-white ring-[#ece4f0] hover:bg-mist'}`}
                >
                  <button
                    className="flex min-w-0 flex-1 items-center gap-3 text-left disabled:cursor-not-allowed"
                    onClick={() => props.onSwitch(character.id)}
                    disabled={props.busy && !current}
                    aria-pressed={current}
                    title={
                      current
                        ? `Talking with ${pronouns(character.gender).them} now`
                        : `Talk with ${character.name}`
                    }
                  >
                    <span
                      className={`flex size-9 shrink-0 items-center justify-center rounded-full font-serif text-base ${current ? 'bg-lilac text-white' : 'bg-mist text-lilac'}`}
                    >
                      {character.name.slice(0, 1)}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-medium text-ink">
                        {character.name}
                        {character.nameNative && (
                          <span className="ml-1.5 text-[11px] font-normal text-faint">
                            {character.nameNative}
                          </span>
                        )}
                      </span>
                      <span className="block truncate text-[11px] text-faint">
                        {character.tagline || character.model || 'No description yet'}
                      </span>
                    </span>
                  </button>
                  <button
                    className={iconButton}
                    onClick={() => props.onEdit(character)}
                    aria-label={`Edit ${character.name}`}
                    title="Profile & memories"
                  >
                    <Pencil size={15} />
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="mt-3 flex items-center gap-2">
            <button
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs text-soft ring-1 ring-[#ece4f0] hover:bg-mist"
              onClick={props.onCreate}
            >
              <Plus size={14} /> New character
            </button>
            <button
              className={iconButton}
              onClick={props.onRefreshModels}
              disabled={props.modelBusy}
              aria-label="Refresh models and animations"
              title="Refresh models and animations"
            >
              <RefreshCw size={16} className={props.modelBusy ? 'animate-spin' : ''} />
            </button>
            <button
              className={iconButton}
              onClick={props.onResetCamera}
              aria-label="Reset camera"
              title="Reset camera"
            >
              <RotateCcw size={16} />
            </button>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-faint">
            Each character has their own body, personality, conversation, and memories. Camera: drag
            to orbit, right-drag or Shift-drag to pan, scroll to zoom toward the cursor,
            double-click to reset.
          </p>
        </Section>

        <Section
          title="Brain"
          hint={
            props.config.configured
              ? `${PROVIDER_LABEL[props.config.provider]} · ${props.config.model}`
              : 'Not connected'
          }
        >
          <BrainForm
            key={`${props.config.provider}|${props.config.model}|${props.config.baseUrl}|${props.config.configured}`}
            config={props.config}
            onSave={props.onConfig}
          />
        </Section>

        <Section
          title="Appearance"
          hint={BACKGROUNDS.find((b) => b.color === prefs.background)?.name ?? 'Custom'}
        >
          <p className="mb-2 text-xs font-medium text-soft">Lighting</p>
          <div
            className="mb-4 flex gap-1 rounded-xl bg-mist p-1"
            role="group"
            aria-label="Lighting"
          >
            {(
              [
                ['faithful', 'Faithful (VRoid colours)'],
                ['studio', 'Studio (bright, warm)'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                aria-pressed={prefs.lighting === value}
                onClick={() => onPrefs({ ...prefs, lighting: value })}
                className={`flex-1 rounded-lg py-2 text-xs ${prefs.lighting === value ? 'bg-white text-lilac-dark shadow-sm' : 'text-soft'}`}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="mb-2 text-xs font-medium text-soft">Background</p>
          <div className="flex flex-wrap items-center gap-2">
            {BACKGROUNDS.map((b) => (
              <button
                key={b.color}
                title={b.name}
                aria-label={`${b.name} background`}
                aria-pressed={prefs.background === b.color}
                onClick={() => onPrefs({ ...prefs, background: b.color })}
                className={`size-8 rounded-full ring-1 ring-black/10 transition hover:scale-110 ${prefs.background === b.color ? 'outline-2 outline-offset-2 outline-lilac' : ''}`}
                style={{ background: b.color }}
              />
            ))}
            <label
              title="Custom colour"
              className="relative flex size-8 cursor-pointer items-center justify-center overflow-hidden rounded-full bg-[conic-gradient(#f9a8d4,#fde68a,#a7f3d0,#93c5fd,#c4b5fd,#f9a8d4)] ring-1 ring-black/10"
            >
              <span className="sr-only">Custom background colour</span>
              <input
                type="color"
                value={prefs.background}
                onChange={(e) => onPrefs({ ...prefs, background: e.target.value })}
                className="absolute inset-0 cursor-pointer opacity-0"
              />
            </label>
          </div>
        </Section>

        <Section title="Physics" hint={`${prefs.fps} fps`}>
          <p className="mb-2 text-xs font-medium text-soft">Hair & clothes</p>
          <div
            className="flex gap-1 rounded-xl bg-mist p-1"
            role="group"
            aria-label="Physics style"
          >
            {(
              [
                ['model', 'As exported'],
                ['soft', 'Soft'],
                ['bouncy', 'Bouncy'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                aria-pressed={prefs.physics === value}
                onClick={() => onPrefs({ ...prefs, physics: value })}
                className={`flex-1 rounded-lg py-2 text-xs ${prefs.physics === value ? 'bg-white text-lilac-dark shadow-sm' : 'text-soft'}`}
              >
                {label}
              </button>
            ))}
          </div>
          <Toggle
            checked={prefs.wind}
            onChange={(value) => onPrefs({ ...prefs, wind: value })}
            label="Gentle breeze"
            description="A soft, gusting wind keeps hair and skirt alive even in calm idles."
          />
          <Toggle
            checked={prefs.fps === 60}
            onChange={(value) => onPrefs({ ...prefs, fps: value ? 60 : 30 })}
            label="Smooth motion (60 fps)"
            description="Smoother animation and physics. Turn off to save battery."
          />
        </Section>

        <Section
          title="Animations"
          hint={props.clips.length ? `${props.clips.length} in animations/` : 'Procedural only'}
        >
          {!props.clips.length && (
            <p className="text-[11px] leading-relaxed text-faint">
              No .vrma files yet, so Maido moves with built-in procedural poses. Add files named
              like <code className="text-soft">idle.happy.sway.vrma</code> or{' '}
              <code className="text-soft">gesture.clap.vrma</code> to animations/, then press
              refresh in Character. See animations/README.md.
            </p>
          )}
          {CLIP_KINDS.map(({ kind, label }) => {
            const list = props.clips.filter((c) => c.kind === kind);
            if (!list.length) return null;
            return (
              <div key={kind} className="mb-3 last:mb-0">
                <p className="mb-1.5 text-xs font-medium text-soft">
                  {label} <span className="font-normal text-faint">· {list.length}</span>
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {list.map((c) => (
                    <button
                      key={c.name}
                      title={c.name}
                      onClick={() => props.onPlayClip(c.name)}
                      className="inline-flex max-w-full items-center gap-1 rounded-full border border-[#ece4f0] bg-white px-3 py-1.5 text-xs text-soft transition hover:bg-mist"
                    >
                      <Play size={11} className="shrink-0" />
                      <span className="truncate">
                        {kind === 'extra'
                          ? c.name.replace(/\.vrma$/i, '')
                          : c.name
                              .replace(/\.vrma$/i, '')
                              .split('.')
                              .slice(1)
                              .join(' · ')}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </Section>

        <Section title="Body & emotion" hint={prefs.autoEmotion ? 'Brain-driven' : 'Manual'}>
          <Toggle
            checked={prefs.autoEmotion}
            onChange={(value) => onPrefs({ ...prefs, autoEmotion: value })}
            label="Brain moves the body"
            description="Each reply carries hidden emotion and gesture cues that drive the character's face and posture."
          />
          <Toggle
            checked={prefs.idleLife}
            onChange={(value) => onPrefs({ ...prefs, idleLife: value })}
            label="Idle life"
            description="Occasional glances and head tilts while waiting."
          />
          <Toggle
            checked={prefs.manpu}
            onChange={(value) => onPrefs({ ...prefs, manpu: value })}
            label="Manga symbols"
            description="Blush, sweat drops, anger veins, “!”, zzz… around the head."
          />
          <p className="mt-4 mb-2 text-xs font-medium text-soft">Try an emotion</p>
          <div className="flex flex-wrap gap-1.5">
            {EMOTIONS.filter((e) => e !== 'neutral').map((e) => (
              <button
                key={e}
                className={`${chip} border-[#ece4f0] bg-white text-soft`}
                onClick={() => props.onFeel(e)}
              >
                {EMOTION_ICON[e]} {e}
              </button>
            ))}
          </div>
          <p className="mt-4 mb-2 text-xs font-medium text-soft">Try a face</p>
          <div className="flex flex-wrap gap-1.5">
            {FACES.filter((f) => f !== 'neutral').map((f) => (
              <button
                key={f}
                className={`${chip} border-[#ece4f0] bg-white text-soft`}
                onClick={() => props.onFace(f)}
              >
                {f}
              </button>
            ))}
          </div>
          <p className="mt-4 mb-2 text-xs font-medium text-soft">Try a gesture</p>
          <div className="flex flex-wrap gap-1.5">
            {props.gestures.map((g) => (
              <button
                key={g}
                className={`${chip} border-[#ece4f0] bg-white text-soft`}
                onClick={() => props.onGesture(g)}
              >
                {g}
              </button>
            ))}
          </div>
        </Section>

        <Section
          title="Conversation"
          hint={`${Math.floor(props.messageCount / 2)} turns with ${pronouns(props.characters.find((c) => c.id === props.activeId)?.gender).them}`}
        >
          <button
            className="flex w-full items-center gap-3 rounded-xl bg-white px-3.5 py-3 text-left text-sm text-ink ring-1 ring-[#ece4f0] hover:bg-mist"
            onClick={props.onTranscript}
          >
            <ScrollText size={17} className="text-lilac" />
            <span className="flex-1">Full transcript</span>
            <span className="text-xs text-faint">{props.messageCount} msgs</span>
          </button>
          <div className="mt-2 flex gap-2">
            <button
              className="flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs text-soft ring-1 ring-[#ece4f0] hover:bg-mist disabled:opacity-40"
              onClick={props.onExport}
              disabled={!props.messageCount || props.busy}
            >
              <ArrowDownToLine size={14} /> Export JSON
            </button>
            {confirmClear ? (
              <button
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-[#b1828a] px-3 py-2 text-xs text-white"
                onClick={() => {
                  props.onClear();
                  setConfirmClear(false);
                }}
                onBlur={() => setConfirmClear(false)}
              >
                <Trash2 size={14} /> Confirm clear
              </button>
            ) : (
              <button
                className="flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs text-[#a5727b] ring-1 ring-[#ece4f0] hover:bg-[#fbefee] disabled:opacity-40"
                onClick={() => setConfirmClear(true)}
                disabled={!props.messageCount || props.busy}
              >
                <Trash2 size={14} /> Clear
              </button>
            )}
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-faint">
            Saved on this computer in memory/, per character. Each message sends up to 19 recent
            turns plus the character's memories to your provider.
          </p>
        </Section>

        <p className="px-2 pt-2 text-[11px] leading-relaxed text-faint">
          Maido v0.3 · running locally. Character memory is available. Voice and computer use are
          coming later.
        </p>
      </div>
    </aside>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl bg-white/70 p-4 ring-1 ring-[#efe8f3]">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h3 className="text-[11px] font-semibold tracking-[.14em] text-lilac uppercase">{title}</h3>
        {hint && <span className="truncate text-[11px] text-faint">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  description: string;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-start gap-3 rounded-lg py-2 text-left"
    >
      <span
        className={`relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors ${checked ? 'bg-lilac' : 'bg-[#ddd3e3]'}`}
      >
        <span
          className={`absolute top-0.5 left-0.5 size-4 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-4' : ''}`}
        />
      </span>
      <span>
        <span className="block text-[13px] text-ink">{label}</span>
        <span className="block text-[11px] leading-relaxed text-faint">{description}</span>
      </span>
    </button>
  );
}
