import { ChartEntry } from './types';

export interface MetadataCache {
  byTrackId: Map<string, ChartEntry>;
  byIsrc: Map<string, ChartEntry>;
  get: (trackId: string, isrc?: string) => ChartEntry | undefined;
  size: number;
}

/**
 * Builds an in-memory cache of previously seen tracks from historical CSV records.
 * Primary key: track_id. Secondary key: isrc.
 */
export function buildCache(existingRows: ChartEntry[]): MetadataCache {
  const byTrackId = new Map<string, ChartEntry>();
  const byIsrc = new Map<string, ChartEntry>();

  for (const row of existingRows) {
    if (row.track_id && !byTrackId.has(row.track_id)) {
      byTrackId.set(row.track_id, row);
    }
    if (row.isrc && !byIsrc.has(row.isrc)) {
      byIsrc.set(row.isrc, row);
    }
  }

  const get = (trackId: string, isrc?: string): ChartEntry | undefined => {
    if (trackId && byTrackId.has(trackId)) {
      return byTrackId.get(trackId);
    }
    if (isrc && byIsrc.has(isrc)) {
      return byIsrc.get(isrc);
    }
    return undefined;
  };

  return {
    byTrackId,
    byIsrc,
    get,
    get size() {
      return byTrackId.size;
    },
  };
}

