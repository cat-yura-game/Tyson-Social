import { describe, expect, it } from 'vitest';
import { DevelopmentModerationProvider } from '../src/ai/moderation';

describe('development moderation provider', () => {
  it('allows ordinary content', async () => {
    const provider = new DevelopmentModerationProvider();
    const result = await provider.moderate({ text: 'Привет, Tyson!', links: [], media: [] });
    expect(result.decision).toBe('allow');
  });

  it('sends suspicious links to review', async () => {
    const provider = new DevelopmentModerationProvider();
    const result = await provider.moderate({ text: 'Open this', links: ['https://xn--fake.example'], media: [] });
    expect(result.decision).toBe('review');
    expect(result.categories).toContain('suspicious_link');
  });
});
