document.addEventListener("DOMContentLoaded", () => {
  const connectButton = document.getElementById("connect-ws");
  const disconnectButton = document.getElementById("disconnect-ws");
  const wsStatus = document.getElementById("ws-status");
  const logContainer = document.getElementById("log-container");

  let socket;
  let userScrolledUp = false; // Flag to track user scroll position
  // 存储流式数据的映射
  let streamDataMap = {};

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

          // 保存流式数据用于合并
          if (!streamDataMap[messageData.id]) {
            streamDataMap[messageData.id] = [];
          }
          streamDataMap[messageData.id].push(messageData.chunk);

          if (streamContainer) {
            const chunkNode = document.createTextNode(messageData.chunk);
            streamContainer.appendChild(chunkNode);

            // 检查是否需要添加或更新合并按钮和原始数据按钮
            let buttonContainer = document.getElementById(
              `buttons-${messageData.id}`
            );

            if (!buttonContainer) {
              buttonContainer = document.createElement("div");
              buttonContainer.id = `buttons-${messageData.id}`;
              buttonContainer.className = "stream-buttons";

              // 合并JSON按钮
              const mergeButton = document.createElement("button");
              mergeButton.id = `merge-${messageData.id}`;
              mergeButton.className = "merge-button";
              mergeButton.textContent = "显示合并JSON";
              mergeButton.onclick = () => showMergedJSON(messageData.id);

              // 原始数据按钮
              const rawButton = document.createElement("button");
              rawButton.id = `raw-${messageData.id}`;
              rawButton.className = "raw-button";
              rawButton.textContent = "显示原始数据";
              rawButton.onclick = () => showRawData(messageData.id);

              // 添加按钮到容器
              buttonContainer.appendChild(mergeButton);
              buttonContainer.appendChild(rawButton);

              // 在流容器后插入按钮容器
              streamContainer.parentNode.insertBefore(
                buttonContainer,
                streamContainer.nextSibling
              );
            }

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
    const wasExpanded = isUpdate && entryDiv.classList.contains("expanded");
    entryDiv.innerHTML = `
      <div class="entry-summary">${escapeHtml(summaryHtml)}</div>
      <div class="entry-details">${detailsHtml}</div>
    `;
    if (wasExpanded) {
      entryDiv.classList.add("expanded");
    }

    // --- Add Toggle Listener (Always add/re-add after setting innerHTML) ---
    const summaryElement = entryDiv.querySelector(".entry-summary");
    if (summaryElement) {
      const newSummaryElement = summaryElement.cloneNode(true);
      summaryElement.parentNode.replaceChild(newSummaryElement, summaryElement);

      newSummaryElement.addEventListener("click", () => {
        entryDiv.classList.toggle("expanded");
      });
    }
    // --- End Add Toggle Listener ---

    // Add to container only if it's a new entry
    if (!isUpdate) {
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

  // 显示原始流数据
  function showRawData(id) {
    if (!streamDataMap[id] || streamDataMap[id].length === 0) {
      console.warn("无原始数据可显示");
      return;
    }

    // 合并流式数据
    const rawData = streamDataMap[id].join("");

    // 获取或创建原始数据容器
    let rawContainer = document.getElementById(`raw-data-${id}`);
    if (!rawContainer) {
      rawContainer = document.createElement("div");
      rawContainer.id = `raw-data-${id}`;
      rawContainer.className = "raw-data";

      // 找到流容器的父元素并在正确位置插入
      const buttonContainer = document.getElementById(`buttons-${id}`);
      if (buttonContainer) {
        buttonContainer.parentNode.insertBefore(
          rawContainer,
          buttonContainer.nextSibling
        );
      }
    }

    // 切换显示/隐藏
    if (rawContainer.style.display === "none" || !rawContainer.style.display) {
      rawContainer.style.display = "block";

      // 显示格式化的原始数据
      rawContainer.innerHTML = `
        <div class="info">原始数据:</div>
        <div class="code-block-wrapper">
          <pre><code class="language-text">${escapeHtml(rawData)}</code></pre>
          <button class="copy-button" data-copy-content="${escapeHtml(
            rawData
          )}">复制</button>
        </div>
      `;

      // 添加复制按钮功能
      addCopyListeners(rawContainer);

      // 更新按钮文本
      const rawButton = document.getElementById(`raw-${id}`);
      if (rawButton) {
        rawButton.textContent = "隐藏原始数据";
      }
    } else {
      rawContainer.style.display = "none";

      // 更新按钮文本
      const rawButton = document.getElementById(`raw-${id}`);
      if (rawButton) {
        rawButton.textContent = "显示原始数据";
      }
    }
  }

  // 显示合并后的JSON
  function showMergedJSON(id) {
    if (!streamDataMap[id] || streamDataMap[id].length === 0) {
      console.warn("无可合并的数据");
      return;
    }

    // 合并流式数据
    const mergedData = streamDataMap[id].join("");

    // 获取或创建合并JSON容器
    let mergedContainer = document.getElementById(`merged-${id}`);
    if (!mergedContainer) {
      mergedContainer = document.createElement("div");
      mergedContainer.id = `merged-${id}`;
      mergedContainer.className = "merged-json";

      // 找到按钮容器并在其后插入
      const buttonContainer = document.getElementById(`buttons-${id}`);
      if (buttonContainer) {
        // 检查是否已经有原始数据容器，如果有就在其后插入
        const rawContainer = document.getElementById(`raw-data-${id}`);
        if (rawContainer && rawContainer.style.display !== "none") {
          buttonContainer.parentNode.insertBefore(
            mergedContainer,
            rawContainer.nextSibling
          );
        } else {
          buttonContainer.parentNode.insertBefore(
            mergedContainer,
            buttonContainer.nextSibling
          );
        }
      }
    }

    // 切换显示/隐藏
    if (
      mergedContainer.style.display === "none" ||
      !mergedContainer.style.display
    ) {
      mergedContainer.style.display = "block";

      try {
        // 尝试解析数据行，每行都是 data: {...} 格式
        // 过滤掉不是JSON对象的行，如 data: [DONE]
        const dataLines = mergedData.split("\n").filter((line) => {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) return false;
          // 排除 [DONE] 和其他非JSON对象的行
          const content = trimmed.substring(5).trim();
          return content.startsWith("{") && content.endsWith("}");
        });

        if (dataLines.length > 0) {
          // 提取所有行中的内容部分，组合成完整对象
          let lastCompleteData = null;
          let contentParts = [];

          // 首先尝试收集所有的delta content
          for (const line of dataLines) {
            try {
              // 确保我们只处理JSON部分
              const jsonStartIndex = line.indexOf("{");
              if (jsonStartIndex === -1) continue;

              const jsonStr = line.substring(jsonStartIndex);
              const jsonData = JSON.parse(jsonStr);

              // 保存最后一个完整的数据对象，以便取出基本结构
              lastCompleteData = jsonData;

              // 提取内容部分
              if (
                jsonData.choices &&
                jsonData.choices[0] &&
                jsonData.choices[0].delta &&
                jsonData.choices[0].delta.content
              ) {
                contentParts.push(jsonData.choices[0].delta.content);
              }
            } catch (err) {
              console.warn("解析流行数据时出错，跳过:", err, "行内容:", line);
            }
          }

          // 如果没有完整数据，就显示错误
          if (!lastCompleteData) {
            mergedContainer.innerHTML = `<div class="error">无法找到有效的JSON数据</div>`;
            return;
          }

          // 创建完整的对象，使用最后一条数据作为模板
          const completeObject = JSON.parse(JSON.stringify(lastCompleteData));

          // 合并所有内容片段
          const fullContent = contentParts.join("");

          // 将合并后的内容放入完整对象中
          if (completeObject.choices && completeObject.choices.length > 0) {
            if (!completeObject.choices[0].delta) {
              completeObject.choices[0].delta = {};
            }
            completeObject.choices[0].delta.content = fullContent;
          }

          // 更新usage统计（如果存在）
          if (completeObject.usage) {
            // 使用最后一个请求的usage数据，这通常是最完整的
          }

          // 显示格式化的JSON
          mergedContainer.innerHTML = `
            <div class="info">合并JSON:</div>
            <div class="code-block-wrapper">
              <pre><code class="language-json">${escapeHtml(
                JSON.stringify(completeObject, null, 2)
              )}</code></pre>
              <button class="copy-button" data-copy-content="${escapeHtml(
                JSON.stringify(completeObject, null, 2)
              )}">复制</button>
            </div>
          `;

          // 添加复制按钮功能
          addCopyListeners(mergedContainer);
        } else {
          mergedContainer.innerHTML = `<div class="warning">无有效JSON数据行</div>`;
        }
      } catch (e) {
        console.error("解析合并数据时出错:", e);
        mergedContainer.innerHTML = `<div class="error">解析合并数据时出错: ${e.message}</div>`;
      }

      // 更新按钮文本
      const mergeButton = document.getElementById(`merge-${id}`);
      if (mergeButton) {
        mergeButton.textContent = "隐藏合并JSON";
      }
    } else {
      mergedContainer.style.display = "none";

      // 更新按钮文本
      const mergeButton = document.getElementById(`merge-${id}`);
      if (mergeButton) {
        mergeButton.textContent = "显示合并JSON";
      }
    }
  }

  connectButton.addEventListener("click", connectWebSocket);
  disconnectButton.addEventListener("click", disconnectWebSocket);

  disconnectButton.disabled = true;
  wsStatus.textContent = "未连接";
  wsStatus.style.color = "grey";
  connectWebSocket();
});
