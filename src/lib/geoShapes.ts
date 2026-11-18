import { feature } from 'topojson-client';
import { geoArea, geoNaturalEarth1, geoPath } from 'd3-geo';
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import topology from 'world-atlas/countries-110m.json';
import centroids from './geo-centroids.json';
import { countryName, numericToAlpha2 } from './geo';

/*
 * Country boundaries: Natural Earth 1:110m via world-atlas (bundled locally — the map
 * makes no network requests). Representative points come from the 1:50m set so that
 * small states (Singapore, Hong Kong, Malta…) can still be marked and selected.
 */

export const MAP_W = 1000;

export type Box = [[number, number], [number, number]];

export interface Shape {
  key: string;
  code?: string;
  name: string;
  d: string;
  /** Bounds of the country's largest landmass, for framing. */
  bounds: Box;
}

export interface MapData {
  width: number;
  height: number;
  shapes: Shape[];
  /** Projected representative point for every country we can place, keyed by ISO alpha-2. */
  points: Map<string, [number, number]>;
  shapeByCode: Map<string, Shape>;
}

type CountryFeature = Feature<Polygon | MultiPolygon, { name: string }>;

function largestPolygon(f: CountryFeature): CountryFeature {
  if (f.geometry.type !== 'MultiPolygon') return f;
  const polys = f.geometry.coordinates.map((coordinates) => ({ type: 'Polygon' as const, coordinates }));
  polys.sort((a, b) => geoArea(b) - geoArea(a));
  return { ...f, geometry: polys[0] };
}

let cached: MapData | null = null;

export function getMapData(): MapData {
  if (cached) return cached;
  const topo = topology as unknown as Parameters<typeof feature>[0] & { objects: { countries: unknown } };
  const all = (feature(topo, topo.objects.countries as never) as unknown as FeatureCollection<Polygon | MultiPolygon, { name: string }>).features;
  const features = all.filter((f) => f.id !== '010'); // Antarctica adds height without information
  const collection: FeatureCollection<Polygon | MultiPolygon, { name: string }> = { type: 'FeatureCollection', features };

  const pad = 6;
  const projection = geoNaturalEarth1().fitWidth(MAP_W - pad * 2, collection);
  const path = geoPath(projection).digits(1);
  const [[x0, y0], [, y1]] = path.bounds(collection);
  const [tx, ty] = projection.translate();
  projection.translate([tx - x0 + pad, ty - y0 + pad]);
  const height = Math.ceil(y1 - y0 + pad * 2);

  const shapes: Shape[] = features.map((f) => {
    const id = typeof f.id === 'string' ? f.id : f.id !== undefined ? String(f.id).padStart(3, '0') : undefined;
    const code = id ? numericToAlpha2(id) : f.properties.name === 'Kosovo' ? 'XK' : undefined;
    return {
      key: id ?? f.properties.name,
      code,
      name: code ? countryName(code) : f.properties.name,
      d: path(f) ?? '',
      bounds: path.bounds(largestPolygon(f)) as Box,
    };
  });

  const points = new Map<string, [number, number]>();
  for (const [id, lonLat] of Object.entries(centroids as unknown as Record<string, [number, number]>)) {
    const code = numericToAlpha2(id);
    const p = projection(lonLat);
    if (code && p) points.set(code, [p[0], p[1]]);
  }
  for (const s of shapes) {
    if (s.code && !points.has(s.code)) {
      const [[a, b], [c, d]] = s.bounds;
      points.set(s.code, [(a + c) / 2, (b + d) / 2]);
    }
  }

  cached = {
    width: MAP_W,
    height,
    shapes,
    points,
    shapeByCode: new Map(shapes.filter((s) => s.code).map((s) => [s.code!, s])),
  };
  return cached;
}
