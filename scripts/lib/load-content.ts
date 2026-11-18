/**
 * Shared content loading used by Node-side tooling (`npm run validate`, the dev
 * determinism harness). The browser imports the same JSON through Vite, so a
 * file that passes `npm run validate` cannot fail at boot for a schema reason.
 */

import { parseContent, indexContent, type LoadedContent } from '@core/content';
import type { TileMapDef } from '@core/nav';

export interface MapJson {
  id: string;
  name: string;
  note?: string;
  tileSize: number;
  width: number;
  height: number;
  rows: string[];
  legend: Record<string, string>;
}

/** Convert a row-string map into the numeric `TileMapDef` the core consumes. */
export function mapJsonToDef(json: MapJson): TileMapDef {
  if (json.rows.length !== json.height) {
    throw new Error(`${json.id}: height is ${json.height} but there are ${json.rows.length} rows`);
  }
  const tiles: number[] = [];
  for (let y = 0; y < json.rows.length; y++) {
    const row = json.rows[y]!;
    if (row.length !== json.width) {
      throw new Error(`${json.id}: row ${y} is ${row.length} wide, expected ${json.width}`);
    }
    for (let x = 0; x < row.length; x++) {
      const ch = row[x]!;
      const kind = json.legend[ch];
      if (kind === undefined) {
        throw new Error(`${json.id}: row ${y} col ${x} uses '${ch}', not in the legend`);
      }
      tiles.push(kind === 'wall' ? 1 : 0);
    }
  }
  return { width: json.width, height: json.height, tileSize: json.tileSize, tiles };
}

export function loadBundle(raw: unknown, file: string, version: string): LoadedContent {
  return indexContent(parseContent(raw, file), version);
}
