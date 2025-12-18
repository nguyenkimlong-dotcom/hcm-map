"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import routes from "@/data/routes.json";

export type Place = {
  id?: string;
  slug?: string;
  title: string;
  country?: string;
  city?: string;
  coords: [number, number];
  dateStart?: string;
  dateEnd?: string;
  periodLabel?: string;
  levelTexts?: {
    primary?: string;
    secondary?: string;
    high?: string;
  };
  media?: {
    cover?: string;
    gallery?: string[];
  };
  tags?: string[];
  sources?: string[];
};

type MarkerEntry = {
  marker: maplibregl.Marker;
  popup: maplibregl.Popup;
  place: Place;
};

type Props = {
  places: Place[];
};

const MAP_STYLE_URL = "https://demotiles.maplibre.org/style.json";

type RouteFeature = GeoJSON.Feature<
  GeoJSON.LineString,
  { fromSlug?: string; toSlug?: string; order?: string | number; mode?: string; label?: string }
>;

const EMPTY_FC: GeoJSON.FeatureCollection<GeoJSON.Geometry> = { type: "FeatureCollection", features: [] };

function buildPopupContent(place: Place) {
  const wrapper = document.createElement("div");
  wrapper.className = "space-y-2";

  const title = document.createElement("h3");
  title.className = "text-base font-semibold text-slate-900";
  title.textContent = place.title || "Dia diem";
  wrapper.appendChild(title);

  if (place.country || place.city) {
    const location = document.createElement("p");
    location.className = "text-sm text-slate-600";
    location.textContent = [place.city, place.country].filter(Boolean).join(", ");
    wrapper.appendChild(location);
  }

  if (place.periodLabel || place.dateStart || place.dateEnd) {
    const time = document.createElement("p");
    time.className = "text-sm font-medium text-blue-700";
    const fallbackRange =
      place.dateStart && place.dateEnd ? `${place.dateStart} -> ${place.dateEnd}` : place.dateStart || place.dateEnd || "";
    time.textContent = place.periodLabel || fallbackRange;
    wrapper.appendChild(time);
  }

  const description = place.levelTexts?.primary || place.levelTexts?.secondary || place.levelTexts?.high;
  if (description) {
    const desc = document.createElement("p");
    desc.className = "text-sm leading-relaxed text-slate-700";
    desc.textContent = description;
    wrapper.appendChild(desc);
  }

  const cover = place.media?.cover;
  if (cover) {
    const image = document.createElement("img");
    image.src = cover;
    image.alt = place.title || "Anh dia diem";
    image.className = "mt-1 h-36 w-full rounded-lg object-cover";
    wrapper.appendChild(image);
  }

  if (place.slug) {
    const detail = document.createElement("a");
    detail.href = `/places/${place.slug}`;
    detail.target = "_blank";
    detail.rel = "noopener noreferrer";
    detail.className =
      "inline-flex items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700";
    detail.textContent = "Xem chi tiet";
    wrapper.appendChild(detail);
  }

  return wrapper;
}

function buildLineFeature(coords: [number, number][]) {
  if (!coords || coords.length < 2) return null;
  return {
    type: "Feature",
    properties: {},
    geometry: { type: "LineString", coordinates: coords },
  } as GeoJSON.Feature<GeoJSON.LineString>;
}

function toNumberOrder(v: string | number | undefined) {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = Number(v);
    if (!Number.isNaN(n)) return n;
  }
  return undefined;
}

function buildPointCollection(places: Place[]): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: "FeatureCollection",
    features: places
      .filter((p) => Array.isArray(p.coords) && p.coords.length === 2)
      .map((p) => ({
        type: "Feature",
        properties: { slug: p.slug, title: p.title },
        geometry: { type: "Point", coordinates: p.coords },
      })),
  };
}

export default function MapView({ places }: Props) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerMapRef = useRef<Record<string, MarkerEntry>>({});
  const animationRef = useRef<number | null>(null);
  const moveTimeoutRef = useRef<number | null>(null);
  const zoomInTimeoutRef = useRef<number | null>(null);
  const moveEndHandlerRef = useRef<((e: maplibregl.MapLibreEvent) => void) | null>(null);

  const [mapLoaded, setMapLoaded] = useState(false);
  const [activePlaceId, setActivePlaceId] = useState<string | null>(null);
  const [stepIndex, setStepIndex] = useState<number>(0);

  const sortedPlaces = useMemo(() => {
    const list = [...places];
    list.sort((a, b) => {
      const aHas = Boolean(a.dateStart);
      const bHas = Boolean(b.dateStart);
      if (aHas && bHas) {
        const compare = (a.dateStart || "").localeCompare(b.dateStart || "");
        if (compare !== 0) return compare;
      } else if (aHas && !bHas) {
        return -1;
      } else if (!aHas && bHas) {
        return 1;
      }
      return (a.title || "").localeCompare(b.title || "");
    });
    return list;
  }, [places]);

  const routeFeatures: RouteFeature[] = useMemo(() => {
    const fc = routes as GeoJSON.FeatureCollection;
    const features = (fc.features || []) as RouteFeature[];
    const R = 6378137;
    const toLngLat = (x: number, y: number): [number, number] => {
      const lon = (x / R) * (180 / Math.PI);
      const lat = (2 * Math.atan(Math.exp(y / R)) - Math.PI / 2) * (180 / Math.PI);
      return [lon, lat];
    };

    const isLikelyMercator = (coords: number[]) => Math.abs(coords[0]) > 180 || Math.abs(coords[1]) > 90;

    return features.map((f) => {
      if (f.geometry.type !== "LineString") return f;
      const coords = f.geometry.coordinates as [number, number][];
      if (coords.length === 0) return f;
      const needConvert = isLikelyMercator(coords[0]);
      if (!needConvert) return f;
      const converted = coords.map(([x, y]) => toLngLat(x, y));
      return {
        ...f,
        geometry: { ...f.geometry, coordinates: converted },
      } as RouteFeature;
    });
  }, []);

  const routeByPairRef = useRef<Map<string, RouteFeature>>(new Map());
  const maxOrderRef = useRef<number>(0);
  const initialCenterRef = useRef<[number, number] | null>(null);

  useEffect(() => {
    const map = new Map<string, RouteFeature>();
    let maxOrder = 0;
    routeFeatures.forEach((f) => {
      const fromSlug = f.properties?.fromSlug;
      const toSlug = f.properties?.toSlug;
      const key = fromSlug && toSlug ? `${fromSlug}->${toSlug}` : undefined;
      if (key) map.set(key, f);
      const ord = toNumberOrder(f.properties?.order);
      if (ord !== undefined) maxOrder = Math.max(maxOrder, ord);
    });
    routeByPairRef.current = map;
    maxOrderRef.current = maxOrder;
  }, [routeFeatures]);

  const currentStep = sortedPlaces.length ? Math.min(stepIndex, sortedPlaces.length - 1) : 0;
  const currentPlace = sortedPlaces[currentStep];
  const fallbackCenter: [number, number] = useMemo(() => {
    return sortedPlaces[0]?.coords || [105.8342, 21.0278];
  }, [sortedPlaces]);

  const setRoutesProgressData = (features: RouteFeature[]) => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    const source = map.getSource("routes-progress") as maplibregl.GeoJSONSource | undefined;
    if (!source) return;
    source.setData({
      type: "FeatureCollection",
      features: features as GeoJSON.Feature[],
    });
  };

  const setRoutesAnimData = (line: GeoJSON.FeatureCollection) => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    const source = map.getSource("routes-anim") as maplibregl.GeoJSONSource | undefined;
    if (!source) return;
    source.setData(line);
  };

  const animateSegment = (feature: RouteFeature | undefined) => {
    if (!feature || feature.geometry.type !== "LineString") {
      setRoutesAnimData(EMPTY_FC);
      return;
    }
    const coords = feature.geometry.coordinates as [number, number][];
    if (coords.length < 2) {
      setRoutesAnimData(EMPTY_FC);
      return;
    }

    if (animationRef.current !== null) {
      cancelAnimationFrame(animationRef.current);
    }

    const duration = 1800;
    let start: number | null = null;

    const tick = (now: number) => {
      if (start === null) start = now;
      const t = Math.min(1, (now - start) / duration);
      const n = coords.length;
      const idx = Math.max(1, Math.floor(t * (n - 1)));
      const lineCoords = coords.slice(0, idx + 1);
      const line = buildLineFeature(lineCoords);
      setRoutesAnimData(
        line
          ? ({ type: "FeatureCollection", features: [line] } as GeoJSON.FeatureCollection<GeoJSON.LineString>)
          : EMPTY_FC,
      );
      if (t < 1) {
        animationRef.current = requestAnimationFrame(tick);
      } else {
        animationRef.current = null;
      }
    };

    animationRef.current = requestAnimationFrame(tick);
  };

  const buildProgressFeatures = (orderLimit?: number) => {
    if (orderLimit === undefined) return [];
    return routeFeatures.filter((f) => {
      const o = toNumberOrder(f.properties?.order);
      return o !== undefined && o <= orderLimit;
    });
  };

  const applyStep = (nextIndex: number, prevIndex?: number, options?: { animate?: boolean }) => {
    const animate = options?.animate !== false;
    if (sortedPlaces.length === 0) return;
    const clamped = Math.max(0, Math.min(nextIndex, sortedPlaces.length - 1));
    const place = sortedPlaces[clamped];
    const key = place.id || place.slug || `place-${clamped}`;

    setActivePlaceId(key);

    const map = mapRef.current;
    const showPopup = () => {
      if (!mapRef.current) return;
      const entry = markerMapRef.current[key];
      if (entry) {
        entry.popup.setLngLat(entry.place.coords).addTo(mapRef.current);
      } else {
        const popup = new maplibregl.Popup({ offset: 12, closeButton: true }).setDOMContent(buildPopupContent(place));
        popup.setLngLat(place.coords).addTo(mapRef.current);
      }
    };

    if (map) {
      Object.values(markerMapRef.current).forEach(({ popup }) => popup.remove());

      if (moveTimeoutRef.current !== null) {
        window.clearTimeout(moveTimeoutRef.current);
        moveTimeoutRef.current = null;
      }
      if (zoomInTimeoutRef.current !== null) {
        window.clearTimeout(zoomInTimeoutRef.current);
        zoomInTimeoutRef.current = null;
      }

      if (moveEndHandlerRef.current) {
        map.off("moveend", moveEndHandlerRef.current);
        moveEndHandlerRef.current = null;
      }

      if (animate) {
        const targetCenter = place.coords;
        const fromCenter =
          prevIndex !== undefined && prevIndex >= 0 && sortedPlaces[prevIndex]?.coords
            ? sortedPlaces[prevIndex].coords
            : (map.getCenter().toArray() as [number, number]);
        const midCenter: [number, number] = [
          (fromCenter[0] + targetCenter[0]) / 2,
          (fromCenter[1] + targetCenter[1]) / 2,
        ];
        const baseZoom = map.getZoom();
        const zoomOut = Math.max(2.2, Math.min(baseZoom - 2.5, 5.2));
        const moveZoom = zoomOut;
        const finalZoom = 6;
        const zoomOutDuration = 1200;
        const moveDuration = 1400;
        const zoomInDuration = 950;

        map.stop();
        // Step 1: zoom out ngay tại điểm cũ để người dùng thấy thu nhỏ
        map.easeTo({ center: fromCenter, zoom: zoomOut, duration: zoomOutDuration, essential: true });

        // Step 2: di chuyển ở mức zoomOut qua midpoint tới điểm mới
        moveTimeoutRef.current = window.setTimeout(() => {
          map.easeTo({ center: midCenter, zoom: moveZoom, duration: moveDuration, essential: true });
          moveTimeoutRef.current = null;

          // Step 3: zoom in vào điểm mới rồi mở popup
          zoomInTimeoutRef.current = window.setTimeout(() => {
            const handler = () => {
              showPopup();
              if (moveEndHandlerRef.current) {
                map.off("moveend", moveEndHandlerRef.current);
                moveEndHandlerRef.current = null;
              }
            };
            moveEndHandlerRef.current = handler;
            map.once("moveend", handler);
            map.easeTo({ center: targetCenter, zoom: finalZoom, duration: zoomInDuration, essential: true });
            zoomInTimeoutRef.current = null;
          }, moveDuration + 80);
        }, zoomOutDuration + 60);
      } else {
        // Không animate: không tự zoom/popup khi mới tải trang
        animateSegment(undefined);
        return;
      }
    }

    let segmentOrder: number | undefined;
    if (prevIndex !== undefined && prevIndex >= 0 && clamped !== prevIndex) {
      const from = sortedPlaces[prevIndex];
      const to = place;
      const segKey = from.slug && to.slug ? `${from.slug}->${to.slug}` : undefined;
      const segFeature = segKey ? routeByPairRef.current.get(segKey) : undefined;
      segmentOrder = toNumberOrder(segFeature?.properties?.order);
      if (animate) {
        animateSegment(segFeature);
      }
    } else if (animate) {
      animateSegment(undefined);
    }

    const progressFeatures =
      segmentOrder !== undefined ? buildProgressFeatures(segmentOrder) : buildProgressFeatures(undefined);
    setRoutesProgressData(progressFeatures);
  };

  const setStep = (nextIndex: number) => {
    const clamped = Math.max(0, Math.min(nextIndex, Math.max(0, sortedPlaces.length - 1)));
    const prev = stepIndex;
    if (clamped !== stepIndex) {
      setStepIndex(clamped);
    }
    applyStep(clamped, prev);
  };

  useEffect(() => {
    const container = mapContainerRef.current;
    if (!container || mapRef.current) return;

    const initialCenter = initialCenterRef.current || fallbackCenter;
    if (!initialCenterRef.current) {
      initialCenterRef.current = initialCenter;
    }

    const map = new maplibregl.Map({
      container,
      style: MAP_STYLE_URL,
      center: initialCenter,
      zoom: sortedPlaces.length ? 2.5 : 3.5,
    });

    map.addControl(new maplibregl.NavigationControl(), "top-right");
    map.on("load", () => {
      if (!map.getSource("routes")) {
        map.addSource("routes", { type: "geojson", data: routes as GeoJSON.FeatureCollection });
        map.addLayer({
          id: "routes-base",
          type: "line",
          source: "routes",
          layout: { "line-join": "round", "line-cap": "round" },
          paint: { "line-color": "#cbd5e1", "line-width": 2 },
        });
      }

      if (!map.getSource("routes-progress")) {
        map.addSource("routes-progress", { type: "geojson", data: EMPTY_FC });
        map.addLayer({
          id: "routes-progress-line",
          type: "line",
          source: "routes-progress",
          layout: { "line-join": "round", "line-cap": "round" },
          paint: { "line-color": "#2563eb", "line-width": 3 },
        });
      }

      if (!map.getSource("routes-anim")) {
        map.addSource("routes-anim", { type: "geojson", data: EMPTY_FC });
        map.addLayer({
          id: "routes-anim-line",
          type: "line",
          source: "routes-anim",
          layout: { "line-join": "round", "line-cap": "round" },
          paint: { "line-color": "#ef4444", "line-width": 4 },
        });
      }

      if (!map.getSource("vn-islands")) {
        const data: GeoJSON.FeatureCollection<GeoJSON.Point> = {
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              properties: { title: "Quan dao Hoang Sa" },
              geometry: { type: "Point", coordinates: [112.3, 16.5] },
            },
            {
              type: "Feature",
              properties: { title: "Quan dao Truong Sa" },
              geometry: { type: "Point", coordinates: [113.4, 9.6] },
            },
          ],
        };

        map.addSource("vn-islands", { type: "geojson", data });
        map.addLayer({
          id: "vn-islands-labels",
          type: "symbol",
          source: "vn-islands",
          layout: {
            "text-field": ["get", "title"],
            "text-size": ["interpolate", ["linear"], ["zoom"], 3, 10, 6, 12, 8, 14],
            "text-allow-overlap": true,
          },
          paint: {
            "text-color": "#0f172a",
            "text-halo-color": "#ffffff",
            "text-halo-width": 1.6,
          },
        });
      }

      if (!map.getSource("route-nodes")) {
        map.addSource("route-nodes", { type: "geojson", data: buildPointCollection(sortedPlaces) });
        map.addLayer({
          id: "route-nodes-circle",
          type: "circle",
          source: "route-nodes",
          paint: {
            "circle-radius": 5,
            "circle-color": "#ffffff",
            "circle-stroke-color": "#0f172a",
            "circle-stroke-width": 1.5,
          },
        });
      }

      setMapLoaded(true);
      if (sortedPlaces.length > 0) {
        const initialIndex = Math.min(stepIndex, sortedPlaces.length - 1);
        applyStep(initialIndex, undefined, { animate: false });
      }
    });

    mapRef.current = map;

    return () => {
      if (animationRef.current !== null) {
        cancelAnimationFrame(animationRef.current);
      }
      if (moveTimeoutRef.current !== null) {
        window.clearTimeout(moveTimeoutRef.current);
        moveTimeoutRef.current = null;
      }
      if (zoomInTimeoutRef.current !== null) {
        window.clearTimeout(zoomInTimeoutRef.current);
        zoomInTimeoutRef.current = null;
      }
      if (moveEndHandlerRef.current) {
        activeMap.off("moveend", moveEndHandlerRef.current);
        moveEndHandlerRef.current = null;
      }
      const activeMap = mapRef.current;
      if (activeMap) {
        ["routes-anim-line", "routes-progress-line", "routes-base", "vn-islands-labels"].forEach((layerId) => {
          if (activeMap.getLayer(layerId)) activeMap.removeLayer(layerId);
        });
        ["route-nodes", "routes-anim", "routes-progress", "routes", "vn-islands"].forEach((sourceId) => {
          if (activeMap.getSource(sourceId)) activeMap.removeSource(sourceId);
        });
        activeMap.remove();
      }
      mapRef.current = null;
      setMapLoaded(false);
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    Object.values(markerMapRef.current).forEach(({ marker, popup }) => {
      popup.remove();
      marker.remove();
    });
    markerMapRef.current = {};

    sortedPlaces.forEach((place, index) => {
      if (!place.coords || place.coords.length !== 2) return;
      const key = place.id || place.slug || `place-${index}`;

      const popup = new maplibregl.Popup({ offset: 12, closeButton: true }).setDOMContent(buildPopupContent(place));

      const marker = new maplibregl.Marker({ color: "#2563eb" })
        .setLngLat(place.coords)
        .setPopup(popup)
        .addTo(map);

      marker.getElement().addEventListener("click", () => setActivePlaceId(key));

      markerMapRef.current[key] = { marker, popup, place };
    });

    const nodeSource = map.getSource("route-nodes") as maplibregl.GeoJSONSource | undefined;
    if (nodeSource) {
      nodeSource.setData(buildPointCollection(sortedPlaces));
    }
  }, [sortedPlaces]);

  return (
    <section className="h-screen w-screen bg-slate-50">
      <div className="flex h-full w-full">
        <div className="flex w-full flex-col gap-4 lg:flex-row lg:items-start">
          <aside className="h-fit w-full flex-shrink-0 rounded-xl border border-slate-200 bg-white shadow-sm lg:sticky lg:top-4 lg:w-[340px]">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">Hanh trinh</p>
                <h2 className="text-lg font-semibold text-slate-900">Danh sach dia diem</h2>
              </div>
              <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
                {sortedPlaces.length} diem
              </span>
            </div>

            <div className="max-h-[70vh] overflow-y-auto divide-y divide-slate-100">
              {sortedPlaces.length === 0 ? (
                <p className="p-4 text-sm text-slate-600">Chua co du lieu. Hay them JSON vao src/data/places.json.</p>
              ) : (
                sortedPlaces.map((place, index) => {
                  const key = place.id || place.slug || `place-${index}`;
                  const active = activePlaceId === key;
                  return (
                    <div
                      key={key}
                      onClick={() => setStep(index)}
                      className={`block w-full cursor-pointer text-left transition hover:bg-blue-50/80 ${
                        active ? "bg-blue-50" : "bg-white"
                      }`}
                    >
                      <div className="flex items-start gap-3 px-4 py-3">
                        <div
                          className={`mt-1 h-9 w-9 shrink-0 rounded-full border text-center text-sm font-semibold leading-9 ${
                            active
                              ? "border-blue-500 bg-blue-100 text-blue-700"
                              : "border-slate-200 bg-slate-50 text-slate-700"
                          }`}
                        >
                          {index + 1}
                        </div>
                        <div className="space-y-1">
                          <p className="text-sm font-semibold text-slate-900">{place.title}</p>
                          <p className="text-xs text-slate-600">
                            {[place.city, place.country].filter(Boolean).join(", ") || "Dia diem"}
                          </p>
                          {place.periodLabel || place.dateStart || place.dateEnd ? (
                            <p className="text-xs font-medium text-blue-700">
                              {place.periodLabel ||
                                (place.dateStart && place.dateEnd
                                  ? `${place.dateStart} -> ${place.dateEnd}`
                                  : place.dateStart || place.dateEnd)}
                            </p>
                          ) : null}
                          {place.levelTexts?.primary ? (
                            <p className="text-xs text-slate-700">{place.levelTexts.primary}</p>
                          ) : null}
                          {place.slug ? (
                            <Link
                              href={`/places/${place.slug}`}
                              className="text-xs font-semibold text-blue-700 hover:text-blue-800"
                              onClick={(event) => event.stopPropagation()}
                            >
                              Chi tiet
                            </Link>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </aside>

          <div className="flex flex-1 flex-col gap-3">
            <div className="h-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div ref={mapContainerRef} className="h-screen w-full md:h-[85vh]" />
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => setStep(currentStep - 1)}
                  disabled={currentStep <= 0}
                  className="rounded-md border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"
                >
                  Prev
                </button>
                <button
                  type="button"
                  onClick={() => setStep(currentStep + 1)}
                  disabled={currentStep >= sortedPlaces.length - 1}
                  className="rounded-md border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"
                >
                  Next
                </button>
                <div className="flex min-w-[220px] flex-1 items-center gap-3">
                  <input
                    type="range"
                    min={0}
                    max={Math.max(sortedPlaces.length - 1, 0)}
                    value={currentStep}
                    onChange={(e) => setStep(Number(e.target.value))}
                    className="w-full"
                  />
                </div>
              </div>
              <div className="mt-2 text-sm font-semibold text-slate-700">
                {currentPlace ? `${currentPlace.periodLabel || ""} — ${currentPlace.title}` : "Chua co du lieu"}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
