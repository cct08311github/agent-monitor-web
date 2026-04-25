import { describe, it, expect, vi, afterEach } from 'vitest'
import { defineComponent } from 'vue'
import { mount } from '@vue/test-utils'

// ---------------------------------------------------------------------------
// useVoiceCommand unit tests
//
// Environment: happy-dom — SpeechRecognition is not natively provided.
// Strategy: build a minimal SpeechRecognition mock class and inject it via
//   vi.stubGlobal / window assignment before importing the composable.
// ---------------------------------------------------------------------------

/** A minimal SpeechRecognition mock that records calls. */
function makeSpeechRecognitionMock() {
  const instances: MockSpeechRecognition[] = []

  class MockSpeechRecognition {
    lang = ''
    continuous = false
    interimResults = false
    onresult: ((e: SpeechRecognitionEvent) => void) | null = null
    onend: (() => void) | null = null
    onerror: (() => void) | null = null

    startCalled = false
    stopCalled = false

    start() {
      this.startCalled = true
    }

    stop() {
      this.stopCalled = true
    }

    /** Helper to simulate a successful recognition result. */
    simulateResult(transcript: string) {
      const evt = {
        results: [[{ transcript, confidence: 1 }]],
      } as unknown as SpeechRecognitionEvent
      this.onresult?.(evt)
    }

    /** Helper to simulate the recognition session ending. */
    simulateEnd() {
      this.onend?.()
    }

    /** Helper to simulate an error. */
    simulateError() {
      this.onerror?.()
    }
  }

  // Track all instances created by the mock constructor.
  const TrackingMock = new Proxy(MockSpeechRecognition, {
    construct(target, args) {
      const inst = new target(...(args as []))
      instances.push(inst as unknown as MockSpeechRecognition)
      return inst
    },
  })

  return { TrackingMock, instances }
}

// ---------------------------------------------------------------------------

describe('useVoiceCommand', () => {
  let restoreGlobal: (() => void) | null = null

  afterEach(() => {
    restoreGlobal?.()
    restoreGlobal = null
    vi.unstubAllGlobals()
  })

  // ── 1. supported = false when SpeechRecognition is unavailable ─────────────

  it('supported is false when SpeechRecognition is not available', async () => {
    // Ensure neither SpeechRecognition nor webkitSpeechRecognition is defined
    vi.stubGlobal('SpeechRecognition', undefined)
    vi.stubGlobal('webkitSpeechRecognition', undefined)

    // Dynamic import after stubbing globals so composable sees the stub
    const { useVoiceCommand } = await import('../useVoiceCommand')
    const onTranscript = vi.fn()

    const Comp = defineComponent({
      setup() {
        const voice = useVoiceCommand(onTranscript)
        return { voice }
      },
      template: '<div />',
    })

    const wrapper = mount(Comp)
    const voice = (wrapper.vm as unknown as { voice: ReturnType<typeof useVoiceCommand> }).voice
    expect(voice.supported.value).toBe(false)
    wrapper.unmount()
  })

  // ── 2. supported = true when SpeechRecognition is available ───────────────

  it('supported is true when SpeechRecognition is available', async () => {
    const { TrackingMock } = makeSpeechRecognitionMock()
    vi.stubGlobal('SpeechRecognition', TrackingMock)

    const { useVoiceCommand } = await import('../useVoiceCommand')
    const onTranscript = vi.fn()

    const Comp = defineComponent({
      setup() {
        const voice = useVoiceCommand(onTranscript)
        return { voice }
      },
      template: '<div />',
    })

    const wrapper = mount(Comp)
    const voice = (wrapper.vm as unknown as { voice: ReturnType<typeof useVoiceCommand> }).voice
    expect(voice.supported.value).toBe(true)
    wrapper.unmount()
  })

  // ── 3. start() sets listening=true and calls recognition.start() ──────────

  it('start() sets listening to true and invokes recognition.start()', async () => {
    const { TrackingMock, instances } = makeSpeechRecognitionMock()
    vi.stubGlobal('SpeechRecognition', TrackingMock)

    const { useVoiceCommand } = await import('../useVoiceCommand')
    const onTranscript = vi.fn()

    const Comp = defineComponent({
      setup() {
        const voice = useVoiceCommand(onTranscript)
        return { voice }
      },
      template: '<div />',
    })

    const wrapper = mount(Comp)
    const voice = (wrapper.vm as unknown as { voice: ReturnType<typeof useVoiceCommand> }).voice

    expect(voice.listening.value).toBe(false)
    voice.start()
    expect(voice.listening.value).toBe(true)
    expect(instances.length).toBe(1)
    expect(instances[0].startCalled).toBe(true)
    wrapper.unmount()
  })

  // ── 4. stop() sets listening=false and calls recognition.stop() ───────────

  it('stop() sets listening to false', async () => {
    const { TrackingMock, instances } = makeSpeechRecognitionMock()
    vi.stubGlobal('SpeechRecognition', TrackingMock)

    const { useVoiceCommand } = await import('../useVoiceCommand')
    const onTranscript = vi.fn()

    const Comp = defineComponent({
      setup() {
        const voice = useVoiceCommand(onTranscript)
        return { voice }
      },
      template: '<div />',
    })

    const wrapper = mount(Comp)
    const voice = (wrapper.vm as unknown as { voice: ReturnType<typeof useVoiceCommand> }).voice

    voice.start()
    expect(voice.listening.value).toBe(true)

    voice.stop()
    expect(voice.listening.value).toBe(false)
    expect(instances[0].stopCalled).toBe(true)
    wrapper.unmount()
  })

  // ── 5. toggle() starts when not listening ─────────────────────────────────

  it('toggle() starts recognition when not listening', async () => {
    const { TrackingMock } = makeSpeechRecognitionMock()
    vi.stubGlobal('SpeechRecognition', TrackingMock)

    const { useVoiceCommand } = await import('../useVoiceCommand')
    const onTranscript = vi.fn()

    const Comp = defineComponent({
      setup() {
        const voice = useVoiceCommand(onTranscript)
        return { voice }
      },
      template: '<div />',
    })

    const wrapper = mount(Comp)
    const voice = (wrapper.vm as unknown as { voice: ReturnType<typeof useVoiceCommand> }).voice

    expect(voice.listening.value).toBe(false)
    voice.toggle()
    expect(voice.listening.value).toBe(true)
    wrapper.unmount()
  })

  // ── 6. toggle() stops when already listening ─────────────────────────────

  it('toggle() stops recognition when already listening', async () => {
    const { TrackingMock } = makeSpeechRecognitionMock()
    vi.stubGlobal('SpeechRecognition', TrackingMock)

    const { useVoiceCommand } = await import('../useVoiceCommand')
    const onTranscript = vi.fn()

    const Comp = defineComponent({
      setup() {
        const voice = useVoiceCommand(onTranscript)
        return { voice }
      },
      template: '<div />',
    })

    const wrapper = mount(Comp)
    const voice = (wrapper.vm as unknown as { voice: ReturnType<typeof useVoiceCommand> }).voice

    voice.start()
    expect(voice.listening.value).toBe(true)

    voice.toggle()
    expect(voice.listening.value).toBe(false)
    wrapper.unmount()
  })

  // ── 7. onresult calls onTranscript with transcript text ───────────────────

  it('calls onTranscript when recognition fires a result', async () => {
    const { TrackingMock, instances } = makeSpeechRecognitionMock()
    vi.stubGlobal('SpeechRecognition', TrackingMock)

    const { useVoiceCommand } = await import('../useVoiceCommand')
    const onTranscript = vi.fn()

    const Comp = defineComponent({
      setup() {
        const voice = useVoiceCommand(onTranscript)
        return { voice }
      },
      template: '<div />',
    })

    const wrapper = mount(Comp)
    const voice = (wrapper.vm as unknown as { voice: ReturnType<typeof useVoiceCommand> }).voice

    voice.start()
    instances[0].simulateResult('切到日誌')

    expect(onTranscript).toHaveBeenCalledWith('切到日誌')
    wrapper.unmount()
  })

  // ── 8. onend sets listening=false ────────────────────────────────────────

  it('sets listening to false when recognition ends naturally', async () => {
    const { TrackingMock, instances } = makeSpeechRecognitionMock()
    vi.stubGlobal('SpeechRecognition', TrackingMock)

    const { useVoiceCommand } = await import('../useVoiceCommand')
    const onTranscript = vi.fn()

    const Comp = defineComponent({
      setup() {
        const voice = useVoiceCommand(onTranscript)
        return { voice }
      },
      template: '<div />',
    })

    const wrapper = mount(Comp)
    const voice = (wrapper.vm as unknown as { voice: ReturnType<typeof useVoiceCommand> }).voice

    voice.start()
    expect(voice.listening.value).toBe(true)

    instances[0].simulateEnd()
    expect(voice.listening.value).toBe(false)
    wrapper.unmount()
  })

  // ── 9. onerror sets listening=false ──────────────────────────────────────

  it('sets listening to false when recognition errors', async () => {
    const { TrackingMock, instances } = makeSpeechRecognitionMock()
    vi.stubGlobal('SpeechRecognition', TrackingMock)

    const { useVoiceCommand } = await import('../useVoiceCommand')
    const onTranscript = vi.fn()

    const Comp = defineComponent({
      setup() {
        const voice = useVoiceCommand(onTranscript)
        return { voice }
      },
      template: '<div />',
    })

    const wrapper = mount(Comp)
    const voice = (wrapper.vm as unknown as { voice: ReturnType<typeof useVoiceCommand> }).voice

    voice.start()
    expect(voice.listening.value).toBe(true)

    instances[0].simulateError()
    expect(voice.listening.value).toBe(false)
    wrapper.unmount()
  })

  // ── 10. start() does nothing when already listening ───────────────────────

  it('start() does nothing when already listening (idempotent)', async () => {
    const { TrackingMock, instances } = makeSpeechRecognitionMock()
    vi.stubGlobal('SpeechRecognition', TrackingMock)

    const { useVoiceCommand } = await import('../useVoiceCommand')
    const onTranscript = vi.fn()

    const Comp = defineComponent({
      setup() {
        const voice = useVoiceCommand(onTranscript)
        return { voice }
      },
      template: '<div />',
    })

    const wrapper = mount(Comp)
    const voice = (wrapper.vm as unknown as { voice: ReturnType<typeof useVoiceCommand> }).voice

    voice.start()
    voice.start() // second call — should not create a second instance
    expect(instances).toHaveLength(1)
    wrapper.unmount()
  })

  // ── 11. onUnmounted calls stop() ─────────────────────────────────────────

  it('calls stop on component unmount', async () => {
    const { TrackingMock, instances } = makeSpeechRecognitionMock()
    vi.stubGlobal('SpeechRecognition', TrackingMock)

    const { useVoiceCommand } = await import('../useVoiceCommand')
    const onTranscript = vi.fn()

    const Comp = defineComponent({
      setup() {
        const voice = useVoiceCommand(onTranscript)
        return { voice }
      },
      template: '<div />',
    })

    const wrapper = mount(Comp)
    const voice = (wrapper.vm as unknown as { voice: ReturnType<typeof useVoiceCommand> }).voice

    voice.start()
    expect(voice.listening.value).toBe(true)

    wrapper.unmount()
    // After unmount, recognition.stop() should have been called
    expect(instances[0].stopCalled).toBe(true)
  })
})
