// Legacy share links pointed at /?a=<id>; the app now lives at /app.
(function () {
  var params = new URLSearchParams(location.search);
  if (params.get("a")) location.replace("/app" + location.search);
})();
