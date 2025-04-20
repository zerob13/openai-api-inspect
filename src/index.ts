#!/usr/bin/env node

import config from "./lib/config";
import logger from "./lib/logger";
import buildServer from "./server";
import open from "open";

// 定义一个变量用于存储退出超时计时器
let exitTimeout: NodeJS.Timeout | null = null;

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

    // 改进的优雅退出处理
    const signals = ["SIGINT", "SIGTERM"];
    for (const signal of signals) {
      process.on(signal, async () => {
        logger.info(`Received ${signal}, shutting down gracefully...`);

        // 强制退出的超时处理，确保程序不会卡住
        if (exitTimeout) {
          clearTimeout(exitTimeout);
        }

        exitTimeout = setTimeout(() => {
          logger.warn("Forced exit due to shutdown timeout");
          process.exit(1);
        }, 3000); // 3秒后强制退出

        try {
          await server.close();
          logger.info("Server closed successfully");
          clearTimeout(exitTimeout as NodeJS.Timeout);
          process.exit(0);
        } catch (err) {
          logger.error({ err }, "Error during server shutdown");
          process.exit(1);
        }
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
