import { createApp } from "./src/app.js";
import { config } from "./src/config.js";

const app = createApp();

const server = app.listen(config.port, () => console.log(`Ridge running at http://localhost:${config.port}`));

let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} received; finishing in-flight requests.`);
  const forceExit = setTimeout(() => {
    console.error("Graceful shutdown timed out.");
    process.exit(1);
  }, 10_000);
  forceExit.unref();
  server.close((err) => {
    clearTimeout(forceExit);
    if (err) console.error("Server shutdown failed.", err);
    process.exit(err ? 1 : 0);
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

export default app;
