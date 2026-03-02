/**
 * ELDERLY DEVICE / UI Simulator
 * Step 0: POST coordinates every N seconds (default 5s) to Location Tracking Service
 *
 * Simulates an elderly person moving between waypoints —
 * some inside the safe boundary, some outside.
 */

const http = require("http");

const LOCATION_TRACKING_URL =
  process.env.LOCATION_TRACKING_URL || "http://localhost:3001";
const ELDERLY_ID = process.env.ELDERLY_ID || "elderly-001";
const INTERVAL_MS = parseInt(process.env.INTERVAL_MS || "5000");

// Home: Singapore city centre
// Boundary radius: 500m (set in check-home-outside-service)
const HOME_LAT = 1.3521;
const HOME_LNG = 103.8198;

// Simulated waypoints: mix of inside (~<500m) and outside (~>500m)
const WAYPOINTS = [
  { label: "Home (inside)",          lat: 1.3521,  lng: 103.8198 },
  { label: "Nearby park (inside)",   lat: 1.3528,  lng: 103.8205 },
  { label: "Corner shop (inside)",   lat: 1.3514,  lng: 103.8190 },
  { label: "Bus stop (borderline)",  lat: 1.3535,  lng: 103.8220 },
  { label: "Market (outside)",       lat: 1.3560,  lng: 103.8250 },
  { label: "Clinic (outside)",       lat: 1.3495,  lng: 103.8150 },
  { label: "Mall (far outside)",     lat: 1.3600,  lng: 103.8300 },
  { label: "Back toward home",       lat: 1.3540,  lng: 103.8210 },
];

let waypointIndex = 0;

function postCoordinates(lat, lng, label) {
  const body = JSON.stringify({
    elderlyID: ELDERLY_ID,
    latitude: lat,
    longitude: lng,
    timestamp: new Date().toISOString(),
  });

  const url = new URL(`${LOCATION_TRACKING_URL}/coordinates`);
  const options = {
    hostname: url.hostname,
    port: url.port || 80,
    path: url.pathname,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(body),
    },
  };

  const req = http.request(options, (res) => {
    let data = "";
    res.on("data", (chunk) => (data += chunk));
    res.on("end", () => {
      console.log(
        `[Elderly Device] 📍 Posted location: ${label} (${lat.toFixed(4)}, ${lng.toFixed(4)}) → ${res.statusCode}`
      );
    });
  });

  req.on("error", (err) => {
    console.error(`[Elderly Device] ❌ Failed to post location:`, err.message);
  });

  req.write(body);
  req.end();
}

function simulate() {
  const waypoint = WAYPOINTS[waypointIndex % WAYPOINTS.length];
  // Add small random jitter to make it feel real
  const jitterLat = (Math.random() - 0.5) * 0.0002;
  const jitterLng = (Math.random() - 0.5) * 0.0002;
  postCoordinates(waypoint.lat + jitterLat, waypoint.lng + jitterLng, waypoint.label);
  waypointIndex++;
}

// Wait for services to start before sending
console.log(`[Elderly Device] 🟢 Starting simulation for ${ELDERLY_ID}`);
console.log(`[Elderly Device] Sending to: ${LOCATION_TRACKING_URL}`);
console.log(`[Elderly Device] Interval: ${INTERVAL_MS}ms`);
console.log(`[Elderly Device] Cycling through ${WAYPOINTS.length} waypoints\n`);

setTimeout(() => {
  simulate(); // immediate first ping
  setInterval(simulate, INTERVAL_MS);
}, 3000); // 3s startup grace period
