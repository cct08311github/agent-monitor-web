// ---------------------------------------------------------------------------
// onboardingSteps.ts — Static data for the 5-step onboarding tour.
// ---------------------------------------------------------------------------

export interface OnboardingStep {
  title: string
  description: string
  hintKey?: string // displayed as <kbd>...</kbd> e.g. '⌘ K'
}

export const ONBOARDING_STEPS: ReadonlyArray<OnboardingStep> = [
  {
    title: '👋 歡迎使用 Agent Monitor',
    description:
      '這是用來監控 OpenClaw agent 的 dashboard。我們先帶你看 5 個快速上手的功能。',
  },
  {
    title: '⌘ Command Palette',
    description:
      '按下 ⌘+K (Mac) 或 Ctrl+K (Windows) 隨時打開命令面板，快速跳到任何 tab、執行 action、搜尋功能。',
    hintKey: '⌘ K',
  },
  {
    title: '🎹 鍵盤快捷鍵',
    description: '按 ? 隨時查看完整的鍵盤快捷鍵列表。專業 user 都用快捷鍵 ;)',
    hintKey: '?',
  },
  {
    title: '🎨 主題切換 + 個人化',
    description:
      '按 T 切換深淺主題。在命令面板裡可以 ⭐ 釘選常用功能；agent detail 裡可以加筆記、bookmark 重要 sessions。',
    hintKey: 'T',
  },
  {
    title: '🚀 準備好了',
    description: '隨時可以從 ? 面板裡的「重新觀看引導」回來重看。Have fun!',
  },
] as const
