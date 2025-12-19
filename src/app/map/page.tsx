import MapView from "@/components/MapView";
import { loadPlaces } from "@/lib/loadPlaces";
import { Place } from "@/types/place";

export const dynamic = "force-dynamic";

export default async function MapPage() {
  const places = await loadPlaces();

  return (
    <main className="min-h-screen bg-slate-50">
      <MapView places={places as Place[]} />
    </main>
  );
}
