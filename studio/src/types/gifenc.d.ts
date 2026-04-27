declare module "gifenc" {
  export interface GIFEncoderInstance {
    writeFrame(
      data: Uint8Array | number[],
      width: number,
      height: number,
      options?: {
        palette?: number[][];
        delay?: number;
        repeat?: number;
        transparent?: boolean;
        transparentIndex?: number;
        colorDepth?: number;
        dispose?: number;
      }
    ): void;
    finish(): void;
    bytes(): Uint8Array;
    bytesView(): Uint8Array;
    reset(): void;
  }

  export function GIFEncoder(capacity?: number): GIFEncoderInstance;

  export function quantize(
    rgba: Uint8ClampedArray | Uint8Array,
    maxColors: number,
    options?: { format?: string; oneBitAlpha?: boolean }
  ): number[][];

  export function applyPalette(
    rgba: Uint8ClampedArray | Uint8Array,
    palette: number[][],
    format?: string
  ): Uint8Array;

  export function nearestColorIndex(
    palette: number[][],
    r: number,
    g: number,
    b: number,
    a?: number
  ): number;
}
