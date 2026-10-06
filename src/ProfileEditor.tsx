import { useEffect, useRef, useState } from 'react';
import { Check, X } from 'lucide-react';
import { request } from './api';
import { Area, Group, Label, field } from './CharacterEditor';
import { GENDERS, type Gender, type UserProfile } from './types';
import { GENDER_LABEL } from './pronouns';

export const EMPTY_PROFILE: UserProfile = {
  name: '',
  callMe: '',
  gender: '',
  age: '',
  location: '',
  languages: '',
  occupation: '',
  about: '',
  personality: '',
  interests: '',
  goals: '',
  preferences: '',
  avoid: '',
};

/**
 * "You": the user describes themselves once, and every character knows who they're talking
 * with. Characters still keep their own memories on top; this is the part you write.
 */
export default function ProfileEditor({
  profile,
  onClose,
  onSaved,
}: {
  profile: UserProfile;
  onClose: () => void;
  onSaved: (profile: UserProfile) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState<UserProfile>({ ...EMPTY_PROFILE, ...profile });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  const set = <K extends keyof UserProfile>(key: K, value: UserProfile[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));
  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      onSaved(await request<UserProfile>('/api/profile', draft, undefined, 'PUT'));
    } catch (e) {
      setError(
        e instanceof Error && e.message === 'Unknown API endpoint.'
          ? "The Maido server is running an older version, so it can't save profiles yet. Restart it (Ctrl+C, then npm run dev) and save again; your text stays here until you close this."
          : e instanceof Error
            ? e.message
            : 'Could not save your profile.',
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      onCancel={(event) => {
        if (saving) event.preventDefault();
        else onClose();
      }}
      aria-labelledby="profile-title"
      className="m-auto max-h-[calc(100dvh-32px)] w-[min(640px,calc(100vw-32px))] overflow-hidden rounded-3xl border-0 bg-[#fdfbfe] p-0 text-ink shadow-[0_25px_100px_#46305340] backdrop:bg-[#342a40]/30 backdrop:backdrop-blur-sm"
    >
      <form onSubmit={save} className="flex max-h-[calc(100dvh-32px)] flex-col">
        <div className="flex items-start justify-between gap-3 px-7 pt-6">
          <div>
            <p className="text-[10px] font-semibold tracking-[.18em] text-faint">YOU</p>
            <h2 id="profile-title" className="font-serif text-2xl">
              Tell them about yourself
            </h2>
          </div>
          <button
            type="button"
            className="inline-flex size-8 items-center justify-center rounded-lg text-soft hover:bg-mist"
            onClick={onClose}
            disabled={saving}
            aria-label="Close"
          >
            <X size={19} />
          </button>
        </div>
        <p className="px-7 pt-2 text-[13px] leading-relaxed text-soft">
          Every character reads this, so they know who they're talking with. Fill in as much or as
          little as you like. It stays on this computer in memory/you.json and is sent with each
          message to your AI provider.
        </p>
        <div className="flex-1 space-y-5 overflow-y-auto px-7 py-5">
          <Group title="Basics">
            <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
              <Label text="Name">
                <input
                  className={field}
                  maxLength={60}
                  value={draft.name}
                  onChange={(e) => set('name', e.target.value)}
                  placeholder="Your name"
                />
              </Label>
              <Label text="What should they call you?">
                <input
                  className={field}
                  maxLength={60}
                  value={draft.callMe}
                  onChange={(e) => set('callMe', e.target.value)}
                  placeholder="Nickname, or blank for your name"
                />
              </Label>
            </div>
            <div className="grid grid-cols-3 gap-3 max-sm:grid-cols-1">
              <Label text="Gender">
                <select
                  className={field}
                  value={draft.gender}
                  onChange={(e) => set('gender', e.target.value as Gender | '')}
                >
                  <option value="">Prefer not to say</option>
                  {GENDERS.map((g) => (
                    <option key={g} value={g}>
                      {GENDER_LABEL[g]}
                    </option>
                  ))}
                </select>
              </Label>
              <Label text="Age">
                <input
                  className={field}
                  maxLength={40}
                  value={draft.age}
                  onChange={(e) => set('age', e.target.value)}
                  placeholder="e.g. 27"
                />
              </Label>
              <Label text="Where you live">
                <input
                  className={field}
                  maxLength={120}
                  value={draft.location}
                  onChange={(e) => set('location', e.target.value)}
                  placeholder="City, country"
                />
              </Label>
            </div>
            <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
              <Label text="Languages">
                <input
                  className={field}
                  maxLength={200}
                  value={draft.languages}
                  onChange={(e) => set('languages', e.target.value)}
                  placeholder="Indonesian, English…"
                />
              </Label>
              <Label text="Work / studies">
                <input
                  className={field}
                  maxLength={300}
                  value={draft.occupation}
                  onChange={(e) => set('occupation', e.target.value)}
                  placeholder="What you do"
                />
              </Label>
            </div>
          </Group>
          <Group title="Who you are">
            <Area
              label="About you"
              hint="Your background and story: where you're from, life right now, people and things that matter to you."
              max={3000}
              value={draft.about}
              onChange={(v) => set('about', v)}
              rows={4}
            />
            <Area
              label="Personality & habits"
              hint="How you behave: introvert or social, night owl, procrastinator, perfectionist, how you handle stress…"
              max={2000}
              value={draft.personality}
              onChange={(v) => set('personality', v)}
              rows={3}
            />
            <Area
              label="Interests"
              max={1500}
              value={draft.interests}
              onChange={(v) => set('interests', v)}
              rows={2}
              placeholder="Games, music, food, hobbies…"
            />
            <Area
              label="What you're working toward"
              max={1500}
              value={draft.goals}
              onChange={(v) => set('goals', v)}
              rows={2}
              placeholder="Projects, health, learning, career…"
            />
          </Group>
          <Group title="How they should treat you">
            <Area
              label="How you like to be talked to and helped"
              hint="e.g. straight to the point, gentle when I'm stressed, push me when I procrastinate, tease me a bit."
              max={1500}
              value={draft.preferences}
              onChange={(v) => set('preferences', v)}
              rows={3}
            />
            <Area
              label="Please avoid"
              hint="Topics, jokes, or habits you don't want from them."
              max={1000}
              value={draft.avoid}
              onChange={(v) => set('avoid', v)}
              rows={2}
            />
          </Group>
          {error && (
            <p className="text-xs text-[#b0707b]" role="alert">
              {error}
            </p>
          )}
        </div>
        <div className="flex items-center justify-end border-t border-[#f0eaf3] px-7 py-4">
          <button
            className="inline-flex items-center gap-2 rounded-lg bg-lilac px-5 py-2.5 text-xs text-white hover:bg-lilac-dark disabled:opacity-50"
            disabled={saving}
          >
            {saving ? (
              'Saving…'
            ) : (
              <>
                <Check size={15} /> Save
              </>
            )}
          </button>
        </div>
      </form>
    </dialog>
  );
}
