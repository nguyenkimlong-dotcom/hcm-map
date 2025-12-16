import Link from "next/link";

import { loadPlaces } from "@/lib/loadPlaces";

export const dynamic = "force-dynamic";

export default async function AboutPage() {
  const places = await loadPlaces();
  const sourceLinks = Array.from(
    new Set(
      places
        .flatMap((place) => place.sources || [])
        .filter((item): item is string => typeof item === "string" && item.trim().length > 0),
    ),
  );

  return (
    <main className="min-h-screen bg-slate-50 pb-16">
      <div className="mx-auto max-w-4xl px-4 py-10 space-y-8">
        <header className="space-y-3">
          <p className="text-sm font-semibold uppercase tracking-wide text-blue-700">Gioi thieu</p>
          <h1 className="text-3xl font-bold text-slate-900 sm:text-4xl">Muc tieu cua website</h1>
          <p className="text-base text-slate-700 leading-relaxed">
            Du an nay giup hoc sinh theo doi hanh trinh qua ban do tuong tac, luu lai cac dia diem, moc thoi gian, hinh
            anh va ghi chu. Muc tieu la truc quan hoa lo trinh hoc tap/du lich, dong thoi luyen tap cach to chuc du lieu
            va trich dan nguon tai lieu mot cach minh bach.
          </p>
          <p className="text-base text-slate-700 leading-relaxed">
            Nguyen tac: thong tin can co nguon ro rang, uu tien tai lieu chinh thong; khi su dung hinh anh hoac trich
            dan, luon ghi nguon de ton trong ban quyen va giup nguoi xem tra cuu them.
          </p>
        </header>

        <section className="space-y-3">
          <h2 className="text-2xl font-semibold text-slate-900">Nguon tu lieu</h2>
          {sourceLinks.length === 0 ? (
            <p className="text-sm text-slate-600">Chua co nguon. Them cac duong dan vao truong sources cua tung dia diem.</p>
          ) : (
            <ul className="space-y-2">
              {sourceLinks.map((link) => (
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
          )}
        </section>

        <div className="flex flex-wrap gap-3">
          <Link
            href="/"
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-white"
          >
            Ve trang chu
          </Link>
          <Link
            href="/map"
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Xem ban do
          </Link>
        </div>
      </div>
    </main>
  );
}
