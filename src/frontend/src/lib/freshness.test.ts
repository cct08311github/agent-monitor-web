import { describe, it, expect } from 'vitest'
import { computeFreshness, formatFreshnessLabel } from './freshness'

describe('computeFreshness', () => {
  it('returns loading for null age', () => {
    expect(computeFreshness(null)).toBe('loading')
  })

  it('returns fresh for age 0', () => {
    expect(computeFreshness(0)).toBe('fresh')
  })

  it('returns fresh for age 15', () => {
    expect(computeFreshness(15)).toBe('fresh')
  })

  it('returns fresh for age 29', () => {
    expect(computeFreshness(29)).toBe('fresh')
  })

  it('returns warning for age 30', () => {
    expect(computeFreshness(30)).toBe('warning')
  })

  it('returns warning for age 45', () => {
    expect(computeFreshness(45)).toBe('warning')
  })

  it('returns warning for age 59', () => {
    expect(computeFreshness(59)).toBe('warning')
  })

  it('returns stale for age 60', () => {
    expect(computeFreshness(60)).toBe('stale')
  })

  it('returns stale for age 120', () => {
    expect(computeFreshness(120)).toBe('stale')
  })

  it('returns stale for age 3600', () => {
    expect(computeFreshness(3600)).toBe('stale')
  })
})

describe('formatFreshnessLabel', () => {
  it('returns 載入中... for loading', () => {
    expect(formatFreshnessLabel('loading', null)).toBe('載入中...')
  })

  it('returns 已更新 Xs 前 for fresh', () => {
    expect(formatFreshnessLabel('fresh', 5)).toBe('已更新 5s 前')
  })

  it('returns ⚠ 資料延遲 Xs for warning', () => {
    expect(formatFreshnessLabel('warning', 45)).toBe('⚠ 資料延遲 45s')
  })

  it('returns ⚠ 資料可能過期 (Xs) for stale', () => {
    expect(formatFreshnessLabel('stale', 90)).toBe('⚠ 資料可能過期 (90s)')
  })
})
