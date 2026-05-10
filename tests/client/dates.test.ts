import { describe, expect, it } from 'vitest'
import { formatLocalDateTime } from '../../client/src/utils/dates'

describe('date utilities', () => {
  it('returns the original value when a date string cannot be parsed', () => {
    expect(formatLocalDateTime('not-a-date')).toBe('not-a-date')
  })
})
