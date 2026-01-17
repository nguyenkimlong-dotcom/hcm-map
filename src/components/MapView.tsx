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

const COUNTRY_ISO_MAP: Record<string, string> = {
  "ai cap": "EGY",
  algeria: "DZA",
  angola: "AGO",
  anh: "GBR",
  argentina: "ARG",
  bi: "BEL",
  congo: "COD",
  "cote d ivoire": "CIV",
  duc: "DEU",
  ghana: "GHA",
  "ha lan": "NLD",
  kenya: "KEN",
  madagascar: "MDG",
  malaysia: "MYS",
  martinique: "FRA",
  morocco: "MAR",
  my: "USA",
  "nam phi": "ZAF",
  nga: "RUS",
  nigeria: "NGA",
  phap: "FRA",
  reunion: "FRA",
  senegal: "SEN",
  singapore: "SGP",
  somalia: "SOM",
  "sri lanka": "LKA",
  tanzania: "TZA",
  "thai lan": "THA",
  "trung quoc": "CHN",
  tunisie: "TUN",
  uc: "AUS",
  uruguay: "URY",
  "viet nam": "VNM",
  y: "ITA",
};

function normalizeCountryName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function collectCountryCodes(list: Place[]) {
  const codes = new Set<string>();
  list.forEach((place) => {
    const placeAny = place as any;
    const rawCode = typeof placeAny.countryCode === "string" ? placeAny.countryCode.trim() : "";
    if (rawCode && /^[a-zA-Z]{3}$/.test(rawCode)) {
      codes.add(rawCode.toUpperCase());
      return;
    }
    if (!place.country) return;
    const key = normalizeCountryName(place.country);
    const code = COUNTRY_ISO_MAP[key];
    if (code) codes.add(code);
  });
  return Array.from(codes);
}

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

function renderSimpleMarkdown(input: string) {
  const escapeHtml = (value: string) =>
    value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  const safe = escapeHtml(input || "");
  const withBlocks = safe
    .replace(/^### (.*)$/gm, '<h4 class="mt-3 text-sm font-semibold text-slate-700">$1</h4>')
    .replace(/^## (.*)$/gm, '<h3 class="mt-3 text-base font-semibold text-slate-800">$1</h3>')
    .replace(/^# (.*)$/gm, '<h2 class="mt-3 text-lg font-semibold text-slate-900">$1</h2>')
    .replace(/^> (.*)$/gm, '<blockquote class="border-l-2 border-slate-300 pl-3 italic text-slate-600">$1</blockquote>');
  const lines = withBlocks.split(/\n/);
  const out: string[] = [];
  let inList = false;
  lines.forEach((line) => {
    const match = line.match(/^[-*]\s+(.*)$/);
    if (match) {
      if (!inList) {
        inList = true;
        out.push('<ul class="list-disc space-y-1 pl-5">');
      }
      out.push(`<li>${match[1]}</li>`);
      return;
    }
    if (inList) {
      out.push("</ul>");
      inList = false;
    }
    if (!line.trim()) {
      out.push("<br />");
      return;
    }
    const inline = line.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/_(.+?)_/g, "<em>$1</em>");
    out.push(`<p>${inline}</p>`);
  });
  if (inList) out.push("</ul>");
  return out.join("");
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
  title.className = "whitespace-pre-line text-base font-bold text-slate-900";
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
    const dateWrap = document.createElement("div");
    dateWrap.className = "mt-1";
    dateWrap.appendChild(pill);
    body.appendChild(dateWrap);
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
      "mt-2 flex w-full items-center justify-center gap-2 rounded-md bg-[#991B1B]/90 px-3 py-2 text-sm font-semibold text-white shadow-sm shadow-black/10 backdrop-blur hover:bg-[#7F1D1D]";
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

function smoothLine(coords: [number, number][], segments = 6, maxPoints = 1200) {
  if (coords.length < 3) return coords;
  const totalSegments = (coords.length - 1) * segments + 1;
  const safeSegments =
    totalSegments > maxPoints ? Math.max(1, Math.floor((maxPoints - 1) / (coords.length - 1))) : segments;
  const out: [number, number][] = [];
  for (let i = 0; i < coords.length - 1; i += 1) {
    const p0 = coords[i - 1] || coords[i];
    const p1 = coords[i];
    const p2 = coords[i + 1];
    const p3 = coords[i + 2] || coords[i + 1];
    for (let j = 0; j < safeSegments; j += 1) {
      const t = j / safeSegments;
      const t2 = t * t;
      const t3 = t2 * t;
      const x =
        0.5 *
        (2 * p1[0] +
          (-p0[0] + p2[0]) * t +
          (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 +
          (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3);
      const y =
        0.5 *
        (2 * p1[1] +
          (-p0[1] + p2[1]) * t +
          (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 +
          (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3);
      out.push([x, y]);
    }
  }
  out.push(coords[coords.length - 1]);
  return out;
}

function haversineMeters(a: [number, number], b: [number, number]) {
  const R = 6371000;
  const toRad = (v: number) => (v * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * R * Math.asin(Math.sqrt(h));
}

function lineDistanceMeters(coords: [number, number][]) {
  let sum = 0;
  for (let i = 1; i < coords.length; i += 1) {
    sum += haversineMeters(coords[i - 1], coords[i]);
  }
  return sum;
}

function buildPartialLineByDistance(coords: [number, number][], distanceMeters: number) {
  if (coords.length === 0) return coords;
  if (distanceMeters <= 0) return [coords[0]];
  const out: [number, number][] = [coords[0]];
  let travelled = 0;
  for (let i = 1; i < coords.length; i += 1) {
    const prev = coords[i - 1];
    const cur = coords[i];
    const segDist = haversineMeters(prev, cur);
    if (travelled + segDist >= distanceMeters) {
      const remain = distanceMeters - travelled;
      const t = segDist > 0 ? remain / segDist : 0;
      out.push([prev[0] + (cur[0] - prev[0]) * t, prev[1] + (cur[1] - prev[1]) * t]);
      return out;
    }
    travelled += segDist;
    out.push(cur);
  }
  return out;
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
  const animHeadMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const detailAudioRef = useRef<HTMLAudioElement | null>(null);
  const activePopupRef = useRef<mapboxgl.Popup | null>(null);

  const [mapLoaded, setMapLoaded] = useState(false);
  const [activePlaceId, setActivePlaceId] = useState<string | null>(null);
  const [stepIndex, setStepIndex] = useState<number>(0);
  const [projectionMode, setProjectionMode] = useState<"globe" | "mercator">("globe");
  const [showMenu, setShowMenu] = useState<boolean>(true);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [detailPlace, setDetailPlace] = useState<Place | null>(null);
  const [activeTab, setActiveTab] = useState<"places" | "journey" | "quiz">("journey");
  const [hasStarted, setHasStarted] = useState(false);
  const [countryQuery, setCountryQuery] = useState("");
  const [hoveredTab, setHoveredTab] = useState<"places" | "journey" | "quiz" | null>(null);
  const [quizSets, setQuizSets] = useState<QuizQuestion[][]>([]);
  const [quizAnswersBySet, setQuizAnswersBySet] = useState<Record<number, Record<string, number>>>({});
  const [quizSubmittedBySet, setQuizSubmittedBySet] = useState<Record<number, boolean>>({});
  const [quizScoreBySet, setQuizScoreBySet] = useState<Record<number, number>>({});
  const [activeQuizIndex, setActiveQuizIndex] = useState(-1);
  const [reachedStepIndex, setReachedStepIndex] = useState(0);
  const [isAutoPlay, setIsAutoPlay] = useState(false);
  const [showAutoOptions, setShowAutoOptions] = useState(false);
  const [autoSpeed, setAutoSpeed] = useState<"auto" | "x2" | "x4" | "custom">("auto");
  const [customSpeedFactor, setCustomSpeedFactor] = useState(1);
  const [viewportWidth, setViewportWidth] = useState<number>(0);
  const [activeStory, setActiveStory] = useState<{
    title?: string;
    body?: string;
    imageUrl?: string;
    imageLabel?: string;
  } | null>(null);
  const placeSectionRef = useRef<HTMLDivElement | null>(null);
  const journeySectionRef = useRef<HTMLDivElement | null>(null);
  const autoNextTimeoutRef = useRef<number | null>(null);
  const isAutoPlayRef = useRef(false);
  const lastAnimDurationRef = useRef(0);
  const stepIndexRef = useRef(0);
  const autoPlayTokenRef = useRef(0);

  useEffect(() => {
    const updateWidth = () => setViewportWidth(window.innerWidth || 0);
    updateWidth();
    window.addEventListener("resize", updateWidth);
    return () => window.removeEventListener("resize", updateWidth);
  }, []);

  const getSidebarWidth = (maxWidth: number) => {
    if (!viewportWidth) return maxWidth;
    if (viewportWidth >= 1024) return maxWidth;
    if (viewportWidth >= 768) return Math.min(viewportWidth * 0.6, maxWidth);
    if (viewportWidth >= 640) return Math.min(viewportWidth * 0.75, maxWidth);
    return Math.min(viewportWidth * 0.9, maxWidth);
  };

  const leftSidebarWidth = showMenu ? getSidebarWidth(360) : 0;
  const rightSidebarWidth = detailPlace ? getSidebarWidth(360) : 0;

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

  const filteredPlaces = useMemo(() => {
    const query = countryQuery.trim().toLowerCase();
    if (!query) return sortedPlaces;
    return sortedPlaces.filter((place) => (place.country || "").toLowerCase().includes(query));
  }, [sortedPlaces, countryQuery]);

  const quizBank = useMemo(() => {
    return (quizData as QuizQuestion[])
      .filter((q) => q && q.id && Array.isArray(q.options))
      .map((q) => {
        const rawIndex = Number(q.answerIndex);
        if (!Number.isFinite(rawIndex)) return q;
        const maxIndex = Math.max(0, q.options.length - 1);
        const normalized = Math.max(0, Math.min(maxIndex, rawIndex - 1));
        return { ...q, answerIndex: normalized };
      });
  }, []);

  const generateQuizSet = () => {
    const nextSets = Array.from({ length: 10 }, () => pickRandomItems(quizBank, 10).map(shuffleQuizOptions));
    setQuizSets(nextSets);
    setQuizAnswersBySet({});
    setQuizSubmittedBySet({});
    setQuizScoreBySet({});
    setActiveQuizIndex(-1);
  };

  useEffect(() => {
    if (activeTab === "quiz") {
      generateQuizSet();
    }
  }, [activeTab, quizBank]);

  const handleQuizAnswer = (id: string, optionIndex: number) => {
    if (activeQuizIndex < 0) return;
    if (quizSubmittedBySet[activeQuizIndex]) return;
    setQuizAnswersBySet((prev) => ({
      ...prev,
      [activeQuizIndex]: { ...(prev[activeQuizIndex] ?? {}), [id]: optionIndex },
    }));
  };

  const handleQuizSubmit = () => {
    if (activeQuizIndex < 0) return;
    if (quizSubmittedBySet[activeQuizIndex]) return;
    const answers = quizAnswersBySet[activeQuizIndex] ?? {};
    const score = displayQuizQuestions.reduce((sum, question) => {
      return sum + (answers[question.id] === question.answerIndex ? 1 : 0);
    }, 0);
    setQuizScoreBySet((prev) => ({ ...prev, [activeQuizIndex]: score }));
    setQuizSubmittedBySet((prev) => ({ ...prev, [activeQuizIndex]: true }));
  };

  const handleQuizNext = () => {
    if (activeQuizIndex < quizSets.length - 1) {
      setActiveQuizIndex((prev) => Math.min(prev + 1, quizSets.length - 1));
      return;
    }
    generateQuizSet();
  };

  const stopAutoPlay = () => {
    isAutoPlayRef.current = false;
    setIsAutoPlay(false);
    setShowAutoOptions(false);
    autoPlayTokenRef.current += 1;
    if (autoNextTimeoutRef.current !== null) {
      window.clearTimeout(autoNextTimeoutRef.current);
      autoNextTimeoutRef.current = null;
    }
  };

  const handleAutoToggle = () => {
    if (isAutoPlay) {
      stopAutoPlay();
      return;
    }
    autoPlayTokenRef.current += 1;
    isAutoPlayRef.current = true;
    setIsAutoPlay(true);
    setShowAutoOptions(true);
    if (!hasStarted) {
      handleStartJourney();
      return;
    }
    if (currentStep < sortedPlaces.length - 1) {
      setStep(currentStep + 1);
    }
  };

  const sidebarSections = [
    { key: "journey", label: "H\u00e0nh tr\u00ecnh", icon: "Orion_direction.svg", ref: journeySectionRef },
    { key: "places", label: "\u0110\u1ecba \u0111i\u1ec3m", icon: "Orion_geotag-pin.svg", ref: placeSectionRef },
    { key: "quiz", label: "Tr\u1eafc nghi\u1ec7m", icon: "/question.svg" },
  ] as const;

  const visibleTab = hoveredTab ?? activeTab;
  const activeSection = sidebarSections.find((section) => section.key === visibleTab);
  const sidebarMeta = visibleTab === "quiz" ? `${quizSets.length} b\u1ed9` : `${sortedPlaces.length} \u0111i\u1ec3m`;
  const sidebarHint =
    visibleTab === "quiz"
      ? "Ch\u1ecdn \u0111\u00e1p \u00e1n r\u1ed3i b\u1ea5m Ch\u1ea5m \u0111i\u1ec3m."
      : visibleTab === "places"
        ? "Danh s\u00e1ch \u0111\u1ecba \u0111i\u1ec3m theo h\u00e0nh tr\u00ecnh."
        : "Theo d\u00f5i h\u00e0nh tr\u00ecnh theo th\u1eddi gian.";
  const activeQuizSet = activeQuizIndex >= 0 ? quizSets[activeQuizIndex] : [];
  const displayQuizQuestions = activeQuizSet ?? [];
  const activeQuizAnswers = quizAnswersBySet[activeQuizIndex] ?? {};
  const quizSubmitted = quizSubmittedBySet[activeQuizIndex] ?? false;
  const quizScore = quizScoreBySet[activeQuizIndex] ?? null;
  const quizAnsweredCount = displayQuizQuestions.reduce(
    (count, question) => (activeQuizAnswers[question.id] !== undefined ? count + 1 : count),
    0,
  );

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
      const converted = needConvert ? coords.map(([x, y]) => toLngLat(x, y)) : coords;
      const smoothed = smoothLine(converted);
      return {
        ...f,
        geometry: { ...f.geometry, coordinates: smoothed },
      } as RouteFeature;
    });
  }, []);

  const routeByPairRef = useRef<Map<string, RouteFeature>>(new Map());
  const maxOrderRef = useRef<number>(0);
  const initialCenterRef = useRef<[number, number] | null>(null);
  const completedSegmentsRef = useRef<Set<string>>(new Set());

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
  const autoSpeedFactor = useMemo(() => {
    if (autoSpeed === "x2") return 2;
    if (autoSpeed === "x4") return 4;
    if (autoSpeed === "custom") return Math.max(0.25, Math.min(6, customSpeedFactor || 1));
    return 1;
  }, [autoSpeed, customSpeedFactor]);
  const visiblePlaces = useMemo(() => {
    if (!hasStarted) return sortedPlaces;
    return sortedPlaces.slice(0, Math.min(sortedPlaces.length, reachedStepIndex + 1));
  }, [sortedPlaces, hasStarted, reachedStepIndex]);
  const visibleCountryCodes = useMemo(() => collectCountryCodes(visiblePlaces), [visiblePlaces]);
  const fallbackCenter: [number, number] = useMemo(() => {
    return sortedPlaces[0]?.coords || [105.8342, 21.0278];
  }, [sortedPlaces]);

  const getAutoDuration = (distanceMeters: number) => {
    const baseSpeedMps = 700000;
    const speedFactor = isAutoPlayRef.current ? autoSpeedFactor : 1;
    const speedMps = baseSpeedMps * speedFactor;
    const minDuration = 1200 / speedFactor;
    return Math.max(minDuration, (Math.max(0, distanceMeters) / speedMps) * 1000);
  };

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

  const setRoutesBaseData = (features: RouteFeature[]) => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    const source = map.getSource("routes") as mapboxgl.GeoJSONSource | undefined;
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

  const setAnimHeadData = (coords: [number, number] | null, mode?: string) => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    if (!coords) {
      if (animHeadMarkerRef.current) {
        animHeadMarkerRef.current.remove();
        animHeadMarkerRef.current = null;
      }
      return;
    }
    if (mode === "land") {
      if (animHeadMarkerRef.current) {
        animHeadMarkerRef.current.remove();
        animHeadMarkerRef.current = null;
      }
      return;
    }
    const iconSrc = mode === "train" ? "/train.svg" : "/vessels.svg";
    if (!animHeadMarkerRef.current) {
      const el = document.createElement("div");
      el.className = "route-anim-head";
      const img = document.createElement("img");
      img.src = iconSrc;
      img.alt = mode ? `${mode} vehicle` : "vehicle";
      img.className = "h-12 w-12";
      el.appendChild(img);
      animHeadMarkerRef.current = new mapboxgl.Marker({ element: el, anchor: "center" })
        .setLngLat(coords)
        .addTo(map);
      return;
    }
    const markerEl = animHeadMarkerRef.current.getElement();
    const markerImg = markerEl.querySelector("img");
    if (markerImg && markerImg.getAttribute("src") !== iconSrc) {
      markerImg.setAttribute("src", iconSrc);
      markerImg.setAttribute("alt", mode ? `${mode} vehicle` : "vehicle");
    }
    animHeadMarkerRef.current.setLngLat(coords);
  };

  const animateSegment = (feature: RouteFeature | undefined, mode?: string, onComplete?: () => void) => {
    if (!feature || feature.geometry.type !== "LineString") {
      setRoutesAnimData(EMPTY_FC);
      setAnimHeadData(null);
      lastAnimDurationRef.current = 1200;
      return;
    }
    const coords = feature.geometry.coordinates as [number, number][];
    if (coords.length < 2) {
      setRoutesAnimData(EMPTY_FC);
      setAnimHeadData(null);
      lastAnimDurationRef.current = 1200;
      return;
    }

    if (animationRef.current !== null) {
      cancelAnimationFrame(animationRef.current);
    }

    const distance = lineDistanceMeters(coords);
    const duration = getAutoDuration(distance);
    lastAnimDurationRef.current = duration;
    const totalDistance = Math.max(0, distance);
    let start: number | null = null;

    const tick = (now: number) => {
      if (start === null) start = now;
      const t = Math.min(1, (now - start) / duration);
      const targetDistance = totalDistance * t;
      let lineCoords = buildPartialLineByDistance(coords, targetDistance);
      if (lineCoords.length < 2 && coords.length >= 2) {
        const start = coords[0];
        const next = coords[1];
        const tinyT = 0.001;
        lineCoords = [start, [start[0] + (next[0] - start[0]) * tinyT, start[1] + (next[1] - start[1]) * tinyT]];
      }
      const line = buildLineFeature(lineCoords);
      setRoutesAnimData(
        line
          ? ({ type: "FeatureCollection", features: [line] } as GeoJSON.FeatureCollection<GeoJSON.LineString>)
          : EMPTY_FC,
      );
      const headCoords = targetDistance <= 0 ? coords[0] : lineCoords[lineCoords.length - 1];
      setAnimHeadData(headCoords || null, mode);
      if (t < 1) {
        animationRef.current = requestAnimationFrame(tick);
      } else {
        animationRef.current = null;
        if (onComplete) onComplete();
      }
    };

    animationRef.current = requestAnimationFrame(tick);
  };

  const segmentKeyForFeature = (feature: RouteFeature, idx: number) => {
    const props = feature.properties;
    if (props?.fromSlug && props?.toSlug) return `${props.fromSlug}->${props.toSlug}`;
    return `feature-${idx}`;
  };

  const buildProgressFeatures = (keys?: Set<string>) => {
    if (!keys || keys.size === 0) return [];
    return routeFeatures.filter((f, idx) => keys.has(segmentKeyForFeature(f, idx)));
  };

  const markProgressUpTo = (targetIndex: number, forceStarted = false) => {
    if (sortedPlaces.length < 2) return;
    const maxIndex = Math.max(0, Math.min(targetIndex, sortedPlaces.length - 1));
    for (let i = 0; i < maxIndex; i += 1) {
      const from = sortedPlaces[i];
      const to = sortedPlaces[i + 1];
      if (!from?.slug || !to?.slug) continue;
      const segKey = `${from.slug}->${to.slug}`;
      const segFeature = routeByPairRef.current.get(segKey);
      if (!segFeature) continue;
      const featureIndex = routeFeatures.indexOf(segFeature);
      if (featureIndex < 0) continue;
      const progressKey = segmentKeyForFeature(segFeature, featureIndex);
      completedSegmentsRef.current.add(progressKey);
    }
    const progressFeatures = buildProgressFeatures(completedSegmentsRef.current);
    setRoutesProgressData(progressFeatures);
    const showProgress = hasStarted || forceStarted;
    const baseFeatures = showProgress ? progressFeatures : routeFeatures;
    setRoutesBaseData(baseFeatures);
    if (showProgress) {
      setReachedStepIndex((prev) => Math.max(prev, maxIndex));
    }
  };

  const applyStep = (nextIndex: number, prevIndex?: number, options?: { animate?: boolean; forceZoom?: boolean }) => {
    const animate = options?.animate !== false;
    const forceZoom = options?.forceZoom === true;
    if (sortedPlaces.length === 0) return;
    const clamped = Math.max(0, Math.min(nextIndex, sortedPlaces.length - 1));
    const place = sortedPlaces[clamped];
    const key = place.id || place.slug || `place-${clamped}`;

    setActivePlaceId(key);

    const map = mapRef.current;
    const showPopup = () => {
      if (!mapRef.current) return;
      if (activePopupRef.current) {
        activePopupRef.current.remove();
        activePopupRef.current = null;
      }
      const entry = markerMapRef.current[key];
      if (entry) {
        entry.popup.setDOMContent(buildPopupContent(entry.place, () => setDetailPlace(entry.place)));
        entry.popup.setLngLat(entry.place.coords).addTo(mapRef.current);
        activePopupRef.current = entry.popup;
      } else {
        const popup = new mapboxgl.Popup({ offset: 12, closeButton: true, className: "popup-clean" }).setDOMContent(
          buildPopupContent(place, () => setDetailPlace(place)),
        );
        popup.setLngLat(place.coords).addTo(mapRef.current);
        activePopupRef.current = popup;
      }
      setDetailPlace(place);
    };

    let arrivalCallback: (() => void) | null = null;

    if (map) {
      Object.values(markerMapRef.current).forEach(({ popup }) => popup.remove());
      if (activePopupRef.current) {
        activePopupRef.current.remove();
        activePopupRef.current = null;
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
        map.off("moveend", moveEndHandlerRef.current);
        moveEndHandlerRef.current = null;
      }

      if (autoNextTimeoutRef.current !== null) {
        window.clearTimeout(autoNextTimeoutRef.current);
        autoNextTimeoutRef.current = null;
      }

      if (animate) {
        const targetCenter = place.coords;
        const fromCenter =
          prevIndex !== undefined && prevIndex >= 0 && sortedPlaces[prevIndex]?.coords
            ? sortedPlaces[prevIndex].coords
            : (map.getCenter().toArray() as [number, number]);
        const sameCenter = isSameCoord(fromCenter, targetCenter);
        const finalZoom = 6;
        const zoomInDuration = 950;
        if (sameCenter) {
          if (forceZoom) {
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
          } else {
            showPopup();
          }
        } else {
        const distance = haversineMeters(fromCenter, targetCenter);
        const midCenter: [number, number] = [
          (fromCenter[0] + targetCenter[0]) / 2,
          (fromCenter[1] + targetCenter[1]) / 2,
        ];
        const baseZoom = map.getZoom();
        const distanceKm = distance / 1000;
        let targetZoomOut = 5.8;
        if (distanceKm > 50) targetZoomOut = 5.2;
        if (distanceKm > 200) targetZoomOut = 4.5;
        if (distanceKm > 800) targetZoomOut = 3.8;
        if (distanceKm > 2000) targetZoomOut = 3.2;
        if (distanceKm > 4000) targetZoomOut = 2.6;
        const zoomOut = Math.max(2.2, Math.min(targetZoomOut, baseZoom - 0.4));
        const moveZoom = zoomOut;
        const zoomOutDuration = 1200;
        const moveDuration = 1400;

        map.stop();
        // Step 1: zoom out ngay tại điểm cũ để người dùng thấy thu nhỏ
        map.easeTo({ center: fromCenter, zoom: zoomOut, duration: zoomOutDuration, essential: true });

        // Step 2: di chuyển ở mức zoomOut qua midpoint tới điểm mới
        moveTimeoutRef.current = window.setTimeout(() => {
          map.easeTo({ center: midCenter, zoom: moveZoom, duration: moveDuration, essential: true });
          moveTimeoutRef.current = null;

        }, zoomOutDuration + 60);

        arrivalCallback = () => {
          const handler = () => {
            showPopup();
            if (moveEndHandlerRef.current) {
              map.off("moveend", moveEndHandlerRef.current);
              moveEndHandlerRef.current = null;
            }
          };
          moveEndHandlerRef.current = handler;
          map.once("moveend", handler);
          if (zoomInTimeoutRef.current !== null) {
            window.clearTimeout(zoomInTimeoutRef.current);
          }
          zoomInTimeoutRef.current = window.setTimeout(() => {
            map.easeTo({ center: targetCenter, zoom: finalZoom, duration: zoomInDuration, essential: true });
            zoomInTimeoutRef.current = null;
          }, 80);
        };
        }
      } else {
        // Không animate: không tự zoom/popup khi mới tới trang
        animateSegment(undefined);
        return;
      }
    }

    const clearAutoNextTimeout = () => {
      if (autoNextTimeoutRef.current !== null) {
        window.clearTimeout(autoNextTimeoutRef.current);
        autoNextTimeoutRef.current = null;
      }
    };

    const scheduleAutoNext = (nextIndex: number) => {
      if (!isAutoPlayRef.current) return;
      if (nextIndex > sortedPlaces.length - 1) {
        setIsAutoPlay(false);
        setShowAutoOptions(false);
        return;
      }
      if (nextIndex <= stepIndexRef.current) return;
      clearAutoNextTimeout();
      const token = autoPlayTokenRef.current;
      const delayMs = Math.max(800, Math.min(3500, lastAnimDurationRef.current + 250));
      autoNextTimeoutRef.current = window.setTimeout(() => {
        if (autoPlayTokenRef.current !== token) return;
        setStep(nextIndex);
      }, delayMs);
    };

    const commitProgress = (segmentKey?: string) => {
      if (segmentKey) {
        completedSegmentsRef.current.add(segmentKey);
      }
      const progressFeatures = buildProgressFeatures(completedSegmentsRef.current);
      setRoutesProgressData(progressFeatures);
      const baseFeatures = hasStarted ? progressFeatures : routeFeatures;
      setRoutesBaseData(baseFeatures);
      if (hasStarted) {
        setReachedStepIndex((prev) => Math.max(prev, clamped));
      }
    };

    if (prevIndex !== undefined && prevIndex >= 0 && clamped !== prevIndex) {
      const from = sortedPlaces[prevIndex];
      const to = place;
      const segKey = from.slug && to.slug ? `${from.slug}->${to.slug}` : undefined;
      const segFeature = segKey ? routeByPairRef.current.get(segKey) : undefined;
      const featureIndex = segFeature ? routeFeatures.indexOf(segFeature) : -1;
      const progressKey = segFeature ? segmentKeyForFeature(segFeature, featureIndex) : undefined;
      const segMode = segFeature?.properties?.mode;
      if (animate && segFeature) {
        animateSegment(segFeature, segMode, () => {
          commitProgress(progressKey);
          if (arrivalCallback) arrivalCallback();
          scheduleAutoNext(clamped + 1);
        });
      } else if (animate && isAutoPlayRef.current && prevIndex !== undefined) {
        const fallbackDistance =
          from.coords && place.coords ? haversineMeters(from.coords as [number, number], place.coords as [number, number]) : 0;
        lastAnimDurationRef.current = getAutoDuration(fallbackDistance);
        animateSegment(undefined);
        commitProgress(progressKey);
        if (arrivalCallback) arrivalCallback();
        scheduleAutoNext(clamped + 1);
      } else if (animate) {
        const fallbackDistance =
          from.coords && place.coords ? haversineMeters(from.coords as [number, number], place.coords as [number, number]) : 0;
        lastAnimDurationRef.current = getAutoDuration(fallbackDistance);
        animateSegment(undefined);
        commitProgress(progressKey);
        if (arrivalCallback) arrivalCallback();
      } else {
        commitProgress(progressKey);
      }
    } else if (animate) {
      lastAnimDurationRef.current = getAutoDuration(0);
      animateSegment(undefined);
      commitProgress();
    } else {
      commitProgress();
    }
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
    if (!hasStarted) {
      setHasStarted(true);
    }
    if (clamped > prev + 1) {
      markProgressUpTo(clamped, true);
    }
    if (clamped !== stepIndex) {
      setStepIndex(clamped);
    }
    if (clamped === stepIndex) {
      return;
    }
    applyStep(clamped, prev);
  };

  const handleStartJourney = () => {
    setHasStarted(true);
    if (sortedPlaces.length === 0) return;
    setStepIndex(0);
    setReachedStepIndex(0);
    applyStep(0, undefined, { animate: true, forceZoom: true });
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

      if (!map.getSource("country-boundaries")) {
        const layers = map.getStyle()?.layers || [];
        const hillshadeLayer = layers.find((layer) => layer.type === "hillshade");
        const symbolLayer = layers.find((layer) => layer.type === "symbol");
        const beforeId = hillshadeLayer?.id || symbolLayer?.id;
        map.addSource("country-boundaries", {
          type: "vector",
          url: "mapbox://mapbox.country-boundaries-v1",
        });
        map.addLayer({
          id: "countries-mono",
          type: "fill",
          source: "country-boundaries",
          "source-layer": "country_boundaries",
          paint: {
            "fill-color": "#e2e8f0",
            "fill-opacity": 1,
            "fill-outline-color": "#cbd5f5",
          },
        }, beforeId);
        map.addLayer({
          id: "countries-highlight",
          type: "fill",
          source: "country-boundaries",
          "source-layer": "country_boundaries",
          paint: {
            "fill-color": "#f59e0b",
            "fill-opacity": 0.6,
          },
          filter: ["in", ["get", "iso_3166_1_alpha_3"], ["literal", visibleCountryCodes]],
        }, beforeId);
      }

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
          paint: {
            "line-width": 4,
            "line-color": "#a13031",
          },
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
        [
          "routes-anim-line",
          "routes-progress-line",
          "routes-base",
          "vn-islands-labels",
          "countries-highlight",
          "countries-mono",
        ].forEach((layerId) => {
          if (activeMap.getLayer(layerId)) activeMap.removeLayer(layerId);
        });
        ["route-nodes", "routes-anim", "routes-progress", "routes", "vn-islands", "country-boundaries"].forEach(
          (sourceId) => {
          if (activeMap.getSource(sourceId)) activeMap.removeSource(sourceId);
        },
        );
        if (animHeadMarkerRef.current) {
          animHeadMarkerRef.current.remove();
          animHeadMarkerRef.current = null;
        }
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

  useEffect(() => {
    stepIndexRef.current = stepIndex;
  }, [stepIndex]);

  useEffect(() => {
    const audio = detailAudioRef.current;
    if (!audio) return;
    const src = (detailPlace as any)?.media?.audio;
    if (!detailPlace || !src) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      return;
    }
    if (audio.src !== src) {
      audio.src = src;
    }
    audio.currentTime = 0;
    const playPromise = audio.play();
    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch(() => {
        // Autoplay can be blocked by the browser; ignore silently.
      });
    }
  }, [detailPlace]);

  useEffect(() => {
    isAutoPlayRef.current = isAutoPlay;
    if (!isAutoPlay && autoNextTimeoutRef.current !== null) {
      window.clearTimeout(autoNextTimeoutRef.current);
      autoNextTimeoutRef.current = null;
    }
  }, [isAutoPlay]);

  useEffect(() => {
    return () => {
      if (autoNextTimeoutRef.current !== null) {
        window.clearTimeout(autoNextTimeoutRef.current);
        autoNextTimeoutRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    autoPlayTokenRef.current += 1;
  }, [isAutoPlay]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    if (!map.getLayer("countries-highlight")) return;
    const visibility = hasStarted ? "visible" : "none";
    map.setLayoutProperty("countries-highlight", "visibility", visibility);
    map.setLayoutProperty("countries-mono", "visibility", visibility);
    if (!hasStarted) {
      return;
    }
    const filter =
      visibleCountryCodes.length > 0
        ? (["in", ["get", "iso_3166_1_alpha_3"], ["literal", visibleCountryCodes]] as any)
        : (["==", ["get", "iso_3166_1_alpha_3"], ""] as any);
    map.setFilter("countries-highlight", filter);
  }, [mapLoaded, visibleCountryCodes, hasStarted]);

  useEffect(() => {
    if (!mapLoaded) return;
    const progressFeatures = buildProgressFeatures(completedSegmentsRef.current);
    const baseFeatures = hasStarted ? progressFeatures : routeFeatures;
    setRoutesBaseData(baseFeatures);
  }, [mapLoaded, hasStarted, routeFeatures]);

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

    visiblePlaces.forEach((place, index) => {
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
      nodeSource.setData(buildPointCollection(visiblePlaces));
    }
  }, [visiblePlaces]);

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
            className={`pointer-events-auto absolute left-3 top-14 z-20 h-[83vh] transform overflow-hidden rounded-2xl border border-white/30 bg-white/55 shadow-2xl ring-1 ring-white/20 backdrop-blur-xl transition-transform duration-300 ${
              showMenu ? "translate-x-0" : "-translate-x-[110%]"
            }`}
            style={{ width: leftSidebarWidth ? `${leftSidebarWidth}px` : undefined }}
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
                              className="h-5 w-5 object-contain opacity-90 filter brightness-0 invert"
                            />
                          ) : null}
                        </div>
                        <div>
                          <p className="text-lg font-semibold uppercase tracking-wide">
                            {activeSection?.label || "Danh m\u1ee5c"}
                          </p>
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
                        {quizSets.length === 0 ? (
                          <p className="rounded-xl border border-white/40 bg-white/70 px-3 py-4 text-sm text-slate-600">{"Ch\u01b0a c\u00f3 c\u00e2u h\u1ecfi tr\u1eafc nghi\u1ec7m. H\u00e3y th\u00eam c\u00e2u h\u1ecfi v\u00e0o src/data/quiz.json."}</p>
                        ) : (
                          <div className="space-y-3">
                            <div className="rounded-xl border border-white/40 bg-white/70 p-3 shadow-sm">
                              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                {"B\u1ed9 c\u00e2u h\u1ecfi"}
                              </p>
                              <div className="mt-2 space-y-2">
                                {quizSets.map((setQuestions, index) => {
                                  const isActive = index === activeQuizIndex;
                                  const isDone = quizSubmittedBySet[index] === true;
                                  return (
                                    <div key={`quiz-set-${index}`} className="rounded-lg">
                                      <button
                                        type="button"
                                        onClick={() => setActiveQuizIndex(index)}
                                        className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition ${
                                          isActive
                                            ? "border-[#991B1B]/50 bg-[#991B1B]/10 text-[#991B1B]"
                                            : isDone
                                              ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                                              : "border-white/60 bg-white/80 text-slate-700 hover:bg-white"
                                        }`}
                                      >
                                        <div className="flex items-center justify-between gap-2">
                                          <p className="text-xs font-semibold">{`B\u00e0i ${index + 1}`}</p>
                                          {isDone ? (
                                            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                                              {"\u0110\u00e3 l\u00e0m"}
                                            </span>
                                          ) : null}
                                        </div>
                                      </button>
                                      {isActive ? (
                                        <div className="mt-2 space-y-3 rounded-lg border border-white/50 bg-white/70 p-3 shadow-sm">
                                          {setQuestions.map((question, qIndex) => {
                                            const selectedIndex = activeQuizAnswers[question.id];
                                            const isCorrect = selectedIndex === question.answerIndex;
                                            return (
                                              <div key={question.id} className="rounded-xl border border-white/40 bg-white/70 p-3 shadow-sm">
                                                <p className="text-sm font-semibold text-slate-900">{`${qIndex + 1}. ${question.question}`}</p>
                                                <div className="mt-2 space-y-2">
                                                  {question.options.map((option, optionIndex) => {
                                                    const isSelected = selectedIndex === optionIndex;
                                                    const showCorrect = quizSubmitted && question.answerIndex === optionIndex;
                                                    const showWrong =
                                                      quizSubmitted && isSelected && question.answerIndex !== optionIndex;
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
                                                    {selectedIndex === undefined
                                                      ? "Ch\u01b0a ch\u1ecdn \u0111\u00e1p \u00e1n"
                                                      : isCorrect
                                                        ? "\u0110\u00fang"
                                                        : "Sai"}
                                                  </p>
                                                ) : null}
                                              </div>
                                            );
                                          })}
                                          <div className="flex flex-wrap items-center justify-between gap-2">
                                            <p className="text-xs font-semibold text-slate-600">
                                              {"\u0110\u00e3 ch\u1ecdn "}
                                              {quizAnsweredCount}/{displayQuizQuestions.length}
                                              {" c\u00e2u"}
                                            </p>
                                            <div className="flex items-center gap-2">
                                              <button
                                                type="button"
                                                onClick={handleQuizSubmit}
                                                disabled={displayQuizQuestions.length === 0}
                                                className="rounded-md border border-[#991B1B]/30 bg-[#991B1B] px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-[#7F1D1D] disabled:cursor-not-allowed disabled:opacity-50"
                                              >
                                                {"Ch\u1ea5m \u0111i\u1ec3m"}
                                              </button>
                                              <button
                                                type="button"
                                                onClick={handleQuizNext}
                                                disabled={displayQuizQuestions.length === 0}
                                                className="rounded-md border border-white/60 bg-white/80 px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
                                              >
                                                {"K\u1ebf ti\u1ebfp"}
                                              </button>
                                            </div>
                                          </div>
                                          {quizSubmitted ? (
                                            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800">
                                              {"K\u1ebft qu\u1ea3: "}
                                              {quizScore ?? 0}/{displayQuizQuestions.length}
                                            </div>
                                          ) : null}
                                        </div>
                                      ) : null}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        )}

                        {activeQuizIndex < 0 ? (
                          <p className="rounded-xl border border-white/40 bg-white/70 px-3 py-3 text-sm text-slate-600">
                            {"Ch\u1ecdn m\u1ed9t b\u00e0i \u0111\u1ec3 b\u1eaft \u0111\u1ea7u."}
                          </p>
                        ) : null}
                      </div>
                    ) : sortedPlaces.length === 0 ? (
                      <p className="p-4 text-sm text-slate-600">{"Ch\u01b0a c\u00f3 d\u1eef li\u1ec7u. Th\u00eam JSON v\u00e0o src/data/places.json."}</p>
                    ) : visibleTab === "places" ? (
                      <div className="space-y-4 px-2 py-3">
                        <div ref={placeSectionRef}>
                          <p className="px-2 text-xs font-semibold uppercase tracking-wide text-[#991B1B]">{"\u0110\u1ecba \u0111i\u1ec3m"}</p>
                          <div className="mt-2 px-2">
                            <input
                              type="text"
                              value={countryQuery}
                              onChange={(e) => setCountryQuery(e.target.value)}
                              placeholder="Ví dụ: Việt Nam"
                              className="w-full rounded-lg border border-white/60 bg-white/80 px-3 py-2 text-sm text-slate-700 shadow-sm backdrop-blur placeholder:text-slate-500 focus:border-[#991B1B]/50 focus:outline-none"
                            />
                          </div>
                          <div className="mt-2 divide-y divide-white/30 rounded-xl border border-white/30 bg-white/50 shadow-lg ring-1 ring-white/20 backdrop-blur-xl">
                            {filteredPlaces.length === 0 ? (
                              <div className="px-4 py-4 text-sm text-slate-600">
                                Không có địa điểm phù hợp.
                              </div>
                            ) : (
                              filteredPlaces.map((place, index) => {
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
                                      <p className="whitespace-pre-line text-sm font-semibold text-slate-900">
                                        {place.title}
                                      </p>
                                      <p className="text-xs text-slate-600">
                                        {[place.city, place.country].filter(Boolean).join(", ") || "\u0110\u1ecba \u0111i\u1ec3m"}
                                      </p>
                                    </div>
                                  </div>
                                </div>
                              );
                            })
                            )}
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
                                      <p className="whitespace-pre-line text-sm font-semibold text-slate-900">
                                        {place.title}
                                      </p>
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

          {activeTab === "journey" ? (
            <div
              className="pointer-events-auto absolute bottom-4 flex justify-center px-4"
              style={{
                left: leftSidebarWidth ? leftSidebarWidth + 12 : 12,
                right: rightSidebarWidth ? rightSidebarWidth + 12 : 12,
              }}
            >
              <div className="flex w-full max-w-5xl flex-col gap-2 rounded-2xl border border-white/40 bg-white/70 p-3 shadow-2xl backdrop-blur">
                <div className="flex flex-wrap items-center gap-3">
                  {hasStarted ? (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          stopAutoPlay();
                          setStep(currentStep - 1);
                        }}
                        disabled={currentStep <= 0}
                        className="rounded-md border border-white/50 bg-white/60 px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm backdrop-blur disabled:opacity-50"
                      >
                        {"Tr\u01b0\u1edbc"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          stopAutoPlay();
                          setStep(currentStep + 1);
                        }}
                        disabled={currentStep >= sortedPlaces.length - 1}
                        className="rounded-md border border-white/50 bg-white/60 px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm backdrop-blur disabled:opacity-50"
                      >
                        Sau
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={handleStartJourney}
                      className="rounded-md bg-[#991B1B] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#7F1D1D]"
                    >
                      {"B\u1eaft \u0111\u1ea7u"}
                    </button>
                  )}
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
                  <span className="text-slate-500">{"D\u00f2ng th\u1eddi gian"}</span>
                  <span className="text-center text-[13px]">
                    {currentPlace
                      ? `${currentPlace.periodLabel || "\u0110\u1ecba \u0111i\u1ec3m"} - ${currentPlace.title}`
                      : "Ch\u01b0a c\u00f3 d\u1eef li\u1ec7u"}
                  </span>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {/* Detail sidebar */}
        {detailPlace ? (
          <div
            className="pointer-events-auto absolute right-3 top-14 z-30 flex h-[83vh] max-w-full flex-col overflow-hidden rounded-2xl border border-white/30 bg-white/95 shadow-2xl ring-1 ring-white/20 backdrop-blur-xl"
            style={{ width: rightSidebarWidth ? `${rightSidebarWidth}px` : undefined }}
          >
            <audio ref={detailAudioRef} className="hidden" preload="auto" />
            <div className="glass-noise pointer-events-none absolute inset-0 z-0" aria-hidden="true" />
            <div className="relative z-10 flex items-center justify-between border-b border-white/30 bg-white/45 px-4 py-3 backdrop-blur-xl">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-[#991B1B]">Thông tin</p>
                <h3 className="whitespace-pre-line text-lg font-semibold text-slate-900 line-clamp-2">
                  {detailPlace.title}
                </h3>
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
                  <div
                    className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-800 text-justify"
                    dangerouslySetInnerHTML={{
                      __html: renderSimpleMarkdown((detailPlace as any).detailMarkdown),
                    }}
                  />
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

              {(detailPlace as any).stories?.length ? (
                <div className="space-y-2 text-sm text-slate-700">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {"C\u00e2u chuy\u1ec7n"}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {(detailPlace as any).stories.map((story: any, idx: number) => (
                      <button
                        key={`story-${idx}`}
                        type="button"
                        onClick={() => setActiveStory(story)}
                        className="rounded-full border border-[#991B1B]/30 bg-[#991B1B]/10 px-3 py-1 text-xs font-semibold text-[#991B1B] shadow-sm transition hover:bg-[#991B1B]/20"
                      >
                        {story?.title || `C\u00e2u chuy\u1ec7n ${idx + 1}`}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

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

        {activeStory ? (
          <div className="pointer-events-auto absolute inset-0 z-40 flex items-center justify-center px-4 py-6">
            <button
              type="button"
              className="absolute inset-0 bg-slate-900/45 backdrop-blur-sm"
              onClick={() => setActiveStory(null)}
              aria-label={"\u0110\u00f3ng c\u00e2u chuy\u1ec7n"}
            />
            <div className="relative z-10 w-full max-w-3xl overflow-hidden rounded-3xl border border-white/30 bg-white/90 shadow-2xl ring-1 ring-white/20 backdrop-blur-xl">
              <div className="relative flex items-center justify-between border-b border-white/30 bg-[#991B1B]/90 px-5 py-4 text-white">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-white/80">
                    {"C\u00e2u chuy\u1ec7n"}
                  </p>
                  <h3 className="text-xl font-semibold">{activeStory.title || "\u1ea8n t\u00edch l\u1ecbch s\u1eed"}</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveStory(null)}
                  className="rounded-full border border-white/40 bg-white/15 px-3 py-1 text-sm font-semibold text-white hover:bg-white/25"
                >
                  {"\u0110\u00f3ng"}
                </button>
              </div>
              <div className="max-h-[70vh] overflow-y-auto px-6 py-5">
                {activeStory.imageUrl ? (
                  <div className="mb-4 overflow-hidden rounded-2xl border border-white/40 bg-white/80 shadow-sm">
                    {isImageUrl(activeStory.imageUrl) ? (
                      <img
                        src={activeStory.imageUrl}
                        alt={activeStory.imageLabel || activeStory.title || "\u0110\u1ecba \u0111i\u1ec3m"}
                        className="h-auto w-full"
                      />
                    ) : (
                      <a
                        href={activeStory.imageUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block px-5 py-4 text-sm font-semibold text-[#991B1B] underline underline-offset-2"
                      >
                        {activeStory.imageLabel || activeStory.imageUrl}
                      </a>
                    )}
                    {activeStory.imageLabel ? (
                      <div className="border-t border-white/40 bg-white/80 px-4 py-2 text-xs font-semibold text-slate-600">
                        {activeStory.imageLabel}
                      </div>
                    ) : null}
                  </div>
                ) : null}
                <div
                  className="rounded-2xl border border-white/40 bg-white/80 px-5 py-4 text-base leading-relaxed text-slate-800 shadow-sm"
                  dangerouslySetInnerHTML={{
                    __html: renderSimpleMarkdown(activeStory.body || "\u0110ang c\u1eadp nh\u1eadt c\u00e2u chuy\u1ec7n..."),
                  }}
                />
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
