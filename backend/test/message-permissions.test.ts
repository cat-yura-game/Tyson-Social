import { describe, expect, it } from 'vitest';
import { canDeleteMessage } from '../src/services/message-permissions';

describe('message deletion permissions', () => {
  it('allows an author to delete their own message', () => {
    expect(canDeleteMessage('user-a', 'user-a')).toBe(true);
  });

  it('does not allow deleting another user message', () => {
    expect(canDeleteMessage('user-a', 'user-b')).toBe(false);
  });
});
