import { describe, it, expect, beforeEach } from 'vitest'
import { useLogPause } from './useLogPause'

describe('useLogPause', () => {
  let api: ReturnType<typeof useLogPause<string>>

  beforeEach(() => {
    api = useLogPause<string>({ maxQueueSize: 5 })
  })

  it('initial state: paused=false, queue empty', () => {
    expect(api.paused.value).toBe(false)
    expect(api.pauseQueue.value).toEqual([])
  })

  it('enqueue pushes entries', () => {
    api.enqueue('a')
    api.enqueue('b')
    expect(api.pauseQueue.value).toEqual(['a', 'b'])
  })

  it('enqueue truncates oldest entries when exceeding maxQueueSize', () => {
    for (let i = 0; i < 10; i++) api.enqueue(`e${i}`)
    expect(api.pauseQueue.value.length).toBe(5)
    // Oldest (e0-e4) dropped, newest (e5-e9) retained
    expect(api.pauseQueue.value).toEqual(['e5', 'e6', 'e7', 'e8', 'e9'])
  })

  it('drain returns all entries and empties the queue', () => {
    api.enqueue('x')
    api.enqueue('y')
    const result = api.drain()
    expect(result).toEqual(['x', 'y'])
    expect(api.pauseQueue.value).toEqual([])
  })

  it('drain on empty queue returns empty array', () => {
    const result = api.drain()
    expect(result).toEqual([])
    expect(api.pauseQueue.value).toEqual([])
  })

  it('reset clears the queue without returning entries', () => {
    api.enqueue('1')
    api.enqueue('2')
    api.reset()
    expect(api.pauseQueue.value).toEqual([])
  })

  it('paused ref is independently mutable', () => {
    api.paused.value = true
    expect(api.paused.value).toBe(true)
    api.paused.value = false
    expect(api.paused.value).toBe(false)
  })

  it('enqueue-drain cycle works multiple rounds', () => {
    api.enqueue('a')
    api.enqueue('b')
    expect(api.drain()).toEqual(['a', 'b'])
    api.enqueue('c')
    api.enqueue('d')
    api.enqueue('e')
    expect(api.drain()).toEqual(['c', 'd', 'e'])
    expect(api.pauseQueue.value).toEqual([])
  })

  it('enqueue exactly at maxQueueSize does not truncate', () => {
    for (let i = 0; i < 5; i++) api.enqueue(`e${i}`)
    expect(api.pauseQueue.value.length).toBe(5)
    expect(api.pauseQueue.value).toEqual(['e0', 'e1', 'e2', 'e3', 'e4'])
  })
})
