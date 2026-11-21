import data from '@/data/places.json';
import labelData from '@/data/place-labels.json';
import { projectRoute } from '@/lib/domain/coordinates';
import {
  inferHeuristicLabels,
  type PlaceLabel,
  type PlaceLabelMap,
} from '@/lib/domain/place-labels';

export type PlaceCoordinates = {
  lat: number;
  lng: number;
  x: number;
  y: number;
};

export const placeCoordinates: Record<string, { lat: number; lng: number }> = {
  PLACE_REAL_001: { lat: 37.3914, lng: 126.7808 },
  PLACE_REAL_002: { lat: 37.3458, lng: 126.6932 },
  PLACE_REAL_003: { lat: 37.3502, lng: 126.6974 },
  PLACE_REAL_004: { lat: 37.4002, lng: 126.8052 },
  PLACE_REAL_005: { lat: 37.4024, lng: 126.8081 },
  PLACE_REAL_006: { lat: 37.3243, lng: 126.6805 },
  PLACE_REAL_007: { lat: 37.3688, lng: 126.7124 },
  PLACE_REAL_008: { lat: 37.4412, lng: 126.7968 },
  PLACE_REAL_009: { lat: 37.3818, lng: 126.8365 },
  PLACE_REAL_010: { lat: 37.3925, lng: 126.8142 },
  PLACE_REAL_011: { lat: 37.4504, lng: 126.7872 },
  PLACE_REAL_012: { lat: 37.3884, lng: 126.7392 },
  PLACE_REAL_013: { lat: 37.3212, lng: 126.6758 },
  PLACE_REAL_014: { lat: 37.3532, lng: 126.7182 },
  PLACE_REAL_015: { lat: 37.3448, lng: 126.7374 },
  PLACE_REAL_016: { lat: 37.3452, lng: 126.6871 },
  PLACE_REAL_017: { lat: 37.3418, lng: 126.6852 },
  PLACE_REAL_018: { lat: 37.3388, lng: 126.6889 },
  PLACE_REAL_019: { lat: 37.3648, lng: 126.7262 },
  PLACE_REAL_020: { lat: 37.3264, lng: 126.6742 },
};

const labelsById = labelData as PlaceLabelMap;

export const places = data.map((p) => {
  const base =
    'coordinates' in p && p.coordinates
      ? p.coordinates
      : placeCoordinates[p.id];
  const labels: PlaceLabel = labelsById[p.id] ?? inferHeuristicLabels(p);
  return {
    ...p,
    labels,
    coordinates: {
      ...base,
      ...projectRoute(base.lat, base.lng),
    },
  };
});
export type Place = (typeof places)[number];
export const placeIds = new Set(places.map((p) => p.id));
