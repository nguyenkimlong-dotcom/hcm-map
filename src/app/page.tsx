import Link from "next/link";

import { loadPlaces } from "@/lib/loadPlaces";

export const dynamic = "force-dynamic";

export default async function Home() {
  const places = await loadPlaces();
  const preview = places.slice(0, 5);

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto flex max-w-5xl flex-col gap-10 px-4 py-16">
        <div className="flex flex-col items-center gap-6 text-center">
          <p className="rounded-full bg-blue-50 px-3 py-1 text-sm font-semibold text-blue-700">Hanh trinh 2025</p>
          <h1 className="text-4xl font-bold leading-tight text-slate-900 sm:text-5xl">
            Ban do tuong tac cho cac chang hanh trinh
          </h1>
          <p className="max-w-3xl text-lg text-slate-600">
            Theo doi dia diem, thoi gian va hinh anh chuyen di. Bat dau bang viec mo ban do hoac doc phan gioi thieu
            nguon trich dan.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/map"
              className="rounded-lg bg-blue-600 px-6 py-3 text-base font-semibold text-white shadow-sm transition hover:bg-blue-700"
            >
              Xem ban do
            </Link>
            <Link
              href="/about"
              className="rounded-lg border border-slate-200 px-6 py-3 text-base font-semibold text-slate-800 transition hover:bg-white"
            >
              Gioi thieu & nguon
            </Link>
          </div>
        </div>

        <section className="grid gap-4 sm:grid-cols-3">
          <Link
            href="/map"
            className="rounded-xl border border-slate-200 bg-white p-4 text-sm font-semibold text-slate-800 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md"
          >
            Map
          </Link>
          <Link
            href="/admin/places"
            className="rounded-xl border border-slate-200 bg-white p-4 text-sm font-semibold text-slate-800 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md"
          >
            Places editor
          </Link>
          <Link
            href="/admin/routes"
            className="rounded-xl border border-slate-200 bg-white p-4 text-sm font-semibold text-slate-800 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md"
          >
            Routes editor
          </Link>
        </section>

        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-slate-900">Mot vai dia diem</h2>
            <Link href="/map" className="text-sm font-semibold text-blue-700 hover:text-blue-800">
              Xem tat ca tren ban do
            </Link>
          </div>
          {preview.length === 0 ? (
            <p className="text-sm text-slate-600">Chua co du lieu. Hay them JSON vao src/data/places.json.</p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {preview.map((place, index) => (
                <Link
                  key={place.slug || place.id || `place-${index}`}
                  href={place.slug ? `/places/${place.slug}` : "/map"}
                  className="group rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-slate-900">{place.title}</p>
                      <p className="text-xs text-slate-600">
                        {[place.city, place.country].filter(Boolean).join(", ") || "Dia diem"}
                      </p>
                      <p className="text-xs font-medium text-blue-700">
                        {place.periodLabel ||
                          (place.dateStart && place.dateEnd
                            ? `${place.dateStart} -> ${place.dateEnd}`
                            : place.dateStart || place.dateEnd || "Chua co thoi gian")}
                      </p>
                    </div>
                    <span className="text-xs font-semibold text-blue-600">Chi tiet</span>
                  </div>
                  {place.levelTexts?.primary ? (
                    <p className="mt-2 text-xs text-slate-700 line-clamp-2">{place.levelTexts.primary}</p>
                  ) : null}
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
