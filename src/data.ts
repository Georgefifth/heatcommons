export type CityId = "kuala-lumpur" | "dehradun";
export type SpotKind = "cooling" | "water" | "shade" | "rest";
export type RouteId = "walkway" | "shortest";

export type Spot = {
  id: string;
  cityId: CityId;
  title: string;
  kind: SpotKind;
  position: [number, number];
  note: string;
  tags: string[];
  freshness: string;
  source: "osm" | "demo" | "local";
  osmUrl?: string;
};

export type RouteChoice = {
  id: RouteId;
  title: string;
  comfort: string;
  minutes: number;
  distance: string;
  path: [number, number][];
};

export type City = {
  id: CityId;
  name: string;
  region: string;
  center: [number, number];
  startName: string;
  startPosition: [number, number];
  endName: string;
  endPosition: [number, number];
  spots: Spot[];
};

export const CITIES: Record<CityId, City> = {
  "kuala-lumpur": {
    id: "kuala-lumpur",
    name: "Kuala Lumpur",
    region: "Malaysia",
    center: [3.1435, 101.6915],
    startName: "KL Sentral",
    startPosition: [3.1345, 101.6867],
    endName: "Central Market",
    endPosition: [3.1449, 101.6954],
    spots: [
      {
        id: "kl-demo-green",
        cityId: "kuala-lumpur",
        title: "Example green space",
        kind: "shade",
        position: [3.1451, 101.6879],
        note: "Illustrative demo point. Shade and public access are not verified.",
        tags: ["Example", "Not verified"],
        freshness: "Sample point",
        source: "demo",
      },
      {
        id: "kl-demo-water",
        cityId: "kuala-lumpur",
        title: "Example water stop",
        kind: "water",
        position: [3.1354, 101.6877],
        note: "Illustrative demo point. Water availability and access are not verified.",
        tags: ["Example", "Not verified"],
        freshness: "Sample point",
        source: "demo",
      },
    ],
  },
  dehradun: {
    id: "dehradun",
    name: "Dehradun",
    region: "Uttarakhand, India",
    center: [30.3267, 78.045],
    startName: "Clock Tower",
    startPosition: [30.3259, 78.0414],
    endName: "Parade Ground",
    endPosition: [30.3284, 78.0477],
    spots: [
      {
        id: "dd-demo-green",
        cityId: "dehradun",
        title: "Example green space",
        kind: "shade",
        position: [30.3261, 78.0405],
        note: "Illustrative demo point. Shade and public access are not verified.",
        tags: ["Example", "Not verified"],
        freshness: "Sample point",
        source: "demo",
      },
      {
        id: "dd-demo-water",
        cityId: "dehradun",
        title: "Example water stop",
        kind: "water",
        position: [30.3274, 78.0448],
        note: "Illustrative demo point. Water availability and access are not verified.",
        tags: ["Example", "Not verified"],
        freshness: "Sample point",
        source: "demo",
      },
    ],
  },
};

export const SPOT_COLORS: Record<SpotKind, string> = {
  cooling: "#f19070",
  water: "#4bafaa",
  shade: "#608e52",
  rest: "#d0a940",
};

export const KIND_LABELS: Record<SpotKind, string> = {
  cooling: "Indoor public place",
  water: "Drinking water",
  shade: "Green space",
  rest: "Covered rest",
};

export const SAMPLE_WEATHER: Record<CityId, { temperature: number; feelsLike: number; humidity: number; wind: number }> = {
  "kuala-lumpur": { temperature: 34, feelsLike: 40, humidity: 68, wind: 8 },
  dehradun: { temperature: 33, feelsLike: 36, humidity: 45, wind: 7 },
};
