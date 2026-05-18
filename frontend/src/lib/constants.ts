// Filepath: frontend/src/lib/constants.ts

export const BOX_ART_DIMENSIONS = {
  THUMBNAIL: { width: 285, height: 380 },
  PREVIEW: { width: 285, height: 380 }
} as const;

export const PLACEHOLDER_URLS = {
  GAME_BOX_ART: (width: number, height: number) => `/api/placeholder/${width}/${height}`,
} as const;
