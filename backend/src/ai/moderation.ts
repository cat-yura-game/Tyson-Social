export type ModerationDecision = 'allow' | 'review' | 'block';

export interface ModerationInput {
  text: string;
  links: string[];
  media: Array<{ mimeType: string; objectKey: string; base64Data?: string }>;
}

export interface ModerationResult {
  decision: ModerationDecision;
  riskScore: number;
  categories: string[];
  reason: string;
  provider: string;
  modelVersion: string;
}

export interface ModerationProvider {
  moderate(input: ModerationInput): Promise<ModerationResult>;
}

const suspiciousLink = /(xn--|bit\.ly|tinyurl\.com|t\.me\/\+|login[-_.].*\.(zip|mov))/i;
const repeatedPhrase = /(.{12,})\1{2,}/i;

export class DevelopmentModerationProvider implements ModerationProvider {
  async moderate(input: ModerationInput): Promise<ModerationResult> {
    const categories: string[] = [];
    let riskScore = 0;

    if (input.links.some((link) => suspiciousLink.test(link))) {
      categories.push('suspicious_link');
      riskScore += 0.65;
    }
    if (repeatedPhrase.test(input.text)) {
      categories.push('repeated_content');
      riskScore += 0.3;
    }
    if (input.links.length > 5) {
      categories.push('link_spam');
      riskScore += 0.4;
    }

    riskScore = Math.min(1, riskScore);
    const decision: ModerationDecision = riskScore >= 0.85 ? 'block' : riskScore >= 0.45 ? 'review' : 'allow';

    return {
      decision,
      riskScore,
      categories,
      reason: categories.length === 0 ? 'No development rules matched.' : 'Development safety rules matched.',
      provider: 'tyson-rules',
      modelVersion: 'dev-v1',
    };
  }
}
