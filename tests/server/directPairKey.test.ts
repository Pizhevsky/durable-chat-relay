import { describe, expect, it } from 'vitest'
import { DirectPairKey } from '../../shared/domain/DirectPairKey'

describe('DirectPairKey', () => {
  it('builds the same canonical key regardless of user order', () => {
    expect(DirectPairKey.fromUserIds(['u-denis', 'u-anna']).value).toBe('u-anna:u-denis')
    expect(DirectPairKey.fromUserIds(['u-anna', 'u-denis']).value).toBe('u-anna:u-denis')
  })

  it('rejects anything other than two unique users', () => {
    expect(() => DirectPairKey.fromUserIds(['u-denis', 'u-denis'])).toThrow(/two unique/)
  })
})
