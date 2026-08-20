export function selectCollectibleVariant(variants: readonly string[], random = Math.random): string {
  if (!variants.length) throw new Error('No collectible variants are available.');
  const index = Math.min(variants.length - 1, Math.max(0, Math.floor(random() * variants.length)));
  return variants[index]!;
}
