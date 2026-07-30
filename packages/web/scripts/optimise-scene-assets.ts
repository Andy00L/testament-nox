import { readFileSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import sharp from "sharp";

/**
 * Converts the source art to WebP at the sizes the page actually renders it.
 *
 * The originals are PNGs of several megabytes each. Shipping those would make the first
 * paint of a page whose whole point is atmosphere depend on an 8MB download, so each one is
 * resized to the largest size it is ever displayed at and encoded as WebP.
 *
 * Two families live here. public/scene holds the environment (the mat, the roof, the
 * handscroll, the transmission painting). public/frames holds the carved frames the
 * interface mounts controls and figures inside: the same source problem, the same keying,
 * so they share this pass rather than growing a second script.
 *
 * Run after replacing anything in public/scene or public/frames. Output is committed.
 */
const SCENE_DIR = resolve(import.meta.dirname, "../public/scene");
const FRAMES_DIR = resolve(import.meta.dirname, "../public/frames");

const CONVERSIONS = [
  // The tatami field tiles across the viewport behind everything. 1600px is enough at 1x
  // and the weave is fine enough that upscaling is invisible.
  { source: "bg.png", output: "tatami.webp", width: 1600, quality: 78 },
  // The roof is drawn large and bleeds off the top edge. Trimmed first: the source is a
  // 2048px square that is mostly transparent margin, and that margin would otherwise
  // dictate the element box.
  { source: "roof-china.png", output: "roof.webp", width: 1400, quality: 82, trim: true },
] as const;

/**
 * The transmission illustration arrives with its "transparent" checkerboard baked into the
 * pixels. Keying by colour alone would also erase the white cranes on the elder's robe, so
 * the background is removed by flood fill instead: starting from the borders, expand only
 * through near-neutral bright pixels. Anything light that is enclosed by the figures is
 * unreachable from the border and survives.
 */
async function keyOutCheckerboard(
  sourcePath: string,
  outputPath: string,
  targetWidth: number,
  options: {
    keptFraction?: { width: number; height: number };
    brightnessFloor?: number;
  } = {},
): Promise<void> {
  const keptFraction = options.keptFraction ?? { width: 0.985, height: 0.975 };
  // The generator stamps a small watermark in the extreme bottom-right, outside the
  // subject. Cropped before keying, or its dark glyphs survive as opaque specks that the
  // trim then dutifully keeps. The frame assets carry a pale star instead of dark glyphs,
  // and a pale neutral mark is itself key colour, so those pass 1.0 and let the fill take it.
  const sourceMeta = await sharp(sourcePath).metadata();
  const { data, info } = await sharp(sourcePath)
    .extract({
      left: 0,
      top: 0,
      width: Math.floor((sourceMeta.width ?? 0) * keptFraction.width),
      height: Math.floor((sourceMeta.height ?? 0) * keptFraction.height),
    })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;

  /**
   * Checkerboard squares are neutral (r=g=b within a hair) and bright. The floor sits low
   * enough to also catch squares dimmed by the source's own baked drop shadow; the wood,
   * silk and robes are all strongly non-neutral, so neutrality is what protects them.
   * Two checkerboards exist across these sources, measured on the raw pixels: the scene art
   * renders it at 172-255, the frame art at 80-95, hence the per-asset floor.
   * Unit: 0-255.
   */
  const KEY_BRIGHTNESS_FLOOR = options.brightnessFloor ?? 118;
  const KEY_NEUTRALITY = 9;

  const isKeyColour = (offset: number): boolean => {
    const red = data[offset] ?? 0;
    const green = data[offset + 1] ?? 0;
    const blue = data[offset + 2] ?? 0;
    return (
      Math.min(red, green, blue) >= KEY_BRIGHTNESS_FLOOR &&
      Math.abs(red - green) <= KEY_NEUTRALITY &&
      Math.abs(green - blue) <= KEY_NEUTRALITY &&
      Math.abs(red - blue) <= KEY_NEUTRALITY
    );
  };

  const visited = new Uint8Array(width * height);
  const queue: number[] = [];
  const enqueue = (x: number, y: number) => {
    const pixel = y * width + x;
    if (visited[pixel] === 1) return;
    if (!isKeyColour(pixel * channels)) return;
    visited[pixel] = 1;
    queue.push(pixel);
  };

  for (let x = 0; x < width; x += 1) {
    enqueue(x, 0);
    enqueue(x, height - 1);
  }
  for (let y = 0; y < height; y += 1) {
    enqueue(0, y);
    enqueue(width - 1, y);
  }

  while (queue.length > 0) {
    const pixel = queue.pop() as number;
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    data[pixel * channels + 3] = 0;
    if (x > 0) enqueue(x - 1, y);
    if (x < width - 1) enqueue(x + 1, y);
    if (y > 0) enqueue(x, y - 1);
    if (y < height - 1) enqueue(x, y + 1);
  }

  /**
   * Sealed pockets. A checkerboard enclosed by a slot, a handle ring or a fan rib is
   * unreachable from the border, and those pockets are exactly the windows the interface
   * mounts its controls inside, so they have to become real holes. Size cannot separate a
   * pocket from flat artwork: the fan's paper panel is key colour too, and larger than a
   * slot. The checkerboard alternates two tones while a painted panel is uniform, so
   * brightness spread decides. Unit: standard deviation over 0-255.
   */
  const POCKET_TEXTURE_FLOOR = 5;

  const erasePocketIfCheckered = (seedPixel: number): void => {
    const component: number[] = [seedPixel];
    const stack: number[] = [seedPixel];
    visited[seedPixel] = 1;
    let brightnessSum = 0;
    let brightnessSquaredSum = 0;

    while (stack.length > 0) {
      const pixel = stack.pop() as number;
      const brightness = data[pixel * channels] ?? 0;
      brightnessSum += brightness;
      brightnessSquaredSum += brightness * brightness;

      const x = pixel % width;
      const y = Math.floor(pixel / width);
      const neighbours = [
        x > 0 ? pixel - 1 : -1,
        x < width - 1 ? pixel + 1 : -1,
        y > 0 ? pixel - width : -1,
        y < height - 1 ? pixel + width : -1,
      ];
      for (const neighbour of neighbours) {
        if (neighbour < 0 || visited[neighbour] === 1) {
          continue;
        }
        if (!isKeyColour(neighbour * channels)) {
          continue;
        }
        visited[neighbour] = 1;
        component.push(neighbour);
        stack.push(neighbour);
      }
    }

    const mean = brightnessSum / component.length;
    const variance = brightnessSquaredSum / component.length - mean * mean;
    if (Math.sqrt(Math.max(0, variance)) < POCKET_TEXTURE_FLOOR) {
      return;
    }
    for (const pixel of component) {
      data[pixel * channels + 3] = 0;
    }
  };

  for (let pixel = 0; pixel < width * height; pixel += 1) {
    if (visited[pixel] === 1 || !isKeyColour(pixel * channels)) {
      continue;
    }
    erasePocketIfCheckered(pixel);
  }

  await sharp(data, { raw: { width, height, channels: 4 } })
    .trim()
    .resize({ width: targetWidth, withoutEnlargement: true })
    .webp({ quality: 82, effort: 6 })
    .toFile(outputPath);
  console.log(`[optimiseSceneAssets] checkerboard keyed out -> ${outputPath}`);
}

await keyOutCheckerboard(
  resolve(SCENE_DIR, "transmission-source.png"),
  resolve(SCENE_DIR, "transmission.webp"),
  1100,
);

// The write sheet's handscroll. Rendered via CSS border-image 9-slice, so it is kept
// wide enough to stay sharp at 2x on the widest panel the layout allows.
await keyOutCheckerboard(
  resolve(SCENE_DIR, "scroll-source.png"),
  resolve(SCENE_DIR, "scroll.webp"),
  1800,
);

for (const conversion of CONVERSIONS) {
  const sourcePath = resolve(SCENE_DIR, conversion.source);
  const outputPath = resolve(SCENE_DIR, conversion.output);

  const pipeline = sharp(sourcePath);
  if ("trim" in conversion && conversion.trim) {
    pipeline.trim();
  }
  await pipeline
    .resize({ width: conversion.width, withoutEnlargement: true })
    .webp({ quality: conversion.quality, effort: 6 })
    .toFile(outputPath);

  const before = statSync(sourcePath).size;
  const after = statSync(outputPath).size;
  console.log(
    `[optimiseSceneAssets] ${conversion.source} -> ${conversion.output}  ` +
      `${Math.round(before / 1024)}KB to ${Math.round(after / 1024)}KB`,
  );
}

/**
 * The carved frames. Each one arrives as a 2880px render with the checkerboard baked in and
 * a pale star in the corner, so they go through the same keying as the scene art. The widths
 * are twice the largest CSS width each frame is ever laid out at, so they stay sharp at 2x
 * without paying for pixels no screen resolves.
 */
const FRAME_CONVERSIONS = [
  // The two-slot plaque that carries the page's actions. Widest at the write panel.
  { source: "legacy-box-source.png", output: "legacy-box.webp", width: 1240, brightnessFloor: 0 },
  // One envelope per heir on the door. Narrower, and there can be eight of them.
  {
    source: "heir-envelope-source.png",
    output: "heir-envelope.webp",
    width: 1120,
    brightnessFloor: 0,
  },
  // The countdown mounts: the zodiac dial while you are alive, the fan once the door opens.
  {
    source: "hourglass-frame-source.png",
    output: "hourglass-frame.webp",
    width: 1000,
    brightnessFloor: 118,
  },
  { source: "fan-frame-source.png", output: "fan-frame.webp", width: 1060, brightnessFloor: 118 },
] as const;

for (const frame of FRAME_CONVERSIONS) {
  const sourcePath = resolve(FRAMES_DIR, frame.source);
  const outputPath = resolve(FRAMES_DIR, frame.output);
  await keyOutCheckerboard(sourcePath, outputPath, frame.width, {
    keptFraction: { width: 1, height: 1 },
    brightnessFloor: frame.brightnessFloor,
  });

  const before = statSync(sourcePath).size;
  const after = statSync(outputPath).size;
  console.log(
    `[optimiseSceneAssets] ${frame.source} -> ${frame.output}  ` +
      `${Math.round(before / 1024)}KB to ${Math.round(after / 1024)}KB`,
  );
}

// The shadow is already a small vector; it just gets copied under a consistent name.
writeFileSync(resolve(SCENE_DIR, "shadow.svg"), readFileSync(resolve(SCENE_DIR, "shadow.svg")));
