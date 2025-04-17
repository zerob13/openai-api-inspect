import Fastify from "fastify";
import logger from "./lib/logger";
import cors from "@fastify/cors";
import proxyRoutes from "./routes/proxy";
import fastifyStatic from "@fastify/static";
import fastifyWebsocket from "@fastify/websocket";
import path from "path";
import ws from "ws";

// Keep track of connected WebSocket clients
const connections = new Set<ws>();

// Extend FastifyInstance interface for decorator typing (optional but good practice)
declare module "fastify" {
  interface FastifyInstance {
    websocketConnections: Set<ws>;
    broadcast(message: any): void;
  }
}

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

  // Decorate Fastify instance with connections set and broadcast function
  server.decorate("websocketConnections", connections);
  server.decorate("broadcast", (message: any) => {
    const stringifiedMessage = JSON.stringify(message);
    server.log.debug(
      { type: "broadcast", count: connections.size },
      "Broadcasting message to WS clients"
    );
    connections.forEach((socket) => {
      if (socket.readyState === ws.OPEN) {
        socket.send(stringifiedMessage, (err: Error | undefined) => {
          if (err) {
            server.log.error(
              { err },
              "Error sending message to WebSocket client"
            );
            // Optionally remove the connection if sending fails repeatedly
            // connections.delete(socket);
          }
        });
      } else if (
        socket.readyState === ws.CLOSING ||
        socket.readyState === ws.CLOSED
      ) {
        // Clean up closed connections proactively
        connections.delete(socket);
      }
    });
  });

  // Register plugins
  server.register(cors, {
    origin: true, // Allow all origins reflectively (more secure than '*')
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Request-ID"], // Allow common headers
  });

  // Register static file server for the UI
  server.register(fastifyStatic, {
    root: path.join(__dirname, "..", "public"),
    prefix: "/ui/", // Serve UI under /ui/ path
  });
  server.get("/", (request, reply) => {
    reply.redirect("/ui/");
  });

  // Register WebSocket plugin
  server.register(fastifyWebsocket);

  // Register API routes AND WebSocket route
  server.register(async (instance) => {
    instance.log.info("Registering routes...");

    // Health check route
    instance.get("/health", async (request, reply) => {
      return { status: "ok" };
    });

    // Register the main proxy routes (no prefix change needed here)
    // The original prefix was inside the anonymous function, keep it there.
    // The broadcast function will be available via request.server.broadcast
    instance.register(proxyRoutes, { prefix: "/v1" });

    // Register WebSocket route
    instance.get(
      "/ws",
      { websocket: true },
      (connection: any, req /* FastifyRequest */) => {
        const socket = connection;
        instance.log.info("Web UI client connected");
        connections.add(socket);

        socket.on("message", (message: Buffer) => {
          // Handle messages from client if needed (e.g., ping/pong)
          instance.log.debug(
            { data: message.toString() },
            "Received message from WS client"
          );
          // Example: Echo back
          // if (socket.readyState === ws.OPEN) {
          //    socket.send('pong');
          // }
        });

        socket.on("close", () => {
          instance.log.info("Web UI client disconnected");
          connections.delete(socket);
        });

        socket.on("error", (error: Error) => {
          instance.log.error({ error }, "Web UI client WebSocket error");
          connections.delete(socket); // Clean up on error
        });
      }
    );

    instance.log.info(
      "Routes registered under /v1, /health, and WebSocket at /ws."
    );
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
