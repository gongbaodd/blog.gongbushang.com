// Cloudinary public_id from a delivery URL (MIG-1b). Pure function, no side effects.
//
//   https://res.cloudinary.com/<cloud>/image/upload/[<transforms>/][v<version>/]<public_id>.<ext>[?query]
//
// Returns the public_id as Cloudinary stores it: no transformations, no version, no extension.
// The full URL is kept separately as the featured_image `src`, so rendering is unaffected.
export function cloudinaryPublicId(url) {
  const path = decodeURIComponent(new URL(url.split("?")[0]).pathname);
  // Leading transformation segments (e.g. a_-360/, w_300,h_200/) are delivery options, not part of the id.
  const rest = path
    .replace(/^\/[^/]+\/image\/upload\//, "")
    .replace(/^(?:[A-Za-z]{1,3}_[^/]*\/)+/, "")
    .replace(/^v\d+\//, "");
  return rest.replace(/\.[A-Za-z0-9]+$/, "");
}
