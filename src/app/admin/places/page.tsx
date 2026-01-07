"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { Place } from "@/types/place";

type EditablePlace = Place & {
  detailMarkdown?: string;
  stories?: { title?: string; body?: string; imageUrl?: string; imageLabel?: string }[];
};

type PlacesResponse = {
  places: EditablePlace[];
};

const emptyPlace: EditablePlace = {
  title: "",
  coords: [0, 0],
};

export default function PlacesAdminPage() {
  const [places, setPlaces] = useState<EditablePlace[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [savedSnapshot, setSavedSnapshot] = useState<string>("");
  const [notice, setNotice] = useState<{ type: "saved" | "noop"; message: string } | null>(null);
  const markdownRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    let mounted = true;
    setStatus("loading");
    fetch("/api/places")
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to load places");
        return (await res.json()) as PlacesResponse;
      })
      .then((data) => {
        if (!mounted) return;
        const list = Array.isArray(data.places) ? data.places : [];
        setPlaces(list);
        setSavedSnapshot(JSON.stringify(list));
        setSelectedIndex(list.length ? 0 : -1);
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

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    const sorted = places
      .map((p, idx) => ({ p, idx }))
      .sort((a, b) => {
        const aKey = (a.p.dateStart || "").trim();
        const bKey = (b.p.dateStart || "").trim();
        if (aKey && bKey && aKey !== bKey) return aKey.localeCompare(bKey);
        if (aKey && !bKey) return -1;
        if (!aKey && bKey) return 1;
        return (a.p.title || "").localeCompare(b.p.title || "");
      })
      .map((entry, order) => ({ ...entry, order: order + 1 }));
    if (!query) return sorted;
    return sorted.filter(({ p }) =>
      `${p.title} ${p.country ?? ""} ${p.city ?? ""}`.toLowerCase().includes(query),
    );
  }, [places, search]);

  const selectedPlace = selectedIndex >= 0 ? places[selectedIndex] : null;
  const currentSnapshot = useMemo(() => JSON.stringify(places), [places]);

  const updatePlace = (patch: Partial<EditablePlace>) => {
    if (selectedIndex < 0) return;
    setPlaces((prev) => {
      const next = [...prev];
      next[selectedIndex] = { ...next[selectedIndex], ...patch };
      return next;
    });
  };

  const updateCoords = (field: "lng" | "lat", value: number) => {
    if (selectedIndex < 0) return;
    setPlaces((prev) => {
      const next = [...prev];
      const coords: [number, number] = [...(next[selectedIndex].coords ?? [0, 0])] as [number, number];
      if (field === "lng") coords[0] = value;
      if (field === "lat") coords[1] = value;
      next[selectedIndex] = { ...next[selectedIndex], coords };
      return next;
    });
  };

  const applyMarkdown = (prefix: string, suffix = "") => {
    const textarea = markdownRef.current;
    if (!textarea || selectedIndex < 0) return;
    const value = places[selectedIndex]?.detailMarkdown ?? "";
    const start = textarea.selectionStart ?? value.length;
    const end = textarea.selectionEnd ?? value.length;
    const before = value.slice(0, start);
    const selected = value.slice(start, end);
    const after = value.slice(end);
    const next = `${before}${prefix}${selected}${suffix}${after}`;
    updatePlace({ detailMarkdown: next });
    window.requestAnimationFrame(() => {
      const cursor = start + prefix.length;
      textarea.focus();
      textarea.setSelectionRange(cursor, cursor + selected.length);
    });
  };

  const updateMediaList = (listKey: "images" | "videos", index: number, patch: { label?: string; url?: string }) => {
    if (selectedIndex < 0) return;
    setPlaces((prev) => {
      const next = [...prev];
      const media = { ...(next[selectedIndex].media ?? {}) };
      const list = [...(media[listKey] ?? [])];
      list[index] = { ...list[index], ...patch };
      media[listKey] = list;
      next[selectedIndex] = { ...next[selectedIndex], media };
      return next;
    });
  };

  const handleUpload = async (listKey: "images" | "videos" | "audio", index: number, file: File | null) => {
    if (!file) return;
    setStatus("saving");
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const typeParam = listKey === "videos" ? "video" : listKey === "audio" ? "audio" : "image";
      const res = await fetch(`/api/places?type=${typeParam}`, {
        method: "PUT",
        body: form,
      });
      if (!res.ok) throw new Error("Upload failed");
      const data = (await res.json()) as { url?: string };
      if (data.url) {
        if (listKey === "audio") {
          updatePlace({ media: { ...(selectedPlace?.media ?? {}), audio: data.url } });
        } else {
          updateMediaList(listKey, index, { url: data.url });
        }
      }
      setStatus("idle");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
      setStatus("error");
    }
  };

  const addMediaItem = (listKey: "images" | "videos") => {
    if (selectedIndex < 0) return;
    setPlaces((prev) => {
      const next = [...prev];
      const media = { ...(next[selectedIndex].media ?? {}) };
      const list = [...(media[listKey] ?? []), { label: "", url: "" }];
      media[listKey] = list;
      next[selectedIndex] = { ...next[selectedIndex], media };
      return next;
    });
  };

  const removeMediaItem = (listKey: "images" | "videos", index: number) => {
    if (selectedIndex < 0) return;
    setPlaces((prev) => {
      const next = [...prev];
      const media = { ...(next[selectedIndex].media ?? {}) };
      const list = [...(media[listKey] ?? [])];
      list.splice(index, 1);
      media[listKey] = list;
      next[selectedIndex] = { ...next[selectedIndex], media };
      return next;
    });
  };

  const updateStory = (
    index: number,
    patch: { title?: string; body?: string; imageUrl?: string; imageLabel?: string },
  ) => {
    if (selectedIndex < 0) return;
    setPlaces((prev) => {
      const next = [...prev];
      const stories = [...(next[selectedIndex].stories ?? [])];
      stories[index] = { ...stories[index], ...patch };
      next[selectedIndex] = { ...next[selectedIndex], stories };
      return next;
    });
  };

  const addStory = () => {
    if (selectedIndex < 0) return;
    setPlaces((prev) => {
      const next = [...prev];
      const stories = [...(next[selectedIndex].stories ?? []), { title: "", body: "" }];
      next[selectedIndex] = { ...next[selectedIndex], stories };
      return next;
    });
  };

  const handleStoryImageUpload = async (storyIndex: number, file: File | null) => {
    if (!file) return;
    setStatus("saving");
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/places?type=image", { method: "PUT", body: form });
      if (!res.ok) throw new Error("Upload failed");
      const data = (await res.json()) as { url?: string };
      if (data.url) {
        updateStory(storyIndex, { imageUrl: data.url });
      }
      setStatus("idle");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
      setStatus("error");
    }
  };

  const removeStory = (index: number) => {
    if (selectedIndex < 0) return;
    setPlaces((prev) => {
      const next = [...prev];
      const stories = [...(next[selectedIndex].stories ?? [])];
      stories.splice(index, 1);
      next[selectedIndex] = { ...next[selectedIndex], stories };
      return next;
    });
  };

  const handleSave = async () => {
    if (currentSnapshot === savedSnapshot) {
      setNotice({ type: "noop", message: "Chua co thay doi." });
      return;
    }
    setStatus("saving");
    setError(null);
    try {
      const res = await fetch("/api/places", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ places }),
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
    setPlaces((prev) => {
      const next = [...prev, { ...emptyPlace }];
      setSelectedIndex(next.length - 1);
      return next;
    });
  };

  const handleRemove = () => {
    if (selectedIndex < 0) return;
    const target = places[selectedIndex];
    const name = target?.title || "this place";
    if (!window.confirm(`Remove ${name}?`)) return;
    setPlaces((prev) => {
      const next = [...prev];
      next.splice(selectedIndex, 1);
      const nextIndex = Math.min(selectedIndex, next.length - 1);
      setSelectedIndex(nextIndex >= 0 ? nextIndex : -1);
      return next;
    });
  };

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 1800);
    return () => window.clearTimeout(timer);
  }, [notice]);

  return (
    <div className="min-h-screen bg-slate-50 px-6 py-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        {notice ? (
          <div className="fixed left-1/2 top-6 z-50 -translate-x-1/2">
            <div
              className={`rounded-full px-4 py-2 text-sm font-semibold shadow-lg ${
                notice.type === "saved"
                  ? "bg-emerald-500/90 text-white"
                  : "bg-slate-900/90 text-white"
              }`}
            >
              {notice.message}
            </div>
          </div>
        ) : null}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Places Editor</h1>
            <p className="text-sm text-slate-600">Edit places.json without touching the map UI.</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleAdd}
              className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-100"
            >
              Add place
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
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by title/country"
              className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700"
            />
            <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Sorted by date start
            </p>
            <div className="mt-3 max-h-[70vh] overflow-y-auto">
              {filtered.length === 0 ? (
                <p className="px-2 py-3 text-sm text-slate-500">No matches.</p>
              ) : (
                filtered.map(({ p, idx, order }) => (
                  <button
                    key={`place-${idx}`}
                    type="button"
                    onClick={() => setSelectedIndex(idx)}
                    className={`w-full rounded-md px-2 py-2 text-left text-sm transition ${
                      idx === selectedIndex ? "bg-[#EAB308]/20 text-slate-900" : "text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-xs font-semibold text-slate-600">
                        {order}
                      </span>
                      <p className="font-semibold">{p.title || "(untitled)"}</p>
                    </div>
                    <p className="text-xs text-slate-500">
                      {[p.city, p.country].filter(Boolean).join(", ")}
                      {p.dateStart ? ` • ${p.dateStart}` : ""}
                    </p>
                  </button>
                ))
              )}
            </div>
          </aside>

          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            {selectedPlace ? (
              <div className="grid gap-4 md:grid-cols-2">
                <div className="md:col-span-2">
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Title</label>
                  <textarea
                    value={selectedPlace.title ?? ""}
                    onChange={(e) => updatePlace({ title: e.target.value })}
                    rows={2}
                    className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Country</label>
                  <input
                    type="text"
                    value={selectedPlace.country ?? ""}
                    onChange={(e) => updatePlace({ country: e.target.value })}
                    className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">City</label>
                  <input
                    type="text"
                    value={selectedPlace.city ?? ""}
                    onChange={(e) => updatePlace({ city: e.target.value })}
                    className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Longitude</label>
                  <input
                    type="number"
                    step="0.0001"
                    value={selectedPlace.coords?.[0] ?? 0}
                    onChange={(e) => updateCoords("lng", Number(e.target.value))}
                    className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Latitude</label>
                  <input
                    type="number"
                    step="0.0001"
                    value={selectedPlace.coords?.[1] ?? 0}
                    onChange={(e) => updateCoords("lat", Number(e.target.value))}
                    className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Period label</label>
                  <input
                    type="text"
                    value={selectedPlace.periodLabel ?? ""}
                    onChange={(e) => updatePlace({ periodLabel: e.target.value })}
                    className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Date start</label>
                  <input
                    type="text"
                    value={selectedPlace.dateStart ?? ""}
                    onChange={(e) => updatePlace({ dateStart: e.target.value })}
                    className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Date end</label>
                  <input
                    type="text"
                    value={selectedPlace.dateEnd ?? ""}
                    onChange={(e) => updatePlace({ dateEnd: e.target.value })}
                    className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Detail markdown
                  </label>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => applyMarkdown("**", "**")}
                      className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700"
                    >
                      Bold
                    </button>
                    <button
                      type="button"
                      onClick={() => applyMarkdown("_", "_")}
                      className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700"
                    >
                      Italic
                    </button>
                    <button
                      type="button"
                      onClick={() => applyMarkdown("## ", "")}
                      className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700"
                    >
                      Heading
                    </button>
                    <button
                      type="button"
                      onClick={() => applyMarkdown("- ", "")}
                      className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700"
                    >
                      Bullet
                    </button>
                    <button
                      type="button"
                      onClick={() => applyMarkdown("> ", "")}
                      className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700"
                    >
                      Quote
                    </button>
                  </div>
                  <textarea
                    ref={markdownRef}
                    value={selectedPlace.detailMarkdown ?? ""}
                    onChange={(e) => updatePlace({ detailMarkdown: e.target.value })}
                    rows={8}
                    className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700"
                  />
                </div>
                <div className="md:col-span-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Images</label>
                    <button
                      type="button"
                      onClick={() => addMediaItem("images")}
                      className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700"
                    >
                      Add image
                    </button>
                  </div>
                  <div className="mt-2 space-y-2">
                    {(selectedPlace.media?.images ?? []).length === 0 ? (
                      <p className="text-xs text-slate-500">No images yet.</p>
                    ) : (
                      (selectedPlace.media?.images ?? []).map((img, idx) => (
                        <div key={`img-${idx}`} className="grid gap-2 md:grid-cols-[1fr_1fr_auto]">
                          <input
                            type="text"
                            value={img.label ?? ""}
                            onChange={(e) => updateMediaList("images", idx, { label: e.target.value })}
                            placeholder="Image label"
                            className="rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700"
                          />
                          <input
                            type="text"
                            value={img.url ?? ""}
                            onChange={(e) => updateMediaList("images", idx, { url: e.target.value })}
                            placeholder="Image URL"
                            className="rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700"
                          />
                          <div className="flex items-center gap-2">
                            <label className="cursor-pointer rounded-md border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-700">
                              Upload
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(e) => handleUpload("images", idx, e.target.files?.[0] ?? null)}
                              />
                            </label>
                            <button
                              type="button"
                              onClick={() => removeMediaItem("images", idx)}
                              className="rounded-md border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-700"
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
                <div className="md:col-span-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Videos</label>
                    <button
                      type="button"
                      onClick={() => addMediaItem("videos")}
                      className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700"
                    >
                      Add video
                    </button>
                  </div>
                  <div className="mt-2 space-y-2">
                    {(selectedPlace.media?.videos ?? []).length === 0 ? (
                      <p className="text-xs text-slate-500">No videos yet.</p>
                    ) : (
                      (selectedPlace.media?.videos ?? []).map((vid, idx) => (
                        <div key={`vid-${idx}`} className="grid gap-2 md:grid-cols-[1fr_1fr_auto]">
                          <input
                            type="text"
                            value={vid.label ?? ""}
                            onChange={(e) => updateMediaList("videos", idx, { label: e.target.value })}
                            placeholder="Video label"
                            className="rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700"
                          />
                          <input
                            type="text"
                            value={vid.url ?? ""}
                            onChange={(e) => updateMediaList("videos", idx, { url: e.target.value })}
                            placeholder="Video URL"
                            className="rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700"
                          />
                          <div className="flex items-center gap-2">
                            <label className="cursor-pointer rounded-md border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-700">
                              Upload
                              <input
                                type="file"
                                accept="video/*"
                                className="hidden"
                                onChange={(e) => handleUpload("videos", idx, e.target.files?.[0] ?? null)}
                              />
                            </label>
                            <button
                              type="button"
                              onClick={() => removeMediaItem("videos", idx)}
                              className="rounded-md border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-700"
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
                <div className="md:col-span-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Audio</label>
                    <label className="cursor-pointer rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700">
                      Upload audio
                      <input
                        type="file"
                        accept="audio/*"
                        className="hidden"
                        onChange={(e) => handleUpload("audio", 0, e.target.files?.[0] ?? null)}
                      />
                    </label>
                  </div>
                  <input
                    type="text"
                    value={selectedPlace.media?.audio ?? ""}
                    onChange={(e) => updatePlace({ media: { ...selectedPlace.media, audio: e.target.value } })}
                    placeholder="Audio URL"
                    className="mt-2 w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700"
                  />
                </div>
                <div className="md:col-span-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Stories</label>
                    <button
                      type="button"
                      onClick={addStory}
                      className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700"
                    >
                      Add story
                    </button>
                  </div>
                  <div className="mt-2 space-y-3">
                    {(selectedPlace.stories ?? []).length === 0 ? (
                      <p className="text-xs text-slate-500">No stories yet.</p>
                    ) : (
                      (selectedPlace.stories ?? []).map((story, idx) => (
                        <div key={`story-${idx}`} className="rounded-md border border-slate-200 p-3">
                          <div className="flex items-center justify-between">
                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                              Story {idx + 1}
                            </p>
                            <button
                              type="button"
                              onClick={() => removeStory(idx)}
                              className="rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-700"
                            >
                              Remove
                            </button>
                          </div>
                          <input
                            type="text"
                            value={story.title ?? ""}
                            onChange={(e) => updateStory(idx, { title: e.target.value })}
                            placeholder="Story title"
                            className="mt-2 w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700"
                          />
                          <div className="mt-2 grid gap-2 md:grid-cols-[1fr_1fr_auto]">
                            <input
                              type="text"
                              value={story.imageLabel ?? ""}
                              onChange={(e) => updateStory(idx, { imageLabel: e.target.value })}
                              placeholder="Image label"
                              className="rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700"
                            />
                            <input
                              type="text"
                              value={story.imageUrl ?? ""}
                              onChange={(e) => updateStory(idx, { imageUrl: e.target.value })}
                              placeholder="Image URL"
                              className="rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700"
                            />
                            <label className="cursor-pointer rounded-md border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-700">
                              Upload
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(e) => handleStoryImageUpload(idx, e.target.files?.[0] ?? null)}
                              />
                            </label>
                          </div>
                          <textarea
                            value={story.body ?? ""}
                            onChange={(e) => updateStory(idx, { body: e.target.value })}
                            rows={5}
                            placeholder="Story content"
                            className="mt-2 w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700"
                          />
                        </div>
                      ))
                    )}
                  </div>
                </div>
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Level primary</label>
                  <textarea
                    value={selectedPlace.levelTexts?.primary ?? ""}
                    onChange={(e) =>
                      updatePlace({ levelTexts: { ...selectedPlace.levelTexts, primary: e.target.value } })
                    }
                    rows={3}
                    className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Level secondary
                  </label>
                  <textarea
                    value={selectedPlace.levelTexts?.secondary ?? ""}
                    onChange={(e) =>
                      updatePlace({ levelTexts: { ...selectedPlace.levelTexts, secondary: e.target.value } })
                    }
                    rows={3}
                    className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Level high</label>
                  <textarea
                    value={selectedPlace.levelTexts?.high ?? ""}
                    onChange={(e) => updatePlace({ levelTexts: { ...selectedPlace.levelTexts, high: e.target.value } })}
                    rows={3}
                    className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700"
                  />
                </div>
                <div className="md:col-span-2">
                  {status === "error" && error ? (
                    <p className="text-sm text-red-600">{error}</p>
                  ) : status === "saved" ? (
                    <p className="text-sm text-emerald-700">Saved.</p>
                  ) : null}
                </div>
                <div className="md:col-span-2">
                  <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-rose-600">Danger zone</p>
                    <p className="mt-1 text-sm text-rose-700">
                      Remove this place from the list.
                    </p>
                    <button
                      type="button"
                      onClick={handleRemove}
                      className="mt-3 rounded-md border border-rose-300 bg-white px-3 py-2 text-sm font-semibold text-rose-700 shadow-sm hover:bg-rose-100"
                    >
                      Remove place
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-500">Select a place to edit.</p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
