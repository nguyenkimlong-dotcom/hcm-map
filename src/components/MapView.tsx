"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

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

export default function MapView({ places }: Props) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerMapRef = useRef<Record<string, MarkerEntry>>({});
  const [activePlaceId, setActivePlaceId] = useState<string | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState<string>("all");
  const [selectedCountry, setSelectedCountry] = useState<string>("all");

  const dateRange = useMemo(() => {
    const years = places
      .map((p) => (p.dateStart ? Number.parseInt(p.dateStart.slice(0, 4), 10) : undefined))
      .filter((y): y is number => Number.isFinite(y));
    if (!years.length) return { min: undefined as number | undefined, max: undefined as number | undefined };
    return { min: Math.min(...years), max: Math.max(...years) };
  }, [places]);

  const [selectedYear, setSelectedYear] = useState<number>(dateRange.min ?? new Date().getFullYear());
  const effectiveYear = useMemo(() => {
    if (dateRange.min !== undefined && selectedYear < dateRange.min) return dateRange.min;
    return selectedYear;
  }, [dateRange.min, selectedYear]);

  const periodOptions = useMemo(() => {
    const labels = new Set<string>();
    places.forEach((p) => {
      if (p.periodLabel) labels.add(p.periodLabel);
    });
    return Array.from(labels).sort();
  }, [places]);

  const countryOptions = useMemo(() => {
    const labels = new Set<string>();
    places.forEach((p) => {
      if (p.country) labels.add(p.country);
    });
    return Array.from(labels).sort();
  }, [places]);

  const filteredPlaces = useMemo(() => {
    const list = places.filter((place) => {
      if (selectedPeriod !== "all" && place.periodLabel !== selectedPeriod) return false;
      if (selectedCountry !== "all" && place.country !== selectedCountry) return false;

      if (dateRange.min !== undefined && dateRange.max !== undefined) {
        const startYear = place.dateStart ? Number.parseInt(place.dateStart.slice(0, 4), 10) : undefined;
        if (startYear === undefined) return false;
        if (startYear > effectiveYear) return false;
      }
      return true;
    });

    return list.sort((a, b) => {
      const aDate = a.dateStart || "";
      const bDate = b.dateStart || "";
      if (aDate && bDate && aDate !== bDate) return aDate.localeCompare(bDate);
      if (!aDate && bDate) return 1;
      if (aDate && !bDate) return -1;
      return (a.title || "").localeCompare(b.title || "");
    });
  }, [dateRange.max, dateRange.min, effectiveYear, places, selectedCountry, selectedPeriod]);

  const fallbackCenter: [number, number] = useMemo(() => {
    return filteredPlaces[0]?.coords || places[0]?.coords || [105.8342, 21.0278];
  }, [filteredPlaces, places]);

  useEffect(() => {
    const container = mapContainerRef.current;
    if (!container || mapRef.current) return;

    const map = new maplibregl.Map({
      container,
      style: MAP_STYLE_URL,
      center: fallbackCenter,
      zoom: filteredPlaces.length ? 2.5 : 3.5,
      attributionControl: true,
    });

    map.addControl(new maplibregl.NavigationControl(), "top-right");
    mapRef.current = map;
  }, [fallbackCenter, filteredPlaces.length]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    Object.values(markerMapRef.current).forEach(({ marker, popup }) => {
      popup.remove();
      marker.remove();
    });
    markerMapRef.current = {};

    const bounds = new maplibregl.LngLatBounds();

    filteredPlaces.forEach((place, index) => {
      if (!place.coords || place.coords.length !== 2) return;
      const key = place.id || place.slug || `place-${index}`;

      const popup = new maplibregl.Popup({ offset: 12, closeButton: true }).setDOMContent(buildPopupContent(place));

      const marker = new maplibregl.Marker({ color: "#2563eb" })
        .setLngLat(place.coords)
        .setPopup(popup)
        .addTo(map);

      marker.getElement().addEventListener("click", () => setActivePlaceId(key));

      markerMapRef.current[key] = { marker, popup, place };
      bounds.extend(place.coords);
    });

    if (!bounds.isEmpty()) {
      map.fitBounds(bounds, { padding: 60, maxZoom: 8 });
    } else {
      map.setCenter(fallbackCenter);
    }

    return () => {
      Object.values(markerMapRef.current).forEach(({ marker, popup }) => {
        popup.remove();
        marker.remove();
      });
      markerMapRef.current = {};
    };
  }, [fallbackCenter, filteredPlaces]);

  const handleFocusPlace = (placeKey: string) => {
    setActivePlaceId(placeKey);
    const map = mapRef.current;
    const entry = markerMapRef.current[placeKey];
    if (!map || !entry) return;

    Object.values(markerMapRef.current).forEach(({ popup }) => popup.remove());
    map.flyTo({ center: entry.place.coords, zoom: 6, essential: true });
    entry.popup.addTo(map);
  };

  return (
    <section className="w-full bg-slate-50 pb-10">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4">
        <div className="grid gap-4 md:grid-cols-[320px,1fr]">
          <aside className="h-fit rounded-xl border border-slate-200 bg-white shadow-sm md:sticky md:top-4">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">Hanh trinh</p>
                <h2 className="text-lg font-semibold text-slate-900">Danh sach dia diem</h2>
              </div>
              <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
                {filteredPlaces.length} diem
              </span>
            </div>

            <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-3">
              <div className="grid grid-cols-1 gap-3">
                <label className="text-sm text-slate-700">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Giai doan
                  </span>
                  <select
                    value={selectedPeriod}
                    onChange={(e) => setSelectedPeriod(e.target.value)}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-800"
                  >
                    <option value="all">Tat ca</option>
                    {periodOptions.map((label) => (
                      <option key={label} value={label}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="text-sm text-slate-700">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Quoc gia
                  </span>
                  <select
                    value={selectedCountry}
                    onChange={(e) => setSelectedCountry(e.target.value)}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-800"
                  >
                    <option value="all">Tat ca</option>
                    {countryOptions.map((label) => (
                      <option key={label} value={label}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {dateRange.min !== undefined && dateRange.max !== undefined ? (
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-600">
                    <span>Timeline</span>
                    <span>Nam: {effectiveYear}</span>
                  </div>
                  <input
                    type="range"
                    min={dateRange.min}
                    max={dateRange.max}
                    value={effectiveYear}
                    onChange={(e) => setSelectedYear(Number(e.target.value))}
                    className="w-full"
                  />
                  <div className="flex justify-between text-[11px] text-slate-500">
                    <span>{dateRange.min}</span>
                    <span>{dateRange.max}</span>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="max-h-[70vh] overflow-y-auto divide-y divide-slate-100">
              {filteredPlaces.length === 0 ? (
                <p className="p-4 text-sm text-slate-600">
                  Khong co dia diem phu hop. Thu thay doi bo loc hoac timeline.
                </p>
              ) : (
                filteredPlaces.map((place, index) => {
                  const key = place.id || place.slug || `place-${index}`;
                  const active = activePlaceId === key;
                  return (
                    <div
                      key={key}
                      onClick={() => handleFocusPlace(key)}
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

          <div className="min-h-[60vh] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div ref={mapContainerRef} className="h-[60vh] w-full md:h-[70vh]" />
          </div>
        </div>
      </div>
    </section>
  );
}
