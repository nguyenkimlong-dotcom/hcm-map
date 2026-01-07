import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

const placesPath = path.join(process.cwd(), "src", "data", "places.json");

export async function GET() {
  try {
    const raw = await fs.readFile(placesPath, "utf8");
    const places = JSON.parse(raw);
    return NextResponse.json({ places });
  } catch (err) {
    return NextResponse.json({ error: "Failed to read places.json" }, { status: 500 });
  }
}

function sanitizeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export async function PUT(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") || "image";
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Missing file" }, { status: 400 });
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    const safeName = sanitizeFileName(file.name || `${Date.now()}`);
    const folder =
      type === "video" ? "uploads/videos" : type === "audio" ? "uploads/audio" : "uploads/images";
    const targetDir = path.join(process.cwd(), "public", "media", folder);
    await fs.mkdir(targetDir, { recursive: true });
    const filePath = path.join(targetDir, safeName);
    await fs.writeFile(filePath, buffer);
    const url = `/media/${folder}/${safeName}`;
    return NextResponse.json({ url });
  } catch (err) {
    return NextResponse.json({ error: "Failed to upload file" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!body || !Array.isArray(body.places)) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }
    const payload = JSON.stringify(body.places, null, 2);
    await fs.writeFile(placesPath, `${payload}\n`, "utf8");
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: "Failed to save places.json" }, { status: 500 });
  }
}
