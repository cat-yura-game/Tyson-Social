export interface SummaryResult {
  summary: string;
  provider: string;
  modelVersion: string;
}

export interface SummaryProvider {
  summarize(text: string, locale: string): Promise<SummaryResult>;
}

export class DevelopmentSummaryProvider implements SummaryProvider {
  async summarize(text: string): Promise<SummaryResult> {
    const normalized = text.replace(/\s+/g, ' ').trim();
    const summary = normalized.length <= 320 ? normalized : `${normalized.slice(0, 317)}…`;
    return { summary, provider: 'tyson-dev', modelVersion: 'dev-v1' };
  }
}
