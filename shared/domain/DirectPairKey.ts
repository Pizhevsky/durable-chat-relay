import type { UserId } from '../types.js'

export class DirectPairKey {
  private constructor(readonly value: string) {}

  static fromUserIds(userIds: UserId[]): DirectPairKey {
    const uniqueIds = Array.from(new Set(userIds.map((id) => id.trim()).filter(Boolean)))

    if (uniqueIds.length !== 2) {
      throw new Error('A direct chat requires exactly two unique participants.')
    }

    return new DirectPairKey(uniqueIds.sort().join(':'))
  }

  equals(other: DirectPairKey): boolean {
    return this.value === other.value
  }
}
