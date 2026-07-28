import { createApp } from "./src/app.js";
import { config } from "./src/config.js";

const app = createApp();

app.listen(config.port, () => console.log(`DashboardX running at http://localhost:${config.port}`));

export default app;
