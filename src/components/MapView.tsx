"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

import routes from "@/data/routes.json";
import { Place } from "@/types/place";

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";
mapboxgl.accessToken = MAPBOX_TOKEN;

type MarkerEntry = {
  marker: mapboxgl.Marker;
  popup: mapboxgl.Popup;
  place: Place;
};

type Props = {
  places: Place[];
};

// Positron GL style supports globe projection without API key
const MAP_STYLE_URL = "mapbox://styles/mapbox/streets-v12";

type RouteFeature = GeoJSON.Feature<
  GeoJSON.LineString,
  { fromSlug?: string; toSlug?: string; order?: string | number; mode?: string; label?: string }
>;

const EMPTY_FC: GeoJSON.FeatureCollection<GeoJSON.Geometry> = { type: "FeatureCollection", features: [] };
const POPUP_STYLE_ID = "mapbox-popup-clean-style";

function buildPopupContent(place: Place, onDetail: () => void) {
  const wrapper = document.createElement("div");
  wrapper.className = "max-w-[280px] overflow-hidden rounded-xl border border-slate-200 shadow-lg";

  const header = document.createElement("div");
  header.className =
    "bg-gradient-to-r from-blue-600 to-indigo-500 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-white";
  header.textContent = "Hanh trinh";
  wrapper.appendChild(header);

  const body = document.createElement("div");
  body.className = "space-y-2 bg-white px-3 py-3";
  wrapper.appendChild(body);

  const title = document.createElement("h3");
  title.className = "text-base font-bold text-slate-900";
  title.textContent = place.title || "Dia diem";
  body.appendChild(title);

  if (place.country || place.city) {
    const location = document.createElement("p");
    location.className = "text-sm text-slate-600";
    location.textContent = [place.city, place.country].filter(Boolean).join(", ");
    body.appendChild(location);
  }

  if (place.periodLabel || place.dateStart || place.dateEnd) {
    const pill = document.createElement("span");
    pill.className =
      "inline-flex items-center rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700";
    const fallbackRange =
      place.dateStart && place.dateEnd ? `${place.dateStart} -> ${place.dateEnd}` : place.dateStart || place.dateEnd || "";
    pill.textContent = place.periodLabel || fallbackRange;
    body.appendChild(pill);
  }

  const description = place.levelTexts?.primary || place.levelTexts?.secondary || place.levelTexts?.high;
  if (description) {
    const desc = document.createElement("p");
    desc.className = "text-sm leading-relaxed text-slate-700";
    desc.textContent = description;
    body.appendChild(desc);
  }

  const cover = place.media?.cover;
  if (cover) {
    const image = document.createElement("img");
    image.src = cover;
    image.alt = place.title || "Anh dia diem";
    image.className = "mt-1 h-36 w-full rounded-lg object-cover";
    body.appendChild(image);
  }

  if (place.slug) {
    const detail = document.createElement("button");
    detail.type = "button";
    detail.className =
      "mt-1 inline-flex items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700";
    detail.textContent = "Xem chi tiet";
    detail.onclick = (e) => {
      e.stopPropagation();
      onDetail();
    };
    body.appendChild(detail);
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
  const hasToken = Boolean(MAPBOX_TOKEN);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markerMapRef = useRef<Record<string, MarkerEntry>>({});
  const animationRef = useRef<number | null>(null);
  const moveTimeoutRef = useRef<number | null>(null);
  const zoomInTimeoutRef = useRef<number | null>(null);
  const moveEndHandlerRef = useRef<((e: mapboxgl.MapboxEvent) => void) | null>(null);
  const popupStyleInjectedRef = useRef<boolean>(false);

  const [mapLoaded, setMapLoaded] = useState(false);
  const [activePlaceId, setActivePlaceId] = useState<string | null>(null);
  const [stepIndex, setStepIndex] = useState<number>(0);
  const [projectionMode, setProjectionMode] = useState<"globe" | "mercator">("globe");
  const [showMenu, setShowMenu] = useState<boolean>(true);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [detailPlace, setDetailPlace] = useState<Place | null>(null);

  const routeOrderMap = useMemo(() => {
    const m = new Map<string, number>();
    (routes as GeoJSON.FeatureCollection).features?.forEach((f, idx) => {
      if (f.type !== "Feature") return;
      const props = f.properties as RouteFeature["properties"];
      const ord = toNumberOrder(props?.order) ?? idx + 1;
      if (!ord) return;
      if (props?.fromSlug) {
        const cur = m.get(props.fromSlug);
        if (cur === undefined || ord < cur) m.set(props.fromSlug, ord);
      }
      if (props?.toSlug) {
        const cur = m.get(props.toSlug);
        if (cur === undefined || ord < cur) m.set(props.toSlug, ord);
      }
    });
    return m;
  }, []);

  const sortedPlaces = useMemo(() => {
    const list = [...places];
    list.sort((a, b) => {
      const aOrd = a.slug ? routeOrderMap.get(a.slug) : undefined;
      const bOrd = b.slug ? routeOrderMap.get(b.slug) : undefined;
      if (aOrd !== undefined && bOrd !== undefined && aOrd !== bOrd) return aOrd - bOrd;
      if (aOrd !== undefined && bOrd === undefined) return -1;
      if (aOrd === undefined && bOrd !== undefined) return 1;

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
  }, [places, routeOrderMap]);

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
  const lastProgressOrderRef = useRef<number>(0);

  useEffect(() => {
    const map = new Map<string, RouteFeature>();
    let maxOrder = 0;
    routeFeatures.forEach((f, idx) => {
      const fromSlug = f.properties?.fromSlug;
      const toSlug = f.properties?.toSlug;
      const key = fromSlug && toSlug ? `${fromSlug}->${toSlug}` : undefined;
      if (key) map.set(key, f);
      const ord = toNumberOrder(f.properties?.order) ?? idx + 1;
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
    const source = map.getSource("routes-progress") as mapboxgl.GeoJSONSource | undefined;
    if (!source) return;
    source.setData({
      type: "FeatureCollection",
      features: features as GeoJSON.Feature[],
    });
  };

  const setRoutesAnimData = (line: GeoJSON.FeatureCollection) => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    const source = map.getSource("routes-anim") as mapboxgl.GeoJSONSource | undefined;
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
    return routeFeatures.filter((f, idx) => {
      const o = toNumberOrder(f.properties?.order) ?? idx + 1;
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
        entry.popup.setDOMContent(buildPopupContent(entry.place, () => setDetailPlace(entry.place)));
        entry.popup.setLngLat(entry.place.coords).addTo(mapRef.current);
      } else {
        const popup = new mapboxgl.Popup({ offset: 12, closeButton: true, className: "popup-clean" }).setDOMContent(
          buildPopupContent(place, () => setDetailPlace(place)),
        );
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
        // Step 1: zoom out ngay t?i diem cu d? ngu?i dùng th?y thu nh?
        map.easeTo({ center: fromCenter, zoom: zoomOut, duration: zoomOutDuration, essential: true });

        // Step 2: di chuy?n ? m?c zoomOut qua midpoint t?i diem m?i
        moveTimeoutRef.current = window.setTimeout(() => {
          map.easeTo({ center: midCenter, zoom: moveZoom, duration: moveDuration, essential: true });
          moveTimeoutRef.current = null;

          // Step 3: zoom in vào diem m?i r?i m? popup
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
        // Không animate: không t? zoom/popup khi m?i t?i trang
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
      const fallbackOrder = segFeature ? routeFeatures.indexOf(segFeature) + 1 : undefined;
      segmentOrder = toNumberOrder(segFeature?.properties?.order) ?? fallbackOrder;
      if (segmentOrder !== undefined) {
        lastProgressOrderRef.current = Math.max(lastProgressOrderRef.current, segmentOrder);
      }
      if (animate && segFeature) {
        animateSegment(segFeature);
      } else if (animate) {
        animateSegment(undefined);
      }
    } else if (animate) {
      animateSegment(undefined);
    }

    const progressLimit = lastProgressOrderRef.current;
    const progressFeatures = buildProgressFeatures(progressLimit);
    setRoutesProgressData(progressFeatures);
  };

  const applyProjection = (mode: "globe" | "mercator") => {
    const map = mapRef.current;
    if (!map) return;
    try {
      map.setProjection(mode as any);
      if (mode === "globe") {
        map.setFog(
          {
            range: [0.5, 10],
            color: "rgba(255,255,255,0.4)",
            "horizon-blend": 0.2,
          } as any,
        );
        map.easeTo({ pitch: 0, bearing: 0, zoom: 1.8, duration: 500, essential: true });
      } else {
        map.setFog(null as any);
        map.easeTo({ pitch: 0, bearing: 0, duration: 400, essential: true });
      }
    } catch (err) {
      console.warn("Projection switch failed", err);
    }
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
    if (!container || mapRef.current || !hasToken) return;

    if (!popupStyleInjectedRef.current && typeof document !== "undefined") {
      const existed = document.getElementById(POPUP_STYLE_ID);
      if (!existed) {
        const style = document.createElement("style");
        style.id = POPUP_STYLE_ID;
        style.innerHTML = `
          .mapboxgl-popup.popup-clean { padding: 0; }
          .mapboxgl-popup.popup-clean .mapboxgl-popup-content { padding: 0; background: transparent; box-shadow: none; border: none; }
          .mapboxgl-popup.popup-clean .mapboxgl-popup-tip { display: none; }
        `;
        document.head.appendChild(style);
      }
      popupStyleInjectedRef.current = true;
    }

    const initialCenter = initialCenterRef.current || fallbackCenter;
    if (!initialCenterRef.current) {
      initialCenterRef.current = initialCenter;
    }

    const map = new mapboxgl.Map(
      {
        container,
        style: MAP_STYLE_URL,
        center: initialCenter,
        zoom: sortedPlaces.length ? 2.5 : 3.5,
        projection: projectionMode,
        antialias: true,
      } as mapboxgl.MapboxOptions,
    );

    map.dragRotate.enable();

    map.addControl(new mapboxgl.NavigationControl(), "top-right");
    map.on("load", () => {
      applyProjection(projectionMode);

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
      const activeMap = mapRef.current;
      if (activeMap && moveEndHandlerRef.current) {
        activeMap.off("moveend", moveEndHandlerRef.current);
        moveEndHandlerRef.current = null;
      }
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
    applyProjection(projectionMode);
  }, [projectionMode]);

  useEffect(() => {
    if (mapRef.current) {
      mapRef.current.resize();
    }
  }, [isFullscreen, showMenu]);

  // Shift navigation controls when detail sidebar is open
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const ctrl = map.getContainer().querySelector(".mapboxgl-ctrl-top-right") as HTMLElement | null;
    if (ctrl) {
      ctrl.style.right = detailPlace ? "410px" : "12px";
      ctrl.style.top = "12px";
    }
  }, [detailPlace]);

  // Sync state when user exits fullscreen via ESC
  useEffect(() => {
    const handler = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        if (wrapperRef.current?.requestFullscreen) {
          await wrapperRef.current.requestFullscreen();
          setIsFullscreen(true);
        }
      } else if (document.exitFullscreen) {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    } catch (err) {
      console.warn("Fullscreen toggle failed", err);
    }
  };

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

      const popup = new mapboxgl.Popup({ offset: 12, closeButton: true, className: "popup-clean" }).setDOMContent(
        buildPopupContent(place, () => setDetailPlace(place)),
      );

      const marker = new mapboxgl.Marker({ color: "#2563eb" })
        .setLngLat(place.coords)
        .setPopup(popup)
        .addTo(map);

      marker.getElement().addEventListener("click", () => setActivePlaceId(key));

      markerMapRef.current[key] = { marker, popup, place };
    });

    const nodeSource = map.getSource("route-nodes") as mapboxgl.GeoJSONSource | undefined;
    if (nodeSource) {
      nodeSource.setData(buildPointCollection(sortedPlaces));
    }
  }, [sortedPlaces]);

  if (!hasToken) {
    return (
      <section className="h-screen w-screen bg-slate-50">
        <div className="mx-auto flex h-full max-w-5xl items-center justify-center px-4">
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-amber-900 shadow-sm">
            <p className="text-lg font-semibold">Thieu Mapbox access token</p>
            <p className="mt-2 text-sm">
              Them bien moi truong <code className="rounded bg-white px-1 py-0.5">NEXT_PUBLIC_MAPBOX_TOKEN</code> vao
              file <code className="rounded bg-white px-1 py-0.5">.env.local</code>, sau do chay lai <code>pnpm dev</code>.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className={isFullscreen ? "fixed inset-0 z-50 bg-slate-50" : "h-screen w-screen bg-slate-50"}>
      <div ref={wrapperRef} className="relative h-full w-full overflow-hidden">
        <div ref={mapContainerRef} className="h-full w-full" />

        {/* Overlay */}
        <div className="pointer-events-none absolute inset-0 flex flex-col">
          <div className="pointer-events-auto flex justify-start gap-2 p-3">
            <button
              type="button"
              onClick={() => setProjectionMode((prev) => (prev === "mercator" ? "globe" : "mercator"))}
              className="rounded-md border border-slate-200 bg-white/90 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-white"
            >
              {projectionMode === "mercator" ? "🌍" : "🗺️"}
            </button>
            <button
              type="button"
              onClick={toggleFullscreen}
              className="rounded-md border border-slate-200 bg-white/90 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-white"
              aria-label="Toggle fullscreen"
            >
              {isFullscreen ? "🞬" : "⛶"}
            </button>
            <button
              type="button"
              onClick={() => setShowMenu((prev) => !prev)}
              className="rounded-md border border-slate-200 bg-white/90 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-white"
            >
              ☰
            </button>
          </div>

          <div
            className={`pointer-events-auto absolute left-3 top-14 z-20 max-h-[88vh] w-[320px] transform overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl transition-transform duration-300 ${
              showMenu ? "translate-x-0" : "-translate-x-[110%]"
            }`}
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">Menu</p>
                <h2 className="text-lg font-semibold text-slate-900">Timeline & Chuc nang</h2>
              </div>
              <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
                {sortedPlaces.length} diem
              </span>
            </div>

            <div className="max-h-[55vh] overflow-y-auto divide-y divide-slate-100">
              {sortedPlaces.length === 0 ? (
                <p className="p-4 text-sm text-slate-600">Chua co du lieu. Them JSON vao src/data/places.json.</p>
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

            <div className="border-t border-slate-200 bg-slate-50 px-4 py-3">
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => setStep(currentStep - 1)}
                  disabled={currentStep <= 0}
                  className="rounded-md border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-50"
                >
                  Prev
                </button>
                <button
                  type="button"
                  onClick={() => setStep(currentStep + 1)}
                  disabled={currentStep >= sortedPlaces.length - 1}
                  className="rounded-md border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-50"
                >
                  Next
                </button>
                <div className="flex min-w-[180px] flex-1 items-center gap-3">
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
              <div className="mt-2 text-xs font-semibold text-slate-700">
                {currentPlace ? `${currentPlace.periodLabel || ""} - ${currentPlace.title}` : "Chua co du lieu"}
              </div>
              <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-slate-600">
                <span className="rounded-full bg-slate-100 px-2 py-1">Timeline</span>
                <span className="rounded-full bg-slate-100 px-2 py-1">Quiz (sắp ra mắt)</span>
                <span className="rounded-full bg-slate-100 px-2 py-1">Bộ lọc (sắp ra mắt)</span>
              </div>
            </div>
          </div>
        </div>

        {/* Detail sidebar */}
        {detailPlace ? (
          <div className="pointer-events-auto absolute right-3 top-14 z-30 h-[88vh] w-[380px] max-w-full overflow-hidden rounded-xl bg-white shadow-2xl ring-1 ring-slate-200">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">Thong tin</p>
                <h3 className="text-lg font-semibold text-slate-900 line-clamp-2">{detailPlace.title}</h3>
              </div>
              <button
                type="button"
                onClick={() => setDetailPlace(null)}
                className="rounded-full border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
                aria-label="Close detail"
              >
                ×
              </button>
            </div>
            <div className="h-full overflow-y-auto px-4 pb-6 pt-4 space-y-4">
              {detailPlace.media?.cover ? (
                <img
                  src={detailPlace.media.cover}
                  alt={detailPlace.title || "cover"}
                  className="h-44 w-full rounded-lg object-cover"
                />
              ) : null}

              <div className="space-y-1 text-sm text-slate-700">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Dia diem</p>
                <p className="text-base font-semibold text-slate-900">
                  {[detailPlace.city, detailPlace.country].filter(Boolean).join(", ") || "Dia diem"}
                </p>
              </div>

              {detailPlace.periodLabel || detailPlace.dateStart || detailPlace.dateEnd ? (
                <div className="space-y-1 text-sm text-slate-700">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Thoi gian</p>
                  <p className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-sm font-semibold text-blue-700">
                    {detailPlace.periodLabel ||
                      (detailPlace.dateStart && detailPlace.dateEnd
                        ? `${detailPlace.dateStart} -> ${detailPlace.dateEnd}`
                        : detailPlace.dateStart || detailPlace.dateEnd)}
                  </p>
                </div>
              ) : null}

              <div className="space-y-2 text-sm text-slate-700">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Noi dung chinh</p>
                {detailPlace.levelTexts?.primary ? (
                  <p className="text-base font-medium text-slate-900">{detailPlace.levelTexts.primary}</p>
                ) : null}
                {detailPlace.levelTexts?.secondary ? (
                  <p className="text-slate-600">{detailPlace.levelTexts.secondary}</p>
                ) : null}
                {detailPlace.levelTexts?.high ? <p className="text-slate-600">{detailPlace.levelTexts.high}</p> : null}
              </div>

              {detailPlace.sources?.length ? (
                <div className="space-y-2 text-sm text-slate-700">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Nguon</p>
                  <ul className="space-y-1">
                    {detailPlace.sources.map((s, idx) => (
                      <li key={`${detailPlace.slug || detailPlace.id}-src-${idx}`} className="flex items-start gap-2">
                        <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-slate-400" />
                        <span className="break-words">{s}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
