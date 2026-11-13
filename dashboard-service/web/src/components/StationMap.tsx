/// <reference types="geojson" />
import { useEffect, useRef } from "react";
import maplibregl, { type StyleSpecification } from "maplibre-gl";

/** Hsinchu station, approximate. Geometry below is schematic, in metres around this point. */
const ORIGIN = { lng: 120.97163, lat: 24.80166 };
const TRACK_BEARING = 32; // degrees clockwise from north
const M_PER_DEG_LAT = 110_540;
const M_PER_DEG_LNG = 111_320 * Math.cos((ORIGIN.lat * Math.PI) / 180);

/** across = metres perpendicular to the tracks (east-ish +), along = metres along the tracks (north-ish +). */
function toLngLat(across: number, along: number): [number, number] {
  const a = (TRACK_BEARING * Math.PI) / 180;
  const east = across * Math.cos(a) + along * Math.sin(a);
  const north = -across * Math.sin(a) + along * Math.cos(a);
  return [ORIGIN.lng + east / M_PER_DEG_LNG, ORIGIN.lat + north / M_PER_DEG_LAT];
}

function rect(across: number, along: number, w: number, l: number) {
  const c = [
    [across - w / 2, along - l / 2],
    [across + w / 2, along - l / 2],
    [across + w / 2, along + l / 2],
    [across - w / 2, along + l / 2],
    [across - w / 2, along - l / 2],
  ];
  return [c.map(([x, y]) => toLngLat(x, y))];
}

function circle(across: number, along: number, r: number) {
  const pts = Array.from({ length: 33 }, (_, i) => {
    const t = (i / 32) * Math.PI * 2;
    return toLngLat(across + r * Math.cos(t), along + r * Math.sin(t));
  });
  return [pts];
}

type Feature = GeoJSON.Feature<GeoJSON.Polygon, Record<string, string | number>>;
const poly = (coordinates: GeoJSON.Position[][], properties: Record<string, string | number>): Feature => ({
  type: "Feature",
  geometry: { type: "Polygon", coordinates },
  properties,
});

const structures: Feature[] = [
  poly(rect(-52, 0, 26, 54), { name: "前站站體", height: 16, base: 0, color: "#7fa6d6" }),
  poly(rect(48, 0, 20, 36), { name: "後站站體", height: 11, base: 0, color: "#6b8fbf" }),
  poly(rect(0, 4, 112, 12), { name: "跨站天橋", height: 13, base: 8, color: "#9cc3ea" }),
  ...[-22, 0, 22].flatMap((x, i) => [
    poly(rect(x, 0, 8, 300), { name: `第 ${i + 1} 月台`, height: 1.1, base: 0, color: "#3b5578" }),
    poly(rect(x, 0, 6, 150), { name: `第 ${i + 1} 月台雨棚`, height: 6, base: 5.4, color: "#4f6f99" }),
  ]),
  ...[-30, -14, -8, 8, 14, 30].map((x) => poly(rect(x, 0, 1.6, 900), { name: "軌道", height: 0.2, base: 0, color: "#56677f" })),
];

export type HotZone = { id: string; name: string; level: "ok" | "warn" | "alert"; componentId?: string; across: number; along: number; r: number };
const LEVEL_COLOR = { ok: "#4ade80", warn: "#f5b638", alert: "#f8656b" };

const defaultZones: HotZone[] = [
  { id: "z-2a", name: "2A 月台", level: "alert", componentId: "platform-crowding", across: 0, along: 70, r: 26 },
  { id: "z-1b", name: "1B 月台", level: "warn", componentId: "platform-crowding", across: -22, along: -70, r: 24 },
  { id: "z-front", name: "前站大廳", level: "ok", componentId: "passenger-flow", across: -52, along: 0, r: 34 },
  { id: "z-rear", name: "後站電扶梯", level: "warn", componentId: "alerts", across: 48, along: -12, r: 16 },
];

function graticule(): GeoJSON.FeatureCollection<GeoJSON.LineString> {
  const lines: GeoJSON.Feature<GeoJSON.LineString>[] = [];
  for (let d = -800; d <= 800; d += 50) {
    lines.push({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [toLngLat(d, -800), toLngLat(d, 800)] } });
    lines.push({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [toLngLat(-800, d), toLngLat(800, d)] } });
  }
  return { type: "FeatureCollection", features: lines };
}

/** Raster basemap, configured on the server (.env) and delivered via /api/config. */
export type Basemap = { tiles: string; attribution: string; maxzoom: number; darken: boolean };
export const DEFAULT_BASEMAP: Basemap = {
  tiles: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  attribution: "© OpenStreetMap contributors",
  maxzoom: 19,
  darken: true,
};

// Swapping brightness min/max inverts a light map; rotating the hue back keeps water blue-ish.
const DARKEN_PAINT = {
  "raster-brightness-min": 1,
  "raster-brightness-max": 0.08,
  "raster-hue-rotate": 200,
  "raster-saturation": -0.55,
  "raster-contrast": 0.1,
  "raster-opacity": 0.8,
};
const PLAIN_PAINT = { "raster-opacity": 0.85, "raster-saturation": -0.4, "raster-brightness-max": 0.85 };

function buildStyle(zones: HotZone[], basemap: Basemap): StyleSpecification {
  return {
    version: 8,
    sources: {
      basemap: {
        type: "raster",
        // "{s}" in the URL means the provider has a/b/c subdomains.
        tiles: basemap.tiles.includes("{s}") ? ["a", "b", "c"].map((d) => basemap.tiles.replace("{s}", d)) : [basemap.tiles],
        tileSize: 256,
        maxzoom: basemap.maxzoom,
        attribution: basemap.attribution,
      },
      grid: { type: "geojson", data: graticule() },
      zones: {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: zones.map((z) => poly(circle(z.across, z.along, z.r), { id: z.id, name: z.name, color: LEVEL_COLOR[z.level] })),
        },
      },
      station: { type: "geojson", data: { type: "FeatureCollection", features: structures } },
    },
    layers: [
      { id: "bg", type: "background", paint: { "background-color": "#0a1220" } },
      { id: "basemap", type: "raster", source: "basemap", paint: basemap.darken ? DARKEN_PAINT : PLAIN_PAINT },
      { id: "grid", type: "line", source: "grid", paint: { "line-color": "#1d3350", "line-width": 1, "line-opacity": 0.7 } },
      { id: "zones", type: "fill", source: "zones", paint: { "fill-color": ["get", "color"], "fill-opacity": 0.35 } },
      { id: "zones-edge", type: "line", source: "zones", paint: { "line-color": ["get", "color"], "line-width": 1.5 } },
      {
        id: "station",
        type: "fill-extrusion",
        source: "station",
        paint: {
          "fill-extrusion-color": ["get", "color"],
          "fill-extrusion-height": ["get", "height"],
          "fill-extrusion-base": ["get", "base"],
          "fill-extrusion-opacity": 0.92,
        },
      },
    ],
  };
}

type Props = { onSelect?: (zone: HotZone) => void; zones?: HotZone[]; basemap?: Basemap };

/** Map basemap + simple extruded station geometry, rotatable and zoomable. */
export function StationMap({ onSelect, zones = defaultZones, basemap = DEFAULT_BASEMAP }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    const map = new maplibregl.Map({
      container: el.current!,
      style: buildStyle(zones, basemap),
      center: toLngLat(0, 0),
      zoom: 17.1,
      pitch: 58,
      bearing: TRACK_BEARING - 90 + 18,
      maxPitch: 75,
      attributionControl: { compact: true },
    });
    // Keep the station centred in the area the panels leave open.
    map.setPadding({ top: 80, bottom: 120, left: 240, right: Math.min(640, Math.max(420, window.innerWidth * 0.36)) + 16 });
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "bottom-right");
    // Missing basemap tiles (offline, blocked) must not break the page: the grid stays as the fallback base.
    map.on("error", () => {});

    map.on("click", "zones", (e) => {
      const id = e.features?.[0]?.properties?.id;
      const z = zones.find((x) => x.id === id);
      if (!z) return;
      new maplibregl.Popup({ closeButton: false, className: "zone-popup" })
        .setLngLat(e.lngLat)
        .setHTML(`<strong></strong><span></span>`)
        .addTo(map)
        .getElement()
        .querySelectorAll("strong,span")
        .forEach((n, i) => (n.textContent = i === 0 ? z.name : ` · ${{ ok: "正常", warn: "注意", alert: "擁擠" }[z.level]}`));
      onSelectRef.current?.(z);
    });
    map.on("mouseenter", "zones", () => (map.getCanvas().style.cursor = "pointer"));
    map.on("mouseleave", "zones", () => (map.getCanvas().style.cursor = ""));

    // Pulsing alert pins pinned to the model.
    zones
      .filter((z) => z.level === "alert")
      .forEach((z) => {
        const pin = document.createElement("div");
        pin.className = "alert-pin";
        new maplibregl.Marker({ element: pin }).setLngLat(toLngLat(z.across, z.along)).addTo(map);
      });
    return () => map.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={el} className="station-map" />;
}
