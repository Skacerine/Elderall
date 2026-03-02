/**
 * LOCATION TRACKING SERVICE (Port 3001)
 *
 * Responsibilities:
 *  - Accept POST /coordinates from Elderly Device (Step 0 / Step 5)
 *  - Serve GET /location/latest?elderlyID=X to Check Radius Service (Step 2→response)
 *  - Forward new coordinates to Check Home/Outside Service (Step 5)
 *  - Serve GET /coordinates?elderlyID=X (Step 3)
 */

const http = require("http");
const url = require("url");

const PORT = process.env.PORT || 3001;
const CHECK_HOME_URL = process.env.CHECK_HOME_URL || "http://localhost:3002";

// In-memory store: { elderlyID: [{ latitude, longitude, timestamp, status? }] }
const locationStore = {};

// --- Helper: POST to another service ---
function postJSON(serviceUrl, path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const parsedUrl = new URL(serviceUrl + path);
    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || 80,
      path: parsedUrl.pathname,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(data),
      },
    };
    const req = http.request(options, (res) => {
      let responseData = "";
      res.on("data", (chunk) => (responseData += chunk));
      res.on("end", () => {
        try { resolve(JSON.parse(responseData)); } catch { resolve(responseData); }
      });
    });
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

function getJSON(serviceUrl, path) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(serviceUrl + path);
    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || 80,
      path: parsedUrl.pathname + parsedUrl.search,
      method: "GET",
    };
    const req = http.request(options, (res) => {
      let responseData = "";
      res.on("data", (chunk) => (responseData += chunk));
      res.on("end", () => {
        try { resolve(JSON.parse(responseData)); } catch { resolve(responseData); }
      });
    });
    req.on("error", reject);
    req.end();
  });
}

// --- HTTP Server ---
const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const { pathname, query } = parsedUrl;

  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");

  // POST /coordinates — Step 0 (from elderly device) & Step 5 internal
  if (req.method === "POST" && pathname === "/coordinates") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", async () => {
      try {
        const { elderlyID, latitude, longitude, timestamp } = JSON.parse(body);
        if (!locationStore[elderlyID]) locationStore[elderlyID] = [];

        const record = { latitude, longitude, timestamp, receivedAt: new Date().toISOString() };
        locationStore[elderlyID].push(record);

        // Keep last 100 records
        if (locationStore[elderlyID].length > 100) locationStore[elderlyID].shift();

        console.log(`[LocationTracking] 📥 Received coords for ${elderlyID}: (${latitude.toFixed(4)}, ${longitude.toFixed(4)})`);

        // Step 5: Forward to Check Home/Outside Service to compute status
        try {
          const checkResult = await postJSON(CHECK_HOME_URL, "/check-status", {
            elderlyID, latitude, longitude, timestamp,
          });
          // Attach status to record
          record.status = checkResult.status;
          record.boundaryRadius = checkResult.boundaryRadius;
          console.log(`[LocationTracking] 🏠 Status from Check Home: ${checkResult.status}`);
        } catch (err) {
          console.warn(`[LocationTracking] ⚠️ Could not reach Check Home/Outside Service:`, err.message);
        }

        res.writeHead(200);
        res.end(JSON.stringify({ success: true, record }));
      } catch (err) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // GET /location/latest?elderlyID=X — Step 2: Called by Check Radius Service
  if (req.method === "GET" && pathname === "/location/latest") {
    const { elderlyID } = query;
    if (!elderlyID) {
      res.writeHead(400);
      return res.end(JSON.stringify({ error: "elderlyID required" }));
    }
    const records = locationStore[elderlyID] || [];
    const latest = records[records.length - 1] || null;
    console.log(`[LocationTracking] 📤 Serving latest location for ${elderlyID}`);
    res.writeHead(200);
    return res.end(JSON.stringify({ elderlyID, location: latest }));
  }

  // GET /coordinates?elderlyID=X — Step 3: full coordinates list
  if (req.method === "GET" && pathname === "/coordinates") {
    const { elderlyID } = query;
    if (!elderlyID) {
      res.writeHead(400);
      return res.end(JSON.stringify({ error: "elderlyID required" }));
    }
    const records = locationStore[elderlyID] || [];
    console.log(`[LocationTracking] 📤 Serving coordinates history for ${elderlyID} (${records.length} records)`);
    res.writeHead(200);
    return res.end(JSON.stringify({ elderlyID, coordinates: records }));
  }

  // GET /health
  if (req.method === "GET" && pathname === "/health") {
    res.writeHead(200);
    return res.end(JSON.stringify({ service: "location-tracking-service", status: "ok" }));
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: "Not found" }));
});

server.listen(PORT, () => {
  console.log(`[LocationTracking] 🚀 Running on port ${PORT}`);
  console.log(`[LocationTracking] Will forward new coords to: ${CHECK_HOME_URL}`);
});
