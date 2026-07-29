import { readFileSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import sharp from "sharp";

/**
 * Converts the scene's source art to WebP at the sizes the page actually renders it.
 *
 * The originals are 2048px PNGs of several megabytes each. Shipping those would make the
 * first paint of a page whose whole point is atmosphere depend on a 8MB download, so each
 * one is resized to the largest size it is ever displayed at and encoded as WebP.
 *
 * Run after replacing anything in public/scene/source. Output is committed.
 */
const SCENE_DIR = resolve(import.meta.dirname, "../public/scene");

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
): Promise<void> {
  // The generator stamps a small watermark in the extreme bottom-right, outside the
  // subject. Cropped before keying, or its dark glyphs survive as opaque specks that the
  // trim then dutifully keeps.
  const sourceMeta = await sharp(sourcePath).metadata();
  const { data, info } = await sharp(sourcePath)
    .extract({
      left: 0,
      top: 0,
      width: Math.floor((sourceMeta.width ?? 0) * 0.985),
      height: Math.floor((sourceMeta.height ?? 0) * 0.975),
    })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;

  /**
   * Checkerboard squares are neutral (r=g=b within a hair) and bright. The floor sits low
   * enough to also catch squares dimmed by the source's own baked drop shadow; the wood,
   * silk and robes are all strongly non-neutral, so neutrality is what protects them.
   * Unit: 0-255.
   */
  const KEY_BRIGHTNESS_FLOOR = 118;
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

// The shadow is already a small vector; it just gets copied under a consistent name.
writeFileSync(resolve(SCENE_DIR, "shadow.svg"), readFileSync(resolve(SCENE_DIR, "shadow.svg")));
