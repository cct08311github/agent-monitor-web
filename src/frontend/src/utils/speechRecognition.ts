/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * speechRecognition.ts
 *
 * Thin wrapper around the Web Speech API (SpeechRecognition / webkitSpeechRecognition).
 * Browser API types are spotty across environments, so `any` casts are intentional here.
 */

export interface SpeechRecognitionWrapper {
  start(): void
  stop(): void
  onResult: (text: string) => void
  onError: (msg: string) => void
  onEnd: () => void
}

/**
 * Returns true when the current browser exposes SpeechRecognition or its
 * webkit-prefixed counterpart.  Always false in SSR / non-browser contexts.
 */
export function isSpeechRecognitionSupported(): boolean {
  if (typeof window === 'undefined') return false
  const w = window as any
  return !!(w.SpeechRecognition || w.webkitSpeechRecognition)
}

/**
 * Creates a lightweight SpeechRecognitionWrapper for single-utterance dictation.
 *
 * @param lang  BCP-47 language tag (default: `'zh-TW'`)
 * @returns  A wrapper instance, or `null` when the API is unavailable.
 */
export function createSpeechRecognition(lang: string = 'zh-TW'): SpeechRecognitionWrapper | null {
  if (!isSpeechRecognitionSupported()) return null
  const w = window as any
  const Ctor: new () => any = w.SpeechRecognition || w.webkitSpeechRecognition
  try {
    const rec = new Ctor()
    rec.lang = lang
    rec.interimResults = false
    rec.continuous = false // single utterance per start()

    const wrapper: SpeechRecognitionWrapper = {
      start() {
        try {
          rec.start()
        } catch {
          /* may already be running — swallow */
        }
      },
      stop() {
        try {
          rec.stop()
        } catch {
          /* silent */
        }
      },
      onResult: () => {},
      onError: () => {},
      onEnd: () => {},
    }

    rec.onresult = (e: any) => {
      const transcript: string = Array.from(e.results as any[])
        .map((r: any) => r[0].transcript as string)
        .join(' ')
      wrapper.onResult(transcript.trim())
    }

    rec.onerror = (e: any) => wrapper.onError(String((e as any).error ?? 'unknown'))

    rec.onend = () => wrapper.onEnd()

    return wrapper
  } catch {
    return null
  }
}
