# HeatCommons

HeatCommons is a community-first heat planning prototype for people who travel or work outdoors. It brings a local hourly apparent-temperature forecast, nearby mapped places, and pedestrian route options into one calm planning flow.

## What you can do

- Check current apparent temperature and the next few hours of forecast.
- Explore mapped drinking-water points, green spaces, and indoor public amenities around Kuala Lumpur or Dehradun.
- Compare a route that favors mapped footpaths with a distance-focused walking route.
- Filter nearby places and save a point to your own plan.
- Add a place note on this device. These reports are not uploaded or shared with other users.

## How this fits existing work

Official heat dashboards such as [CDC HeatRisk](https://www.cdc.gov/heat-health/about/index.html) focus on forecasts, health guidance, and community heat data. [NYC Cool Options](https://finder.nyc.gov/coolingcenters/locations) is a city-maintained directory with indoor and outdoor filters, accessibility and pet-friendly details, and open-now hours. [HeatWatch India](https://www.heatwatch.in/) maps cooling centres and documents how extreme heat affects frontline workers.

HeatCommons focuses on a short outing flow: connect the next few hours of local weather to nearby OpenStreetMap listings and an OSM-based walking route. The listed amenities and the walk are planning clues; they are not official cooling-centre status, verified availability, or shade-aware routing. No code from the projects above is used here.

## Run locally

```sh
npm install
npm run dev
```

Create a production bundle with `npm run build`.

## Data sources and limits

- Forecast: [Open-Meteo Forecast API](https://open-meteo.com/en/docs). If it is unavailable, the page shows clearly labelled sample conditions. Apparent temperature is a forecast estimate, not an official heat warning or personal risk score.
- Basemap and mapped places: [OpenStreetMap](https://www.openstreetmap.org/copyright), queried through the [Overpass API](https://wiki.openstreetmap.org/wiki/Overpass_API). OSM tags may be incomplete or outdated. A mapped drinking-water point may be inaccessible or unavailable; a park does not prove shade; a library or community centre is not necessarily air-conditioned or open. Confirm before travelling. Recent place results are cached in this browser for up to six hours.
- Walking routes: [Valhalla](https://valhalla.github.io/valhalla/api/) on OpenStreetMap data. HeatCommons compares mapped footpath preference with shortest-distance pedestrian routing. It does not measure shade, sidewalk conditions, accessibility, or closures, and it is not turn-by-turn navigation. Routes are cached in this browser for up to twelve hours. The public demo service is used for this low-volume prototype and may be rate limited.
- Heat guidance: general public guidance from the [World Health Organization](https://www.who.int/news-room/fact-sheets/detail/climate-change-heat-and-health). Follow local official alerts and emergency guidance.

If live place data is unavailable, the map falls back to clearly marked sample points. If pedestrian routing is unavailable, the route is hidden and the page explains the issue instead of drawing a made-up path. User-submitted notes stay in local browser storage.

HeatCommons is not an emergency, medical, or navigation service.

## License

MIT. See [LICENSE](LICENSE).
