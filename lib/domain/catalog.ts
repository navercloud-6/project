import data from '@/data/places.json';

export type PlaceCoordinates = {
  lat: number;
  lng: number;
  x: number;
  y: number;
};

export const placeCoordinates: Record<string, PlaceCoordinates> = {
  PLACE_REAL_001: { lat: 37.3914, lng: 126.7808, x: 455, y: 235 },
  PLACE_REAL_002: { lat: 37.3458, lng: 126.6932, x: 192, y: 368 },
  PLACE_REAL_003: { lat: 37.3502, lng: 126.6974, x: 224, y: 342 },
  PLACE_REAL_004: { lat: 37.4002, lng: 126.8052, x: 545, y: 198 },
  PLACE_REAL_005: { lat: 37.4024, lng: 126.8081, x: 585, y: 175 },
  PLACE_REAL_006: { lat: 37.3243, lng: 126.6805, x: 162, y: 452 },
  PLACE_REAL_007: { lat: 37.3688, lng: 126.7124, x: 262, y: 278 },
  PLACE_REAL_008: { lat: 37.4412, lng: 126.7968, x: 525, y: 112 },
  PLACE_REAL_009: { lat: 37.3818, lng: 126.8365, x: 685, y: 272 },
  PLACE_REAL_010: { lat: 37.3925, lng: 126.8142, x: 602, y: 232 },
  PLACE_REAL_011: { lat: 37.4504, lng: 126.7872, x: 478, y: 68 },
  PLACE_REAL_012: { lat: 37.3884, lng: 126.7392, x: 342, y: 196 },
  PLACE_REAL_013: { lat: 37.3212, lng: 126.6758, x: 118, y: 468 },
  PLACE_REAL_014: { lat: 37.3532, lng: 126.7182, x: 292, y: 332 },
  PLACE_REAL_015: { lat: 37.3448, lng: 126.7374, x: 356, y: 365 },
  PLACE_REAL_016: { lat: 37.3452, lng: 126.6871, x: 140, y: 356 },
  PLACE_REAL_017: { lat: 37.3418, lng: 126.6852, x: 112, y: 386 },
  PLACE_REAL_018: { lat: 37.3388, lng: 126.6889, x: 156, y: 404 },
  PLACE_REAL_019: { lat: 37.3648, lng: 126.7262, x: 308, y: 290 },
  PLACE_REAL_020: { lat: 37.3264, lng: 126.6742, x: 122, y: 432 },
};

export const places = data.map((p) => ({
  ...p,
  coordinates: placeCoordinates[p.id] ?? {
    lat: 37.38,
    lng: 126.78,
    x: 400,
    y: 260,
  },
}));
export type Place = (typeof places)[number];
export const placeIds = new Set(places.map((p) => p.id));
