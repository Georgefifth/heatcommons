const path = require("node:path");
const slide = (name) => path.join(__dirname, "slides", `${name}.png`);

module.exports = [
  {
    name: "live-hook",
    url: process.env.HEATCOMMONS_DEMO_URL || "http://127.0.0.1:5173/",
    session: "walkthrough",
    actions: [
      { type: "waitFor", sel: ".weather-estimate-note" },
      { type: "wait", ms: 3000 },
    ],
    vo: "For people who travel or work outdoors, heat reshapes small everyday choices.",
  },
  {
    name: "opening",
    session: "walkthrough",
    duration: 6,
    card: { image: slide("cover") },
    vo: "HeatCommons brings the forecast, nearby pauses, and a walking plan into one clear place.",
  },
  {
    name: "everyday-choices",
    session: "walkthrough",
    duration: 13,
    card: { image: slide("decisions") },
    vo: "A useful outdoor plan connects how the weather may feel with nearby places to pause and the walking network between them. HeatCommons brings that context into view for commuters and outdoor workers.",
  },
  {
    name: "forecast-in-context",
    session: "walkthrough",
    actions: [
      { type: "waitFor", sel: ".weather-estimate-note" },
      { type: "wait", ms: 4500 },
      { type: "click", sel: ".nav-link[href='#map']" },
      { type: "wait", ms: 11500 },
    ],
    vo: "The page opens with local apparent temperature and an hourly outlook, alongside humidity, wind, and a cooler forecast window. Its source and update state stay visible. If live weather is unavailable, labeled sample conditions keep a fallback from looking like an official warning.",
  },
  {
    name: "filter-nearby-pauses",
    session: "walkthrough",
    actions: [
      { type: "waitFor", sel: ".map-status" },
      { type: "wait", ms: 3000 },
      { type: "click", sel: ".place-filters button:nth-child(3)" },
      { type: "wait", ms: 8500 },
    ],
    vo: "The map groups nearby OpenStreetMap listings into water points, green spaces, and indoor public places. Filter by the kind of pause you are looking for, while keeping the source visible on screen.",
  },
  {
    name: "zoom-neighborhood",
    session: "walkthrough",
    actions: [
      { type: "click", sel: "button[aria-label='Zoom in']" },
      { type: "wait", ms: 8200 },
      { type: "click", sel: ".place-filters button:first-child" },
      { type: "wait", ms: 3000 },
    ],
    vo: "Zoom into the neighborhood to inspect the map, then return to all places. A listing shows what contributors recorded; confirm access, shade, opening, and availability before travelling.",
  },
  {
    name: "two-demo-cities",
    session: "walkthrough",
    actions: [
      { type: "waitFor", sel: "select[aria-label='Choose demo city']" },
      { type: "type", sel: "select[aria-label='Choose demo city']", text: "Dehradun", delay: 130 },
      { type: "click", sel: ".weather-card" },
      { type: "wait", ms: 11000 },
    ],
    vo: "The prototype starts with Kuala Lumpur and Dehradun. Changing the city updates the forecast, nearby listings, and sample trip together, so the same planning flow can be explored in two local contexts with different mapped coverage.",
  },
  {
    name: "open-data-flow",
    session: "walkthrough",
    duration: 14,
    card: { image: slide("signals") },
    vo: "Three open layers meet in the planner: Open-Meteo forecasts, OpenStreetMap places, and Valhalla pedestrian routes. Sources stay visible, and nearby place and route lookups are cached in this browser to keep the prototype lightweight.",
  },
  {
    name: "compare-route-options",
    session: "walkthrough",
    actions: [
      { type: "waitFor", sel: ".route-option:not([disabled])", timeout: 45000 },
      { type: "click", sel: ".route-option:nth-child(2)" },
      { type: "wait", ms: 2500 },
      { type: "wait", ms: 7800 },
    ],
    vo: "Compare a route that favors mapped footpaths with a distance-focused walk. Changing the choice updates the details and the line drawn on the map, so the trade-off stays visible.",
  },
  {
    name: "add-route-to-plan",
    session: "walkthrough",
    actions: [
      { type: "click", sel: ".route-option:first-child" },
      { type: "click", sel: "button.route-action" },
      { type: "waitFor", sel: ".toast-message" },
      { type: "wait", ms: 9000 },
    ],
    vo: "Add the mapped footpath option to today's plan. It follows the OpenStreetMap pedestrian network; the app does not measure shade, accessible sidewalks, or closures along the way.",
  },
  {
    name: "honest-boundaries",
    session: "walkthrough",
    duration: 10,
    card: { image: slide("trust") },
    vo: "The interface labels its limits: forecasts are estimates, mapped places need checking, and street shade is not measured. Follow local official guidance when making real-world decisions.",
  },
  {
    name: "start-a-local-note",
    session: "walkthrough",
    actions: [
      { type: "click", sel: ".map-heading button" },
      { type: "waitFor", sel: "[role='dialog']" },
      { type: "fill", sel: "#spot-name", text: "Example pause point", typewrite: true, delay: 85 },
      { type: "wait", ms: 10000 },
    ],
    vo: "When a map is missing a useful personal detail, a traveler can keep a local note. This example is labeled as a demo, so it does not present an invented place as a verified amenity.",
  },
  {
    name: "complete-local-note",
    session: "walkthrough",
    actions: [
      { type: "fill", sel: "#spot-note", text: "Demo note only. Confirm access before travelling.", typewrite: true, delay: 45 },
      { type: "wait", ms: 1800 },
      { type: "click", sel: ".kind-chip:has-text('Covered rest')" },
      { type: "wait", ms: 6200 },
    ],
    vo: "Add a short reminder and a category. The form keeps the user supplied detail attached to a place type, ready for someone to review in their own plan.",
  },
  {
    name: "pin-local-note",
    session: "walkthrough",
    actions: [
      { type: "click", sel: ".pin-location-button" },
      { type: "waitFor", sel: ".pin-picker-banner" },
      { type: "click", sel: ".map-viewport .leaflet-container" },
      { type: "wait", ms: 9200 },
    ],
    vo: "Place a pin on the map to give the note a location. The point and text stay in this browser; community sharing is not connected in this prototype.",
  },
  {
    name: "saved-note",
    session: "walkthrough",
    actions: [
      { type: "waitFor", sel: "[role='dialog']" },
      { type: "click", sel: "button.modal-submit" },
      { type: "waitFor", sel: ".toast-message" },
      { type: "wait", ms: 10600 },
    ],
    vo: "After saving, the example appears as your local report with its category and location. The screen also links to general guidance from the World Health Organization for everyday heat planning.",
  },
  {
    name: "add-place-to-plan",
    session: "walkthrough",
    actions: [
      { type: "click", sel: ".selected-place-card .save-place-button" },
      { type: "waitFor", sel: ".toast-message" },
      { type: "wait", ms: 10600 },
    ],
    vo: "Save that local item to your own plan, alongside a route choice. Nearby information becomes something to consider while preparing to leave, and remains visible in the browser for later.",
  },
  {
    name: "general-guidance",
    session: "walkthrough",
    actions: [
      { type: "scrollIntoView", sel: ".guidance-section" },
      { type: "wait", ms: 4800 },
      { type: "hover", sel: ".guidance-grid article:first-child" },
      { type: "wait", ms: 8500 },
    ],
    vo: "Below the planner, a short heat guide points to finding shade, drinking water, and checking on others. It stays general and links to its public health source. HeatCommons is not a medical, emergency, or navigation service.",
  },
  {
    name: "closing",
    session: "walkthrough",
    duration: 9,
    card: { image: slide("closing") },
    vo: "HeatCommons is an open-source starting point for a more informed everyday trip. Explore the live prototype and code at github.com/Georgefifth/heatcommons.",
  },
];
