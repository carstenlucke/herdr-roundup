// The extension a downloaded image keeps, by its MIME type, or null when it
// isn't an image the preview draws. Pure, so node --test covers it.
const IMAGES = { "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp", "image/svg+xml": "svg" };
export const imageExtension = (mime) => IMAGES[String(mime).split(";")[0].trim().toLowerCase()] ?? null;
