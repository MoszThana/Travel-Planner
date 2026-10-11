import { NextResponse } from 'next/server';
import { getSafeDb, schema } from '@/db';
import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import { requireUser, requireTripRole, errorResponse } from '@/lib/access';

export const runtime = 'edge';

// Open-Meteo: free, no API key (https://open-meteo.com). Forecasts reach 16 days ahead.
const FORECAST_DAYS = 16;
const DAY_MS = 24 * 60 * 60 * 1000;
const isoDate = (ms: number) => new Date(ms).toISOString().slice(0, 10);

type Place = { lat: number; lng: number; name: string };

async function geocode(destination: string): Promise<Place | null> {
  // "Osaka, Kyoto, Nara" -> try "Osaka" first, then the full text
  const candidates = [destination.split(',')[0].trim(), destination.trim()].filter((v, i, a) => v && a.indexOf(v) === i);
  for (const name of candidates) {
    const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?${new URLSearchParams({ name, count: '1', format: 'json' })}`);
    if (!res.ok) continue;
    const data = await res.json() as any;
    const hit = data.results?.[0];
    if (hit) return { lat: hit.latitude, lng: hit.longitude, name: [hit.name, hit.country].filter(Boolean).join(', ') };
  }
  return null;
}

// GET /api/weather?tripId=... - Daily forecast for the trip's own dates and place (trip members)
export async function GET(request: Request) {
  try {
    const userId = await requireUser(request);
    const tripId = new URL(request.url).searchParams.get('tripId');
    const db = await getSafeDb();
    await requireTripRole(db, tripId, userId, 'viewer');

    const [trip] = await db.select().from(schema.trips).where(eq(schema.trips.id, tripId!)).limit(1);
    const days = await db.select({ id: schema.days.id, dayNumber: schema.days.dayNumber, date: schema.days.date })
      .from(schema.days).where(eq(schema.days.tripId, tripId!)).orderBy(schema.days.dayNumber);

    // Where: the first activity with coordinates, otherwise the destination name
    let place: Place | null = null;
    if (days.length > 0) {
      const [pinned] = await db.select({ lat: schema.activities.lat, lng: schema.activities.lng, location: schema.activities.location })
        .from(schema.activities)
        .where(and(inArray(schema.activities.dayId, days.map((d) => d.id)), isNotNull(schema.activities.lat), isNotNull(schema.activities.lng)))
        .limit(1);
      if (pinned?.lat != null && pinned?.lng != null) {
        place = { lat: pinned.lat, lng: pinned.lng, name: pinned.location || trip.destination };
      }
    }
    if (!place) place = await geocode(trip.destination);
    if (!place) {
      return NextResponse.json({ status: 'no-location', destination: trip.destination });
    }

    // When: only the part of the trip inside the forecast window
    const today = Date.parse(isoDate(Date.now()));
    const lastForecastDay = today + (FORECAST_DAYS - 1) * DAY_MS;
    const tripStart = days[0]?.date ?? trip.startDate;
    const tripEnd = days[days.length - 1]?.date ?? trip.endDate;

    if (Date.parse(isoDate(tripEnd)) < today) {
      return NextResponse.json({ status: 'past', place: place.name });
    }
    if (Date.parse(isoDate(tripStart)) > lastForecastDay) {
      return NextResponse.json({
        status: 'too-early',
        place: place.name,
        availableFrom: isoDate(Date.parse(isoDate(tripStart)) - (FORECAST_DAYS - 1) * DAY_MS),
      });
    }

    const from = isoDate(Math.max(Date.parse(isoDate(tripStart)), today));
    const to = isoDate(Math.min(Date.parse(isoDate(tripEnd)), lastForecastDay));
    const res = await fetch(`https://api.open-meteo.com/v1/forecast?${new URLSearchParams({
      latitude: String(place.lat),
      longitude: String(place.lng),
      daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
      timezone: 'auto',
      start_date: from,
      end_date: to,
    })}`);
    if (!res.ok) {
      return NextResponse.json({ error: 'Weather service is unavailable right now.' }, { status: 502 });
    }
    const data = await res.json() as any;

    const byDate = new Map<string, any>();
    (data.daily?.time || []).forEach((date: string, i: number) => {
      byDate.set(date, {
        date,
        code: data.daily.weather_code[i],
        max: data.daily.temperature_2m_max[i],
        min: data.daily.temperature_2m_min[i],
        rainChance: data.daily.precipitation_probability_max?.[i] ?? null,
      });
    });

    const forecast = days
      .map((d) => ({ dayNumber: d.dayNumber, ...byDate.get(isoDate(d.date)) }))
      .filter((d) => d.date);

    return NextResponse.json({ status: 'ok', place: place.name, forecast });
  } catch (err) {
    return errorResponse(err, 'Weather error:');
  }
}
