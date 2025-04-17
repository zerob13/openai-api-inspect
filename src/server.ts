import Fastify from "fastify";
import logger from "./lib/logger";
import cors from "@fastify/cors";
import proxyRoutes from "./routes/proxy";

function buildServer() {
  const server = Fastify({
    logger: logger, // Use our configured Pino instance
    genReqId: function (req) {
      // Generate request IDs
      return (
        (req.headers["x-request-id"] as string) ||
        require("crypto").randomUUID()
      );
    },
  });

  // Register plugins
  server.register(cors, {
    origin: true, // Allow all origins reflectively (more secure than '*')
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Request-ID"], // Allow common headers
  });

  // Register API routes
  server.register(async (instance) => {
    instance.log.info("Registering routes...");

    // Health check route
    instance.get("/health", async (request, reply) => {
      return { status: "ok" };
    });

    // Register the main proxy routes under /v1 prefix
    instance.register(proxyRoutes, { prefix: "/v1" });

    instance.log.info("Routes registered under /v1 and /health.");
  });

  server.ready((err) => {
    if (err) {
      server.log.error(err, "Error during server setup");
      process.exit(1);
    }
    // Log routes only after server is ready and routes are registered
    // server.log.info('Server successfully booted! Available routes:\n${server.printRoutes()}');
    server.log.info("Server successfully booted!");
  });

  return server;
}

export default buildServer;
