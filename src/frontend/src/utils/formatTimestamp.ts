import type { TimezoneMode } from './timezonePref'

export interface FormatOptions {
  mode?: TimezoneMode
  style?: 'date' | 'time' | 'datetime' | 'short'
  /** Include ' UTC' suffix when mode is 'utc' and style is not 'time'. Default: true. */
  suffix?: boolean
}

const pad = (n: number) => String(n).padStart(2, '0')

function parts(d: Date, mode: TimezoneMode) {
  if (mode === 'utc') {
    return {
      y: d.getUTCFullYear(),
      m: d.getUTCMonth() + 1,
      dd: d.getUTCDate(),
      h: d.getUTCHours(),
      mi: d.getUTCMinutes(),
      s: d.getUTCSeconds(),
    }
  }
  return {
    y: d.getFullYear(),
    m: d.getMonth() + 1,
    dd: d.getDate(),
    h: d.getHours(),
    mi: d.getMinutes(),
    s: d.getSeconds(),
  }
}

export function formatTimestamp(input: number | Date, opts: FormatOptions = {}): string {
  const mode = opts.mode ?? 'local'
  const style = opts.style ?? 'datetime'
  const suffix = opts.suffix ?? true

  const d = input instanceof Date ? input : new Date(input)
  if (Number.isNaN(d.getTime())) return ''

  const p = parts(d, mode)

  let body: string
  switch (style) {
    case 'date':
      body = `${p.y}-${pad(p.m)}-${pad(p.dd)}`
      break
    case 'time':
      body = `${pad(p.h)}:${pad(p.mi)}`
      break
    case 'short':
      body = `${pad(p.m)}-${pad(p.dd)} ${pad(p.h)}:${pad(p.mi)}`
      break
    case 'datetime':
    default:
      body = `${p.y}-${pad(p.m)}-${pad(p.dd)} ${pad(p.h)}:${pad(p.mi)}`
      break
  }

  if (mode === 'utc' && suffix && style !== 'time') return `${body} UTC`
  return body
}
