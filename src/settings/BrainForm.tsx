import { useState, type FormEvent } from 'react';
import { Check, Eye, EyeOff, KeyRound, Unplug } from 'lucide-react';
import { request } from '../api';
import { forgetBrain, readBrainSession, saveBrainEntry } from '../storage';
import type { Config, Provider } from '../types';

export const PROVIDER_LABEL: Record<Provider, string> = {
  openai: 'OpenAI',
  anthropic: 'Claude',
  compatible: 'Custom API',
};

const field =
  'mt-1.5 block w-full min-w-0 rounded-lg border border-[#e6ddea] bg-white px-3 py-2.5 text-[13px] text-ink outline-none placeholder:text-faint focus:border-[#b79cc9] focus:ring-3 focus:ring-[#f0e6f6] disabled:opacity-50';
export default function BrainForm({
  config,
  onSave,
}: {
  config: Config;
  onSave: (config: Config, notice: string) => void;
}) {
  const session = readBrainSession();
  const saved = (p: Provider) => session.entries[p];
  const initial = saved(config.provider);
  const [provider, setProvider] = useState<Provider>(config.provider);
  const [model, setModel] = useState(
    config.configured ? config.model : initial?.model || config.model,
  );
  const [baseUrl, setBaseUrl] = useState(config.baseUrl || initial?.baseUrl || '');
  // The key stays filled in for this session, so it's clear it's saved (and can be revealed).
  const [apiKey, setApiKey] = useState(initial?.apiKey ?? '');
  const [visible, setVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const sameTarget =
    provider === config.provider &&
    (provider !== 'compatible' || baseUrl.replace(/\/+$/, '') === config.baseUrl);
  function switchProvider(value: Provider) {
    const entry = saved(value);
    setProvider(value);
    setError('');
    setApiKey(entry?.apiKey ?? '');
    setModel(
      entry?.model ??
        (value === config.provider ? config.model : value === 'openai' ? 'gpt-4.1-mini' : ''),
    );
    setBaseUrl(entry?.baseUrl ?? (value === config.provider ? config.baseUrl : ''));
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const next = await request<Config>('/api/config', {
        provider,
        model,
        baseUrl,
        ...(apiKey ? { apiKey } : {}),
      });
      saveBrainEntry(provider, {
        model: next.model,
        baseUrl: next.baseUrl,
        apiKey: apiKey || saved(provider)?.apiKey || '',
      });
      onSave(next, 'Brain connected and remembered for this session. Send a message to test it.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save settings.');
    } finally {
      setSaving(false);
    }
  }
  async function disconnect() {
    setSaving(true);
    setError('');
    try {
      onSave(
        await request<Config>('/api/disconnect', {}),
        'Provider disconnected and forgotten for this session.',
      );
      forgetBrain(provider);
      setApiKey('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not disconnect.');
    } finally {
      setSaving(false);
    }
  }
  return (
    <form onSubmit={save} className="space-y-3">
      <div className="flex gap-1 rounded-xl bg-mist p-1" role="group" aria-label="AI provider">
        {(['openai', 'anthropic', 'compatible'] as Provider[]).map((p) => (
          <button
            type="button"
            key={p}
            aria-pressed={provider === p}
            onClick={() => switchProvider(p)}
            disabled={saving}
            className={`flex-1 rounded-lg py-2 text-xs ${provider === p ? 'bg-white text-lilac-dark shadow-sm' : 'text-soft'}`}
          >
            {PROVIDER_LABEL[p]}
          </button>
        ))}
      </div>
      {provider === 'compatible' && (
        <label className="block text-xs font-medium text-soft">
          API base URL
          <input
            className={field}
            type="url"
            required
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="http://localhost:1234/v1"
            disabled={saving}
          />
        </label>
      )}
      <label className="block text-xs font-medium text-soft">
        Model ID
        <input
          className={field}
          required
          value={model}
          onChange={(e) => setModel(e.target.value)}
          maxLength={160}
          placeholder={
            provider === 'anthropic' ? 'A Claude model ID on your account' : 'Provider model ID'
          }
          disabled={saving}
        />
      </label>
      <label className="block text-xs font-medium text-soft">
        API key{' '}
        {provider === 'compatible' && (
          <span className="font-normal text-faint">(optional for local servers)</span>
        )}
        <span className="relative block">
          <input
            className={`${field} pr-10`}
            type={visible ? 'text' : 'password'}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            maxLength={4096}
            required={provider !== 'compatible' && !(sameTarget && config.hasKey)}
            placeholder={
              sameTarget && config.hasKey ? 'Key set · leave blank to keep' : 'Paste your API key'
            }
            disabled={saving}
          />
          <button
            type="button"
            className="absolute top-1/2 right-2 -translate-y-1/2 p-1 text-faint"
            onClick={() => setVisible(!visible)}
            aria-label={visible ? 'Hide API key' : 'Show API key'}
          >
            {visible ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </span>
      </label>
      <p className="flex gap-2 rounded-lg bg-mist/70 p-2.5 text-[11px] leading-relaxed text-soft">
        <KeyRound size={14} className="mt-0.5 shrink-0" />
        Remembered for this browser session (until you close the tab), even if the local server
        restarts. For a permanent setup use .env. Chat context goes to your provider.
      </p>
      {error && (
        <p className="text-xs text-[#b0707b]" role="alert">
          {error}
        </p>
      )}
      <div className="flex items-center justify-end gap-2">
        {config.configured && (
          <button
            type="button"
            className="mr-auto inline-flex items-center gap-1.5 text-xs text-[#b1828a]"
            onClick={disconnect}
            disabled={saving}
          >
            <Unplug size={14} /> Disconnect
          </button>
        )}
        <button
          className="inline-flex items-center gap-2 rounded-lg bg-lilac px-4 py-2.5 text-xs text-white hover:bg-lilac-dark disabled:opacity-50"
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
  );
}
