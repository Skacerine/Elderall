# 🏠 ElderAll Elderly Tracking — Microservices Simulation

A fully simulated microservices application that mirrors the architecture diagram.
No real GPS hardware or database required — everything runs locally via Docker.

---

## 📐 Architecture Overview

```
[Elderly Device]
      │
      │ 0. POST /coordinates every 5s
      ▼
[Location Tracking Service :3001]
      │  ▲
      │  │ 2. GET /location/latest
      │  │
[Check Radius Service :3003] ──SSE──► [Guardian UI :3000]
      │                                      │
      │ 6. GET /map-data                     │
      ▼                                      │
[Map Microservice :3004]                     │
      │                                      │
      │ 6. GET /status                       │
      ▼                                      │
[Check Home/Outside Service :3002] ◄──────── ┘
      ▲
      │ 5. POST /check-status (from Location Tracking)
      │
[Location Tracking Service :3001]
```

### Services & Ports

| Service                    | Port | Role |
|---------------------------|------|------|
| Guardian UI               | 3000 | Dashboard — map + status display |
| Location Tracking Service | 3001 | Stores GPS coordinates |
| Check Home/Outside Service| 3002 | Computes inside/outside boundary |
| Check Radius Service      | 3003 | Orchestrates checks + SSE publisher |
| Map Microservice          | 3004 | Assembles map display data |
| Elderly Device (sim)      | —    | Posts GPS every 5 seconds |

---

## 🚀 Quick Start (Docker — Recommended)

### Prerequisites
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed and running

### Steps

```bash
# 1. Clone / open the project
cd elderly-tracking

# 2. Build and start all services
docker compose up --build

# 3. Open the Guardian Dashboard
open http://localhost:3000
```

That's it! The elderly device simulator starts automatically and posts a new
location every **5 seconds**, cycling through 8 waypoints (inside and outside
the safe boundary).

### To stop everything:
```bash
docker compose down
```

### To reset and start fresh:
```bash
docker compose down -v && docker compose up --build
```

---

## 💻 Running Without Docker (VS Code / Local Node.js)

If you'd rather run each service as a separate terminal process:

### Prerequisites
- Node.js 18+ installed (`node --version`)

### Steps

Open **6 terminal tabs** in VS Code (`Terminal → New Terminal`, repeat).

**Terminal 1 — Check Home/Outside Service**
```bash
cd check-home-outside-service
node index.js
# Runs on :3002
```

**Terminal 2 — Location Tracking Service**
```bash
cd location-tracking-service
CHECK_HOME_URL=http://localhost:3002 node index.js
# Runs on :3001
```

**Terminal 3 — Check Radius Service**
```bash
cd check-radius-service
LOCATION_TRACKING_URL=http://localhost:3001 CHECK_HOME_URL=http://localhost:3002 node index.js
# Runs on :3003
```

**Terminal 4 — Map Microservice**
```bash
cd map-microservice
CHECK_HOME_URL=http://localhost:3002 node index.js
# Runs on :3004
```

**Terminal 5 — Guardian UI**
```bash
cd guardian-ui
CHECK_RADIUS_URL=http://localhost:3003 MAP_SERVICE_URL=http://localhost:3004 LOCATION_TRACKING_URL=http://localhost:3001 node index.js
# Runs on :3000
```

**Terminal 6 — Elderly Device Simulator**
```bash
cd elderly-device
LOCATION_TRACKING_URL=http://localhost:3001 node index.js
# No port — just a background simulator
```

Then open **http://localhost:3000** in your browser.

---

## 🗺️ Using the Guardian Dashboard

### Map
- The **green dashed circle** = safe boundary (500m radius from home)
- The **🏠 icon** = home location (Singapore city centre for demo)
- The **👴 icon** = elderly person's current position
  - Green = inside boundary
  - Red background = outside boundary (ALERT triggered)
- **Blue dashed line** = movement path history
- **Click anywhere on the map** to set a custom location, then click "Send Location"

### Sidebar Panels

**Tracking Target** — Enter any `elderlyID` and click Track to monitor them.

**Current Status** — Live stats: coordinates, distance from home, boundary radius, last update time.

**Service Flow** — Watch each step light up in real-time as data flows through the microservices:
- Steps glow **blue** when active
- Steps turn **green** when completed

**Manual Location Simulator** — Override the auto-simulator:
- Click quick-location buttons (Home / Park / Market / Mall / Clinic)
- Or type custom coordinates
- Or click directly on the map
- Click **"Send Location"** to inject that position

**Event Log** — Timestamped log of every API call and SSE event.

---

## 📡 API Reference

### Location Tracking Service (`:3001`)
```
POST /coordinates
  Body: { elderlyID, latitude, longitude, timestamp }
  → Stores coordinate, forwards to Check Home/Outside Service

GET /location/latest?elderlyID=X
  → Returns latest coordinate record

GET /coordinates?elderlyID=X
  → Returns full coordinate history
```

### Check Home/Outside Service (`:3002`)
```
POST /check-status
  Body: { elderlyID, latitude, longitude, timestamp }
  → Returns { status: "INSIDE"|"OUTSIDE", distanceFromHome, boundaryRadius, ... }

GET /status?elderlyID=X
  → Returns latest computed status + mapTileData

GET /config
  → Returns home location and boundary radius
```

### Check Radius Service (`:3003`)
```
GET /status?elderlyID=X
  → Orchestrates: fetches location + status, returns combined result

GET /subscribe?elderlyID=X
  → SSE stream — pushes updates every time status changes
```

### Map Microservice (`:3004`)
```
GET /map-data?elderlyID=X
  → Queries Check Home/Outside, assembles mapRenderedData, boundaryCircle, etc.
```

### Guardian UI / Proxy (`:3000`)
```
GET  /api/status?elderlyID=X      → proxies to Check Radius Service
GET  /api/subscribe?elderlyID=X   → SSE proxy to Check Radius Service
GET  /api/map-data?elderlyID=X    → proxies to Map Microservice
POST /api/simulate-location       → proxies to Location Tracking Service
```

---

## ⚙️ Configuration

### Boundary and Home Location

Edit `docker-compose.yml` environment variables under `check-home-outside-service`:

```yaml
environment:
  - HOME_LAT=1.3521       # Home latitude
  - HOME_LNG=103.8198     # Home longitude
  - BOUNDARY_RADIUS=500   # Safe zone radius in metres
```

### Simulation Speed

Edit `docker-compose.yml` under `elderly-device`:
```yaml
environment:
  - INTERVAL_MS=5000   # Post every 5 seconds (change to 2000 for faster simulation)
```

### Multiple Elderly Persons

The system supports multiple elderly persons by default — just use different `elderlyID` values.
In the Guardian UI, type a different ID in the "Tracking Target" box and click Track.

To add a second simulated device, duplicate the `elderly-device` service in `docker-compose.yml`:
```yaml
elderly-device-2:
  build: ./elderly-device
  environment:
    - LOCATION_TRACKING_URL=http://location-tracking-service:3001
    - ELDERLY_ID=elderly-002
    - INTERVAL_MS=7000
  networks:
    - elderly-net
```

---

## 🔍 Monitoring Service Logs

```bash
# All services
docker compose logs -f

# Individual service
docker compose logs -f location-tracking-service
docker compose logs -f check-home-outside-service
docker compose logs -f check-radius-service
docker compose logs -f map-microservice
docker compose logs -f guardian-ui
docker compose logs -f elderly-device
```

---

## 🏗️ Project Structure

```
elderly-tracking/
├── docker-compose.yml                  ← Orchestrates all services
├── README.md
│
├── elderly-device/                     ← Simulated GPS device
│   ├── Dockerfile
│   ├── package.json
│   └── index.js                        ← Posts waypoints every 5s
│
├── location-tracking-service/          ← Stores GPS coordinates (Port 3001)
│   ├── Dockerfile
│   ├── package.json
│   └── index.js
│
├── check-home-outside-service/         ← Boundary check engine (Port 3002)
│   ├── Dockerfile
│   ├── package.json
│   └── index.js
│
├── check-radius-service/               ← Orchestrator + SSE publisher (Port 3003)
│   ├── Dockerfile
│   ├── package.json
│   └── index.js
│
├── map-microservice/                   ← Map data assembler (Port 3004)
│   ├── Dockerfile
│   ├── package.json
│   └── index.js
│
└── guardian-ui/                        ← Guardian dashboard (Port 3000)
    ├── Dockerfile
    ├── package.json
    ├── index.js                        ← Express server + API proxy
    └── public/
        └── index.html                  ← Map UI (Leaflet.js)
```

---

## 🐛 Troubleshooting

**Map shows blank / no tiles**
→ You may be offline. The map uses OpenStreetMap tiles. The simulation data still
  flows correctly — you'll see coordinates and status even without tiles.

**"No location data yet" in status panel**
→ Wait 5–10 seconds for the elderly device to send its first coordinate.

**Services can't connect to each other (Docker)**
→ Make sure all containers are on the `elderly-net` network.
  Run `docker compose down && docker compose up --build`.

**Port already in use**
→ Another process is using 3000–3004. Find and stop it:
```bash
lsof -ti:3000 | xargs kill   # macOS/Linux
```

**Services start but elderly device fails**
→ The device waits 3 seconds before posting. This is intentional to let
  the Location Tracking Service start first.
