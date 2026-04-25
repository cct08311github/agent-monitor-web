const WEEKDAYS = ['週日', '週一', '週二', '週三', '週四', '週五', '週六']

export function humanizeCron(expr: string): string {
  if (!expr || typeof expr !== 'string') return ''
  const trimmed = expr.trim()

  // @-shortcuts
  const shortcuts: Record<string, string> = {
    '@yearly': '每年 1/1 00:00',
    '@annually': '每年 1/1 00:00',
    '@monthly': '每月 1 號 00:00',
    '@weekly': '每週日 00:00',
    '@daily': '每天 00:00',
    '@midnight': '每天 00:00',
    '@hourly': '每小時整點',
  }
  if (trimmed.toLowerCase() in shortcuts) return shortcuts[trimmed.toLowerCase()]

  const parts = trimmed.split(/\s+/)
  if (parts.length !== 5) return trimmed
  const [min, hour, dom, mon, dow] = parts

  // 5-stars: * * * * *
  if (min === '*' && hour === '*' && dom === '*' && mon === '*' && dow === '*') {
    return '每分鐘'
  }

  // */N * * * *
  const minStep = min.match(/^\*\/(\d+)$/)
  if (minStep && hour === '*' && dom === '*' && mon === '*' && dow === '*') {
    return `每 ${minStep[1]} 分鐘`
  }

  // 0 * * * *
  if (min === '0' && hour === '*' && dom === '*' && mon === '*' && dow === '*') {
    return '每小時整點'
  }

  // 0 */N * * *
  const hourStep = hour.match(/^\*\/(\d+)$/)
  if (min === '0' && hourStep && dom === '*' && mon === '*' && dow === '*') {
    return `每 ${hourStep[1]} 小時`
  }

  // M H * * * — every day at H:M
  if (/^\d+$/.test(min) && /^\d+$/.test(hour) && dom === '*' && mon === '*' && dow === '*') {
    const h = String(hour).padStart(2, '0')
    const m = String(min).padStart(2, '0')
    return `每天 ${h}:${m}`
  }

  // M H * * D — weekly on weekday D at H:M
  if (/^\d+$/.test(min) && /^\d+$/.test(hour) && dom === '*' && mon === '*' && /^\d+$/.test(dow)) {
    const idx = parseInt(dow, 10) % 7
    const h = String(hour).padStart(2, '0')
    const m = String(min).padStart(2, '0')
    return `每${WEEKDAYS[idx]} ${h}:${m}`
  }

  // M H D * * — monthly on day D at H:M
  if (/^\d+$/.test(min) && /^\d+$/.test(hour) && /^\d+$/.test(dom) && mon === '*' && dow === '*') {
    const h = String(hour).padStart(2, '0')
    const m = String(min).padStart(2, '0')
    return `每月 ${dom} 號 ${h}:${m}`
  }

  return trimmed
}
