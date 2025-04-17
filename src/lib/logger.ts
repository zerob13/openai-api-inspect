import pino from "pino";

const isDevelopment = process.env.NODE_ENV === "development";

const loggerOptions: pino.LoggerOptions = {
  level: isDevelopment ? "debug" : "info", // Log more in development
};

if (isDevelopment) {
  loggerOptions.transport = {
    target: "pino-pretty", // Use pino-pretty in development
    options: {
      colorize: true, // Enable colorized output
      translateTime: "SYS:standard", // Use standard time format
      ignore: "pid,hostname", // Hide pid and hostname
    },
  };
}

const logger = pino(loggerOptions);

export default logger;
