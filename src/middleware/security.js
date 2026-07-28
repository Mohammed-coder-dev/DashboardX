// CSP is omitted: the frontend still uses inline event handlers and inline
// styles, so any useful policy would require 'unsafe-inline' anyway.
export function securityHeaders(req, res, next) {
  res.set({
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  });
  next();
}
