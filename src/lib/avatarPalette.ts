export type AvatarPalette = {
  primary: string;
  secondary: string;
};

export type AvatarAccentPair = {
  a: string;
  b: string;
  edgeA: string;
  edgeB: string;
};

const HEX_COLOR_RE = /^#[0-9a-f]{6}$/i;
const HUE_BIN_DEGREES = 10;
const HUE_BIN_COUNT = 360 / HUE_BIN_DEGREES;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const toHexByte = (value: number) => Math.round(clamp(value, 0, 255)).toString(16).padStart(2, "0");

const rgbToHex = (rgb: { r: number; g: number; b: number }) =>
  `#${toHexByte(rgb.r)}${toHexByte(rgb.g)}${toHexByte(rgb.b)}`;

const hexToRgb = (hex: string) => {
  if (!HEX_COLOR_RE.test(hex)) return null;
  return {
    r: Number.parseInt(hex.slice(1, 3), 16),
    g: Number.parseInt(hex.slice(3, 5), 16),
    b: Number.parseInt(hex.slice(5, 7), 16),
  };
};

const rgba = (rgb: { r: number; g: number; b: number }, alpha: number) =>
  `rgba(${Math.round(rgb.r)}, ${Math.round(rgb.g)}, ${Math.round(rgb.b)}, ${alpha.toFixed(2)})`;

const hashStringToInt = (value: string) => {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const hueDistance = (a: number, b: number) => {
  const diff = Math.abs(a - b) % 360;
  return Math.min(diff, 360 - diff);
};

const hslToRgb = (h: number, s: number, l: number) => {
  const hue = ((h % 360) + 360) % 360;
  const sat = clamp(s, 0, 1);
  const light = clamp(l, 0, 1);

  if (sat <= 1e-9) {
    const gray = Math.round(light * 255);
    return { r: gray, g: gray, b: gray };
  }

  const c = (1 - Math.abs(2 * light - 1)) * sat;
  const hh = hue / 60;
  const x = c * (1 - Math.abs((hh % 2) - 1));
  let r1 = 0;
  let g1 = 0;
  let b1 = 0;

  if (hh >= 0 && hh < 1) {
    r1 = c;
    g1 = x;
  } else if (hh >= 1 && hh < 2) {
    r1 = x;
    g1 = c;
  } else if (hh >= 2 && hh < 3) {
    g1 = c;
    b1 = x;
  } else if (hh >= 3 && hh < 4) {
    g1 = x;
    b1 = c;
  } else if (hh >= 4 && hh < 5) {
    r1 = x;
    b1 = c;
  } else {
    r1 = c;
    b1 = x;
  }

  const m = light - c / 2;
  return {
    r: (r1 + m) * 255,
    g: (g1 + m) * 255,
    b: (b1 + m) * 255,
  };
};

const rgbToHsl = (r: number, g: number, b: number) => {
  const rn = clamp(r / 255, 0, 1);
  const gn = clamp(g / 255, 0, 1);
  const bn = clamp(b / 255, 0, 1);
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;

  let h = 0;
  if (delta > 1e-9) {
    if (max === rn) h = ((gn - bn) / delta) % 6;
    else if (max === gn) h = (bn - rn) / delta + 2;
    else h = (rn - gn) / delta + 4;
    h *= 60;
    if (h < 0) h += 360;
  }

  const l = (max + min) / 2;
  const s = delta <= 1e-9 ? 0 : delta / (1 - Math.abs(2 * l - 1));
  return { h, s, l };
};

const parseHueBin = (binIndex: number) => binIndex * HUE_BIN_DEGREES + HUE_BIN_DEGREES / 2;

const pickSecondaryHueBin = (bins: number[], primaryBin: number) => {
  let bestBin = -1;
  let bestWeight = -1;
  for (let i = 0; i < bins.length; i += 1) {
    const weight = bins[i];
    if (weight <= 0) continue;
    const distance = Math.abs(i - primaryBin);
    const ringDistance = Math.min(distance, bins.length - distance);
    if (ringDistance < 3) continue;
    if (weight > bestWeight) {
      bestWeight = weight;
      bestBin = i;
    }
  }
  return bestBin;
};

const readImagePixels = async (src: string, size = 40): Promise<Uint8ClampedArray | null> => {
  if (typeof window === "undefined") return null;

  return await new Promise<Uint8ClampedArray | null>((resolve) => {
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.referrerPolicy = "no-referrer";

    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.drawImage(img, 0, 0, size, size);
        const imageData = ctx.getImageData(0, 0, size, size);
        resolve(imageData.data);
      } catch {
        resolve(null);
      }
    };

    img.onerror = () => resolve(null);
    img.src = src;
  });
};

const buildPaletteFromPixels = (pixels: Uint8ClampedArray, fallbackSeed: string): AvatarPalette => {
  const hueBins = new Array<number>(HUE_BIN_COUNT).fill(0);
  let totalWeight = 0;
  let weightedR = 0;
  let weightedG = 0;
  let weightedB = 0;
  let weightedS = 0;
  let weightedL = 0;

  for (let i = 0; i < pixels.length; i += 4) {
    const alpha = (pixels[i + 3] ?? 0) / 255;
    if (alpha < 0.08) continue;

    const r = pixels[i] ?? 0;
    const g = pixels[i + 1] ?? 0;
    const b = pixels[i + 2] ?? 0;
    const hsl = rgbToHsl(r, g, b);

    const chromaWeight = 0.25 + hsl.s * 0.75;
    const weight = alpha * chromaWeight;
    if (weight <= 0) continue;

    totalWeight += weight;
    weightedR += r * weight;
    weightedG += g * weight;
    weightedB += b * weight;
    weightedS += hsl.s * weight;
    weightedL += hsl.l * weight;

    if (hsl.s > 0.06) {
      const bin = Math.floor(hsl.h / HUE_BIN_DEGREES) % HUE_BIN_COUNT;
      hueBins[bin] += hsl.s * alpha;
    }
  }

  if (totalWeight <= 1e-6) {
    return buildAvatarPaletteFromSeed(fallbackSeed);
  }

  const avgRgb = {
    r: weightedR / totalWeight,
    g: weightedG / totalWeight,
    b: weightedB / totalWeight,
  };
  const avgHsl = rgbToHsl(avgRgb.r, avgRgb.g, avgRgb.b);

  let primaryBin = hueBins.findIndex((weight) => weight === Math.max(...hueBins));
  if (primaryBin < 0) {
    primaryBin = Math.floor(avgHsl.h / HUE_BIN_DEGREES) % HUE_BIN_COUNT;
  }

  const primaryHue = parseHueBin(primaryBin);
  let secondaryBin = pickSecondaryHueBin(hueBins, primaryBin);
  let secondaryHue = secondaryBin >= 0 ? parseHueBin(secondaryBin) : (primaryHue + 28) % 360;
  if (hueDistance(primaryHue, secondaryHue) < 16) {
    secondaryHue = (primaryHue + 32) % 360;
  }

  const baseSaturation = clamp(weightedS / totalWeight, 0, 1);
  const baseLightness = clamp(weightedL / totalWeight, 0, 1);

  const primarySat = clamp(0.46 + baseSaturation * 0.40, 0.40, 0.86);
  const secondarySat = clamp(primarySat * 0.90, 0.35, 0.80);
  const primaryLight = clamp(0.35 + baseLightness * 0.30, 0.30, 0.64);
  const secondaryLight = clamp(primaryLight * 0.86, 0.24, 0.56);

  const primary = rgbToHex(hslToRgb(primaryHue, primarySat, primaryLight));
  const secondary = rgbToHex(hslToRgb(secondaryHue, secondarySat, secondaryLight));
  return { primary, secondary };
};

export const isAvatarPalette = (value: unknown): value is AvatarPalette => {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.primary === "string" && typeof candidate.secondary === "string";
};

export const sanitizeAvatarPalette = (value: unknown): AvatarPalette | null => {
  if (!isAvatarPalette(value)) return null;
  const primary = String(value.primary).trim();
  const secondary = String(value.secondary).trim();
  if (!HEX_COLOR_RE.test(primary) || !HEX_COLOR_RE.test(secondary)) return null;
  return {
    primary: primary.toLowerCase(),
    secondary: secondary.toLowerCase(),
  };
};

export const buildAvatarPaletteFromSeed = (seed: string): AvatarPalette => {
  const hash = hashStringToInt(seed || "user");
  const primaryHue = hash % 360;
  const secondaryHue = (primaryHue + 24 + ((hash >> 8) % 32)) % 360;
  const primarySat = (58 + ((hash >> 16) % 24)) / 100;
  const secondarySat = (52 + ((hash >> 20) % 24)) / 100;
  const primaryLight = (42 + ((hash >> 24) % 12)) / 100;
  const secondaryLight = (34 + ((hash >> 12) % 14)) / 100;

  return {
    primary: rgbToHex(hslToRgb(primaryHue, primarySat, primaryLight)),
    secondary: rgbToHex(hslToRgb(secondaryHue, secondarySat, secondaryLight)),
  };
};

export const extractAvatarPaletteFromImageSource = async (
  src: string,
  fallbackSeed: string
): Promise<AvatarPalette> => {
  const trimmed = src.trim();
  if (!trimmed) return buildAvatarPaletteFromSeed(fallbackSeed);
  const pixels = await readImagePixels(trimmed);
  if (!pixels) return buildAvatarPaletteFromSeed(fallbackSeed);
  return buildPaletteFromPixels(pixels, fallbackSeed);
};

export const extractAvatarPaletteFromFile = async (file: File, fallbackSeed: string): Promise<AvatarPalette> => {
  if (typeof window === "undefined") return buildAvatarPaletteFromSeed(fallbackSeed);
  const objectUrl = URL.createObjectURL(file);
  try {
    return await extractAvatarPaletteFromImageSource(objectUrl, fallbackSeed);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
};

export const paletteToAccentPair = (
  palette: AvatarPalette | null | undefined,
  seed: string
): AvatarAccentPair => {
  const normalized = sanitizeAvatarPalette(palette) ?? buildAvatarPaletteFromSeed(seed);
  const primary = hexToRgb(normalized.primary) ?? { r: 235, g: 74, b: 154 };
  const secondary = hexToRgb(normalized.secondary) ?? { r: 190, g: 255, b: 29 };

  return {
    a: rgba(primary, 0.20),
    b: rgba(secondary, 0.16),
    edgeA: rgba(primary, 0.75),
    edgeB: rgba(secondary, 0.65),
  };
};
