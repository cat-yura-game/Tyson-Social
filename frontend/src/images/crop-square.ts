const MAX_AVATAR_SIDE = 1024;

export interface SquareCrop {
  sourceX: number;
  sourceY: number;
  sourceSize: number;
  outputSize: number;
}

export function calculateSquareCrop(width: number, height: number): SquareCrop {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error('Invalid image dimensions.');
  }
  const sourceSize = Math.min(width, height);
  return {
    sourceX: (width - sourceSize) / 2,
    sourceY: (height - sourceSize) / 2,
    sourceSize,
    outputSize: Math.min(sourceSize, MAX_AVATAR_SIDE),
  };
}

export async function cropAvatarToSquare(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  try {
    const crop = calculateSquareCrop(bitmap.width, bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = crop.outputSize;
    canvas.height = crop.outputSize;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Image processing is unavailable.');

    context.drawImage(
      bitmap,
      crop.sourceX,
      crop.sourceY,
      crop.sourceSize,
      crop.sourceSize,
      0,
      0,
      crop.outputSize,
      crop.outputSize,
    );

    const outputType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (result) => result ? resolve(result) : reject(new Error('Image encoding failed.')),
        outputType,
        outputType === 'image/jpeg' ? 0.9 : undefined,
      );
    });
    return new File([blob], `avatar.${outputType === 'image/png' ? 'png' : 'jpg'}`, { type: outputType });
  } finally {
    bitmap.close();
  }
}
