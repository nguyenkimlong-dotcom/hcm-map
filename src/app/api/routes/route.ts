import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

const routesPath = path.join(process.cwd(), "src", "data", "routes.json");

type FeatureCollection = {
  type: "FeatureCollection";
  name?: string;
  crs?: unknown;
  features: unknown[];
};

export async function GET() {
  try {
    const raw = await fs.readFile(routesPath, "utf8");
    const routes = JSON.parse(raw);
    return NextResponse.json({ routes });
  } catch (err) {
    return NextResponse.json({ error: "Failed to read routes.json" }, { status: 500 });
  }
}

function buildCollection(features: unknown[], base?: FeatureCollection): FeatureCollection {
  if (base && base.type === "FeatureCollection") {
    return { ...base, features };
  }
  return { type: "FeatureCollection", features };
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const incoming = body?.routes;
    let collection: FeatureCollection | null = null;

    if (Array.isArray(incoming)) {
      let existing: FeatureCollection | undefined;
      try {
        const raw = await fs.readFile(routesPath, "utf8");
        existing = JSON.parse(raw) as FeatureCollection;
      } catch (err) {
        existing = undefined;
      }
      collection = buildCollection(incoming, existing);
    } else if (incoming && typeof incoming === "object" && incoming.type === "FeatureCollection") {
      collection = incoming as FeatureCollection;
    }

    if (!collection) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const payload = JSON.stringify(collection, null, 2);
    await fs.writeFile(routesPath, `${payload}\n`, "utf8");
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: "Failed to save routes.json" }, { status: 500 });
  }
}
