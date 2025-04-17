document.addEventListener("DOMContentLoaded", () => {
  const connectButton = document.getElementById("connect-ws");
  const disconnectButton = document.getElementById("disconnect-ws");
  const wsStatus = document.getElementById("ws-status");
  const logContainer = document.getElementById("log-container");

  let socket;
  let userScrolledUp = false; // Flag to track user scroll position

  // --- Auto Scroll Check ---
  logContainer.addEventListener("scroll", () => {
    // Check if scrolled to bottom (with tolerance)
    const tolerance = 10;
    userScrolledUp =
      logContainer.scrollHeight -
        logContainer.scrollTop -
        logContainer.clientHeight >
      tolerance;
  });

  function maybeScrollToBottom() {
    if (!userScrolledUp) {
      logContainer.scrollTop = logContainer.scrollHeight;
    }
  }
  // --- End Auto Scroll Check ---

  function connectWebSocket() {
    const urlParams = new URLSearchParams(window.location.search);
    const customWsUrl = urlParams.get("wsUrl");

    let wsUrl;
    if (customWsUrl) {
      wsUrl = customWsUrl;
      console.log(`Connecting to custom WebSocket URL: ${wsUrl}`);
    } else {
      const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      wsUrl = `${wsProtocol}//${window.location.host}/ws`;
      console.log(`Connecting to default WebSocket URL: ${wsUrl}`);
    }

    if (socket && socket.readyState === WebSocket.OPEN) {
      console.warn("WebSocket is already connected.");
      return;
    }

    socket = new WebSocket(wsUrl);

    socket.onopen = (event) => {
      console.log("WebSocket connection opened:", event);
      appendStatusMessage("WebSocket 连接成功。", "success");
      wsStatus.textContent = "已连接";
      wsStatus.style.color = "green";
      connectButton.disabled = true;
      disconnectButton.disabled = false;
      userScrolledUp = false; // Reset scroll flag on connect
    };

    socket.onmessage = (event) => {
      console.log("Message from server:", event.data);
      let shouldScroll = !userScrolledUp; // Check scroll before processing

      try {
        const messageData = JSON.parse(event.data);

        if (messageData.type === "log" && messageData.data) {
          renderLogEntry(messageData.data); // Handles its own scrolling check
        } else if (
          messageData.type === "streamChunk" &&
          messageData.id &&
          messageData.chunk !== undefined
        ) {
          const streamContainer = document.getElementById(
            `stream-${messageData.id}`
          );
          if (streamContainer) {
            const chunkNode = document.createTextNode(messageData.chunk);
            streamContainer.appendChild(chunkNode);
            // Scroll within stream container if needed (optional)
            if (shouldScroll) {
              streamContainer.scrollTop = streamContainer.scrollHeight;
            }
            maybeScrollToBottom(); // Scroll main container if needed
          } else {
            console.warn(
              "Received stream chunk for unknown or non-streaming log entry:",
              messageData.id
            );
          }
        } else {
          console.warn("Received unexpected message format:", messageData);
          appendStatusMessage(`收到未知格式消息: ${event.data}`, "warning");
          maybeScrollToBottom(); // Scroll on status messages too
        }
      } catch (e) {
        console.error("Failed to parse message or render log:", e);
        appendStatusMessage(`处理消息时出错: ${event.data}`, "error");
        maybeScrollToBottom(); // Scroll on errors
      }
    };

    socket.onerror = (error) => {
      console.error("WebSocket Error:", error);
      appendStatusMessage(`WebSocket 错误: ${error}`, "error");
      wsStatus.textContent = "错误";
      wsStatus.style.color = "red";
      connectButton.disabled = false;
      disconnectButton.disabled = true;
      maybeScrollToBottom();
    };

    socket.onclose = (event) => {
      console.log("WebSocket connection closed:", event);
      const reason = event.reason ? ` Reason: ${event.reason}` : "";
      appendStatusMessage(
        `WebSocket 连接已关闭。 Code: ${event.code}${reason}`,
        "info"
      );
      wsStatus.textContent = "已断开";
      wsStatus.style.color = "red";
      connectButton.disabled = false;
      disconnectButton.disabled = true;
      socket = null;
      maybeScrollToBottom();
    };
  }

  function disconnectWebSocket() {
    if (socket) {
      socket.close();
    }
  }

  function appendStatusMessage(message, type = "info") {
    const wasScrolledToBottom = !userScrolledUp;
    const statusDiv = document.createElement("div");
    statusDiv.classList.add("status-message", `status-${type}`);
    statusDiv.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    logContainer.appendChild(statusDiv);
    if (wasScrolledToBottom) {
      // Scroll only if was at bottom before append
      logContainer.scrollTop = logContainer.scrollHeight;
    }
  }

  function renderLogEntry(log) {
    const wasScrolledToBottom = !userScrolledUp;

    const entryId = `log-${log.id}`;
    let entryDiv = document.getElementById(entryId);
    const isUpdate = !!entryDiv; // Check if we are updating an existing entry

    if (!isUpdate) {
      entryDiv = document.createElement("div");
      entryDiv.classList.add("request-entry");
      entryDiv.id = entryId;
    }

    const time = new Date(log.timestamp).toLocaleTimeString();

    // --- Summary Section ---
    let summaryHtml = "";
    if (log.request) {
      summaryHtml = `${log.request.method} ${log.request.url}`;
    } else {
      summaryHtml = "Log Entry";
    }
    if (log.response) {
      summaryHtml += ` - Response: ${log.response.status}`;
    } else if (log.error) {
      summaryHtml += " - Error";
    }
    summaryHtml += ` (${time}) [ID: ${log.id}]`;

    // --- Details Section ---
    let detailsHtml = "";

    // Request Details
    if (log.request) {
      const reqHeaders = log.request.headers || {};
      const reqBody = log.request.body;
      detailsHtml += `<div class="request-header-title">Request Details</div>`;
      detailsHtml += createCodeBlock("Headers", reqHeaders);
      if (reqBody !== undefined && reqBody !== null) {
        detailsHtml += createCodeBlock("Body", reqBody);
      }
    }

    // Response Details
    if (log.response) {
      const resHeaders = log.response.headers || {};
      const resBody = log.response.body;
      const isStreaming = log.response.isStreaming;
      detailsHtml += `<div class="response-header-title">Response Details</div>`;
      detailsHtml += createCodeBlock("Headers", resHeaders);
      if (isStreaming) {
        detailsHtml += `<div class="info">Stream Output:</div><div class="stream-output" id="stream-${log.id}"></div>`;
      } else if (resBody !== undefined && resBody !== null) {
        detailsHtml += createCodeBlock("Body", resBody);
      }
    } else if (log.error) {
      detailsHtml += `<div class="error">PROXY ERROR: ${escapeHtml(
        log.error
      )}</div>`;
    }

    // --- Construct Full Entry ---
    entryDiv.innerHTML = `
      <div class="entry-summary">${escapeHtml(summaryHtml)}</div>
      <div class="entry-details">${detailsHtml}</div>
    `;

    // Add toggle listener only if it's a new entry
    if (!isUpdate) {
      const summaryElement = entryDiv.querySelector(".entry-summary");
      summaryElement.addEventListener("click", () => {
        entryDiv.classList.toggle("expanded");
      });
      logContainer.appendChild(entryDiv);
    }

    // Add copy listeners (do this on updates too, in case content changed)
    addCopyListeners(entryDiv);

    // Scroll if needed
    if (wasScrolledToBottom) {
      logContainer.scrollTop = logContainer.scrollHeight;
    }
  }

  // --- Helper to Create Code Blocks with Copy Button ---
  function createCodeBlock(title, data) {
    const formattedData = formatBody(data); // Use existing formatter
    const escapedData = escapeHtml(formattedData);
    // Note: We copy the *unsescaped* formatted data
    return `
      <div class="info">${escapeHtml(title)}:</div>
      <div class="code-block-wrapper">
        <pre><code class="language-json">${escapedData}</code></pre>
        <button class="copy-button" data-copy-content="${escapeHtml(
          formattedData
        )}">复制</button>
      </div>
    `;
  }

  // --- Add Copy Listeners ---
  function addCopyListeners(parentElement) {
    parentElement.querySelectorAll(".copy-button").forEach((button) => {
      // Remove existing listener to prevent duplicates if called multiple times
      button.replaceWith(button.cloneNode(true));
    });
    // Add new listeners to the cloned buttons
    parentElement.querySelectorAll(".copy-button").forEach((button) => {
      button.addEventListener("click", (event) => {
        const contentToCopy = button.getAttribute("data-copy-content");
        navigator.clipboard
          .writeText(contentToCopy)
          .then(() => {
            button.textContent = "已复制!";
            setTimeout(() => {
              button.textContent = "复制";
            }, 1500); // Reset after 1.5s
          })
          .catch((err) => {
            console.error("Failed to copy text: ", err);
            alert("复制失败!");
          });
        event.stopPropagation(); // Prevent triggering collapse/expand
      });
    });
  }

  // --- Helper to escape HTML ---
  function escapeHtml(unsafe) {
    if (typeof unsafe !== "string") {
      unsafe = String(unsafe); // Convert to string if not already
    }
    return unsafe
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // --- Existing formatBody function (keep as is) ---
  function formatBody(body) {
    if (typeof body === "string") {
      try {
        const parsed = JSON.parse(body);
        return JSON.stringify(parsed, null, 2);
      } catch (e) {
        return body; // Return as is if not valid JSON
      }
    } else if (typeof body === "object") {
      return JSON.stringify(body, null, 2);
    }
    return String(body);
  }

  connectButton.addEventListener("click", connectWebSocket);
  disconnectButton.addEventListener("click", disconnectWebSocket);

  disconnectButton.disabled = true;
  wsStatus.textContent = "未连接";
  wsStatus.style.color = "grey";
  connectWebSocket();
});
