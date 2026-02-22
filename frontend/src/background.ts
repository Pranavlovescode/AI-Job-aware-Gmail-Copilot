type ApiRequestMessage = {
  type: "API_REQUEST";
  url: string;
  method?: "GET" | "POST";
  payload?: unknown;
};

type ApiResponse =
  | { ok: true; data: unknown }
  | { ok: false; error: string };

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  const typed = message as ApiRequestMessage;
  if (!typed || typed.type !== "API_REQUEST" || !typed.url) {
    return false;
  }

  void (async () => {
    try {
      const response = await fetch(typed.url, {
        method: typed.method ?? "GET",
        headers: { "Content-Type": "application/json" },
        body: typed.method === "POST" ? JSON.stringify(typed.payload ?? {}) : undefined,
      });

      if (!response.ok) {
        sendResponse({
          ok: false,
          error: `Backend returned ${response.status} on ${typed.url}`,
        } satisfies ApiResponse);
        return;
      }

      const data = await response.json();
      sendResponse({ ok: true, data } satisfies ApiResponse);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown network error.";
      sendResponse({ ok: false, error: message } satisfies ApiResponse);
    }
  })();

  return true;
});
