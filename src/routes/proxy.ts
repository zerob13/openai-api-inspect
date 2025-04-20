import { FastifyPluginAsync, FastifyRequest } from "fastify";
import config from "../lib/config";
// import { request as undiciRequest, Dispatcher } from 'undici'; // Removed direct undici import
import { Readable } from "stream";
import { pipeline } from "stream/promises"; // Import promise-based pipeline

// Helper to clone headers, excluding problematic ones and potentially redacting
function cloneAndRedactHeaders(
  originalHeaders: FastifyRequest["headers"],
  forBroadcast: boolean = false
): any {
  const headers: any = {};
  for (const key in originalHeaders) {
    const lowerKey = key.toLowerCase();
    // Exclude headers problematic for fetch/proxying
    if (
      lowerKey === "host" ||
      lowerKey === "content-length" ||
      lowerKey === "connection"
    ) {
      continue;
    }
    const value = originalHeaders[key];
    if (value !== undefined) {
      let finalValue = Array.isArray(value) ? value.join(", ") : value;
      // Redact Authorization header specifically for broadcasts
      if (forBroadcast && lowerKey === "authorization") {
        finalValue = "[REDACTED]";
      }
      headers[key] = finalValue;
    }
  }
  return headers;
}

const proxyRoutes: FastifyPluginAsync = async (fastify, opts) => {
  fastify.route({
    method: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    url: "/*",
    handler: async (request, reply) => {
      const requestId = request.id;
      const method = request.method;
      const originalUrl = request.url;
      const requestBody = request.body; // Capture potentially parsed body
      const originalRequestHeaders = request.headers; // Keep original for logging/broadcast

      // Log request details (Redact Authorization header for server logs)
      const loggableHeaders = cloneAndRedactHeaders(
        originalRequestHeaders,
        true
      ); // Use helper for redaction

      request.log.info({
        requestId,
        type: "request",
        method,
        url: originalUrl,
        headers: loggableHeaders, // Use redacted headers for logging
        // Body logging might be verbose, consider conditional logging or truncation
        // body: requestBody,
      });

      // --- Prepare Request Data for Broadcast (Capture BEFORE modifying/sending) ---
      const broadcastRequestData = {
        method: method,
        url: originalUrl,
        headers: cloneAndRedactHeaders(originalRequestHeaders, true), // Redact for broadcast
        // Ensure body sent to broadcast is a serializable format (string/object)
        // Avoid sending raw Buffers or Streams directly if not intended
        body: requestBody
          ? typeof requestBody === "object"
            ? JSON.parse(JSON.stringify(requestBody))
            : String(requestBody)
          : undefined,
      };

      // --- Remove Old Broadcast ---
      // try {
      //   request.server.broadcast({ type: "new_request", /* ... */ });
      // } catch (broadcastError: any) { /* ... */ }
      // --- End Remove Old Broadcast ---

      let targetUrl;
      // 检查配置的targetBaseUrl是否已经包含了v1路径
      if (config.targetBaseUrl.endsWith("/v1")) {
        // 如果已经包含/v1，则移除originalUrl开头的/v1部分，防止重复
        const pathWithoutPrefix = originalUrl.replace(/^\/v1/, "");
        targetUrl = `${config.targetBaseUrl}${pathWithoutPrefix}`;
      } else {
        // 原始逻辑
        targetUrl = `${config.targetBaseUrl}${originalUrl}`;
      }

      // 记录最终的目标URL，用于调试
      request.log.info({
        requestId,
        type: "proxy_target",
        url: targetUrl,
      });

      // Use non-redacted headers for the actual fetch request
      const fetchHeaders = cloneAndRedactHeaders(originalRequestHeaders, false);

      let response: Response | null = null; // Define response variable outside try block

      try {
        // Use global fetch
        response = await fetch(targetUrl, {
          method: method,
          headers: fetchHeaders,
          // Body needs to be string, Buffer, or ReadableStream for fetch
          // Fastify might have already parsed JSON, so stringify it back if needed.
          // Handle other content types appropriately if not JSON.
          body: requestBody ? JSON.stringify(requestBody) : undefined,
        });

        const responseStatus = response.status;
        const responseHeaders = Object.fromEntries(response.headers.entries());

        request.log.info({
          requestId,
          type: "response",
          status: responseStatus,
          headers: responseHeaders, // Log actual response headers
        });

        // Basic streaming detection
        const contentType = response.headers.get("content-type") || "";
        const isStreaming = contentType.includes("text/event-stream");

        // --- Broadcast Initial Log (Request + Response Headers) ---
        const initialLogData = {
          id: requestId,
          timestamp: new Date().toISOString(),
          request: broadcastRequestData, // Use captured request data
          response: {
            status: responseStatus,
            headers: responseHeaders,
            isStreaming: isStreaming,
            // Body added later for non-streaming
          },
        };
        try {
          request.server.broadcast({ type: "log", data: initialLogData });
        } catch (broadcastError: any) {
          request.log.error(
            { err: broadcastError },
            "Failed to broadcast initial log"
          );
        }
        // --- End Initial Broadcast ---

        // --- Remove Old Broadcast ---
        // try {
        //   request.server.broadcast({ type: "response_headers", /* ... */ });
        // } catch (broadcastError: any) { /* ... */ }
        // --- End Remove Old Broadcast ---

        // Forward status code
        reply.code(responseStatus);

        // --- Handle Body / Streaming ---

        if (isStreaming && response.body) {
          request.log.info({ requestId, type: "response_stream_start" });

          // Forward headers (ensure this happens before piping/sending body)
          // These headers should be flushed automatically when piping to reply.raw starts
          Object.entries(responseHeaders).forEach(([key, value]) => {
            // Avoid setting headers that cause issues, like transfer-encoding when Fastify handles it
            if (
              key.toLowerCase() !== "transfer-encoding" &&
              key.toLowerCase() !== "content-length"
            ) {
              reply.header(key, value as string);
            }
          });

          const reader = response.body.getReader();
          const sourceStream = new Readable({
            async read() {
              try {
                const { done, value } = await reader.read();
                if (done) {
                  request.log.info({
                    requestId,
                    type: "response_stream_end_target",
                  });
                  // --- Remove Old Broadcast ---
                  // try { request.server.broadcast({ type: "stream_end", /* ... */ }); } catch (broadcastError: any) { /* ... */ }
                  // --- End Remove Old Broadcast ---
                  this.push(null); // Signal the end of the Node.js stream
                } else {
                  // --- Broadcast Stream Chunk ---
                  try {
                    const chunkString = Buffer.from(value).toString("utf-8"); // Decode chunk
                    request.server.broadcast({
                      type: "streamChunk", // Use 'streamChunk' type
                      id: requestId,
                      chunk: chunkString,
                    });
                  } catch (broadcastError: any) {
                    request.log.error(
                      { err: broadcastError },
                      "Failed to broadcast stream_chunk"
                    );
                  }
                  // --- End Broadcast ---
                  this.push(value); // Push the data chunk
                }
              } catch (streamError: any) {
                request.log.error(
                  {
                    requestId,
                    type: "response_stream_error",
                    error: streamError.message,
                    stack: streamError.stack,
                  },
                  "Error reading from target stream"
                );
                // --- Broadcast Stream Error ---
                try {
                  request.server.broadcast({
                    type: "log", // Use 'log' type for errors too
                    data: {
                      id: requestId,
                      timestamp: new Date().toISOString(),
                      request: broadcastRequestData, // Include original request
                      error: `Stream read error: ${streamError.message}`,
                    },
                  });
                } catch (broadcastError: any) {
                  request.log.error(
                    { err: broadcastError },
                    "Failed to broadcast stream_error"
                  );
                }
                // --- End Broadcast ---
                this.destroy(streamError); // Destroy the Node.js stream on error
              }
            },
            destroy(err, callback) {
              // Ensure the reader is cancelled when the stream is destroyed
              reader
                .cancel()
                .then(() => callback(err))
                .catch(callback);
            },
          });

          // --- Use pipeline to pipe stream to client ---
          try {
            // await pipeline(sourceStream, reply.raw);
            // Using reply.raw bypasses Fastify's standard reply mechanisms after this point.
            // Ensure status/headers are set via reply.code/reply.header *before* this.
            await pipeline(sourceStream, reply.raw);
            request.log.info({
              requestId,
              type: "response_stream_pipeline_success",
            });
          } catch (pipelineError: any) {
            request.log.error(
              {
                requestId,
                type: "response_stream_pipeline_error",
                error: pipelineError.message,
                stack: pipelineError.stack,
              },
              "Error piping stream to client"
            );
            // --- Broadcast Pipeline Error ---
            try {
              request.server.broadcast({
                type: "log",
                data: {
                  id: requestId,
                  timestamp: new Date().toISOString(),
                  request: broadcastRequestData,
                  error: `Stream pipeline error: ${pipelineError.message}`,
                },
              });
            } catch (broadcastError: any) {
              request.log.error(
                { err: broadcastError },
                "Failed to broadcast pipeline_error"
              );
            }
            // --- End Broadcast ---
            // If pipeline fails, ensure the source stream is destroyed
            if (!sourceStream.destroyed) {
              sourceStream.destroy(pipelineError);
            }
            // If headers haven't been sent yet (unlikely here, but possible if error is immediate),
            // we could potentially send a standard error response.
            // However, usually headers are sent once piping starts, so we can only try to end the response.
            if (!reply.raw.writableEnded) {
              reply.raw.end(); // Attempt to gracefully end the response
            }
          }
          // --- End pipeline ---

          // --- Remove old reply.send() ---
          // reply.send(sourceStream);
          // --- End Remove ---
        } else {
          // --- Non-Streaming ---
          // Forward headers first
          Object.entries(responseHeaders).forEach(([key, value]) => {
            if (
              key.toLowerCase() !== "transfer-encoding" &&
              key.toLowerCase() !== "content-length" // Let Fastify/Node set this
            ) {
              reply.header(key, value as string);
            }
          });

          // Read the full body
          const responseBody = await response.text(); // Read as text, could also use .json() if sure

          // --- Broadcast Final Log with Body ---
          const finalLogData = {
            ...initialLogData, // Start with initial log data
            response: {
              ...initialLogData.response,
              body: responseBody, // Add the full body
            },
          };
          try {
            // We could technically just update the existing log on the client,
            // but sending the full log again is simpler for now.
            request.server.broadcast({ type: "log", data: finalLogData });
          } catch (broadcastError: any) {
            request.log.error(
              { err: broadcastError },
              "Failed to broadcast final log"
            );
          }
          // --- End Final Broadcast ---

          reply.send(responseBody); // Send the complete body
        }
      } catch (error: any) {
        request.log.error(
          { requestId, error: error.message, stack: error.stack },
          "Proxy request failed"
        );
        // --- Broadcast Fetch/General Error ---
        try {
          request.server.broadcast({
            type: "log", // Use 'log' type
            data: {
              id: requestId,
              timestamp: new Date().toISOString(),
              request: broadcastRequestData, // Include original request
              error: `Proxy Error: ${error.message}`,
            },
          });
        } catch (broadcastError: any) {
          request.log.error(
            { err: broadcastError },
            "Failed to broadcast proxy_error"
          );
        }
        // --- End Broadcast ---

        // Send appropriate error reply to the original client
        if (!reply.sent) {
          // Check if headers/reply already sent (e.g., during streaming error)
          if (response && response.status >= 400) {
            // If we got an error response from the target server, forward it
            reply.code(response.status).send(await response.text());
          } else {
            // Otherwise, send a generic 500
            reply
              .code(500)
              .send({ error: "Proxy Error", message: error.message });
          }
        } else {
          request.log.warn(
            { requestId },
            "Reply already sent, cannot send error to client for failed proxy request."
          );
          // Optionally try to abruptly end the connection if possible and necessary
          // request.raw.destroy(); // More drastic measure
        }
      }
    },
  });
};

export default proxyRoutes;
