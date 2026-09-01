import { describe, expect, it } from 'vitest';
import { reportReviewStatus } from '../src/ai/reported-post-review';

describe('reported post review safeguards', () => {
  it('removes only high-confidence violations', () => {
    expect(reportReviewStatus({ action: 'remove', confidence: 0.9 })).toBe('removed');
    expect(reportReviewStatus({ action: 'remove', confidence: 0.89 })).toBe('review');
  });

  it('keeps only confident non-violations', () => {
    expect(reportReviewStatus({ action: 'keep', confidence: 0.75 })).toBe('no_violation');
    expect(reportReviewStatus({ action: 'keep', confidence: 0.74 })).toBe('review');
  });

  it('never resolves an ambiguous AI decision automatically', () => {
    expect(reportReviewStatus({ action: 'review', confidence: 1 })).toBe('review');
  });
});
