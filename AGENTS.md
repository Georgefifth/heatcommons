# HeatCommons project instructions

## Product

HeatCommons is an open-source, community-first heat planning prototype for people who travel or work outdoors. It helps people see the local forecast, browse mapped places to pause, compare pedestrian route options, and save place updates on their device.

The project is a hackathon MVP. Keep the first release easy to run and demonstrate. Prefer a small number of complete, useful flows over placeholder pages.

## Trust and safety

- Never describe demo locations, routes, reports, opening hours, shade coverage, access, or water availability as verified facts. Label seeded records as demo data in the interface.
- OpenStreetMap place tags show what contributors mapped. A park is not proof of shade; an indoor amenity is not a designated cooling center; mapped hours and accessibility tags can be incomplete or outdated. Tell people to confirm access, hours, and availability before travelling.
- Valhalla pedestrian routes follow the mapped walking network. Do not describe them as shaded, accessible, safe, or turn-by-turn navigation. Make it clear that street-level shade is not measured.
- Show where forecast data came from and whether it is live or fallback demo data.
- HeatCommons is not a medical, emergency response, official warning, or navigation service. Do not diagnose, calculate personal medical risk, or promise a route is safe or cool.
- Keep heat guidance general and link to public health sources such as WHO or CDC. Tell people to follow local official alerts and emergency guidance.
- Do not collect or transmit precise location unless the user explicitly requests location access. Do not send personal data to third-party APIs.
- User-created reports in the MVP stay in the browser's local storage. Explain that they are not visible to other users.

## Data and attribution

- Use Open-Meteo's public forecast API for a no-key weather prototype. Show its source and a last-updated state. Apparent temperature is not an official heat warning or personal health-risk score. Handle failures with clearly labeled sample conditions.
- Use OpenStreetMap tiles only for visible map content. Keep the required OpenStreetMap attribution visible, use the documented HTTPS tile endpoint, and do not prefetch or bulk-download tiles.
- Use small, cached Overpass queries for nearby OpenStreetMap place listings and include OSM attribution. Respect the public instance's fair use limits; make external place lookups optional and retain a clear fallback state.
- Use the public Valhalla pedestrian demo with an identifying `X-Client-Id` header and fair-use request volume. Cache demo-area routes. If the service is unavailable, show the unavailable state instead of drawing invented route geometry.
- Before using another dataset, API, or existing project, check its license and terms. Do not copy another project's code or present existing work as original.
- Keep example place records small, local, and clearly identified as unverified prototype data.

## UX and implementation

- Make the core map, heat outlook, route comparison, and report flow work on desktop and mobile.
- Use readable contrast, keyboard-accessible controls, visible focus states, and labels that do not rely on color alone.
- Keep external services optional where practical, with useful loading, error, and fallback states.
- Keep dependencies modest and document setup and data sources in README.md.
- The project should be publishable as a public open-source repository. Keep the MIT license and AI/tool/data disclosures accurate.

## Commands

- npm run dev starts the local development server.
- npm run build creates the static production bundle.
- npm run test:e2e runs the desktop and mobile Firefox browser flows. Run npx playwright install firefox once before the first browser run.

Do not add credentials, personal data, or unrelated files from the surrounding home directory to this project.
