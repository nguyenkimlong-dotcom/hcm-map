"use client";

import { useEffect, useMemo, useState } from "react";

type RouteFeature = {
  type: "Feature";
  properties?: {
    fid?: number;
    fromSlug?: string;
    toSlug?: string;
    order?: string | number;
    mode?: string;
    label?: string;
  };
  geometry: {
    type: "LineString";
    coordinates: [number, number][];
  };
};

type RoutesResponse = {
  routes: {
    type: "FeatureCollection";
    features: RouteFeature[];
  };
};

const emptyFeature: RouteFeature = {
  type: "Feature",
  properties: { order: "", mode: "" },
  geometry: { type: "LineString", coordinates: [] },
};

export default function RoutesAdminPage() {
  const [routes, setRoutes] = useState<RouteFeature[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [coordsText, setCoordsText] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [savedSnapshot, setSavedSnapshot] = useState<string>("");
  const [notice, setNotice] = useState<{ type: "saved" | "noop"; message: string } | null>(null);

  useEffect(() => {
    let mounted = true;
    setStatus("loading");
    fetch("/api/routes")
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to load routes");
        return (await res.json()) as RoutesResponse;
      })
      .then((data) => {
        if (!mounted) return;
        const list = Array.isArray(data.routes?.features) ? data.routes.features : [];
        setRoutes(list);
        setSelectedIndex(list.length ? 0 : -1);
        setSavedSnapshot(JSON.stringify(list));
        setStatus("idle");
      })
      .catch((err) => {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : "Failed to load");
        setStatus("error");
      });
    return () => {
      mounted = false;
    };
  }, []);

  const currentSnapshot = useMemo(() => JSON.stringify(routes), [routes]);
  const selectedRoute = selectedIndex >= 0 ? routes[selectedIndex] : null;

  useEffect(() => {
    if (!selectedRoute) {
      setCoordsText("");
      return;
    }
    setCoordsText(JSON.stringify(selectedRoute.geometry.coordinates, null, 2));
  }, [selectedRoute]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 1800);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const updateRoute = (patch: Partial<RouteFeature>) => {
    if (selectedIndex < 0) return;
    setRoutes((prev) => {
      const next = [...prev];
      next[selectedIndex] = { ...next[selectedIndex], ...patch };
      return next;
    });
  };

  const updateProperties = (patch: RouteFeature["properties"]) => {
    if (selectedIndex < 0) return;
    setRoutes((prev) => {
      const next = [...prev];
      next[selectedIndex] = {
        ...next[selectedIndex],
        properties: { ...(next[selectedIndex].properties ?? {}), ...patch },
      };
      return next;
    });
  };

  const applyCoords = () => {
    if (selectedIndex < 0) return;
    try {
      const parsed = JSON.parse(coordsText);
      if (!Array.isArray(parsed)) throw new Error("Invalid coordinates");
      updateRoute({ geometry: { type: "LineString", coordinates: parsed } });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid coordinates JSON");
    }
  };

  const handleSave = async () => {
    if (currentSnapshot === savedSnapshot) {
      setNotice({ type: "noop", message: "Chua co thay doi." });
      return;
    }
    setStatus("saving");
    setError(null);
    try {
      const res = await fetch("/api/routes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ routes }),
      });
      if (!res.ok) throw new Error("Save failed");
      setStatus("saved");
      setSavedSnapshot(currentSnapshot);
      setNotice({ type: "saved", message: "Da luu thanh cong." });
      window.setTimeout(() => setStatus("idle"), 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
      setStatus("error");
    }
  };

  const handleAdd = () => {
    setRoutes((prev) => {
      const next = [...prev, { ...emptyFeature }];
      setSelectedIndex(next.length - 1);
      return next;
    });
  };

  const handleRemove = () => {
    if (selectedIndex < 0) return;
    const target = routes[selectedIndex];
    const name = target?.properties?.label || target?.properties?.fromSlug || `Route ${selectedIndex + 1}`;
    if (!window.confirm(`Remove ${name}?`)) return;
    setRoutes((prev) => {
      const next = [...prev];
      next.splice(selectedIndex, 1);
      const nextIndex = Math.min(selectedIndex, next.length - 1);
      setSelectedIndex(nextIndex >= 0 ? nextIndex : -1);
      return next;
    });
  };

  return (
    <div className="min-h-screen bg-slate-50 px-6 py-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        {notice ? (
          <div className="fixed left-1/2 top-6 z-50 -translate-x-1/2">
            <div
              className={`rounded-full px-4 py-2 text-sm font-semibold shadow-lg ${
                notice.type === "saved" ? "bg-emerald-500/90 text-white" : "bg-slate-900/90 text-white"
              }`}
            >
              {notice.message}
            </div>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Routes Editor</h1>
            <p className="text-sm text-slate-600">Edit routes.json without touching the map UI.</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleAdd}
              className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-100"
            >
              Add route
            </button>
            <button
              type="button"
              onClick={handleRemove}
              disabled={selectedIndex < 0}
              className="rounded-md border border-rose-200 bg-white px-3 py-2 text-sm font-semibold text-rose-700 shadow-sm hover:bg-rose-50 disabled:opacity-60"
            >
              Remove route
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={status === "saving"}
              className="rounded-md bg-[#991B1B] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#7F1D1D] disabled:opacity-60"
            >
              {status === "saving" ? "Saving..." : "Save"}
            </button>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
          <aside className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mt-1 max-h-[70vh] overflow-y-auto space-y-2">
              {routes.length === 0 ? (
                <p className="px-2 py-3 text-sm text-slate-500">No routes yet.</p>
              ) : (
                routes.map((route, idx) => {
                  const isActive = idx === selectedIndex;
                  return (
                    <button
                      key={`route-${idx}`}
                      type="button"
                      onClick={() => setSelectedIndex(idx)}
                      className={`w-full rounded-md px-2 py-2 text-left text-sm transition ${
                        isActive ? "bg-[#EAB308]/20 text-slate-900" : "text-slate-700 hover:bg-slate-100"
                      }`}
                    >
                      <p className="text-xs font-semibold">{`Route ${idx + 1}`}</p>
                      <p className="text-xs text-slate-500">
                        {route.properties?.fromSlug || "from"} → {route.properties?.toSlug || "to"}
                      </p>
                    </button>
                  );
                })
              )}
            </div>
          </aside>

          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            {selectedRoute ? (
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">From slug</label>
                  <input
                    type="text"
                    value={selectedRoute.properties?.fromSlug ?? ""}
                    onChange={(e) => updateProperties({ fromSlug: e.target.value })}
                    className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">To slug</label>
                  <input
                    type="text"
                    value={selectedRoute.properties?.toSlug ?? ""}
                    onChange={(e) => updateProperties({ toSlug: e.target.value })}
                    className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Order</label>
                  <input
                    type="text"
                    value={selectedRoute.properties?.order ?? ""}
                    onChange={(e) => updateProperties({ order: e.target.value })}
                    className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Mode</label>
                  <input
                    type="text"
                    value={selectedRoute.properties?.mode ?? ""}
                    onChange={(e) => updateProperties({ mode: e.target.value })}
                    className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Label</label>
                  <input
                    type="text"
                    value={selectedRoute.properties?.label ?? ""}
                    onChange={(e) => updateProperties({ label: e.target.value })}
                    className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Coordinates (JSON)
                  </label>
                  <textarea
                    value={coordsText}
                    onChange={(e) => setCoordsText(e.target.value)}
                    rows={10}
                    className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700"
                  />
                  <button
                    type="button"
                    onClick={applyCoords}
                    className="mt-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-100"
                  >
                    Apply coordinates
                  </button>
                </div>
                {status === "error" && error ? <p className="text-sm text-red-600">{error}</p> : null}
              </div>
            ) : (
              <p className="text-sm text-slate-500">Select a route to edit.</p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
