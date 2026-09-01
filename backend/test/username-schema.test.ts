import { describe, expect, it } from 'vitest';
import { usernameSchema } from '../src/schemas/username';

describe('username schema', () => {
  it.each(['tyson', 'Tyson14', 'cat_tyson', 'a1_b2'])('accepts %s', (value) => {
    expect(usernameSchema.parse(value)).toBe(value.toLowerCase());
  });

  it.each(['1tyson', '_tyson', 'tyson_', 'tyson__social', 'ty-son', 'тест'])('rejects %s', (value) => {
    expect(usernameSchema.safeParse(value).success).toBe(false);
  });
});
