// Single source of truth for "external video links only" — highlight video
// URLs must point at one of these hosts, never our own storage. Mirrored on
// the frontend (src/utils/videoUrlAllowlist.js) for client-side validation;
// this server-side check is the one that actually matters.
const ALLOWED_HOSTS = ["youtube.com", "youtu.be", "hudl.com", "vimeo.com"];

function isAllowedVideoUrl(url) {
  try {
    const { hostname } = new URL(url);
    const normalized = hostname.replace(/^www\./, "").toLowerCase();
    return ALLOWED_HOSTS.some(
      (host) => normalized === host || normalized.endsWith(`.${host}`)
    );
  } catch {
    return false;
  }
}

module.exports = { isAllowedVideoUrl, ALLOWED_HOSTS };
