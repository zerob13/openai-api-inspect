import dotenv from "dotenv";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";

dotenv.config(); // Load .env file if it exists

const argv = yargs(hideBin(process.argv))
  .usage("Usage: $0 [options]")
  // Target API Base URL (Optional Argument or Environment Variable)
  .option("targetBaseUrl", {
    alias: "t",
    describe:
      "The base URL of the target OpenAI compatible API. Defaults to env variable TARGET_BASE_URL or https://api.ppinfra.com/v3/openai",
    type: "string",
  })
  // Target API Key Removed - Key should come from client request header
  // Proxy Host (Optional Argument or Environment Variable)
  .option("host", {
    alias: "H",
    describe:
      "Host for the proxy server to listen on. Defaults to env variable PROXY_HOST or 0.0.0.0",
    type: "string",
  })
  // Proxy Port (Optional Argument or Environment Variable)
  .option("port", {
    alias: "p",
    describe:
      "Port for the proxy server to listen on. Defaults to env variable PROXY_PORT or 7891",
    type: "number",
  })
  .demandCommand(
    0,
    0,
    "Too many commands provided. No positional commands are expected."
  )
  .help("h")
  .alias("h", "help")
  .strict() // Throw error on unknown options or incorrect number of commands
  .parseSync();

// Type assertion needed because parseSync returns a complex type
interface ArgvShape {
  [x: string]: unknown;
  _: (string | number)[];
  $0: string;
  targetBaseUrl?: string;
  host?: string;
  port?: number;
}

const parsedArgv = argv as ArgvShape;

// Determine the target base URL
const targetBaseUrl =
  parsedArgv.targetBaseUrl ||
  process.env.TARGET_BASE_URL ||
  "https://api.ppinfra.com/v3/openai";

// Validate and structure the configuration
if (typeof targetBaseUrl !== "string" || !targetBaseUrl) {
  // This condition should theoretically not be met with the default, but good practice to keep a check
  console.error("Error: Target Base URL is somehow missing or invalid.");
  process.exit(1);
}

const config = {
  targetBaseUrl: targetBaseUrl.replace(/\/$/, ""), // Remove trailing slash if exists
  proxyHost: parsedArgv.host || process.env.PROXY_HOST || "0.0.0.0",
  proxyPort: parsedArgv.port ?? parseInt(process.env.PROXY_PORT || "7891", 10),
};

// Validate URL format (basic check)
if (
  !config.targetBaseUrl.startsWith("http://") &&
  !config.targetBaseUrl.startsWith("https://")
) {
  console.error(
    `Error: Invalid targetBaseUrl "${config.targetBaseUrl}". It must start with http:// or https://`
  );
  process.exit(1);
}

export default config;
