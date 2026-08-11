import { z } from 'zod';
import { FEED_TOPIC_IDS } from '../recommendations/topics';

export const feedPreferencesSchema = z.object({
  topics: z.array(z.enum(FEED_TOPIC_IDS)).max(6),
}).strict().transform((value) => ({ topics: [...new Set(value.topics)] }));
