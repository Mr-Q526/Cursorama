export interface FrameGeometry { width: number; height: number; }

export function frameGeometry(outputWidth: number, outputHeight: number, sourceWidth: number, sourceHeight: number, padding: number): FrameGeometry {
  const inset = padding / 100;
  const width = Math.min(outputWidth * (1 - 2 * inset), outputHeight * (1 - 2 * inset) * sourceWidth / sourceHeight);
  return { width, height: width * sourceHeight / sourceWidth };
}
