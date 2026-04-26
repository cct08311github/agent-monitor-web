// ---------------------------------------------------------------------------
// dailyDigestFormat — formats daily digest summary for clipboard copy
//
// Usage:
//   const text = formatDigestForClipboard({ date: new Date(), activeAgents: 3, ... })
// ---------------------------------------------------------------------------

export interface DigestData {
  date: Date
  activeAgents: number
  errors24h: number
  activeAlerts: number
  enabledCronJobs: number
  captureCountToday: number
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

export function dateOnly(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function formatDigestForClipboard(data: DigestData): string {
  const lines: string[] = [
    `📊 Agent Monitor 當日摘要 (${dateOnly(data.date)})`,
    '',
    `✅ Active agents: ${data.activeAgents}`,
    `⚠️ Errors (last 24h): ${data.errors24h}`,
    `☕ Active alerts: ${data.activeAlerts}`,
    `🕒 Cron jobs enabled: ${data.enabledCronJobs}`,
    `📝 Captures (today): ${data.captureCountToday}`,
  ]
  return lines.join('\n')
}
