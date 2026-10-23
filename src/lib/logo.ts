// Brand logos are stored inline as data: URLs (a few brands, read with every quote, no file storage needed).
export const LOGO_MAX_CHARS = 400_000;
export const LOGO_RE = /^data:image\/(png|jpeg|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$/;

const readAsDataUrl = (f: Blob) =>
  new Promise<string>((ok, fail) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result));
    r.onerror = () => fail(r.error);
    r.readAsDataURL(f);
  });

// SVG stays vector (sharp at any print size). Bitmaps are scaled so the longest side is ≤ 600 px
// (a 15 mm-tall logo then prints at ~500 dpi) and saved as PNG to keep transparency.
export async function prepareLogo(file: File): Promise<string> {
  if (file.type === "image/svg+xml") {
    const url = await readAsDataUrl(file);
    if (url.length > LOGO_MAX_CHARS) throw new Error("SVG logo is too large (max ~300 KB)");
    return url;
  }
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) throw new Error("Use an SVG, PNG, JPG or WebP");
  const img = await createImageBitmap(file);
  const scale = Math.min(1, 600 / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
  const url = canvas.toDataURL("image/png");
  if (url.length > LOGO_MAX_CHARS) throw new Error("Logo is too large after resizing");
  return url;
}
