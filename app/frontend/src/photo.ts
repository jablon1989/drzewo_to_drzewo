import exifr from "exifr";

export interface Position {
  lat: number;
  lon: number;
  /** metres, when known */
  accuracy?: number;
  source: "photo" | "device";
}

/** GPS from the photo's EXIF data, if the camera saved it. */
export async function photoPosition(file: File): Promise<Position | undefined> {
  try {
    const gps = await exifr.gps(file);
    if (gps && Number.isFinite(gps.latitude) && Number.isFinite(gps.longitude)) {
      return { lat: gps.latitude, lon: gps.longitude, source: "photo" };
    }
  } catch {
    /* no EXIF */
  }
  return undefined;
}

/** Where the phone is right now. */
export function devicePosition(timeoutMs = 12000): Promise<Position | undefined> {
  if (!("geolocation" in navigator)) return Promise.resolve(undefined);
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (p) =>
        resolve({ lat: p.coords.latitude, lon: p.coords.longitude, accuracy: p.coords.accuracy, source: "device" }),
      () => resolve(undefined),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 15000 },
    );
  });
}

/**
 * Shrink a photo to a JPEG of at most `maxSide` px. Drawing it on a canvas
 * also drops all EXIF data, including GPS: the other player cannot read the
 * hidden tree's location out of the photo file.
 */
export async function resizeToJpeg(file: Blob, maxSide: number, quality = 0.85): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error(
      "Can't read this photo. Please use a JPEG/PNG photo (on iPhone: Settings → Camera → Most Compatible).",
    );
  }
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not encode JPEG"))), "image/jpeg", quality),
  );
}
