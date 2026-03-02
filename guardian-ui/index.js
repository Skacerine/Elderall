/**
 * GUARDIAN UI SERVER (Port 3000)
 *
 * Serves the Guardian dashboard HTML page.
 * Proxies API calls from the browser to internal microservices
 * (since the browser cannot reach the internal Docker network directly).
 *
 * Proxy routes:
 *  GET /api/status?elderlyID=X       → Check Radius Service
 *  GET /api/map-data?elderlyID=X     → Map Microservice
 *  GET /api/subscribe?elderlyID=X    → Check Radius Service (SSE passthrough)
 *  POST /api/simulate-location       → Location Tracking Service (manual trigger)
 */

const http = require("http");
const url = require("url");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const CHECK_RADIUS_URL = process.env.CHECK_RADIUS_URL || "http://localhost:3003";
const MAP_SERVICE_URL = process.env.MAP_SERVICE_URL || "http://localhost:3004";
const LOCATION_TRACKING_URL = process.env.LOCATION_TRACKING_URL || "http://localhost:3001";

function proxyGet(targetBase, targetPath, res) {
  return new Promise((resolve, reject) => {
    const fullUrl = new URL(targetBase + targetPath);
    const options = {
      hostname: fullUrl.hostname,
      port: fullUrl.port || 80,
      path: fullUrl.pathname + fullUrl.search,
      method: "GET",
    };
    const proxyReq = http.request(options, (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res);
      resolve();
    });
    proxyReq.on("error", reject);
    proxyReq.end();
  });
}

function proxyPost(targetBase, targetPath, body, res) {
  return new Promise((resolve, reject) => {
    const data = typeof body === "string" ? body : JSON.stringify(body);
    const fullUrl = new URL(targetBase + targetPath);
    const options = {
      hostname: fullUrl.hostname,
      port: fullUrl.port || 80,
      path: fullUrl.pathname,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(data),
      },
    };
    const proxyReq = http.request(options, (proxyRes) => {
      res.writeHead(proxyRes.statusCode, { "Content-Type": "application/json" });
      proxyRes.pipe(res);
      resolve();
    });
    proxyReq.on("error", reject);
    proxyReq.write(data);
    proxyReq.end();
  });
}

const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const { pathname, search, query } = parsedUrl;

  res.setHeader("Access-Control-Allow-Origin", "*");

  // ── API Proxy Routes ──────────────────────────────────────────

  // GET /api/status — proxy to Check Radius Service (Step 1)
  if (pathname === "/api/status") {
    return proxyGet(CHECK_RADIUS_URL, `/status${search || ""}`, res).catch((err) => {
      res.writeHead(502, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Check Radius Service unavailable", detail: err.message }));
    });
  }

  // GET /api/subscribe — SSE proxy to Check Radius Service
  if (pathname === "/api/subscribe") {
    const elderlyID = query.elderlyID;
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    const fullUrl = new URL(`${CHECK_RADIUS_URL}/subscribe?elderlyID=${elderlyID}`);
    const options = {
      hostname: fullUrl.hostname,
      port: fullUrl.port || 80,
      path: fullUrl.pathname + fullUrl.search,
      method: "GET",
    };
    const proxyReq = http.request(options, (proxyRes) => {
      proxyRes.pipe(res);
    });
    proxyReq.on("error", () => res.end());
    req.on("close", () => proxyReq.destroy());
    proxyReq.end();
    return;
  }

  // GET /api/map-data — proxy to Map Microservice (Step 8)
  if (pathname === "/api/map-data") {
    return proxyGet(MAP_SERVICE_URL, `/map-data${search || ""}`, res).catch((err) => {
      res.writeHead(502, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Map Microservice unavailable", detail: err.message }));
    });
  }

  // POST /api/simulate-location — manually trigger a location post
  if (req.method === "POST" && pathname === "/api/simulate-location") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      return proxyPost(LOCATION_TRACKING_URL, "/coordinates", body, res).catch((err) => {
        res.writeHead(502, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Location Tracking Service unavailable" }));
      });
    });
    return;
  }

  // GET /api/config — return service URLs for client awareness
  if (pathname === "/api/config") {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({
      services: {
        locationTracking: "http://localhost:3001",
        checkHomeOutside: "http://localhost:3002",
        checkRadius: "http://localhost:3003",
        mapService: "http://localhost:3004",
        guardianUI: "http://localhost:3000",
      },
    }));
  }

  // ── Static Files ─────────────────────────────────────────────
  let filePath = path.join(__dirname, "public", pathname === "/" ? "index.html" : pathname);
  const ext = path.extname(filePath);
  const mimeTypes = {
    ".html": "text/html",
    ".js": "text/javascript",
    ".css": "text/css",
    ".json": "application/json",
  };

  fs.readFile(filePath, (err, data) => {
    if (err) {
      // fallback to index.html for SPA routing
      fs.readFile(path.join(__dirname, "public", "index.html"), (err2, data2) => {
        if (err2) {
          res.writeHead(404);
          return res.end("Not found");
        }
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(data2);
      });
      return;
    }
    res.writeHead(200, { "Content-Type": mimeTypes[ext] || "text/plain" });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`[GuardianUI] 🚀 Running on port ${PORT}`);
  console.log(`[GuardianUI] 🌐 Open http://localhost:${PORT} in your browser`);
});
