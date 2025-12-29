"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

import routes from "@/data/routes.json";
import quizData from "@/data/quiz.json";
import { Place } from "@/types/place";

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "\u0110\u1ecba \u0111i\u1ec3m";
mapboxgl.accessToken = MAPBOX_TOKEN;

type MarkerEntry = {
  marker: mapboxgl.Marker;
  popup: mapboxgl.Popup;
  place: Place;
};

type Props = {
  places: Place[];
};

type QuizQuestion = {
  id: string;
  question: string;
  options: string[];
  answerIndex: number;
};

// Positron GL style supports globe projection without API key
const MAP_STYLE_URL = "mapbox://styles/mapbox/streets-v12";

type RouteFeature = GeoJSON.Feature<
  GeoJSON.LineString,
  { fromSlug?: string; toSlug?: string; order?: string | number; mode?: string; label?: string }
>;

const EMPTY_FC: GeoJSON.FeatureCollection<GeoJSON.Geometry> = { type: "FeatureCollection", features: [] };
const POPUP_STYLE_ID = "mapbox-popup-clean-style";

function getIconSrc(icon: string) {
  const trimmed = icon.trim();
  if (!trimmed) return null;
  if (/^(https?:)?\/\//i.test(trimmed) || trimmed.startsWith("/")) return trimmed;
  const normalized = trimmed.replace(/\\/g, "/");
  const publicMediaIndex = normalized.indexOf("/public/media/");
  if (publicMediaIndex !== -1) {
    return `/media/${normalized.slice(publicMediaIndex + "/public/media/".length)}`;
  }
  const mediaIndex = normalized.indexOf("/media/");
  if (mediaIndex !== -1) {
    return `/media/${normalized.slice(mediaIndex + "/media/".length)}`;
  }
  if (/\.(svg|png|jpe?g|webp|gif)$/i.test(normalized)) {
    return `/media/${normalized.split("/").pop()}`;
  }
  return null;
}

function isImageUrl(url: string) {
  return /\.(png|jpe?g|webp|gif|svg)$/i.test(url);
}

function isVideoUrl(url: string) {
  return /\.(mp4|webm|ogg)$/i.test(url);
}

function getEmbedVideoSrc(url: string) {
  const trimmed = url.trim();
  const ytMatch = trimmed.match(
    /^(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtube\.com\/embed\/|youtu\.be\/)([A-Za-z0-9_-]{6,})/i,
  );
  if (ytMatch) {
    return `https://www.youtube.com/embed/${ytMatch[1]}`;
  }
  const vimeoMatch = trimmed.match(/^(?:https?:\/\/)?(?:www\.)?vimeo\.com\/(\d+)/i);
  if (vimeoMatch) {
    return `https://player.vimeo.com/video/${vimeoMatch[1]}`;
  }
  return null;
}

function buildPopupContent(place: Place, onDetail: () => void) {
  const placeAny = place as any;
  const wrapper = document.createElement("div");
  wrapper.className =
    "relative max-w-[280px] overflow-hidden rounded-2xl border border-white/30 bg-white/55 shadow-2xl ring-1 ring-white/20 backdrop-blur-xl";

  const noise = document.createElement("div");
  noise.className = "glass-noise pointer-events-none absolute inset-0 z-0";
  noise.setAttribute("aria-hidden", "true");
  wrapper.appendChild(noise);

  const header = document.createElement("div");
  header.className =
    "relative z-10 bg-[#991B1B]/90 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-white backdrop-blur";
  header.textContent = "Hành trình";
  wrapper.appendChild(header);

  const body = document.createElement("div");
  body.className = "relative z-10 space-y-2 bg-white/55 px-3 py-3 backdrop-blur-xl";
  wrapper.appendChild(body);

  const title = document.createElement("h3");
  title.className = "text-base font-bold text-slate-900";
  title.textContent = place.title || "\u0110\u1ecba \u0111i\u1ec3m";
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
      "inline-flex items-center rounded-full bg-[#EAB308]/20 px-3 py-1 text-[13px] font-semibold text-[#991B1B] backdrop-blur";
    const fallbackRange =
      place.dateStart && place.dateEnd ? `${place.dateStart} -> ${place.dateEnd}` : place.dateStart || place.dateEnd || "\u0110\u1ecba \u0111i\u1ec3m";
    pill.textContent = place.periodLabel || fallbackRange;
    body.appendChild(pill);
  }

  const customPopup = typeof placeAny.popup === "string" ? placeAny.popup : undefined;
  const mainText = customPopup || place.levelTexts?.primary;
  const extraText = place.levelTexts?.secondary || place.levelTexts?.high;
  if (mainText) {
    const desc = document.createElement("p");
    desc.className = "text-sm leading-relaxed text-slate-800";
    desc.textContent = mainText;
    body.appendChild(desc);
  }
  if (extraText) {
    const extra = document.createElement("p");
    extra.className = "text-xs leading-relaxed text-slate-600";
    extra.textContent = extraText;
    body.appendChild(extra);
  }

  const cover = place.media?.cover;
  if (cover) {
    const image = document.createElement("img");
    image.src = cover;
    image.alt = place.title || "\u0110\u1ecba \u0111i\u1ec3m";
    image.className = "mt-1 h-36 w-full rounded-lg object-cover ring-1 ring-white/30";
    body.appendChild(image);
  }

  // Sources hidden in popup by request.

  if (place.slug) {
    const detail = document.createElement("button");
    detail.type = "button";
    detail.className =
      "mt-1 inline-flex items-center gap-2 rounded-md bg-[#991B1B]/90 px-3 py-2 text-sm font-semibold text-white shadow-sm shadow-black/10 backdrop-blur hover:bg-[#7F1D1D]";
    detail.textContent = "Xem chi tiết";
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

function isSameCoord(a: [number, number], b: [number, number], epsilon = 1e-4) {
  return Math.abs(a[0] - b[0]) < epsilon && Math.abs(a[1] - b[1]) < epsilon;
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

function pickRandomItems<T>(items: T[], count: number) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, Math.min(count, copy.length));
}

function shuffleQuizOptions(question: QuizQuestion): QuizQuestion {
  const entries = question.options.map((option, index) => ({ option, index }));
  for (let i = entries.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [entries[i], entries[j]] = [entries[j], entries[i]];
  }
  const newOptions = entries.map((entry) => entry.option);
  const newAnswerIndex = entries.findIndex((entry) => entry.index === question.answerIndex);
  return { ...question, options: newOptions, answerIndex: newAnswerIndex };
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
  const [activeTab, setActiveTab] = useState<"places" | "journey" | "quiz">("journey");
  const [hoveredTab, setHoveredTab] = useState<"places" | "journey" | "quiz" | null>(null);
  const [quizSet, setQuizSet] = useState<QuizQuestion[]>([]);
  const [quizAnswers, setQuizAnswers] = useState<Record<string, number>>({});
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const [quizScore, setQuizScore] = useState<number | null>(null);
  const placeSectionRef = useRef<HTMLDivElement | null>(null);
  const journeySectionRef = useRef<HTMLDivElement | null>(null);

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
        const compare = (a.dateStart || "\u0110\u1ecba \u0111i\u1ec3m").localeCompare(b.dateStart || "\u0110\u1ecba \u0111i\u1ec3m");
        if (compare !== 0) return compare;
      } else if (aHas && !bHas) {
        return -1;
      } else if (!aHas && bHas) {
        return 1;
      }
      return (a.title || "\u0110\u1ecba \u0111i\u1ec3m").localeCompare(b.title || "\u0110\u1ecba \u0111i\u1ec3m");
    });
    return list;
  }, [places, routeOrderMap]);

  const quizBank = useMemo(() => {
    return (quizData as QuizQuestion[]).filter((q) => q && q.id && Array.isArray(q.options));
  }, []);

  const generateQuizSet = () => {
    const nextSet = pickRandomItems(quizBank, 10).map(shuffleQuizOptions);
    setQuizSet(nextSet);
    setQuizAnswers({});
    setQuizSubmitted(false);
    setQuizScore(null);
  };

  useEffect(() => {
    if (activeTab === "quiz") {
      generateQuizSet();
    }
  }, [activeTab, quizBank]);

  const handleQuizAnswer = (id: string, optionIndex: number) => {
    if (quizSubmitted) return;
    setQuizAnswers((prev) => ({ ...prev, [id]: optionIndex }));
  };

  const handleQuizSubmit = () => {
    if (quizSubmitted) return;
    const score = quizSet.reduce((sum, question) => {
      return sum + (quizAnswers[question.id] === question.answerIndex ? 1 : 0);
    }, 0);
    setQuizScore(score);
    setQuizSubmitted(true);
  };

  const handleQuizNext = () => {
    generateQuizSet();
  };

  const sidebarSections = [
    { key: "places", label: "\u0110\u1ecba \u0111i\u1ec3m", icon: "Orion_geotag-pin.svg", ref: placeSectionRef },
    { key: "journey", label: "H\u00e0nh tr\u00ecnh", icon: "Orion_direction.svg", ref: journeySectionRef },
    { key: "quiz", label: "Tr\u1eafc nghi\u1ec7m", icon: "Orion_favorite-book.svg" },
  ] as const;

  const visibleTab = hoveredTab ?? activeTab;
  const activeSection = sidebarSections.find((section) => section.key === visibleTab);
  const sidebarMeta = visibleTab === "quiz" ? `${quizSet.length} c\u00e2u` : `${sortedPlaces.length} \u0111i\u1ec3m`;
  const sidebarHint =
    visibleTab === "quiz"
      ? "Ch\u1ecdn \u0111\u00e1p \u00e1n r\u1ed3i b\u1ea5m Ch\u1ea5m \u0111i\u1ec3m."
      : visibleTab === "places"
        ? "Danh s\u00e1ch \u0111\u1ecba \u0111i\u1ec3m theo h\u00e0nh tr\u00ecnh."
        : "Theo d\u00f5i h\u00e0nh tr\u00ecnh theo th\u1eddi gian.";
  const quizAnsweredCount = Object.keys(quizAnswers).length;

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
        const sameCenter = isSameCoord(fromCenter, targetCenter);
        if (sameCenter) {
          showPopup();
        } else {
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
        }
      } else {
        // Không animate: không tự zoom/popup khi mới tới trang
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
          .mapboxgl-popup-close-button {
            width: 28px;
            height: 28px;
            line-height: 28px;
            border-radius: 999px;
            background: #fff;
            color: #991B1B;
            font-weight: 700;
            right: 8px;
            top: 8px;
            opacity: 0.95;
            box-shadow: 0 6px 16px rgba(15, 23, 42, 0.22);
          }
          .mapboxgl-popup-close-button:hover {
            background: #7F1D1D;
            opacity: 1;
          }
          .glass-noise {
            background-image: url("data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZmlsdGVyIGlkPSJuIj48ZmVUdXJidWxlbmNlIHR5cGU9ImZyYWN0YWxOb2lzZSIgYmFzZUZyZXF1ZW5jeT0iMC44NSIgbnVtT2N0YXZlcz0iMSIgc3RpdGNoVGlsZXM9InN0aXRjaCIvPjwvZmlsdGVyPjxyZWN0IHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgZmlsdGVyPSJ1cmwoI24pIiBvcGFjaXR5PSIwLjA4Ii8+PC9zdmc+");
            background-size: 120px 120px;
            mix-blend-mode: soft-light;
            opacity: 0.14;
          }
          .mapboxgl-ctrl-top-right .mapboxgl-ctrl-group {
            display: flex;
            flex-direction: row;
            gap: 6px;
            padding: 4px;
            background: rgba(255, 255, 255, 0.7);
            border: 1px solid rgba(255, 255, 255, 0.45);
            border-radius: 12px;
            box-shadow: 0 10px 30px rgba(15, 23, 42, 0.12);
            backdrop-filter: blur(14px);
          }
          .mapboxgl-ctrl-top-right .mapboxgl-ctrl-group button {
            width: 25px;
            height: 25px;
            border-radius: 8px;
          }
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

    map.addControl(new mapboxgl.NavigationControl({ showCompass: true }), "top-right");
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
            "text-color": "#000000",
            "text-halo-color": "#ffffff",
            "text-halo-width": 1.0,
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
      ctrl.style.right = "24px";
      ctrl.style.top = "5px";
    }
  }, []);

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
      console.warn("Bật/tắt toàn màn hình thất bại", err);
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

      const marker = new mapboxgl.Marker({ color: "#991B1B" })
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
            <p className="text-lg font-semibold">Thiếu mã truy cập Mapbox</p>
            <p className="mt-2 text-sm">
              Thêm biến môi trường <code className="rounded bg-white px-1 py-0.5">NEXT_PUBLIC_MAPBOX_TOKEN</code> vào
              file <code className="rounded bg-white px-1 py-0.5">.env.local</code>, sau đó chạy lại <code>pnpm dev</code>.
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
              className="group flex h-9 items-center gap-2 overflow-hidden rounded-full border border-white/40 bg-white/80 px-2 shadow-sm backdrop-blur transition-all duration-500 hover:bg-white/95"
              aria-label={projectionMode === "mercator" ? "Quả địa cầu" : "Bản đồ"}
            >
              <img src="/media/Orion_globe.svg" alt="" className="h-4 w-4" />
              <span className="max-w-0 overflow-hidden whitespace-nowrap text-xs font-semibold text-slate-700 transition-all duration-500 group-hover:max-w-[140px]">
                {projectionMode === "mercator" ? "Quả địa cầu" : "Bản đồ"}
              </span>
            </button>
            <button
              type="button"
              onClick={toggleFullscreen}
              className="group flex h-9 items-center gap-2 overflow-hidden rounded-full border border-white/40 bg-white/80 px-2 shadow-sm backdrop-blur transition-all duration-500 hover:bg-white/95"
              aria-label={isFullscreen ? "Thoát" : "Toàn màn hình"}
            >
              <img src="/media/Orion_expand.svg" alt="" className="h-4 w-4" />
              <span className="max-w-0 overflow-hidden whitespace-nowrap text-xs font-semibold text-slate-700 transition-all duration-500 group-hover:max-w-[140px]">
                {isFullscreen ? "Thoát" : "Toàn màn hình"}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setShowMenu((prev) => !prev)}
              className="group flex h-9 items-center gap-2 overflow-hidden rounded-full border border-white/40 bg-white/80 px-2 shadow-sm backdrop-blur transition-all duration-500 hover:bg-white/95"
              aria-label="Danh mục"
            >
              <img src="/media/Orion_menu.svg" alt="" className="h-4 w-4" />
              <span className="max-w-0 overflow-hidden whitespace-nowrap text-xs font-semibold text-slate-700 transition-all duration-500 group-hover:max-w-[140px]">
                Danh mục
              </span>
            </button>
          </div>

          <div
            className={`pointer-events-auto absolute left-3 top-14 z-20 h-[85vh] w-[400px] transform overflow-hidden rounded-2xl border border-white/30 bg-white/55 shadow-2xl ring-1 ring-white/20 backdrop-blur-xl transition-transform duration-300 ${
              showMenu ? "translate-x-0" : "-translate-x-[110%]"
            }`}
          >
            <div className="relative flex h-full">
              <div className="glass-noise pointer-events-none absolute inset-0 z-0" aria-hidden="true" />
              <div className="relative z-10 flex h-full w-full">
                <div
                  className="flex w-16 flex-col items-center gap-3 border-r border-white/30 bg-white/35 py-3"
                  onMouseLeave={() => setHoveredTab(null)}
                >
                  {sidebarSections.map((section) => {
                    const isSelected = activeTab === section.key;
                    const isPreview = visibleTab === section.key;
                    return (
                      <button
                        key={section.key}
                        type="button"
                        onClick={() => setActiveTab(section.key)}
                        onMouseEnter={() => setHoveredTab(section.key)}
                        title={section.label}
                        aria-label={section.label}
                        aria-current={isSelected ? "page" : undefined}
                        className={`flex w-12 items-center justify-center rounded-xl border px-2 py-2 text-[11px] font-semibold transition ${
                          isPreview
                            ? "border-[#991B1B]/50 bg-white text-[#991B1B] shadow-sm"
                            : isSelected
                              ? "border-white/80 bg-white/80 text-slate-700"
                              : "border-white/50 bg-white/70 text-slate-600 hover:bg-white"
                        }`}
                      >
                        <img
                          src={getIconSrc(section.icon) || `/media/${section.icon}`}
                          alt={section.label}
                          className="h-5 w-5 object-contain"
                        />
                      </button>
                    );
                  })}
                </div>
                <div className="flex min-h-0 flex-1 flex-col">
                  <div className="border-b border-white/30 bg-[#991B1B]/90 text-white backdrop-blur">
                    <div className="flex items-center justify-between px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20">
                          {activeSection ? (
                            <img
                              src={getIconSrc(activeSection.icon) || `/media/${activeSection.icon}`}
                              alt=""
                              className="h-5 w-5 object-contain"
                            />
                          ) : null}
                        </div>
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-white/80">
                            {"Tab \u0111ang ch\u1ecdn"}
                          </p>
                          <p className="text-base font-semibold">{activeSection?.label || "Danh m\u1ee5c"}</p>
                        </div>
                      </div>
                      <div className="rounded-full bg-white/20 px-3 py-1 text-xs font-semibold text-white backdrop-blur">
                        {sidebarMeta}
                      </div>
                    </div>
                    <p className="px-4 pb-3 text-xs text-white/90">{sidebarHint}</p>
                  </div>
                  <div className="relative z-10 min-h-0 flex-1 overflow-y-auto bg-white/50 backdrop-blur-xl">
                    {visibleTab === "quiz" ? (
                      <div className="space-y-4 px-3 py-4">
                        {quizSet.length === 0 ? (
                          <p className="rounded-xl border border-white/40 bg-white/70 px-3 py-4 text-sm text-slate-600">{"Ch\u01b0a c\u00f3 c\u00e2u h\u1ecfi tr\u1eafc nghi\u1ec7m. H\u00e3y th\u00eam c\u00e2u h\u1ecfi v\u00e0o src/data/quiz.json."}</p>
                        ) : (
                          <div className="space-y-3">
                            {quizSet.map((question, index) => {
                              const selectedIndex = quizAnswers[question.id];
                              const isCorrect = selectedIndex === question.answerIndex;
                              return (
                                <div
                                  key={question.id}
                                  className="rounded-xl border border-white/40 bg-white/70 p-3 shadow-sm"
                                >
                                  <p className="text-sm font-semibold text-slate-900">{`${index + 1}. ${question.question}`}</p>
                                  <div className="mt-2 space-y-2">
                                    {question.options.map((option, optionIndex) => {
                                      const isSelected = selectedIndex === optionIndex;
                                      const showCorrect = quizSubmitted && question.answerIndex === optionIndex;
                                      const showWrong = quizSubmitted && isSelected && question.answerIndex !== optionIndex;
                                      return (
                                        <button
                                          key={`${question.id}-${optionIndex}`}
                                          type="button"
                                          onClick={() => handleQuizAnswer(question.id, optionIndex)}
                                          className={`flex w-full items-start gap-2 rounded-lg border px-3 py-2 text-left text-sm transition ${
                                            showCorrect
                                              ? "border-emerald-400 bg-emerald-50 text-emerald-800"
                                              : showWrong
                                                ? "border-rose-400 bg-rose-50 text-rose-700"
                                                : isSelected
                                                  ? "border-[#991B1B]/50 bg-[#991B1B]/10 text-[#991B1B]"
                                                  : "border-white/60 bg-white/70 text-slate-700 hover:bg-white"
                                          }`}
                                        >
                                          <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-current text-[11px] font-semibold">
                                            {String.fromCharCode(65 + optionIndex)}
                                          </span>
                                          <span>{option}</span>
                                        </button>
                                      );
                                    })}
                                  </div>
                                  {quizSubmitted ? (
                                    <p
                                      className={`mt-2 text-xs font-semibold ${
                                        isCorrect ? "text-emerald-700" : "text-rose-700"
                                      }`}
                                    >
                                      {selectedIndex === undefined ? "Ch\u01b0a ch\u1ecdn \u0111\u00e1p \u00e1n" : isCorrect ? "\u0110\u00fang" : "Sai"}
                                    </p>
                                  ) : null}
                                </div>
                              );
                            })}
                          </div>
                        )}

                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-xs font-semibold text-slate-600">{"\u0110\u00e3 ch\u1ecdn "}{quizAnsweredCount}/{quizSet.length}{" c\u00e2u"}</p>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={handleQuizSubmit}
                              className="rounded-md border border-[#991B1B]/30 bg-[#991B1B] px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-[#7F1D1D] disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {"Ch\u1ea5m \u0111i\u1ec3m"}
                            </button>
                            <button
                              type="button"
                              onClick={handleQuizNext}
                              className="rounded-md border border-white/60 bg-white/80 px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {"K\u1ebf ti\u1ebfp"}
                            </button>
                          </div>
                        </div>

                        {quizSubmitted ? (
                          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800">{"K\u1ebft qu\u1ea3: "}{quizScore ?? 0}/{quizSet.length}</div>
                        ) : null}
                      </div>
                    ) : sortedPlaces.length === 0 ? (
                      <p className="p-4 text-sm text-slate-600">{"Ch\u01b0a c\u00f3 d\u1eef li\u1ec7u. Th\u00eam JSON v\u00e0o src/data/places.json."}</p>
                    ) : visibleTab === "places" ? (
                      <div className="space-y-4 px-2 py-3">
                        <div ref={placeSectionRef}>
                          <p className="px-2 text-xs font-semibold uppercase tracking-wide text-[#991B1B]">{"\u0110\u1ecba \u0111i\u1ec3m"}</p>
                          <div className="mt-2 divide-y divide-white/30 rounded-xl border border-white/30 bg-white/50 shadow-lg ring-1 ring-white/20 backdrop-blur-xl">
                            {sortedPlaces.map((place, index) => {
                              const key = place.id || place.slug || `place-${index}`;
                              const listIndex = sortedPlaces.indexOf(place);
                              const stepTarget = listIndex >= 0 ? listIndex : index;
                              const displayIndex = listIndex >= 0 ? listIndex + 1 : index + 1;
                              const active = activePlaceId === key;
                              return (
                                <div
                                  key={`places-${key}`}
                                  onClick={() => {
                                    setStep(stepTarget);
                                    setDetailPlace(place);
                                  }}
                                  className={`block w-full cursor-pointer text-left transition hover:bg-[#EAB308]/15 ${
                                    active ? "bg-[#EAB308]/15" : "bg-white"
                                  }`}
                                >
                                  <div className="flex items-start gap-3 px-4 py-3">
                                    <div
                                      className={`mt-1 h-9 w-9 shrink-0 rounded-full border text-center text-sm font-semibold leading-9 ${
                                        active
                                          ? "border-[#991B1B] bg-[#EAB308]/25 text-[#991B1B]"
                                          : "border-slate-200 bg-slate-50 text-slate-700"
                                      }`}
                                    >
                                      {displayIndex}
                                    </div>
                                    <div className="space-y-1">
                                      <p className="text-sm font-semibold text-slate-900">{place.title}</p>
                                      <p className="text-xs text-slate-600">
                                        {[place.city, place.country].filter(Boolean).join(", ") || "\u0110\u1ecba \u0111i\u1ec3m"}
                                      </p>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-4 px-2 py-3">
                        <div ref={journeySectionRef}>
                          <p className="px-2 text-xs font-semibold uppercase tracking-wide text-[#991B1B]">{"H\u00e0nh tr\u00ecnh"}</p>
                          <div className="mt-2 divide-y divide-white/30 rounded-xl border border-white/30 bg-white/50 shadow-lg ring-1 ring-white/20 backdrop-blur-xl">
                            {sortedPlaces.map((place, index) => {
                              const key = place.id || place.slug || `place-${index}`;
                              const listIndex = sortedPlaces.indexOf(place);
                              const stepTarget = listIndex >= 0 ? listIndex : index;
                              const displayIndex = listIndex >= 0 ? listIndex + 1 : index + 1;
                              const active = activePlaceId === key;
                              return (
                                <div
                                  key={`journey-${key}`}
                                  onClick={() => {
                                    setStep(stepTarget);
                                    setDetailPlace(place);
                                  }}
                                  className={`block w-full cursor-pointer text-left transition hover:bg-[#EAB308]/15 ${
                                    active ? "bg-[#EAB308]/15" : "bg-white"
                                  }`}
                                >
                                  <div className="flex items-start gap-3 px-4 py-3">
                                    <div
                                      className={`mt-1 h-9 w-9 shrink-0 rounded-full border text-center text-sm font-semibold leading-9 ${
                                        active
                                          ? "border-[#991B1B] bg-[#EAB308]/25 text-[#991B1B]"
                                          : "border-slate-200 bg-slate-50 text-slate-700"
                                      }`}
                                    >
                                      {displayIndex}
                                    </div>
                                    <div className="space-y-1">
                                      <p className="text-sm font-semibold text-slate-900">{place.title}</p>
                                      <p className="text-xs text-slate-600">
                                        {[place.city, place.country].filter(Boolean).join(", ") || "\u0110\u1ecba \u0111i\u1ec3m"}
                                      </p>
                                      {place.periodLabel || place.dateStart || place.dateEnd ? (
                                        <p className="text-xs font-medium text-[#991B1B]">
                                          {place.periodLabel ||
                                            (place.dateStart && place.dateEnd
                                              ? `${place.dateStart} -> ${place.dateEnd}`
                                              : place.dateStart || place.dateEnd)}
                                        </p>
                                      ) : null}
                                      {place.levelTexts?.primary ? (
                                        <p className="text-xs text-slate-700">{place.levelTexts.primary}</p>
                                      ) : null}
                                      {/* Chi ti?t removed in journey tab */}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {visibleTab === "journey" ? (
            <div className="pointer-events-auto absolute inset-x-0 bottom-4 flex justify-center px-4">
              <div className="flex w-full max-w-5xl flex-col gap-2 rounded-2xl border border-white/40 bg-white/70 p-3 shadow-2xl backdrop-blur">
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setStep(currentStep - 1)}
                    disabled={currentStep <= 0}
                    className="rounded-md border border-white/50 bg-white/60 px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm backdrop-blur disabled:opacity-50"
                  >
                    Trước
                  </button>
                  <button
                    type="button"
                    onClick={() => setStep(currentStep + 1)}
                    disabled={currentStep >= sortedPlaces.length - 1}
                    className="rounded-md border border-white/50 bg-white/60 px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm backdrop-blur disabled:opacity-50"
                  >
                    Sau
                  </button>
                  <div className="flex min-w-[220px] flex-1 items-center gap-3">
                    <input
                      type="range"
                      min={0}
                      max={Math.max(sortedPlaces.length - 1, 0)}
                      value={currentStep}
                      onChange={(e) => setStep(Number(e.target.value))}
                      className="w-full accent-[#991B1B]"
                    />
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-2 text-xs font-semibold text-slate-700">
                  <span className="text-slate-500">Dòng thời gian</span>
                  <span className="text-center text-[13px]">
                    {currentPlace ? `${currentPlace.periodLabel || "\u0110\u1ecba \u0111i\u1ec3m"} - ${currentPlace.title}` : "Chưa có dữ liệu"}
                  </span>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {/* Detail sidebar */}
        {detailPlace ? (
          <div className="pointer-events-auto absolute right-3 top-14 z-30 flex h-[83vh] w-[440px] max-w-full flex-col overflow-hidden rounded-2xl border border-white/30 bg-white/95 shadow-2xl ring-1 ring-white/20 backdrop-blur-xl">
            <div className="glass-noise pointer-events-none absolute inset-0 z-0" aria-hidden="true" />
            <div className="relative z-10 flex items-center justify-between border-b border-white/30 bg-white/45 px-4 py-3 backdrop-blur-xl">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-[#991B1B]">Thông tin</p>
                <h3 className="text-lg font-semibold text-slate-900 line-clamp-2">{detailPlace.title}</h3>
              </div>
              <button
                type="button"
                onClick={() => setDetailPlace(null)}
                className="rounded-full border border-white/40 bg-white/50 p-2 text-slate-700 shadow-sm backdrop-blur hover:bg-white/70"
                aria-label="Đóng chi tiết"
              >
                x
              </button>
            </div>
            <div className="relative z-10 min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-6 pt-4">
              {detailPlace.periodLabel || detailPlace.dateStart || detailPlace.dateEnd ? (
                <div className="space-y-1 text-sm text-slate-700">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Thời gian</p>
                  <div className="flex flex-wrap gap-2">
                    <p className="inline-flex items-center gap-2 rounded-full bg-[#EAB308]/20 px-3 py-1 text-sm font-semibold text-[#991B1B]">
                      {detailPlace.periodLabel ||
                        (detailPlace.dateStart && detailPlace.dateEnd
                          ? `${detailPlace.dateStart} -> ${detailPlace.dateEnd}`
                          : detailPlace.dateStart || detailPlace.dateEnd)}
                    </p>
                    {detailPlace.dateStart && detailPlace.dateEnd && !detailPlace.periodLabel ? (
                      <p className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                        Từ {detailPlace.dateStart} đến {detailPlace.dateEnd}
                      </p>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {detailPlace.media?.cover ? (
                <img
                  src={detailPlace.media.cover}
                  alt={detailPlace.title || "\u0110\u1ecba \u0111i\u1ec3m"}
                  className="h-auto w-full rounded-lg"
                />
              ) : null}

              {(detailPlace as any).media?.images?.length ? (
                <div className="space-y-2 text-sm text-slate-700">
                  <div className="space-y-2">
                    {(detailPlace as any).media.images.slice(0, 3).map((img: any, idx: number) => (
                      <div key={`img-${idx}`} className="rounded-md border border-slate-100 p-2">
                        {img.url && isImageUrl(img.url) ? (
                          <img src={img.url} alt={img.label || "\u0110\u1ecba \u0111i\u1ec3m"} className="h-auto w-full rounded-md" />
                        ) : null}
                        {img.url && !isImageUrl(img.url) ? (
                          <a
                            href={img.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm font-semibold text-[#991B1B] underline underline-offset-2"
                          >
                            {img.label || "\u0110\u1ecba \u0111i\u1ec3m"}
                          </a>
                        ) : (
                          <span className="text-sm font-semibold text-slate-800">{img.label || "\u0110\u1ecba \u0111i\u1ec3m"}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="space-y-2 text-sm text-slate-700">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Nội dung</p>
                {(detailPlace as any).detailMarkdown ? (
                  <div className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-800 whitespace-pre-line text-justify">
                    {(detailPlace as any).detailMarkdown}
                  </div>
                ) : null}
                {detailPlace.levelTexts?.secondary ? (
                  <div className="space-y-1 rounded-md bg-slate-50 px-3 py-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Mô tả bổ sung</p>
                    <p className="text-sm text-slate-700 text-justify">{detailPlace.levelTexts.secondary}</p>
                  </div>
                ) : null}
                {detailPlace.levelTexts?.high ? (
                  <div className="space-y-1 rounded-md bg-slate-50 px-3 py-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Chú thích</p>
                    <p className="text-sm text-slate-700 text-justify">{detailPlace.levelTexts.high}</p>
                  </div>
                ) : null}
              </div>

              {(detailPlace as any).media?.videos?.length ? (
                <div className="space-y-2 text-sm text-slate-700">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Video</p>
                  <div className="space-y-2">
                    {(detailPlace as any).media.videos.slice(0, 3).map((vid: any, idx: number) => (
                      <div key={`vid-${idx}`} className="rounded-md border border-slate-100 p-2">
                        {vid.url && isVideoUrl(vid.url) ? (
                          <video src={vid.url} controls className="w-full rounded-md" />
                        ) : null}
                        {vid.url && !isVideoUrl(vid.url)
                          ? (() => {
                              const embed = getEmbedVideoSrc(vid.url);
                              if (embed) {
                                return (
                                  <div className="aspect-video w-full overflow-hidden rounded-md">
                                    <iframe
                                      src={embed}
                                      title={vid.label || "\u0110\u1ecba \u0111i\u1ec3m"}
                                      className="h-full w-full"
                                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                      allowFullScreen
                                    />
                                  </div>
                                );
                              }
                              return (
                                <a
                                  href={vid.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-sm font-semibold text-[#991B1B] underline underline-offset-2"
                                >
                                  {vid.label || "\u0110\u1ecba \u0111i\u1ec3m"}
                                </a>
                              );
                            })()
                          : null}
                        {!vid.url ? <span className="text-sm font-semibold text-slate-800">Video</span> : null}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="space-y-2 text-sm text-slate-700">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Nguồn</p>
                <ul className="space-y-1">
                  {[
                    "https://baotanghochiminh.vn",
                    "https://hcmcpv.org.vn",
                  ].map((s, idx) => (
                    <li key={`fixed-src-${idx}`} className="flex items-start gap-2">
                      <span className="mt-1 h-1.5 w-1.5 rounded-full bg-slate-400" />
                      <a
                        href={s}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="break-words text-[#991B1B] underline underline-offset-2"
                      >
                        {s}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
