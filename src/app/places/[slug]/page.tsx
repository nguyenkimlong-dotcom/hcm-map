import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { loadPlaces } from "@/lib/loadPlaces";

export const dynamic = "force-dynamic";

type Props = {
  params: {
    slug: string;
  };
};

export default async function PlaceDetailPage({ params }: Props) {
  const places = await loadPlaces();
  const place = places.find((item) => item.slug === params.slug);

  if (!place) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-slate-50 pb-16">
      <div className="mx-auto max-w-4xl px-4 py-10 space-y-8">
        <div className="space-y-2">
          <p className="text-sm font-semibold uppercase tracking-wide text-blue-700">Dia diem</p>
          <h1 className="text-3xl font-bold text-slate-900 sm:text-4xl">{place.title}</h1>
          <p className="text-base text-slate-700">
            {[place.city, place.country].filter(Boolean).join(", ") || "Dia diem"}
          </p>
          <p className="text-base font-medium text-blue-700">
            {place.periodLabel ||
              (place.dateStart && place.dateEnd
                ? `${place.dateStart} -> ${place.dateEnd}`
                : place.dateStart || place.dateEnd || "Thoi gian chua cap nhat")}
          </p>
        </div>

        {place.media?.cover ? (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <Image
              src={place.media.cover}
              alt={place.title}
              width={1200}
              height={600}
              className="h-auto w-full object-cover"
              priority
            />
          </div>
        ) : null}

        <section className="grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Chinh</h2>
            <p className="mt-2 text-sm text-slate-700">
              {place.levelTexts?.primary || "Chua co noi dung cap primary."}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Bo sung</h2>
            <p className="mt-2 text-sm text-slate-700">
              {place.levelTexts?.secondary || "Chua co noi dung cap secondary."}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Nang cao</h2>
            <p className="mt-2 text-sm text-slate-700">
              {place.levelTexts?.high || "Chua co noi dung cap high."}
            </p>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-slate-900">Nguon</h2>
          {place.sources && place.sources.length > 0 ? (
            <ul className="space-y-2">
              {place.sources.map((link) => (
                <li key={link}>
                  <a
                    href={link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-700 underline underline-offset-2 hover:text-blue-800"
                  >
                    {link}
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-600">Chua co nguon.</p>
          )}
        </section>

        <div className="flex flex-wrap gap-3">
          <Link
            href="/map"
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Quay lai ban do
          </Link>
          <Link
            href="/"
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-white"
          >
            Trang chu
          </Link>
        </div>
      </div>
    </main>
  );
}
