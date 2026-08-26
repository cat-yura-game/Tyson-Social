import { describe, expect, it } from 'vitest';
import { normalizeProfileUpdate } from '../src/routes/users';

describe('profile update normalization', () => {
  it('repairs obsolete optional profile fields instead of rejecting a valid save', () => {
    expect(normalizeProfileUpdate({ displayName: 'Tyson', bio: '', birthdayMonthDay: '2026-08-14', birthdayYear: 2026, profileColor: 'legacy-blue' }))
      .toMatchObject({ displayName: 'Tyson', birthdayMonthDay: null, birthdayYear: null, profileColor: 'forest' });
  });
});
