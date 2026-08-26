import { describe, expect, it } from 'vitest';
import { fillBetaFeed } from '../src/routes/shorts';

describe('beta short-video feed', () => {
  it('repeats a small catalogue so the early beta feed remains scrollable', () => {
    expect(fillBetaFeed(['one', 'two'], 5)).toEqual(['one', 'two', 'one', 'two', 'one']);
  });

  it('does not repeat a feed with fewer than two videos', () => {
    expect(fillBetaFeed(['one'], 5)).toEqual(['one']);
  });
});
