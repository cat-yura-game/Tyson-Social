import { describe, expect, it } from 'vitest';
import { calculateSquareCrop } from './crop-square';

describe('square avatar crop', () => {
  it('centres a landscape image and limits output resolution', () => {
    expect(calculateSquareCrop(3000, 2000)).toEqual({
      sourceX: 500,
      sourceY: 0,
      sourceSize: 2000,
      outputSize: 1024,
    });
  });

  it('centres a portrait image without upscaling', () => {
    expect(calculateSquareCrop(600, 900)).toEqual({
      sourceX: 0,
      sourceY: 150,
      sourceSize: 600,
      outputSize: 600,
    });
  });
});
