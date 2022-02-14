import Watcher from "../core/watcher.ts";
import { normalizePath } from "../core/utils.ts";

import type { Middleware } from "../core.ts";

// Websocket client code
const wsCode =
  await (await fetch(new URL("./reload_client.js", import.meta.url))).text();

export interface Options {
  root: string;
}

/** Middleware to hot reload changes */
export default function reload(options: Options): Middleware {
  // Live reload server
  const sockets = new Set<WebSocket>();

  // Create the watcher
  const watcher = new Watcher({
    root: options.root,
  });

  watcher.addEventListener("change", (event) => {
    if (!sockets.size) {
      return;
    }

    const files = event.files!;
    const urls = Array.from(files).map((file) => normalizePath(file));
    const message = JSON.stringify(urls);
    sockets.forEach((socket) => socket.send(message));
    console.log("Changes sent to the browser");
  });

  watcher.start();

  return async (request, next) => {
    // Is a websocket
    if (request.headers.get("upgrade") === "websocket") {
      const { socket, response } = Deno.upgradeWebSocket(request);

      socket.onopen = () => sockets.add(socket);
      socket.onclose = () => sockets.delete(socket);
      socket.onerror = (e) => console.log("Socket errored", e);

      return response;
    }

    // It's a regular request
    const response = await next(request);

    if (!response.body || response.status !== 200) {
      return response;
    }

    // Insert live-reload script in the body
    if (response.headers.get("content-type")?.includes("html")) {
      const reader = response.body.getReader();

      let body = "";
      let result = await reader.read();
      const decoder = new TextDecoder();

      while (!result.done) {
        body += decoder.decode(result.value);
        result = await reader.read();
      }

      body += `<script type="module" id="lume-live-reload">${wsCode}</script>`;

      const { status, statusText } = response;
      const headers = new Headers();
      headers.set("content-type", "text/html");

      return new Response(body, { status, statusText, headers });
    }

    return response;
  };
}