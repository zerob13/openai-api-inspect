#!/usr/bin/env node

import config from "./lib/config";
import logger from "./lib/logger";
import buildServer from "./server";
import open from "open";

async function start() {
  const server = buildServer();

  try {
    logger.info(`Starting proxy server for target: ${config.targetBaseUrl}`);
    logger.info(
      `Proxy listening on http://${config.proxyHost}:${config.proxyPort}`
    );
    // Removed the check for config.targetApiKey and the associated warning/info messages.
    // API key should be passed via client request header.

    await server.listen({ host: config.proxyHost, port: config.proxyPort });

    // --- Automatically open the browser to the UI ---
    const uiUrl = `http://localhost:${config.proxyPort}/ui/`;
    logger.info(`Opening inspect UI at ${uiUrl}`);
    try {
      await open(uiUrl);
    } catch (openError: any) {
      logger.error(
        { err: openError },
        `Failed to open browser automatically. Please navigate to ${uiUrl} manually.`
      );
    }
    // --- End ---

    // Optional: Graceful shutdown handling
    const signals = ["SIGINT", "SIGTERM"];
    for (const signal of signals) {
      process.on(signal, async () => {
        logger.info(`Received ${signal}, shutting down gracefully...`);
        await server.close();
        process.exit(0);
      });
    }
  } catch (err) {
    // Use server.log if available, otherwise fallback to console
    const log = server.log || console;
    log.error(err, "Error starting server");
    process.exit(1);
  }
}

start();
