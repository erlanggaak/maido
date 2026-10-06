import { useRef, useState } from 'react';
import type { Director } from '../avatar/director';
import type { Beat } from '../types';

interface Speech {
  text: string;
  shown: number;
  beats: Beat[];
}

/** Keep streamed subtitles and the director's speech cursor in sync. */
export function useSpeech(director: Director) {
  const [speech, setSpeech] = useState<Speech | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const speechId = useRef(0);

  function beginSpeech() {
    const id = ++speechId.current;
    setSpeech({ text: '', shown: 0, beats: [] });
    setSpeaking(true);
    director.beginSpeech(
      (shown) => {
        if (speechId.current === id) setSpeech((current) => current && { ...current, shown });
      },
      () => {
        if (speechId.current === id) setSpeaking(false);
      },
    );
  }

  function appendSpeech(text: string, beats: Beat[] = []) {
    setSpeech(
      (current) =>
        current && {
          ...current,
          text: current.text + text,
          beats: [...current.beats, ...beats],
        },
    );
    director.appendSpeech(text, beats);
  }

  function endSpeech(final?: { text: string; beats: Beat[] }) {
    if (final)
      setSpeech((current) => current && { ...current, text: final.text, beats: final.beats });
    director.closeSpeech(final);
  }

  function speak(text: string, beats: Beat[]) {
    beginSpeech();
    appendSpeech(text, beats);
    endSpeech();
  }

  function cancelSpeech() {
    director.cancelSpeech();
    speechId.current++;
    setSpeech(null);
    setSpeaking(false);
  }

  return {
    speech,
    speaking,
    beginSpeech,
    appendSpeech,
    endSpeech,
    speak,
    cancelSpeech,
    clearSpeech: () => setSpeech(null),
  };
}
