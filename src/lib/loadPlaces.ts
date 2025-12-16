import fs from "fs/promises";
import path from "path";

import { Place } from "@/components/MapView";

export async function loadPlaces(): Promise<Place[]> {
  try {
    const filePath = path.join(process.cwd(), "src", "data", "places.json");
    const content = await fs.readFile(filePath, "utf-8");
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed)) {
      return parsed as Place[];
    }
    return [];
  } catch (error) {
    console.error("Failed to read places.json", error);
    return [];
  }
}
