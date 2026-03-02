/**
 * CHECK HOME / OUTSIDE SERVICE (Port 3002)
 *
 * Responsibilities:
 *  - POST /check-status — compute inside/outside based on haversine distance (Step 4/5)
 *  - GET /status?elderlyID=X — return latest computed status (Step 6/7)
 *  - Maintains a status store (latest status per elderly)
 */

const http = require("http");
const url = require("url");

const PORT = process.env.PORT || 3002;
const HOME_LAT = parseFloat(process.env.HOME_LAT || "1.3521");
const HOME_LNG = parseFloat(process.env.HOME_LNG || "103.8198");
const BOUNDARY_RADIUS = parseFloat(process.env.BOUNDARY_RADIUS || "500"); // metres

// In-memory status store: { elderlyID: { status, lat, lng, boundaryRadius, timestamp, distanceFromHome } }
const statusStore = {};

// --- Haversine distance in metres ---
function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000; // Earth radius in metres
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const { pathname, query } = parsedUrl;

  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");

  // POST /check-status — Step 4 & 5: Compute inside/outside
  if (req.method === "POST" && pathname === "/check-status") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        const { elderlyID, latitude, longitude, timestamp } = JSON.parse(body);

        const distance = haversineDistance(HOME_LAT, HOME_LNG, latitude, longitude);
        const status = distance <= BOUNDARY_RADIUS ? "INSIDE" : "OUTSIDE";
        const emoji = status === "INSIDE" ? "🏠" : "⚠️";

        const result = {
          elderlyID,
          latitude,
          longitude,
          status,
          boundaryRadius: BOUNDARY_RADIUS,
          distanceFromHome: Math.round(distance),
          homeLocation: { lat: HOME_LAT, lng: HOME_LNG },
          timestamp: timestamp || new Date().toISOString(),
          computedAt: new Date().toISOString(),
        };

        statusStore[elderlyID] = result;

        console.log(
          `[CheckHomeOutside] ${emoji} ${elderlyID} is ${status} ` +
          `(${Math.round(distance)}m from home, radius: ${BOUNDARY_RADIUS}m)`
        );

        res.writeHead(200);
        res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // GET /status?elderlyID=X — Step 7: Map Microservice queries this
  if (req.method === "GET" && pathname === "/status") {
    const { elderlyID } = query;
    if (!elderlyID) {
      res.writeHead(400);
      return res.end(JSON.stringify({ error: "elderlyID required" }));
    }
    const latest = statusStore[elderlyID] || null;
    console.log(`[CheckHomeOutside] 📤 Status requested for ${elderlyID}: ${latest?.status || "no data"}`);
    res.writeHead(200);
    return res.end(
      JSON.stringify({
        elderlyID,
        status: latest?.status || "UNKNOWN",
        latitude: latest?.latitude,
        longitude: latest?.longitude,
        distanceFromHome: latest?.distanceFromHome,
        boundaryRadius: BOUNDARY_RADIUS,
        homeLocation: { lat: HOME_LAT, lng: HOME_LNG },
        timestamp: latest?.timestamp,
        // Step 7 also includes mapTileData (simulated)
        mapTileData: {
          tileServer: "simulated",
          zoom: 15,
          centerLat: latest?.latitude || HOME_LAT,
          centerLng: latest?.longitude || HOME_LNG,
        },
      })
    );
  }

  // GET /all-statuses — helper endpoint to see everyone
  if (req.method === "GET" && pathname === "/all-statuses") {
    res.writeHead(200);
    return res.end(JSON.stringify(statusStore));
  }

  // GET /config — return boundary config
  if (req.method === "GET" && pathname === "/config") {
    res.writeHead(200);
    return res.end(
      JSON.stringify({
        homeLocation: { lat: HOME_LAT, lng: HOME_LNG },
        boundaryRadius: BOUNDARY_RADIUS,
      })
    );
  }

  // GET /health
  if (req.method === "GET" && pathname === "/health") {
    res.writeHead(200);
    return res.end(JSON.stringify({ service: "check-home-outside-service", status: "ok" }));
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: "Not found" }));
});

server.listen(PORT, () => {
  console.log(`[CheckHomeOutside] 🚀 Running on port ${PORT}`);
  console.log(`[CheckHomeOutside] Home: (${HOME_LAT}, ${HOME_LNG}), Radius: ${BOUNDARY_RADIUS}m`);
});
