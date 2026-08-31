import fs from "node:fs";
import path from "node:path";
import type { FontPair } from "./types";

export type SatoriFont = {
  name: string;
  data: Buffer;
  weight: 400 | 700 | 900;
  style: "normal";
};

const cache = new Map<string, Buffer>();

function load(file: string): Buffer {
  let buf = cache.get(file);
  if (!buf) {
    buf = fs.readFileSync(path.join(process.cwd(), "assets", "fonts", file));
    cache.set(file, buf);
  }
  return buf;
}

export type FontSpec = {
  headline: { family: string; weight: 400 | 700 | 900 };
  body: { family: string; weight: 400 | 700 | 900 };
  fonts: SatoriFont[];
};

export function fontsForPair(pair: FontPair): FontSpec {
  const inter: SatoriFont[] = [
    { name: "Inter", data: load("Inter-Regular.ttf"), weight: 400, style: "normal" },
    { name: "Inter", data: load("Inter-Bold.ttf"), weight: 700, style: "normal" },
    { name: "Inter", data: load("Inter-Black.ttf"), weight: 900, style: "normal" },
  ];

  switch (pair) {
    case "serif":
      return {
        headline: { family: "Playfair Display", weight: 700 },
        body: { family: "Source Serif 4", weight: 400 },
        fonts: [
          {
            name: "Playfair Display",
            data: load("PlayfairDisplay-Bold.ttf"),
            weight: 700,
            style: "normal",
          },
          {
            name: "Source Serif 4",
            data: load("SourceSerif4-Regular.ttf"),
            weight: 400,
            style: "normal",
          },
          ...inter,
        ],
      };
    case "condensed":
      return {
        headline: { family: "Bebas Neue", weight: 400 },
        body: { family: "Inter", weight: 400 },
        fonts: [
          {
            name: "Bebas Neue",
            data: load("BebasNeue-Regular.ttf"),
            weight: 400,
            style: "normal",
          },
          ...inter,
        ],
      };
    case "mono":
      return {
        headline: { family: "Space Mono", weight: 700 },
        body: { family: "Space Mono", weight: 400 },
        fonts: [
          {
            name: "Space Mono",
            data: load("SpaceMono-Regular.ttf"),
            weight: 400,
            style: "normal",
          },
          {
            name: "Space Mono",
            data: load("SpaceMono-Bold.ttf"),
            weight: 700,
            style: "normal",
          },
          ...inter,
        ],
      };
    default:
      return {
        headline: { family: "Inter", weight: 900 },
        body: { family: "Inter", weight: 400 },
        fonts: inter,
      };
  }
}
