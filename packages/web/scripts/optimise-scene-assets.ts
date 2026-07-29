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
