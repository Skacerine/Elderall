/**
 * MAP MICROSERVICE (Port 3004)
 *
 * Responsibilities:
 *  - GET /map-data?elderlyID=X (Step 6/7/8)
 *    → Queries Check Home/Outside Service for coordinates + status (Step 6)
 *    → Receives response with mapTileData (Step 7)
 *    → Returns assembled mapRenderedData for Guardian UI (Step 8)
 */

const http = require("http");
const url = require("url");

const PORT = process.env.PORT || 3004;
const CHECK_HOME_URL = process.env.CHECK_HOME_URL || "http://localhost:3002";

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

// Simulate map tile rendering (in reality this would fetch from OpenStreetMap etc.)
function renderMapTiles(lat, lng, zoom) {
  return {
    tileServer: "openstreetmap-simulated",
    zoom,
    centerLat: lat,
    centerLng: lng,
    tiles: [
      `https://tile.openstreetmap.org/${zoom}/${Math.floor(lat * 100)}/${Math.floor(lng * 100)}.png`,
    ],
    rendered: true,
    renderedAt: new Date().toISOString(),
  };
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const { pathname, query } = parsedUrl;

  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");

  // GET /map-data?elderlyID=X — Steps 6, 7, 8
  if (req.method === "GET" && pathname === "/map-data") {
    const { elderlyID } = query;
    if (!elderlyID) {
      res.writeHead(400);
      return res.end(JSON.stringify({ error: "elderlyID required" }));
    }

    console.log(`[MapService] 🗺️  Map data requested for ${elderlyID}`);

    try {
      // Step 6: GET coordinates and status from Check Home/Outside Service
      const statusData = await getJSON(CHECK_HOME_URL, `/status?elderlyID=${elderlyID}`);
      console.log(`[MapService] 📥 Received status from CheckHome: ${statusData.status}`);

      if (!statusData.latitude) {
        res.writeHead(200);
        return res.end(JSON.stringify({ elderlyID, message: "No location data yet" }));
      }

      // Step 7 → Step 8: Assemble map display data
      const zoom = 15;
      const mapRenderedData = renderMapTiles(statusData.latitude, statusData.longitude, zoom);

      // Step 8: Return map display package to Guardian UI
      const response = {
        // Step 8 fields
        mapRenderedData,
        elderlyID,
        currentLocation: {
          lat: statusData.latitude,
          lng: statusData.longitude,
        },
        status: statusData.status,
        distanceFromHome: statusData.distanceFromHome,
        boundaryRadius: statusData.boundaryRadius,
        homeLocation: statusData.homeLocation,
        timestamp: statusData.timestamp,
        // Step 7 fields (mapTileData from Check Home/Outside)
        mapTileData: statusData.mapTileData,
        // Boundary circle for map display
        boundaryCircle: {
          center: statusData.homeLocation,
          radius: statusData.boundaryRadius,
          color: statusData.status === "INSIDE" ? "#22c55e" : "#ef4444",
        },
      };

      console.log(`[MapService] 📤 Sending map display data: status=${statusData.status}`);
      res.writeHead(200);
      return res.end(JSON.stringify(response));
    } catch (err) {
      console.error(`[MapService] ❌ Error:`, err.message);
      res.writeHead(500);
      return res.end(JSON.stringify({ error: err.message }));
    }
  }

  // GET /health
  if (req.method === "GET" && pathname === "/health") {
    res.writeHead(200);
    return res.end(JSON.stringify({ service: "map-microservice", status: "ok" }));
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: "Not found" }));
});

server.listen(PORT, () => {
  console.log(`[MapService] 🚀 Running on port ${PORT}`);
  console.log(`[MapService] Check Home/Outside URL: ${CHECK_HOME_URL}`);
});
