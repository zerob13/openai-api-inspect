import { FastifyPluginAsync, FastifyRequest } from "fastify";
import config from "../lib/config";
// import { request as undiciRequest, Dispatcher } from 'undici'; // Removed direct undici import
import { Readable } from "stream";
import { pipeline } from "stream/promises"; // Import promise-based pipeline

// Helper to clone headers, excluding problematic ones
function cloneHeaders(originalHeaders: FastifyRequest["headers"]): any {
  const headers: any = {};
  for (const key in originalHeaders) {
    // fetch handles host, content-length, connection automatically
    if (
      key.toLowerCase() === "host" ||
      key.toLowerCase() === "content-length" ||
      key.toLowerCase() === "connection"
    ) {
      continue;
    }
    const value = originalHeaders[key];
    if (value !== undefined) {
      // HeadersInit expects string values
      headers[key] = Array.isArray(value) ? value.join(", ") : value;
    }
  }
  return headers;
}

const proxyRoutes: FastifyPluginAsync = async (fastify, opts) => {
  fastify.route({
    method: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"], // Handle common HTTP methods
    url: "/*", // Capture all paths under the prefix (e.g., /v1)
    handler: async (request, reply) => {
      const requestId = request.id;
      const method = request.method; // No need for Dispatcher.HttpMethod type
      const originalUrl = request.url; // e.g., /chat/completions?query=...
      const requestBody = request.body; // Fastify parses body based on Content-Type
      const headers = request.headers;

      // Log request details (Redact Authorization header)
      const loggableHeaders = { ...headers };
      if (loggableHeaders.authorization) {
        loggableHeaders.authorization = "[REDACTED]";
      }
      request.log.info({
        requestId,
        type: "request",
        method,
        url: originalUrl,
        headers: loggableHeaders,
        body: requestBody,
      });

      const targetUrl = `${config.targetBaseUrl}${originalUrl}`;
      const clonedHeaders = cloneHeaders(headers);

      try {
        // Use global fetch
        const response = await fetch(targetUrl, {
          method: method,
          headers: clonedHeaders,
          // Body needs to be string, Buffer, or ReadableStream for fetch
          body: requestBody ? JSON.stringify(requestBody) : undefined,
          // undici/fetch handles duplex streaming automatically when needed
        });

        request.log.info({
          requestId,
          type: "response",
          status: response.status,
          headers: Object.fromEntries(response.headers.entries()), // Convert Headers object to plain object
        });

        // Basic streaming detection
        const contentType = response.headers.get("content-type") || "";
        const isStreaming = contentType.includes("text/event-stream");

        // Forward status code and headers
        reply.code(response.status);
        response.headers.forEach((value, key) => {
          // Avoid setting headers that cause issues, like transfer-encoding when Fastify handles it
          if (
            key.toLowerCase() !== "transfer-encoding" &&
            key.toLowerCase() !== "content-length"
          ) {
            reply.header(key, value);
          }
        });

        if (isStreaming && response.body) {
          request.log.info({ requestId, type: "response_stream_start" });

          const reader = response.body.getReader();
          const sourceStream = new Readable({
            async read() {
              try {
                const { done, value } = await reader.read();
                if (done) {
                  request.log.info({
                    requestId,
                    type: "response_stream_end_target",
                  }); // Log target stream end
                  this.push(null); // Signal the end of the Node.js stream
                } else {
                  // Log the chunk (optional, might be verbose)
                  // request.log.info({ requestId, type: "response_stream_chunk", size: value.length });
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

          // Manually set headers on the raw response *before* piping
          // Filter problematic headers like before
          const responseHeaders = Object.fromEntries(
            [...response.headers.entries()].filter(
              ([key]) =>
                key.toLowerCase() !== "transfer-encoding" &&
                key.toLowerCase() !== "content-length"
            )
          );
          reply.raw.writeHead(response.status, responseHeaders);

          try {
            // Use pipeline for robust piping
            await pipeline(sourceStream, reply.raw);
            request.log.info({
              requestId,
              type: "response_stream_pipeline_success",
            });
            // Pipeline success means stream finished sending to client
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
            // Ensure source stream is destroyed if pipeline fails
            if (!sourceStream.destroyed) {
              sourceStream.destroy(pipelineError);
            }
            // Avoid sending error if headers already sent
            if (!reply.raw.headersSent) {
              // We haven't sent anything, so we can still send a normal error response
              // Note: We can't use reply.code().send() here as we already accessed reply.raw
              reply.raw.statusCode = 500;
              reply.raw.setHeader("Content-Type", "application/json");
              reply.raw.end(JSON.stringify({ error: "Stream Pipeline Error" }));
            } else if (!reply.raw.writableEnded) {
              // Headers sent, but stream might still be open - terminate it.
              reply.raw.end();
            }
          }
          // Since we 'await pipeline', the handler naturally waits for the stream to end or error.
          // No need to call reply.send() here.
        } else if (response.body) {
          // Buffer the response body for non-streaming responses
          const responseBody = await response.text(); // Use text() for simplicity
          let loggedBody: any = responseBody;
          try {
            // Attempt to parse if JSON, otherwise log as text
            if (
              response.headers.get("content-type")?.includes("application/json")
            ) {
              loggedBody = JSON.parse(responseBody);
            }
          } catch (e) {
            /* Ignore parsing error, log as text */
          }

          request.log.info({
            requestId,
            type: "response_body",
            body: loggedBody,
          });
          reply.send(responseBody); // Send the buffered body
        } else {
          // Handle cases with no response body (e.g., 204 No Content)
          request.log.info({ requestId, type: "response_empty" });
          reply.send(); // Send empty response
        }
      } catch (error: any) {
        request.log.error(
          {
            requestId,
            type: "error",
            error: error.message,
            stack: error.stack,
          },
          `Error proxying request to ${targetUrl}`
        );
        reply.code(502).send({ error: "Proxy Error", message: error.message });
      }
    },
  });
};

export default proxyRoutes;
