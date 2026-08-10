// style-src keeps 'unsafe-inline' because the markup uses inline style
// attributes; scripts are fully locked down (no inline handlers remain,
// and the CDN script is SRI-pinned in index.html).
//
// The type faces are served from this origin, so font-src is 'self' and both
// Google hosts are gone from the policy entirely — a page cannot load a font
// from anywhere else even if a stylesheet asked it to.
const CSP = [
  "default-src 'self'",
  "script-src 'self' https://cdn.jsdelivr.net",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

export function securityHeaders(req, res, next) {
  res.set({
    "Content-Security-Policy": CSP,
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  });
  next();
}
