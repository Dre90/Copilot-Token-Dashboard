import Fastify from "fastify";
import cors from "@fastify/cors";
import { registerApiRoutes, registerCopilotRoutes, registerOtlpRoutes } from "./routes/index.js";

const OTLP_PORT = parseInt(process.env.OTLP_PORT ?? "4318", 10);
const API_PORT = parseInt(process.env.API_PORT ?? "4319", 10);

async function startOtlp() {
  const app = Fastify({
    logger: { level: "info" },
    bodyLimit: 50 * 1024 * 1024,
  });
  await app.register(cors, { origin: true });
  registerOtlpRoutes(app);
  await app.listen({ port: OTLP_PORT, host: "0.0.0.0" });
  app.log.info(`OTLP receiver listening on :${OTLP_PORT}`);
}

async function startApi() {
  const app = Fastify({ logger: { level: "info" } });
  await app.register(cors, { origin: true });
  registerApiRoutes(app);
  registerCopilotRoutes(app);
  await app.listen({ port: API_PORT, host: "0.0.0.0" });
  app.log.info(`API + SSE listening on :${API_PORT}`);
}

await Promise.all([startOtlp(), startApi()]);
