# OpenAI API Inspect Proxy

A simple proxy server designed to inspect and forward requests to OpenAI-compatible APIs. Useful for debugging, logging, or routing API calls.

---

# OpenAI API 检查代理

一个简单的代理服务器，用于检查和转发对 OpenAI 兼容 API 的请求。适用于调试、记录日志或路由 API 调用。

---

## Key Features / 主要特性

*   **Transparent Proxying:** Forwards requests to any OpenAI-compatible API endpoint without altering core content.
    *   **透明代理:** 将请求转发到任何 OpenAI 兼容的 API 端点，不修改核心内容。
*   **Streaming Support:** Handles both standard JSON responses and `text/event-stream` (Server-Sent Events) for streaming completions.
    *   **流式支持:** 同时处理标准 JSON 响应和用于流式完成的 `text/event-stream` (服务器发送事件)。
*   **Configurable:** Target API URL, proxy host, and port can be configured via command-line arguments or environment variables.
    *   **可配置:** 目标 API URL、代理监听主机和端口可通过命令行参数或环境变量进行配置。
*   **Request/Response Logging:** Logs details of incoming requests and outgoing responses (headers, body) for inspection. The `Authorization` header is automatically redacted.
    *   **请求/响应日志:** 记录传入请求和传出响应的详细信息（请求头、请求体）以供检查。`Authorization` 请求头会自动脱敏处理。
*   **Stateless API Key Handling:** Does **not** store, manage, or inject API keys. Relies entirely on the `Authorization` header provided by the client.
    *   **无状态 API 密钥处理:** **不**存储、管理或注入 API 密钥。完全依赖客户端提供的 `Authorization` 请求头。

---

## Installation / 安装

1.  Clone the repository:
    ```bash
    git clone https://github.com/zerob13/openai-api-inspect.git
    cd openai-api-inspect
    ```
2.  Install dependencies:
    ```bash
    npm install @fastify/static @fastify/websocket open @types/open
    ```
3.  Build the project (compiles TypeScript to JavaScript):
    ```bash
    npm run build
    ```
    *(Note: The `prepare` script usually runs this automatically after `npm install`)*

---

## Usage / 使用方法

Run the proxy server from the project root directory:

从项目根目录运行代理服务器：

```bash
node dist/index.js [options]
```

**Configuration Options / 配置选项:**

Options can be provided via command-line flags or environment variables. Command-line flags take precedence.

配置项可以通过命令行标志或环境变量提供。命令行标志优先。

| Option              | CLI Flag                | Environment Variable | Default Value                       | Description                                       | 说明                              |
| :------------------ | :---------------------- | :------------------- | :---------------------------------- | :------------------------------------------------ | :-------------------------------- |
| Target API Base URL | `-t`, `--targetBaseUrl` | `TARGET_BASE_URL`    | `https://api.ppinfra.com/v3/openai` | The base URL of the target OpenAI-compatible API. | 目标 OpenAI 兼容 API 的基础 URL。 |
| Proxy Host          | `-H`, `--host`          | `PROXY_HOST`         | `0.0.0.0`                           | Host for the proxy server to listen on.           | 代理服务器监听的主机地址。        |
| Proxy Port          | `-p`, `--port`          | `PROXY_PORT`         | `7891`                              | Port for the proxy server to listen on.           | 代理服务器监听的端口。            |
| Show Help           | `-h`, `--help`          | -                    | -                                   | Display help information.                         | 显示帮助信息。                    |

**Examples / 示例:**

*   Run with default settings (Target: `https://api.ppinfra.com/v3/openai`, Port: `7891`):
    *   使用默认设置运行 (目标: `https://api.ppinfra.com/v3/openai`, 端口: `7891`):
    ```bash
    node dist/index.js
    ```
*   Specify a different target API and port:
    *   指定不同的目标 API 和端口:
    ```bash
    node dist/index.js --targetBaseUrl https://api.openai.com/v1 --port 8080
    # or using aliases
    node dist/index.js -t https://api.openai.com/v1 -p 8080
    ```
*   Use environment variables:
    *   使用环境变量:
    ```bash
    export TARGET_BASE_URL=https://api.custom-ai.com/
    export PROXY_PORT=9000
    node dist/index.js
    ```

---

## Important Notes / 重要提示

*   **API Keys:** This proxy is **transparent** regarding authentication. It **does not** add, remove, or validate API keys. The client application making requests to this proxy **must** include the correct `Authorization: Bearer YOUR_API_KEY` header required by the target API.
    *   **API 密钥:** 此代理在身份验证方面是**透明的**。它**不会**添加、删除或验证 API 密钥。向此代理发出请求的客户端应用程序**必须**包含目标 API 所需的正确 `Authorization: Bearer YOUR_API_KEY` 请求头。
*   **Target URL:** Ensure the `targetBaseUrl` points to the *base path* of the target API (e.g., `https://api.openai.com/v1`), not a specific endpoint like `/chat/completions`. The proxy forwards the path and query parameters from the original request.
    *   **目标 URL:** 确保 `targetBaseUrl` 指向目标 API 的*基础路径*（例如 `https://api.openai.com/v1`），而不是像 `/chat/completions` 这样的具体端点。代理会转发原始请求中的路径和查询参数。
*   **Logging:** Request and response bodies are logged for debugging purposes. Ensure your logging environment is secure if sensitive data might be present in the bodies. API keys in the `Authorization` header are redacted automatically.
    *   **日志记录:** 为了调试目的，会记录请求和响应体。如果请求体中可能包含敏感数据，请确保您的日志记录环境是安全的。`Authorization` 头中的 API 密钥会自动进行脱敏处理。
*   **HTTPS:** Currently, the proxy listens on HTTP. If you need HTTPS for the proxy itself, consider placing it behind a dedicated reverse proxy like Nginx or Caddy that handles TLS termination.
    *   **HTTPS:** 当前，代理服务器监听 HTTP。如果您需要代理服务器本身支持 HTTPS，可以考虑将其部署在专门的反向代理（如 Nginx 或 Caddy）之后，由它们来处理 TLS 终止。

---

## Future Plans / 未来计划

*   **Improve Log Formatting:** Enhance the console log output for better readability (e.g., using `pino-pretty`, adding colors, better structuring).
    *   **改进日志格式:** 优化控制台日志输出以提高可读性（例如，使用 `pino-pretty`、添加颜色、优化结构）。
*   **Enhance JSON Logging:** Improve logging of JSON request/response bodies (e.g., pretty-printing, potential truncation for very large bodies).
    *   **增强 JSON 日志记录:** 改进 JSON 请求/响应体的日志记录（例如，美化打印，对非常大的请求体进行可能的截断）。

---

## License / 许可证

MIT