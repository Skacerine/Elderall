/**
 * CHECK RADIUS SERVICE (Port 3003)
 *
 * Responsibilities:
 *  - GET /status?elderlyID=X — Step 1: Called by Guardian UI
 *    → calls Location Tracking Service for latest location (Step 2)
 *    → calls Check Home/Outside Service for status (Step 6-ish)
 *    → returns combined result
 *  - GET /subscribe?elderlyID=X — SSE stream for Guardian UI
 *    Publishes updates via Server-Sent Events whenever status changes
 */

const http = require("http");
const url = require("url");

const PORT = process.env.PORT || 3003;
const LOCATION_TRACKING_URL = process.env.LOCATION_TRACKING_URL || "http://localhost:3001";
const CHECK_HOME_URL = process.env.CHECK_HOME_URL || "http://localhost:3002";

// SSE clients: { elderlyID: [res, res, ...] }
const sseClients = {};

// Last known status per elderly (used to detect changes)
const lastStatus = {};

// --- HTTP GET helper ---
function getJSON(baseUrl, path) {
  return new Promise((resolve, reject) => {
    const fullUrl = new URL(baseUrl + path);
    const options = {
      hostname: fullUrl.hostname,
      port: fullUrl.port || 80,
      path: fullUrl.pathname + fullUrl.search,
      method: "GET",
    };
    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try { resolve(JSON.parse(data)); } catch { resolve(data); }
      });
    });
    req.on("error", reject);
    req.end();
  });
}

// --- Push SSE event to all clients watching an elderlyID ---
function pushSSEUpdate(elderlyID, data) {
  const clients = sseClients[elderlyID] || [];
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  clients.forEach((clientRes) => {
    try { clientRes.write(payload); } catch { /* client disconnected */ }
  });
  if (clients.length > 0) {
    console.log(`[CheckRadius] 📡 SSE pushed to ${clients.length} client(s) for ${elderlyID}: ${data.status}`);
  }
}

// --- Core: Fetch latest status for an elderly ---
async function fetchCurrentStatus(elderlyID) {
  // Step 2: GET latest location from Location Tracking Service
  const locationResult = await getJSON(LOCATION_TRACKING_URL, `/location/latest?elderlyID=${elderlyID}`);
  const location = locationResult.location;

  if (!location) {
    return { elderlyID, status: "NO_DATA", message: "No location data yet" };
  }

  // Step 6: GET current status from Check Home/Outside Service
  const statusResult = await getJSON(CHECK_HOME_URL, `/status?elderlyID=${elderlyID}`);

  return {
    elderlyID,
    status: statusResult.status || "UNKNOWN",
    latitude: location.latitude,
    longitude: location.longitude,
    distanceFromHome: statusResult.distanceFromHome,
    boundaryRadius: statusResult.boundaryRadius,
    homeLocation: statusResult.homeLocation,
    timestamp: location.timestamp,
    computedAt: statusResult.computedAt,
  };
}

// --- Poll periodically and push SSE updates ---
setInterval(async () => {
  const activeElderlyIDs = Object.keys(sseClients).filter(
    (id) => sseClients[id].length > 0
  );

  for (const elderlyID of activeElderlyIDs) {
    try {
      const current = await fetchCurrentStatus(elderlyID);
      const changed = JSON.stringify(current) !== JSON.stringify(lastStatus[elderlyID]);
      if (changed) {
        lastStatus[elderlyID] = current;
        pushSSEUpdate(elderlyID, current);
      }
    } catch (err) {
      // Silently skip if services not ready
    }
  }
}, 2000); // Poll every 2s

// --- HTTP Server ---
const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const { pathname, query } = parsedUrl;

  res.setHeader("Access-Control-Allow-Origin", "*");

  // GET /status?elderlyID=X — Step 1: Guardian UI triggers this
  if (req.method === "GET" && pathname === "/status") {
    const { elderlyID } = query;
    if (!elderlyID) {
      res.writeHead(400, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "elderlyID required" }));
    }

    console.log(`[CheckRadius] 📥 Status request for ${elderlyID}`);

    try {
      const result = await fetchCurrentStatus(elderlyID);
      lastStatus[elderlyID] = result;
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify(result));
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: err.message }));
    }
  }

  // GET /subscribe?elderlyID=X — SSE stream for Guardian UI
  if (req.method === "GET" && pathname === "/subscribe") {
    const { elderlyID } = query;
    if (!elderlyID) {
      res.writeHead(400, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "elderlyID required" }));
    }

    console.log(`[CheckRadius] 📡 New SSE subscriber for ${elderlyID}`);

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    res.write(`: connected\n\n`); // initial comment to establish connection

    if (!sseClients[elderlyID]) sseClients[elderlyID] = [];
    sseClients[elderlyID].push(res);

    // Send current status immediately
    if (lastStatus[elderlyID]) {
      res.write(`data: ${JSON.stringify(lastStatus[elderlyID])}\n\n`);
    }

    req.on("close", () => {
      sseClients[elderlyID] = sseClients[elderlyID].filter((c) => c !== res);
      console.log(`[CheckRadius] 🔌 SSE client disconnected for ${elderlyID}`);
    });

    return; // Keep connection open
  }

  // GET /health
  if (req.method === "GET" && pathname === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ service: "check-radius-service", status: "ok" }));
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
});

server.listen(PORT, () => {
  console.log(`[CheckRadius] 🚀 Running on port ${PORT}`);
  console.log(`[CheckRadius] Location Tracking URL: ${LOCATION_TRACKING_URL}`);
  console.log(`[CheckRadius] Check Home/Outside URL: ${CHECK_HOME_URL}`);
});
