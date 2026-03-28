# Strava Dashboard (Next.js, No DB)

Custom Strava dashboard that reads directly from Strava API.
No PostgreSQL and no Grafana required.

## What This App Implements

- OAuth connect flow in Next.js (`/api/auth/strava/login`)
- Secure httpOnly session cookie for access/refresh token
- Server-side proxy to Strava API (`/api/strava/[...path]`)
- Local read-rate guard based on your limits:
	- 100 requests / 15 minutes
	- 1000 requests / day
- In-memory cache with TTL to reduce repeated requests
- Lazy-loaded dashboard sections (overview/trends/recent only fetch when visible)

## Setup

1. Copy env:

```powershell
cp .env.example .env.local
```

2. Fill Strava credentials in `.env.local`:

- `STRAVA_CLIENT_ID`
- `STRAVA_CLIENT_SECRET`
- `STRAVA_REDIRECT_URI` (default: `http://localhost:3000/api/auth/strava/callback`)

3. Install and run:

```powershell
npm install
npm run dev
```

4. Open `http://localhost:3000` and click **Connect Strava**.

## Rate Limit Strategy

- Every GET call is checked against local request budget first.
- If budget is exhausted, app returns 429 before calling Strava.
- Cached responses reduce duplicate traffic.
- Trends endpoint caps pagination with `STRAVA_MAX_ACTIVITY_PAGES`.
- Client-side SWR cache keeps data across page transitions (no manual reload needed).
- Refresh policy is selective:
	- auth/budget: ~90s
	- overview: ~5m
	- recent: ~3m
	- trends: ~30m

## API Endpoints

- Auth:
	- `GET /api/auth/strava/login`
	- `GET /api/auth/strava/callback`
	- `GET /api/auth/strava/status`
	- `POST /api/auth/strava/logout`
- Dashboard:
	- `GET /api/dashboard/overview`
	- `GET /api/dashboard/trends`
	- `GET /api/dashboard/recent`
- Generic Strava proxy:
	- `GET|POST|PUT|DELETE /api/strava/[...path]`

## Notes

- Session/cache/rate counters are in-memory (single runtime instance).
- For production multi-instance, move cache and limiter state to Redis.
