"""Build the checked-in SVG map from a pinned admdongkor GeoJSON download.

Requires Python and Shapely 2.1+. The application needs neither at runtime.
Usage: python scripts/build_gyeonggi_map.py <source.geojson>
"""

import hashlib
import json
import math
import sys
from pathlib import Path

import shapely
from shapely.geometry import shape
from shapely.ops import unary_union


SOURCE_COMMIT = "3bc00489b76696db864bdbea4b19985cdfa8b403"
SOURCE_SHA256 = "843ece3a0b3429742cd4a1b699cc13987a88b5e5401f382e7fdaaa194ea5e605"
CITY_IDS = {
    "수원시": "41110", "성남시": "41130", "의정부시": "41150",
    "안양시": "41170", "부천시": "41190", "광명시": "41210",
    "평택시": "41220", "동두천시": "41250", "안산시": "41270",
    "고양시": "41280", "과천시": "41290", "구리시": "41310",
    "남양주시": "41360", "오산시": "41370", "시흥시": "41390",
    "군포시": "41410", "의왕시": "41430", "하남시": "41450",
    "용인시": "41460", "파주시": "41480", "이천시": "41500",
    "안성시": "41550", "김포시": "41570", "화성시": "41590",
    "광주시": "41610", "양주시": "41630", "포천시": "41650",
    "여주시": "41670", "연천군": "41800", "가평군": "41820",
    "양평군": "41830",
}


def build(source_path):
    raw = source_path.read_bytes()
    if hashlib.sha256(raw).hexdigest() != SOURCE_SHA256:
        raise ValueError("Source does not match the reviewed, pinned GeoJSON.")
    source = json.loads(raw.decode("utf-8-sig"))
    groups = {name: [] for name in CITY_IDS}
    seoul = []
    for feature in source["features"]:
        properties = feature["properties"]
        if properties["sidonm"] == "서울특별시":
            seoul.append(shape(feature["geometry"]))
        if properties["sidonm"] != "경기도":
            continue
        name = next(
            (name for name in CITY_IDS if properties["sggnm"].startswith(name)),
            None,
        )
        if name is None:
            raise ValueError(f"Unmapped municipality: {properties['sggnm']}")
        if not properties["adm_cd2"].startswith(CITY_IDS[name][:4]):
            raise ValueError(f"Unexpected administrative code for {name}")
        groups[name].append(shape(feature["geometry"]))
    if any(not parts for parts in groups.values()):
        raise ValueError("A municipality is missing from the source.")

    names = list(CITY_IDS)
    geometries = [unary_union(groups[name]) for name in names]
    if not all(geometry.is_valid for geometry in geometries):
        raise ValueError("Invalid municipality geometry.")
    # Simplify shared boundaries together, so adjacent cities retain matching edges.
    if not shapely.coverage_is_valid(geometries):
        raise ValueError("Municipality geometries do not form a valid coverage.")
    geometries = list(shapely.coverage_simplify(geometries, 0.0015))
    west, south, east, north = unary_union(geometries).bounds
    longitude_scale = math.cos(math.radians(37.5))
    width, height, padding = 800, 720, 36
    scale = min(
        (width - padding * 2) / ((east - west) * longitude_scale),
        (height - padding * 2) / (north - south),
    )
    offset_x = (width - (east - west) * longitude_scale * scale) / 2
    offset_y = (height - (north - south) * scale) / 2

    def project(x, y):
        return [
            round(offset_x + (x - west) * longitude_scale * scale, 2),
            round(offset_y + (north - y) * scale, 2),
        ]

    def svg_path(geometry):
        polygons = [geometry] if geometry.geom_type == "Polygon" else geometry.geoms
        paths = []
        for polygon in polygons:
            for ring in [polygon.exterior, *polygon.interiors]:
                points = [project(x, y) for x, y in ring.coords]
                paths.append("M" + "L".join(f"{x},{y}" for x, y in points) + "Z")
        return "".join(paths)

    cities = []
    for name, geometry in zip(names, geometries):
        # Labels stay on the largest land mass rather than on detached islands.
        land = (
            geometry if geometry.geom_type == "Polygon"
            else max(geometry.geoms, key=lambda polygon: polygon.area)
        )
        point = land.representative_point()
        cities.append({
            "id": CITY_IDS[name],
            "name": name,
            "shortName": name[:-1],
            "path": svg_path(geometry),
            "label": project(point.x, point.y),
        })
    seoul_geometry = unary_union(seoul).simplify(0.0015, preserve_topology=True)
    seoul_point = seoul_geometry.representative_point()
    result = {
        "viewBox": f"0 0 {width} {height}",
        "projection": {
            "west": west, "north": north,
            "longitudeScale": longitude_scale, "scale": scale,
            "offsetX": offset_x, "offsetY": offset_y,
        },
        "source": {
            "date": "2026-10-01",
            "url": f"https://github.com/vuski/admdongkor/tree/{SOURCE_COMMIT}/ver20261001",
            "sha256": SOURCE_SHA256,
            "upstream": "https://sgis.kostat.go.kr",
            "license": "CC BY 4.0",
            "licenseUrl": "https://creativecommons.org/licenses/by/4.0/",
            "processing": "EPSG:4326; municipality dissolve; shared-edge simplification; equirectangular projection at 37.5 N",
        },
        "context": {"name": "서울", "path": svg_path(seoul_geometry), "label": project(seoul_point.x, seoul_point.y)},
        "cities": cities,
    }
    destination = Path(__file__).resolve().parents[1] / "data" / "gyeonggi-map.json"
    destination.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Generated {len(cities)} municipalities: {destination.name} ({destination.stat().st_size:,} bytes)")


if __name__ == "__main__":
    build(Path(sys.argv[1]))
