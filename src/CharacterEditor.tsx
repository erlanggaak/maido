import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Brain, Check, Trash2, UserRound, X } from 'lucide-react';
import { request } from './api';
import { EMOTIONS, FACES, GENDERS, type AvatarAsset, type Character, type Gender, type Memory } from './types';
import { GENDER_LABEL, pronouns } from './pronouns';

export const field = 'mt-1.5 block w-full min-w-0 rounded-lg border border-[#e6ddea] bg-white px-3 py-2.5 text-[13px] text-ink outline-none placeholder:text-faint focus:border-[#b79cc9] focus:ring-3 focus:ring-[#f0e6f6] disabled:opacity-50';

export const BLANK_CHARACTER: Omit<Character, 'id'> = {
  name: '', nameNative: '', gender: 'female', tagline: '', model: '', restingMood: 'neutral', restingFace: '', greeting: '',
  selfDescription: '', background: '', personality: '', speakingStyle: '', likes: '', dislikes: '', relationship: '',
};

interface Props {
  /** null = create a new character. */
  character: Character | null;
  models: AvatarAsset[];
  canDelete: boolean;
  onClose: () => void;
  onSaved: (character: Character) => void;
  onDeleted: (id: string) => void;
  onMemoriesChanged: () => void;
}

/** Edits a character card (who they are) and shows what they remember about the user. */
export default function CharacterEditor({ character, models, canDelete, onClose, onSaved, onDeleted, onMemoriesChanged }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [tab, setTab] = useState<'profile' | 'memories'>('profile');
  const [draft, setDraft] = useState<Omit<Character, 'id'>>(() => character ? { ...character } : { ...BLANK_CHARACTER, model: models[0]?.name ?? '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [memories, setMemories] = useState<Memory[] | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [forgetToo, setForgetToo] = useState(false);
  useEffect(() => { dialog.current?.showModal(); }, []);
  useEffect(() => {
    if (tab !== 'memories' || !character) return;
    void request<{ memories: Memory[] }>(`/api/characters/${character.id}/memories`).then(result => setMemories(result.memories)).catch(e => setError(e.message));
  }, [tab, character]);

  const set = <K extends keyof typeof draft>(key: K, value: (typeof draft)[K]) => setDraft(current => ({ ...current, [key]: value }));
  async function save(event: React.FormEvent) {
    event.preventDefault(); setSaving(true); setError('');
    try {
      const saved = character
        ? await request<Character>(`/api/characters/${character.id}`, draft, undefined, 'PUT')
        : await request<Character>('/api/characters', draft);
      onSaved(saved);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save this character.'); }
    finally { setSaving(false); }
  }
  async function remove() {
    if (!character) return;
    setSaving(true); setError('');
    try { await request(`/api/characters/${character.id}${forgetToo ? '?forgetMemory=1' : ''}`, undefined, undefined, 'DELETE'); onDeleted(character.id); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not delete this character.'); setSaving(false); }
  }
  async function forget(memory: Memory | 'all') {
    if (!character) return;
    try {
      await request(`/api/characters/${character.id}/memories${memory === 'all' ? '' : `/${memory.id}`}`, undefined, undefined, 'DELETE');
      setMemories(current => memory === 'all' ? [] : (current ?? []).filter(m => m.id !== memory.id));
      onMemoriesChanged();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not forget that.'); }
  }

  const name = draft.name.trim() || 'your character';
  const p = pronouns(draft.gender);
  return <dialog ref={dialog} onCancel={event => { if (saving) event.preventDefault(); else onClose(); }} aria-labelledby="character-title"
    className="m-auto max-h-[calc(100dvh-32px)] w-[min(640px,calc(100vw-32px))] overflow-hidden rounded-3xl border-0 bg-[#fdfbfe] p-0 text-ink shadow-[0_25px_100px_#46305340] backdrop:bg-[#342a40]/30 backdrop:backdrop-blur-sm">
    <form onSubmit={save} className="flex max-h-[calc(100dvh-32px)] flex-col">
      <div className="flex items-start justify-between gap-3 px-7 pt-6">
        <div><p className="text-[10px] font-semibold tracking-[.18em] text-faint">{character ? 'CHARACTER' : 'NEW CHARACTER'}</p>
          <h2 id="character-title" className="font-serif text-2xl">{character ? character.name : `Who is ${p.they}?`}</h2></div>
        <button type="button" className="inline-flex size-8 items-center justify-center rounded-lg text-soft hover:bg-mist" onClick={onClose} disabled={saving} aria-label="Close"><X size={19} /></button>
      </div>
      {character && <div className="mx-7 mt-4 flex gap-1 rounded-xl bg-mist p-1" role="tablist">
        {([['profile', 'Profile', UserRound], ['memories', 'Memories', Brain]] as const).map(([value, label, Icon]) =>
          <button type="button" role="tab" key={value} aria-selected={tab === value} onClick={() => setTab(value)} className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-xs ${tab === value ? 'bg-white text-lilac-dark shadow-sm' : 'text-soft'}`}><Icon size={14} />{label}</button>)}
      </div>}

      <div className="flex-1 overflow-y-auto px-7 py-5">
        {tab === 'profile' ? <div className="space-y-5">
          <Group title="Identity">
            <div className="grid grid-cols-[1fr_auto_auto] gap-3 max-sm:grid-cols-1">
              <Label text="Name"><input className={field} required maxLength={40} value={draft.name} onChange={e => set('name', e.target.value)} placeholder="Maido" /></Label>
              <Label text="Native name (optional)"><input className={field} maxLength={40} value={draft.nameNative} onChange={e => set('nameNative', e.target.value)} placeholder="まいど" /></Label>
              <Label text="Gender"><select className={field} value={draft.gender} onChange={e => set('gender', e.target.value as Gender)}>
                {GENDERS.map(g => <option key={g} value={g}>{GENDER_LABEL[g]}</option>)}</select></Label>
            </div>
            <Label text="Tagline" hint={`One line: who ${p.they} is to you.`}><input className={field} maxLength={140} value={draft.tagline} onChange={e => set('tagline', e.target.value)} placeholder="A warm fox-girl companion…" /></Label>
            <div className="grid grid-cols-3 gap-3 max-sm:grid-cols-1">
              <Label text="Body (VRM)"><select className={field} value={draft.model} onChange={e => set('model', e.target.value)}>
                <option value="">Preview mascot</option>{models.map(model => <option key={model.name} value={model.name}>{model.name}</option>)}
                {draft.model && !models.some(model => model.name === draft.model) && <option value={draft.model}>{draft.model} (missing)</option>}
              </select></Label>
              <Label text="Resting mood"><select className={field} value={draft.restingMood} onChange={e => set('restingMood', e.target.value as Character['restingMood'])}>
                {EMOTIONS.filter(e => e !== 'thinking').map(e => <option key={e} value={e}>{e}</option>)}</select></Label>
              <Label text="Resting face"><select className={field} value={draft.restingFace} onChange={e => set('restingFace', e.target.value as Character['restingFace'])}>
                <option value="">Default for mood</option>{FACES.filter(f => f !== 'neutral').map(f => <option key={f} value={f}>{f}</option>)}</select></Label>
            </div>
          </Group>
          <Group title={`How ${name} sees ${p.themselves}`}>
            <Area label="Self-description" hint={`First person. ${p.Their} look, ${p.their} body, what ${p.they} is. Makes ${p.them} aware of ${p.their} own appearance.`} max={2500} value={draft.selfDescription} onChange={v => set('selfDescription', v)} rows={4} placeholder={draft.gender === 'male' ? "I'm a tall guy with messy black hair…" : "I'm a fox-girl with pale-blue hair…"} />
            <Area label="Background" hint={`${p.Their} story: where ${p.they} comes from, why ${p.they}'s here.`} max={3500} value={draft.background} onChange={v => set('background', v)} rows={4} />
          </Group>
          <Group title="Personality">
            <Area label="Traits" max={2000} value={draft.personality} onChange={v => set('personality', v)} rows={3} placeholder={draft.gender === 'male' ? 'Calm, dependable, a little dry humour…' : 'Warm, attentive, a little teasing…'} />
            <Area label="Speaking style" hint="Tone, slang, languages, quirks." max={1500} value={draft.speakingStyle} onChange={v => set('speakingStyle', v)} rows={3} />
            <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
              <Area label="Likes" max={800} value={draft.likes} onChange={v => set('likes', v)} rows={2} />
              <Area label="Dislikes" max={800} value={draft.dislikes} onChange={v => set('dislikes', v)} rows={2} />
            </div>
          </Group>
          <Group title={`You and ${p.them}`}>
            <Area label="Relationship" hint={`Who ${p.they} is to you.`} max={1200} value={draft.relationship} onChange={v => set('relationship', v)} rows={2} />
            <Area label="First greeting" hint={`What ${p.they} says when you meet ${p.them} (no history yet). Write {user} for your name.`} max={500} value={draft.greeting} onChange={v => set('greeting', v)} rows={2} />
          </Group>
        </div> : <div>
          <p className="mb-4 text-[13px] leading-relaxed text-soft">Things {character?.name} chose to remember about you. They're sent with every conversation with {p.them}, and only {p.them}. Remove anything that's wrong or private.</p>
          {memories === null ? <p className="text-sm text-faint">Loading…</p> : !memories.length ? <p className="rounded-xl bg-mist/60 p-5 text-center font-serif text-faint italic">Nothing yet. Tell {p.them} about yourself.</p> :
            <ul className="space-y-2">{[...memories].reverse().map(memory => <li key={memory.id} className="flex items-start gap-3 rounded-xl bg-white px-4 py-3 ring-1 ring-[#efe8f3]">
              <span className="flex-1 text-[13px] leading-relaxed">{memory.text}<span className="mt-0.5 block text-[11px] text-faint">{new Date(memory.at).toLocaleString()}</span></span>
              <button type="button" onClick={() => void forget(memory)} className="inline-flex size-7 shrink-0 items-center justify-center rounded-lg text-faint hover:bg-[#fbefee] hover:text-[#a5727b]" aria-label={`Forget: ${memory.text}`}><Trash2 size={14} /></button>
            </li>)}</ul>}
          {!!memories?.length && <button type="button" onClick={() => void forget('all')} className="mt-4 inline-flex items-center gap-2 text-xs text-[#a5727b]"><Trash2 size={13} /> Forget everything</button>}
        </div>}
        {error && <p className="mt-4 text-xs text-[#b0707b]" role="alert">{error}</p>}
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-[#f0eaf3] px-7 py-4">
        {character && canDelete && (confirmDelete
          ? <div className="mr-auto flex flex-wrap items-center gap-3 text-xs">
              <label className="flex items-center gap-1.5 text-soft"><input type="checkbox" checked={forgetToo} onChange={e => setForgetToo(e.target.checked)} /> also erase {p.their} memories</label>
              <button type="button" onClick={() => void remove()} disabled={saving} className="rounded-lg bg-[#b1828a] px-3 py-2 text-white">Delete {character.name}</button>
              <button type="button" onClick={() => setConfirmDelete(false)} className="text-soft">Cancel</button>
            </div>
          : <button type="button" onClick={() => setConfirmDelete(true)} className="mr-auto inline-flex items-center gap-1.5 text-xs text-[#b1828a]"><Trash2 size={14} /> Delete</button>)}
        {tab === 'profile' && <button className="ml-auto inline-flex items-center gap-2 rounded-lg bg-lilac px-5 py-2.5 text-xs text-white hover:bg-lilac-dark disabled:opacity-50" disabled={saving}>{saving ? 'Saving…' : <><Check size={15} /> {character ? 'Save' : 'Create'}</>}</button>}
      </div>
    </form>
  </dialog>;
}

export function Group({ title, children }: { title: string; children: ReactNode }) {
  return <section className="space-y-3"><h3 className="text-[11px] font-semibold tracking-[.14em] text-lilac uppercase">{title}</h3>{children}</section>;
}
export function Label({ text, hint, children }: { text: string; hint?: string; children: ReactNode }) {
  return <label className="block text-xs font-medium text-soft">{text}{children}{hint && <span className="mt-1 block text-[11px] font-normal text-faint">{hint}</span>}</label>;
}
export function Area({ label, hint, max, value, onChange, rows, placeholder }: { label: string; hint?: string; max: number; value: string; onChange: (value: string) => void; rows: number; placeholder?: string }) {
  return <Label text={label} hint={hint}><textarea className={`${field} resize-y leading-relaxed`} rows={rows} maxLength={max} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} /></Label>;
}
