import fs from "fs/promises";
import path from "path";

import { Place } from "@/types/place";

function normalizeMediaUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const url = value.trim();
  if (/^(https?:)?\/\//i.test(url) || url.startsWith("data:") || url.startsWith("blob:")) return url;
  if (url.startsWith("/")) return url;
  return `/media/${url}`;
}

function normalizePlaceMedia(place: any): Place {
  if (!place || typeof place !== "object") return place as Place;
  const media = place.media ?? {};
  const normalized = {
    ...place,
    media: {
      ...media,
      cover: normalizeMediaUrl(media.cover) ?? media.cover,
      gallery: Array.isArray(media.gallery)
        ? media.gallery.map((item: unknown) => normalizeMediaUrl(item) || item).filter(Boolean)
        : media.gallery,
      images: Array.isArray(media.images)
        ? media.images.map((img: any) => ({
            ...img,
            url: normalizeMediaUrl(img?.url) ?? img?.url,
          }))
        : media.images,
      videos: Array.isArray(media.videos)
        ? media.videos.map((vid: any) => ({
            ...vid,
            url: normalizeMediaUrl(vid?.url) ?? vid?.url,
          }))
        : media.videos,
    },
  };
  return normalized as Place;
}

export async function loadPlaces(): Promise<Place[]> {
  try {
    const filePath = path.join(process.cwd(), "src", "data", "places.json");
    const content = await fs.readFile(filePath, "utf-8");
    const normalized = content.startsWith("\ufeff") ? content.slice(1) : content;
    const parsed = JSON.parse(normalized);
    if (Array.isArray(parsed)) {
      return parsed.map((item) => normalizePlaceMedia(item));
    }
    return [];
  } catch (error) {
    console.error("Failed to read places.json", error);
    return [];
  }
}
