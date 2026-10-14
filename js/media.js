/** Limits for everything users can put into the game: pictures only, small, https only. */
export const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
export const MAX_UPLOAD_MB = 3;
export const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;
export const MAX_URL_LENGTH = 500;       // picture links
export const MAX_IMAGE_SIDE = 8000;      // px
export const MAX_LINK_LENGTH = 200;      // profile links
export const MAX_LINKS = 5;

/** Uploaded file: returns an error text or null. */
export function checkFile(file) {
  if (!ALLOWED_TYPES.includes(file.type)) return "Only PNG, JPG, WebP or GIF pictures are allowed.";
  if (file.size > MAX_UPLOAD_BYTES) return `This picture is too big (max ${MAX_UPLOAD_MB} MB).`;
  return null;
}

/** Picture link: must be https, not SVG, and must really load as a picture. Resolves to an error text or null. */
export function checkImageUrl(raw) {
  const url = String(raw || "").trim();
  return new Promise((resolve) => {
    if (url.length > MAX_URL_LENGTH) return resolve(`The link is too long (max ${MAX_URL_LENGTH} characters).`);
    let u; try { u = new URL(url); } catch { return resolve("That is not a valid link."); }
    if (u.protocol !== "https:") return resolve("Only secure https:// picture links are allowed.");
    if (/\.svg$/i.test(u.pathname)) return resolve("SVG files are not allowed. Use PNG, JPG, WebP or GIF.");
    const img = new Image();
    const timer = setTimeout(() => { img.src = ""; resolve("The picture took too long to load."); }, 8000);
    img.onload = () => { clearTimeout(timer); resolve(img.naturalWidth > MAX_IMAGE_SIDE || img.naturalHeight > MAX_IMAGE_SIDE ? `The picture is too large (max ${MAX_IMAGE_SIDE}px).` : null); };
    img.onerror = () => { clearTimeout(timer); resolve("That link is not a picture, or it cannot be loaded."); };
    img.referrerPolicy = "no-referrer";
    img.src = url;
  });
}

/** Profile link (not a picture): https only, short. Returns the clean URL or null. */
export function safeLink(raw) {
  const s = String(raw || "").trim();
  if (!s || s.length > MAX_LINK_LENGTH) return null;
  try { const u = new URL(s); return u.protocol === "https:" ? u.href : null; } catch { return null; }
}
