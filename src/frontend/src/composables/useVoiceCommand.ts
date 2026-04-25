import { ref, onUnmounted } from 'vue'

// SpeechRecognition is available in Chrome/Edge via the webkit-prefixed name.
// The unprefixed version may not be present in TypeScript's lib.dom.d.ts for
// all compiler versions, so we define a minimal interface here.
interface SpeechRecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((e: SpeechRecognitionEvent) => void) | null
  onend: (() => void) | null
  onerror: (() => void) | null
  start(): void
  stop(): void
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    webkitSpeechRecognition?: any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    SpeechRecognition?: any
  }
}

export function useVoiceCommand(
  onTranscript: (text: string) => void,
  opts: { lang?: string } = {},
) {
  const SR: SpeechRecognitionCtor | null =
    typeof window !== 'undefined'
      ? // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        (window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null)
      : null

  const supported = ref<boolean>(!!SR)
  const listening = ref<boolean>(false)
  let recognition: SpeechRecognitionLike | null = null

  function start() {
    if (!SR || listening.value) return
    try {
      recognition = new SR()
      recognition.lang = opts.lang || 'zh-TW'
      recognition.continuous = false
      recognition.interimResults = false
      recognition.onresult = (e: SpeechRecognitionEvent) => {
        const t = e.results[0]?.[0]?.transcript || ''
        if (t) onTranscript(t)
      }
      recognition.onend = () => {
        listening.value = false
      }
      recognition.onerror = () => {
        listening.value = false
      }
      recognition.start()
      listening.value = true
    } catch {
      listening.value = false
    }
  }

  function stop() {
    if (recognition) {
      try {
        recognition.stop()
      } catch {
        /* silent */
      }
    }
    listening.value = false
  }

  function toggle() {
    listening.value ? stop() : start()
  }

  onUnmounted(() => stop())

  return { supported, listening, start, stop, toggle }
}
