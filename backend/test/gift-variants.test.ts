import { describe, expect, it } from 'vitest';
import { selectCollectibleVariant } from '../src/services/gift-variants';

describe('collectible variants', () => {
  it('selects a server-side variant from the configured list', () => {
    expect(selectCollectibleVariant(['one', 'two', 'three'], () => 0.67)).toBe('three');
  });

  it('rejects an empty collectible configuration', () => {
    expect(() => selectCollectibleVariant([])).toThrow();
  });
});
