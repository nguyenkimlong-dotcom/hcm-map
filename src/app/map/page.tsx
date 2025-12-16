import MapView, { Place } from "@/components/MapView";
import { loadPlaces } from "@/lib/loadPlaces";

export const dynamic = "force-dynamic";

export default async function MapPage() {
  const places = await loadPlaces();

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-6xl px-4 py-10 space-y-2">
        <p className="text-sm font-semibold uppercase tracking-wide text-blue-700">Bản đồ</p>
        <h1 className="text-3xl font-bold text-slate-900 sm:text-4xl">Hành trình của bạn trên bản đồ</h1>
        <p className="max-w-3xl text-base text-slate-600">
          Chọn một địa điểm trong danh sách để di chuyển camera (flyTo) và mở popup chi tiết. Dữ liệu đọc từ file
          JSON trong <code>src/data/places.json</code>.
        </p>
      </div>
      <MapView places={places as Place[]} />
    </main>
  );
}
