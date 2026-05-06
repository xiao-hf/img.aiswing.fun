// Minimal canary Worker for img.aiswing.fun route test
// Route: img.aiswing.fun/__worker_canary__*
// If this works, open https://img.aiswing.fun/__worker_canary__ and you should see build 2026050603.

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/__worker_canary__") {
      return new Response("worker canary ok build 2026050603", {
        status: 200,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-store, max-age=0",
          "X-Aiswing-Build": "2026050603",
          "X-Aiswing-Proxy": "cloudflare-worker-canary",
        },
      });
    }
    return new Response("not found in canary worker", {
      status: 404,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store, max-age=0",
        "X-Aiswing-Build": "2026050603",
        "X-Aiswing-Proxy": "cloudflare-worker-canary",
      },
    });
  },
};
