import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowRight,
  Check,
  ChevronDown,
  Clock3,
  CloudSun,
  Droplets,
  ExternalLink,
  Footprints,
  HeartHandshake,
  Info,
  LocateFixed,
  MapPin,
  Plus,
  ShieldCheck,
  Sparkles,
  Sun,
  Thermometer,
  Trees,
  Umbrella,
  Wind,
  X,
} from "lucide-react";
import {
  CircleMarker,
  MapContainer,
  Polyline,
  TileLayer,
  Tooltip,
  useMap,
  useMapEvents,
} from "react-leaflet";
import {
  CITIES,
  City,
  CityId,
  KIND_LABELS,
  RouteChoice,
  RouteId,
  SAMPLE_WEATHER,
  SPOT_COLORS,
  Spot,
  SpotKind,
} from "./data";

type HourReading = {
  time: string;
  apparent_temperature: number;
  uv_index?: number;
};

type WeatherView = {
  source: "live" | "sample";
  currentTime: string;
  temperature: number;
  feelsLike: number;
  humidity: number;
  wind: number;
  updated: string;
  hourly: HourReading[];
};

type ApiResponse = {
  current?: {
    time: string;
    temperature_2m: number;
    relative_humidity_2m: number;
    apparent_temperature: number;
    wind_speed_10m: number;
  };
  hourly?: {
    time: string[];
    apparent_temperature: number[];
    uv_index?: number[];
  };
};

type RouteApiResponse = {
  trip?: {
    legs?: { shape?: string }[];
    summary?: { length?: number; time?: number };
  };
  status?: number;
  status_message?: string;
};

type OSMElement = {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

type OSMResponse = {
  osm3s?: { timestamp_osm_base?: string };
  elements?: OSMElement[];
};

type SavedCache<T> = { savedAt: number; value: T };

type RouteSet = Partial<Record<RouteId, RouteChoice>>;

const OSM_SPOTS_TTL = 6 * 60 * 60 * 1000;
const ROUTES_TTL = 12 * 60 * 60 * 1000;
const OSM_CACHE_PREFIX = "heatcommons:osm-spots:v1:";
const ROUTE_CACHE_PREFIX = "heatcommons:routes:v1:";

function readCache<T>(key: string, maxAge: number): T | null {
  try {
    const saved = window.localStorage.getItem(key);
    if (!saved) return null;
    const cache = JSON.parse(saved) as SavedCache<T>;
    if (!cache.savedAt || Date.now() - cache.savedAt > maxAge) return null;
    return cache.value;
  } catch {
    return null;
  }
}

function writeCache<T>(key: string, value: T) {
  try {
    window.localStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), value } satisfies SavedCache<T>));
  } catch {
    // The app still works when browser storage is unavailable.
  }
}

function decodePolyline(encoded: string, precision = 6): [number, number][] {
  const coordinates: [number, number][] = [];
  const factor = 10 ** precision;
  let index = 0;
  let lat = 0;
  let lon = 0;

  while (index < encoded.length) {
    let result = 0;
    let shift = 0;
    let byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index < encoded.length);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    result = 0;
    shift = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index < encoded.length);
    lon += result & 1 ? ~(result >> 1) : result >> 1;
    coordinates.push([lat / factor, lon / factor]);
  }

  return coordinates;
}

function formatDistance(kilometers: number) {
  return kilometers >= 1 ? `${kilometers.toFixed(1)} km` : `${Math.round(kilometers * 1000)} m`;
}

function osmPlace(element: OSMElement, cityId: CityId, freshness: string): Spot | null {
  const tags = element.tags ?? {};
  if (tags.access === "private" || tags.access === "no") return null;

  let kind: SpotKind;
  let fallbackTitle: string;
  let note: string;
  if (tags.amenity === "drinking_water") {
    kind = "water";
    fallbackTitle = "Mapped drinking water point";
    note = "OSM lists a drinking water point. Public access and water availability are unverified.";
  } else if (tags.leisure === "park" || tags.leisure === "garden") {
    kind = "shade";
    fallbackTitle = "Mapped green space";
    note = "OSM lists a park or garden. Shade and public access are unverified.";
  } else if (tags.amenity === "library" || tags.amenity === "community_centre") {
    kind = "cooling";
    fallbackTitle = "Mapped indoor public place";
    note = "OSM lists an indoor amenity. Cooling, hours, and public access are unverified.";
  } else {
    return null;
  }

  const latitude = element.lat ?? element.center?.lat;
  const longitude = element.lon ?? element.center?.lon;
  if (latitude === undefined || longitude === undefined) return null;
  const tagsToShow = [KIND_LABELS[kind]];
  if (tags.opening_hours) tagsToShow.push(`Hours listed: ${tags.opening_hours}`);
  if (tags.wheelchair === "yes") tagsToShow.push("Wheelchair tagged");

  return {
    id: `osm-${element.type}-${element.id}`,
    cityId,
    title: tags.name ?? tags["name:en"] ?? fallbackTitle,
    kind,
    position: [latitude, longitude],
    note,
    tags: tagsToShow,
    freshness,
    source: "osm",
    osmUrl: `https://www.openstreetmap.org/${element.type}/${element.id}`,
  };
}

async function fetchWalkingRoute(city: City, id: RouteId, signal: AbortSignal): Promise<RouteChoice> {
  const costingOptions = id === "shortest"
    ? { pedestrian: { shortest: true } }
    : { pedestrian: { walkway_factor: 0.8, sidewalk_factor: 0.8 } };
  const response = await fetch("https://valhalla1.openstreetmap.de/route", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Client-Id": "github.com/Georgefifth/heatcommons",
    },
    signal,
    body: JSON.stringify({
      locations: [
        { lat: city.startPosition[0], lon: city.startPosition[1] },
        { lat: city.endPosition[0], lon: city.endPosition[1] },
      ],
      costing: "pedestrian",
      costing_options: costingOptions,
      units: "kilometers",
      shape_format: "polyline6",
    }),
  });
  if (!response.ok) throw new Error("Walking route unavailable");
  const data = await response.json() as RouteApiResponse;
  const summary = data.trip?.summary;
  const length = summary?.length;
  const time = summary?.time;
  const path = data.trip?.legs?.[0]?.shape ? decodePolyline(data.trip.legs[0].shape) : [];
  if (typeof length !== "number" || typeof time !== "number" || !path.length || !Number.isFinite(length) || !Number.isFinite(time)) {
    throw new Error(data.status_message ?? "No walking route found");
  }

  return {
    id,
    title: id === "walkway" ? "Mapped walkways" : "Shortest walk",
    comfort: id === "walkway" ? "Favors mapped footpaths" : "Minimizes mapped distance",
    minutes: Math.max(1, Math.ceil(time / 60)),
    distance: formatDistance(length),
    path,
  };
}

const LOCAL_SPOTS_KEY = "heatcommons:local-spots:v1";

function formatHour(value: string) {
  const hour = Number(value.slice(0, 2));
  const suffix = hour >= 12 ? "PM" : "AM";
  const twelveHour = hour % 12 || 12;
  return twelveHour + " " + suffix;
}

function makeSampleHours(cityId: CityId): HourReading[] {
  const now = new Date();
  now.setMinutes(0, 0, 0);
  const values = cityId === "kuala-lumpur" ? [39, 40, 40, 39, 38, 36, 34, 33] : [36, 37, 38, 37, 35, 33, 31, 30];
  return values.map((value, index) => {
    const hour = new Date(now.getTime() + index * 60 * 60 * 1000);
    const two = (number: number) => String(number).padStart(2, "0");
    return {
      time: hour.getFullYear() + "-" + two(hour.getMonth() + 1) + "-" + two(hour.getDate()) + "T" + two(hour.getHours()) + ":00",
      apparent_temperature: value,
      uv_index: Math.max(1, 9 - index),
    };
  });
}

function sampleWeather(cityId: CityId): WeatherView {
  const base = SAMPLE_WEATHER[cityId];
  return {
    source: "sample",
    currentTime: new Date().getFullYear() + "-" + String(new Date().getMonth() + 1).padStart(2, "0") + "-" + String(new Date().getDate()).padStart(2, "0") + "T" + String(new Date().getHours()).padStart(2, "0") + ":00",
    temperature: base.temperature,
    feelsLike: base.feelsLike,
    humidity: base.humidity,
    wind: base.wind,
    updated: "Sample conditions",
    hourly: makeSampleHours(cityId),
  };
}

function osmTimestampLabel(timestamp?: string) {
  if (!timestamp) return "OpenStreetMap listing";
  const date = new Date(timestamp);
  return Number.isNaN(date.valueOf())
    ? "OpenStreetMap listing"
    : `OSM data · ${new Intl.DateTimeFormat("en-MY", { month: "short", day: "numeric" }).format(date)}`;
}

function loadLocalSpots(): Spot[] {
  try {
    const saved = window.localStorage.getItem(LOCAL_SPOTS_KEY);
    return saved ? (JSON.parse(saved) as Spot[]) : [];
  } catch {
    return [];
  }
}

function MapZoomControls() {
  const map = useMap();
  return (
    <div className="map-zoom-control" aria-label="Map zoom controls">
      <button
        aria-label="Zoom in"
        onClick={(event) => {
          event.stopPropagation();
          map.zoomIn();
        }}
        type="button"
      >
        +
      </button>
      <button
        aria-label="Zoom out"
        onClick={(event) => {
          event.stopPropagation();
          map.zoomOut();
        }}
        type="button"
      >
        −
      </button>
    </div>
  );
}

function MapRecenter({ city, tick }: { city: City; tick: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView(city.center, 14, { animate: true });
  }, [city, map, tick]);
  return null;
}

function MapSizeObserver() {
  const map = useMap();

  useEffect(() => {
    const container = map.getContainer();
    const invalidateSize = () => map.invalidateSize({ pan: false, debounceMoveend: true });
    const observer = new ResizeObserver(invalidateSize);
    observer.observe(container);
    const frame = window.requestAnimationFrame(invalidateSize);
    const timer = window.setTimeout(invalidateSize, 250);
    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [map]);

  return null;
}

function ReportPinPicker({
  active,
  onPick,
}: {
  active: boolean;
  onPick: (position: [number, number]) => void;
}) {
  useMapEvents({
    click(event) {
      if (active) onPick([event.latlng.lat, event.latlng.lng]);
    },
  });
  return null;
}

function SpotGlyph({ kind, size = 16 }: { kind: SpotKind; size?: number }) {
  if (kind === "water") return <Droplets size={size} />;
  if (kind === "shade") return <Trees size={size} />;
  if (kind === "cooling") return <CloudSun size={size} />;
  return <Umbrella size={size} />;
}

function App() {
  const [cityId, setCityId] = useState<CityId>("kuala-lumpur");
  const city = CITIES[cityId];
  const [weather, setWeather] = useState<WeatherView>(() => sampleWeather("kuala-lumpur"));
  const [weatherLoading, setWeatherLoading] = useState(true);
  const [weatherError, setWeatherError] = useState(false);
  const [localSpots, setLocalSpots] = useState<Spot[]>(loadLocalSpots);
  const [osmSpots, setOsmSpots] = useState<Spot[] | null>(null);
  const [spotStatus, setSpotStatus] = useState<"loading" | "ready" | "error">("loading");
  const [spotUpdated, setSpotUpdated] = useState("");
  const [spotFilter, setSpotFilter] = useState<SpotKind | "all">("all");
  const [selectedSpot, setSelectedSpot] = useState<Spot | null>(city.spots[0] ?? null);
  const [routes, setRoutes] = useState<RouteSet>({});
  const [routeLoading, setRouteLoading] = useState(true);
  const [routeError, setRouteError] = useState(false);
  const [selectedRouteId, setSelectedRouteId] = useState<RouteId>("walkway");
  const [recenterTick, setRecenterTick] = useState(0);
  const [showPoints, setShowPoints] = useState(true);
  const [showRoute, setShowRoute] = useState(true);
  const [reportOpen, setReportOpen] = useState(false);
  const [pinPickerActive, setPinPickerActive] = useState(false);
  const [draftPosition, setDraftPosition] = useState<[number, number] | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftNote, setDraftNote] = useState("");
  const [draftKind, setDraftKind] = useState<SpotKind>("shade");
  const [toast, setToast] = useState("");
  const [routeSaved, setRouteSaved] = useState(false);
  const [spotSaved, setSpotSaved] = useState(false);

  useEffect(() => {
    setSelectedSpot(city.spots[0] ?? null);
    setSpotFilter("all");
    setSelectedRouteId("walkway");
    setRouteSaved(false);
    setSpotSaved(false);
    setDraftPosition(null);
    setPinPickerActive(false);
    setWeather(sampleWeather(cityId));
    setWeatherLoading(true);
    setWeatherError(false);

    let cancelled = false;
    const query = new URLSearchParams({
      latitude: String(city.center[0]),
      longitude: String(city.center[1]),
      current: "temperature_2m,relative_humidity_2m,apparent_temperature,wind_speed_10m",
      hourly: "apparent_temperature,uv_index",
      forecast_days: "1",
      timezone: "auto",
    });

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 8000);

    fetch("https://api.open-meteo.com/v1/forecast?" + query.toString(), { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("Forecast unavailable");
        return response.json() as Promise<ApiResponse>;
      })
      .then((data) => {
        if (cancelled || !data.current) return;
        const currentHour = data.current.time.slice(0, 13);
        const hourly = (data.hourly?.time ?? []).map((time, index) => ({
          time,
          apparent_temperature: data.hourly?.apparent_temperature[index] ?? data.current!.apparent_temperature,
          uv_index: data.hourly?.uv_index?.[index],
        }));
        setWeather({
          source: "live",
          currentTime: data.current.time,
          temperature: data.current.temperature_2m,
          feelsLike: data.current.apparent_temperature,
          humidity: data.current.relative_humidity_2m,
          wind: data.current.wind_speed_10m,
          updated: "Updated " + formatHour(currentHour.slice(11, 13) + ":00"),
          hourly: hourly.length ? hourly : makeSampleHours(cityId),
        });
      })
      .catch(() => {
        if (!cancelled) {
          setWeather(sampleWeather(cityId));
          setWeatherError(true);
        }
      })
      .finally(() => {
        window.clearTimeout(timeout);
        if (!cancelled) setWeatherLoading(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [cityId]);

  useEffect(() => {
    setOsmSpots(null);
    setSpotStatus("loading");
    setSpotUpdated("");
    let cancelled = false;
    const cached = readCache<{ spots: Spot[]; updated: string }>(OSM_CACHE_PREFIX + cityId, OSM_SPOTS_TTL);
    if (cached) {
      setOsmSpots(cached.spots);
      setSpotUpdated(cached.updated);
      setSpotStatus("ready");
      setSelectedSpot((current) => current?.source === "local" ? current : cached.spots[0] ?? null);
      return () => { cancelled = true; };
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15000);
    const query = `[out:json][timeout:12];(nwr(around:1400,${city.center[0]},${city.center[1]})["amenity"="drinking_water"];nwr(around:1400,${city.center[0]},${city.center[1]})["leisure"~"^(park|garden)$"];nwr(around:1400,${city.center[0]},${city.center[1]})["amenity"~"^(library|community_centre)$"];);out center tags;`;
    fetch("https://overpass-api.de/api/interpreter?data=" + encodeURIComponent(query), {
      headers: { Accept: "application/json" },
      referrerPolicy: "strict-origin",
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error("OpenStreetMap places unavailable");
        return response.json() as Promise<OSMResponse>;
      })
      .then((data) => {
        if (cancelled) return;
        const updated = osmTimestampLabel(data.osm3s?.timestamp_osm_base);
        const points = (data.elements ?? [])
          .map((element) => osmPlace(element, cityId, updated))
          .filter((spot): spot is Spot => spot !== null)
          .sort((left, right) => {
            const leftDistance = Math.hypot(left.position[0] - city.center[0], left.position[1] - city.center[1]);
            const rightDistance = Math.hypot(right.position[0] - city.center[0], right.position[1] - city.center[1]);
            return leftDistance - rightDistance;
          })
          .slice(0, 70);
        const cacheValue = { spots: points, updated };
        writeCache(OSM_CACHE_PREFIX + cityId, cacheValue);
        setOsmSpots(points);
        setSpotUpdated(updated);
        setSpotStatus("ready");
        setSelectedSpot((current) => current?.source === "local" ? current : points[0] ?? null);
      })
      .catch(() => {
        if (!cancelled) setSpotStatus("error");
      })
      .finally(() => {
        window.clearTimeout(timeout);
      });

    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [city, cityId]);

  useEffect(() => {
    setRoutes({});
    setRouteLoading(true);
    setRouteError(false);
    let cancelled = false;
    const cached = readCache<RouteSet>(ROUTE_CACHE_PREFIX + cityId, ROUTES_TTL);
    if (cached && cached.walkway && cached.shortest) {
      setRoutes(cached);
      setRouteLoading(false);
      return () => { cancelled = true; };
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15000);
    Promise.allSettled([
      fetchWalkingRoute(city, "walkway", controller.signal),
      fetchWalkingRoute(city, "shortest", controller.signal),
    ]).then((results) => {
      if (cancelled) return;
      const next: RouteSet = {};
      for (const result of results) {
        if (result.status === "fulfilled") next[result.value.id] = result.value;
      }
      setRoutes(next);
      setRouteError(!next.walkway || !next.shortest);
      if (Object.keys(next).length) writeCache(ROUTE_CACHE_PREFIX + cityId, next);
    }).finally(() => {
      window.clearTimeout(timeout);
      if (!cancelled) setRouteLoading(false);
    });

    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [city, cityId]);

  const visibleSpots = useMemo(
    () => [...(osmSpots ?? city.spots), ...localSpots.filter((spot) => spot.cityId === cityId)],
    [city, cityId, localSpots, osmSpots],
  );
  const filteredSpots = useMemo(
    () => visibleSpots.filter((spot) => spotFilter === "all" || spot.kind === spotFilter),
    [spotFilter, visibleSpots],
  );
  const activeRoute = routes[selectedRouteId];
  const currentHour = weather.currentTime.slice(11, 13) || "12";
  const nextReadings = useMemo(() => {
    if (!weather.hourly.length) return [];
    const hour = currentHour;
    let start = weather.hourly.findIndex((item) => item.time.slice(11, 13) === hour);
    if (start < 0) start = 0;
    return weather.hourly.slice(start, start + 6);
  }, [currentHour, weather.hourly]);
  const bestWindow = useMemo(() => {
    if (!nextReadings.length) return null;
    return nextReadings.reduce((best, item) =>
      item.apparent_temperature < best.apparent_temperature ? item : best,
    );
  }, [nextReadings]);
  const dateLabel = new Intl.DateTimeFormat("en-MY", {
    weekday: "long",
    month: "short",
    day: "numeric",
  }).format(new Date());
  const selectedWeatherTemp = Number.isFinite(weather.feelsLike) ? Math.round(weather.feelsLike) : 0;
  const selectedTitle = selectedSpot?.title ?? "Community pause point";

  function notify(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 3200);
  }

  function saveRoute() {
    if (!activeRoute) return;
    setRouteSaved(true);
    notify("Route added to today's plan");
  }

  function saveSpot() {
    if (!selectedSpot) return;
    setSpotSaved(true);
    notify("Spot saved to your local plan");
  }

  function openReport() {
    setDraftTitle("");
    setDraftNote("");
    setDraftPosition(null);
    setDraftKind("shade");
    setReportOpen(true);
  }

  function submitReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draftTitle.trim()) return;
    if (!draftPosition) {
      notify("Choose a point on the map first");
      return;
    }
    const newSpot: Spot = {
      id: "local-" + Date.now(),
      cityId,
      title: draftTitle.trim(),
      kind: draftKind,
      position: draftPosition,
      note: draftNote.trim() || "A community-submitted point. Please confirm details on arrival.",
      tags: [KIND_LABELS[draftKind], "Local report"],
      freshness: "Just now",
      source: "local",
    };
    const next = [...localSpots, newSpot];
    setLocalSpots(next);
    let persisted = true;
    try {
      window.localStorage.setItem(LOCAL_SPOTS_KEY, JSON.stringify(next));
    } catch {
      persisted = false;
    }
    setSelectedSpot(newSpot);
    setDraftTitle("");
    setDraftNote("");
    setDraftPosition(null);
    setReportOpen(false);
    notify(persisted ? "Update saved on this device" : "Update added for this session only");
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="HeatCommons home">
          <span className="brand-mark"><Droplets size={19} fill="currentColor" /></span>
          <span className="brand-word">heat<span>commons</span></span>
        </a>
        <nav className="desktop-nav" aria-label="Main navigation">
          <a className="nav-link nav-link-active" href="#map">Explore map</a>
          <a className="nav-link" href="#plan">My heat plan</a>
          <a className="nav-link" href="#guidance">Heat guide</a>
        </nav>
        <div className="topbar-actions">
          <label className="city-select-wrap">
            <MapPin size={15} />
            <select
              aria-label="Choose demo city"
              title={"Demo city: " + city.name}
              value={cityId}
              onChange={(event) => setCityId(event.target.value as CityId)}
            >
              <option value="kuala-lumpur">Kuala Lumpur</option>
              <option value="dehradun">Dehradun</option>
            </select>
            <ChevronDown size={14} />
          </label>
          <button aria-label="Add a place" className="button button-dark button-report" onClick={openReport} type="button">
            <Plus size={16} />
            <span>Add a place</span>
          </button>
        </div>
      </header>

      <main id="top" className="page-wrap">
        <section className="hero">
          <div className="hero-copy">
            <div className="eyebrow"><span className="eyebrow-dot" /> COMMUNITY HEAT PLANNING <span className="eyebrow-divider">/</span> {dateLabel.toUpperCase()}</div>
            <h1>Find a cooler way<br className="desktop-break" /> through your day.</h1>
            <p>See how it feels outside, then plan around shade, water and places to pause.</p>
            <div className="hero-footnote">
              <ShieldCheck size={15} />
              <span>Plan around local weather and places mapped nearby.</span>
            </div>
          </div>
          <div className="weather-card">
            <div className="weather-card-top">
              <div>
                <div className="weather-kicker"><span className={weather.source === "live" ? "status-dot status-live" : "status-dot"} />{weather.source === "live" ? "LIVE LOCAL FORECAST" : "SAMPLE CONDITIONS"}</div>
                <div className="weather-city">{city.name}<span>{city.region}</span></div>
              </div>
              <div className="weather-symbol"><Sun size={22} strokeWidth={1.7} /></div>
            </div>
            <div className="weather-current">
              <div className="feels-number">{selectedWeatherTemp}<span>°</span></div>
              <div className="feels-copy">
                <span>FEELS LIKE</span>
                <strong>{Math.round(weather.temperature)}°C air temperature</strong>
                <small>{weatherLoading ? "Fetching local conditions…" : weather.updated}</small>
              </div>
            </div>
            <div className="weather-metrics">
              <div><Droplets size={15} /><span>Humidity</span><strong>{Math.round(weather.humidity)}%</strong></div>
              <div><Wind size={15} /><span>Wind</span><strong>{Math.round(weather.wind)} km/h</strong></div>
              <div><Thermometer size={15} /><span>Next cooler window</span><strong>{bestWindow ? formatHour(bestWindow.time.slice(11, 13) + ":00") : "—"}</strong></div>
            </div>
            <div className="forecast-ribbon">
              <span className="forecast-label">FEELS LIKE</span>
              <div className="forecast-bars" aria-label="Next few hours apparent temperature">
                {nextReadings.slice(0, 6).map((reading, index) => {
                  const values = nextReadings.map((item) => item.apparent_temperature);
                  const min = Math.min(...values);
                  const max = Math.max(...values);
                  const height = 14 + ((reading.apparent_temperature - min) / Math.max(1, max - min)) * 28;
                  return (
                    <div className="forecast-hour" key={reading.time}>
                      <strong>{Math.round(reading.apparent_temperature)}°</strong>
                      <span className={index === 0 ? "forecast-bar forecast-bar-now" : "forecast-bar"} style={{ height }} />
                      <small>{index === 0 ? "Now" : formatHour(reading.time.slice(11, 13)).replace(" ", "")}</small>
                    </div>
                  );
                })}
              </div>
            </div>
            {weatherError && <div className="weather-fallback"><Info size={13} /> Live forecast unavailable. Showing sample values.</div>}
            <div className="weather-estimate-note"><Info size={12} /> Apparent temperature is an estimate, not an official heat warning.</div>
          </div>
        </section>

        <section className="workspace-grid">
          <div className="map-column" id="map">
            <div className="section-heading map-heading">
              <div>
                <div className="section-overline">YOUR NEIGHBORHOOD</div>
                <h2>Water, green & indoor stops</h2>
              </div>
              <button className="button button-light small-button" onClick={openReport} type="button">
                <Plus size={15} /> Add a place
              </button>
            </div>
            <div className="map-card">
              <div className="map-status">
                <span className="map-status-icon"><Activity size={15} /></span>
                <span><strong>Mapped places</strong><small>{city.name} · {osmSpots === null ? spotStatus === "error" ? "Sample places shown" : "Finding nearby places…" : `${osmSpots.length} listings · ${spotUpdated}`}</small></span>
                <span className={osmSpots === null ? "map-demo-chip" : "map-live-chip"}>{osmSpots === null ? spotStatus === "error" ? "SAMPLE DATA" : "LOADING" : "OPENSTREETMAP"}</span>
              </div>
              <div className="place-filters" role="group" aria-label="Filter mapped places">
                {([
                  ["all", "All places"],
                  ["water", "Drinking water"],
                  ["shade", "Green space"],
                  ["cooling", "Indoor public"],
                ] as [SpotKind | "all", string][]).map(([kind, label]) => (
                  <button
                    aria-pressed={spotFilter === kind}
                    className={spotFilter === kind ? "place-filter place-filter-selected" : "place-filter"}
                    key={kind}
                    onClick={() => setSpotFilter(kind)}
                    type="button"
                  >
                    {label}<span>{kind === "all" ? visibleSpots.length : visibleSpots.filter((spot) => spot.kind === kind).length}</span>
                  </button>
                ))}
              </div>
              <div className="map-viewport">
                <MapContainer
                  center={city.center}
                  zoom={14}
                  minZoom={11}
                  maxZoom={18}
                  zoomControl={false}
                  scrollWheelZoom={false}
                  style={{ width: "100%", height: "100%" }}
                >
                  <MapRecenter city={city} tick={recenterTick} />
                  <MapSizeObserver />
                  <ReportPinPicker
                    active={pinPickerActive}
                    onPick={(position) => {
                      setDraftPosition(position);
                      setPinPickerActive(false);
                      setReportOpen(true);
                      notify("Map point selected");
                    }}
                  />
                  <MapZoomControls />
                  <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>'
                    url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />
                  {showRoute && activeRoute && (
                    <Polyline
                      positions={activeRoute.path}
                      pathOptions={{
                        color: selectedRouteId === "walkway" ? "#3d6949" : "#d28257",
                        weight: 6,
                        opacity: 0.92,
                        dashArray: selectedRouteId === "walkway" ? "1 0" : "9 9",
                        lineCap: "round",
                      }}
                    />
                  )}
                  {showRoute && activeRoute && (
                    <>
                      <CircleMarker center={city.startPosition} radius={7} pathOptions={{ color: "#fff", weight: 3, fillColor: "#253f32", fillOpacity: 1 }}>
                        <Tooltip direction="top">Start · {city.startName}</Tooltip>
                      </CircleMarker>
                      <CircleMarker center={city.endPosition} radius={7} pathOptions={{ color: "#fff", weight: 3, fillColor: "#e27754", fillOpacity: 1 }}>
                        <Tooltip direction="top">Destination · {city.endName}</Tooltip>
                      </CircleMarker>
                    </>
                  )}
                  {showPoints && filteredSpots.map((spot) => (
                    <CircleMarker
                      key={spot.id}
                      center={spot.position}
                      radius={selectedSpot?.id === spot.id ? 10 : 7}
                      pathOptions={{
                        color: "#fff",
                        weight: selectedSpot?.id === spot.id ? 4 : 2.5,
                        fillColor: SPOT_COLORS[spot.kind],
                        fillOpacity: 1,
                      }}
                      eventHandlers={{ click: () => setSelectedSpot(spot) }}
                    >
                      <Tooltip direction="top" offset={[0, -7]}>{spot.title}</Tooltip>
                    </CircleMarker>
                  ))}
                </MapContainer>
                <div className="map-overlay-top">
                  <div className="map-layer-pill"><span className="map-layer-dot" /> {activeRoute ? `${activeRoute.title} route` : routeLoading ? "Finding a walking route…" : "Walking route unavailable"}</div>
                  <button
                    aria-label="Recenter map"
                    className="map-icon-button"
                    onClick={() => setRecenterTick((tick) => tick + 1)}
                    type="button"
                  >
                    <LocateFixed size={17} />
                  </button>
                </div>
                {pinPickerActive && (
                  <div className="pin-picker-banner">
                    <span><MapPin size={14} /> Tap the map to place your pin</span>
                    <button onClick={() => { setPinPickerActive(false); setReportOpen(true); }} type="button">Cancel</button>
                  </div>
                )}
                <div className="map-overlay-bottom">
                  <div className="map-route-label"><Footprints size={15} /><span>{city.startName}</span><span className="route-dash" /><ArrowRight size={14} /><span>{city.endName}</span></div>
                  <span className="illustrative-label">OSM walking network · shade not measured</span>
                </div>
                <div className="map-toggle-stack">
                  <button className={showPoints ? "map-toggle map-toggle-active" : "map-toggle"} onClick={() => setShowPoints(!showPoints)} type="button">
                    <MapPin size={14} /> Places <span>{showPoints ? "On" : "Off"}</span>
                  </button>
                  <button className={showRoute ? "map-toggle map-toggle-active" : "map-toggle"} onClick={() => setShowRoute(!showRoute)} type="button">
                    <Footprints size={14} /> Route <span>{showRoute ? "On" : "Off"}</span>
                  </button>
                </div>
              </div>
              <div className="map-legend">
                <div className="legend-items">
                  <span><i className="legend-dot legend-shade" /> Green space</span>
                  <span><i className="legend-dot legend-water" /> Drinking water</span>
                  <span><i className="legend-dot legend-cool" /> Indoor public place</span>
                  <span><i className={selectedRouteId === "walkway" ? "legend-line" : "legend-line legend-line-quick"} /> {activeRoute?.title ?? "Walking route"}</span>
                </div>
                <span className="map-credit">© OpenStreetMap contributors</span>
              </div>
            </div>

            <div className="selected-place-card">
              {selectedSpot ? <>
                <div className="selected-place-icon" style={{ backgroundColor: SPOT_COLORS[selectedSpot.kind] + "24", color: SPOT_COLORS[selectedSpot.kind] }}>
                  <SpotGlyph kind={selectedSpot.kind} size={18} />
                </div>
                <div className="selected-place-copy">
                  <div className="selected-place-meta">
                    <span>{selectedSpot.source === "local" ? "YOUR LOCAL REPORT" : selectedSpot.source === "osm" ? "OPENSTREETMAP LISTING" : "SAMPLE PLACE"}</span>
                    <span className="meta-divider">·</span><span>{selectedSpot.freshness}</span>
                  </div>
                  <h3>{selectedTitle}</h3>
                  <p>{selectedSpot.note}{selectedSpot.tags.length > 1 ? ` ${selectedSpot.tags.slice(1).join(" · ")}.` : ""}</p>
                </div>
                {selectedSpot.osmUrl && <a className="place-source-link" href={selectedSpot.osmUrl} rel="noreferrer" target="_blank" aria-label="View this listing on OpenStreetMap"><ExternalLink size={14} /></a>}
                <button className={spotSaved ? "saved-button" : "button button-light save-place-button"} onClick={saveSpot} type="button">
                  {spotSaved ? <><Check size={15} /> Saved</> : <><Plus size={15} /> Add to plan</>}
                </button>
              </> : <div className="empty-place-state"><strong>No mapped places in this category</strong><span>Try another filter or add a local note.</span></div>}
            </div>
          </div>

          <aside className="planner-column" id="plan">
            <div className="section-heading planner-heading">
              <div>
                <div className="section-overline">A MORE THOUGHTFUL WALK</div>
                <h2>Plan a cool stop</h2>
              </div>
              <div className="planner-spark"><Sparkles size={17} /></div>
            </div>
            <div className="planner-card">
              <div className="trip-endpoints">
                <div className="endpoint">
                  <span className="endpoint-icon endpoint-start" />
                  <div><small>STARTING NEAR</small><strong>{city.startName}</strong></div>
                </div>
                <div className="endpoint-connector" />
                <div className="endpoint">
                  <span className="endpoint-icon endpoint-end"><MapPin size={12} fill="currentColor" /></span>
                  <div><small>HEADING TO</small><strong>{city.endName}</strong></div>
                </div>
                <span className="demo-trip-label">DEMO TRIP</span>
              </div>

              <div className="route-options" role="tablist" aria-label="Walking route preference">
                {(["walkway", "shortest"] as RouteId[]).map((routeId) => {
                  const route = routes[routeId];
                  const title = routeId === "walkway" ? "Mapped walkways" : "Shortest walk";
                  const comfort = routeId === "walkway" ? "Favors mapped footpaths" : "Minimizes mapped distance";
                  return (
                    <button
                      aria-selected={selectedRouteId === routeId}
                      className={selectedRouteId === routeId ? "route-option route-option-selected" : "route-option"}
                      disabled={!route}
                      key={routeId}
                      onClick={() => {
                        setSelectedRouteId(routeId);
                        setRouteSaved(false);
                      }}
                      role="tab"
                      type="button"
                    >
                      <span className={"route-option-icon route-option-" + routeId}><Footprints size={16} /></span>
                      <span className="route-option-main"><strong>{title}</strong><small>{route?.comfort ?? comfort}</small></span>
                      <span className="route-option-time"><strong>{route ? route.minutes : routeLoading ? "…" : "—"}<small>{route ? " min" : ""}</small></strong><small>{route?.distance ?? ""}</small></span>
                    </button>
                  );
                })}
              </div>

              <div className="route-insight">
                <div className="insight-symbol"><Trees size={17} /></div>
                <div>
                  <strong>{activeRoute ? selectedRouteId === "walkway" ? "A footpath preference" : "A distance-focused walk" : "Walking route unavailable"}</strong>
                  <p>{activeRoute
                    ? selectedRouteId === "walkway"
                      ? "Prefers mapped footpaths and sidewalks where available. Street-level shade is not measured."
                      : "Uses a distance-focused walking route through the mapped street network."
                    : routeLoading ? "Checking the pedestrian network for this demo trip…" : "The route service did not return a path. Try again later."}</p>
                </div>
              </div>

              <button className={routeSaved ? "button button-added route-action" : "button button-dark route-action"} disabled={!activeRoute} onClick={saveRoute} type="button">
                {routeSaved ? <><Check size={16} /> Added to today's plan</> : <>Add to today&apos;s plan <ArrowRight size={16} /></>}
              </button>
              <div className="route-disclaimer"><Info size={13} /> {routeLoading ? "Loading mapped walking routes" : routeError ? "Route service is unavailable or returned a partial result" : "Mapped walking route · not turn-by-turn navigation"}</div>
            </div>

            <div className="best-window-card">
              <div className="best-window-icon"><CloudSun size={18} /></div>
              <div className="best-window-copy">
                <div className="best-window-kicker">A COOLER WINDOW</div>
                <strong>{bestWindow ? formatHour(bestWindow.time.slice(11, 13)) : "Check the forecast"}</strong>
                <span>{bestWindow ? "Feels like " + Math.round(bestWindow.apparent_temperature) + "°C in the forecast" : "Forecast data unavailable"}</span>
              </div>
              <span className="best-window-arrow"><ArrowRight size={16} /></span>
            </div>

            <div className="quick-note">
              <div className="quick-note-icon"><HeartHandshake size={17} /></div>
              <div><strong>Keep a useful place note</strong><p>Add a local note on this device. Community sharing is not connected in this prototype.</p></div>
              <button aria-label="Add a local place note" onClick={openReport} type="button"><Plus size={17} /></button>
            </div>
          </aside>
        </section>

        <section className="guidance-section" id="guidance">
          <div className="guidance-heading">
            <div>
              <div className="section-overline">SMALL THINGS THAT HELP</div>
              <h2>Take care in the heat.</h2>
            </div>
            <a className="source-link" href="https://www.who.int/news-room/fact-sheets/detail/climate-change-heat-and-health" rel="noreferrer" target="_blank">
              WHO heat guidance <ExternalLink size={14} />
            </a>
          </div>
          <div className="guidance-grid">
            <article className="guidance-card">
              <span className="guidance-card-icon guidance-sun"><Sun size={19} /></span>
              <div><span className="guidance-number">01 / FIND SHADE</span><h3>Pause out of the sun</h3><p>Choose shade or a cooler place where you can. Follow local heat alerts.</p></div>
              <ArrowRight className="guidance-arrow" size={16} />
            </article>
            <article className="guidance-card">
              <span className="guidance-card-icon guidance-water"><Droplets size={19} /></span>
              <div><span className="guidance-number">02 / KEEP WATER CLOSE</span><h3>Drink regularly</h3><p>Carry water and refill when a trusted, available point is nearby.</p></div>
              <ArrowRight className="guidance-arrow" size={16} />
            </article>
            <article className="guidance-card">
              <span className="guidance-card-icon guidance-check"><HeartHandshake size={19} /></span>
              <div><span className="guidance-number">03 / CHECK IN</span><h3>Look out for someone</h3><p>Check on neighbours or co-workers who may need a hand on hot days.</p></div>
              <ArrowRight className="guidance-arrow" size={16} />
            </article>
          </div>
          <div className="safety-note"><Info size={14} /> General guidance only. HeatCommons is not a medical or emergency service. Follow local official advice.</div>
        </section>

        <footer className="site-footer">
          <a className="brand footer-brand" href="#top">
            <span className="brand-mark"><Droplets size={16} fill="currentColor" /></span>
            <span className="brand-word">heat<span>commons</span></span>
          </a>
          <span>Make room for a cooler day.</span>
          <div className="footer-links">
            <a href="https://open-meteo.com/en/docs" rel="noreferrer" target="_blank">Weather data <ExternalLink size={12} /></a>
            <a href="https://www.openstreetmap.org/copyright" rel="noreferrer" target="_blank">Map credits <ExternalLink size={12} /></a>
            <a href="https://valhalla.github.io/valhalla/api/" rel="noreferrer" target="_blank">Walking routes <ExternalLink size={12} /></a>
            <span>{weather.source === "live" ? "Live forecast" : "Sample weather"}{weatherError ? " · offline fallback" : ""}</span>
          </div>
        </footer>
      </main>

      {reportOpen && (
        <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setReportOpen(false)}>
          <section aria-labelledby="report-title" aria-modal="true" className="report-modal" role="dialog">
            <div className="modal-topline">
              <div className="modal-icon"><MapPin size={18} /></div>
              <button aria-label="Close report form" className="modal-close" onClick={() => setReportOpen(false)} type="button"><X size={18} /></button>
            </div>
            <div className="modal-kicker">LOCAL PLACE NOTE</div>
            <h2 id="report-title">Add a place to pause</h2>
            <p className="modal-description">Add a useful shade, water or cool-down point around {city.name}.</p>
            <form onSubmit={submitReport}>
              <label className="field-label" htmlFor="spot-name">Place name</label>
              <input
                autoFocus
                id="spot-name"
                maxLength={72}
                onChange={(event) => setDraftTitle(event.target.value)}
                placeholder="e.g. Shaded bench by the station"
                required
                value={draftTitle}
              />
              <label className="field-label" htmlFor="spot-kind">What can people find here?</label>
              <div className="kind-selector">
                {(["shade", "water", "cooling", "rest"] as SpotKind[]).map((kind) => (
                  <button
                    aria-pressed={draftKind === kind}
                    className={draftKind === kind ? "kind-chip kind-chip-selected" : "kind-chip"}
                    key={kind}
                    onClick={() => setDraftKind(kind)}
                    type="button"
                  >
                    <SpotGlyph kind={kind} size={15} /> {KIND_LABELS[kind]}
                  </button>
                ))}
              </div>
              <div className="field-label"><span className="location-label">Map location</span></div>
              <button
                className={draftPosition ? "pin-location-button pin-location-selected" : "pin-location-button"}
                onClick={() => {
                  setReportOpen(false);
                  setPinPickerActive(true);
                }}
                type="button"
              >
                {draftPosition ? <><Check size={15} /> Pin selected</> : <><MapPin size={15} /> Choose a point on the map</>}
                <span>{draftPosition ? draftPosition[0].toFixed(4) + ", " + draftPosition[1].toFixed(4) : "Required"}</span>
              </button>
              <label className="field-label" htmlFor="spot-note">Helpful note <span>optional</span></label>
              <textarea
                id="spot-note"
                maxLength={180}
                onChange={(event) => setDraftNote(event.target.value)}
                placeholder="Add a detail someone should know before they go"
                rows={3}
                value={draftNote}
              />
              <div className="local-storage-note"><ShieldCheck size={14} /> Prototype update stays in this browser and is not shared publicly. Confirm the place is usable before visiting.</div>
              <button className="button button-dark modal-submit" type="submit">Save local update <ArrowRight size={16} /></button>
            </form>
          </section>
        </div>
      )}

      {toast && <div className="toast-message"><Check size={15} /> {toast}</div>}
    </div>
  );
}

export default App;
