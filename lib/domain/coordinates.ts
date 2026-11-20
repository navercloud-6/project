import mapData from '@/data/gyeonggi-map.json';

/** The same equirectangular projection used by build_gyeonggi_map.py. */
export function projectGyeonggi(lat: number, lng: number) {
  const projection = mapData.projection;
  return {
    x:
      projection.offsetX +
      (lng - projection.west) * projection.longitudeScale * projection.scale,
    y: projection.offsetY + (projection.north - lat) * projection.scale,
  };
}

/** Fit the 800×720 province map into the existing 800×520 route canvas. */
export function projectRoute(lat: number, lng: number) {
  const point = projectGyeonggi(lat, lng);
  return { x: 400 + ((point.x - 400) * 2) / 3, y: 20 + (point.y * 2) / 3 };
}
