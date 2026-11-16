# LastLight — Surplus Food, Second Chance

LastLight is an interactive prototype for small-café closing shifts. It helps staff list surplus items, prioritize the nearest use-by window, choose a plausible use/share/compost route, and inspect the assumptions behind an illustrative food-diversion scenario.

## Run locally

From this folder, run `python3 -m http.server 3000 --bind 0.0.0.0` and open the project’s Preview. The app uses plain HTML, CSS, and JavaScript; it requires no package installation or backend. `index.html`, `styles.css`, and `app.js` are the main interface files. `manus-routes.json` is the single-page route manifest.

## Explore the prototype

The board starts with synthetic sample items. Add an entry, choose a route, use the All / Still in play / Resolved filters, mark a workflow complete, reopen or remove an item, and adjust the factor in “Show your working.” Reset sample board restores the demonstration entries and placeholder factor. Data is stored only in browser local storage on that device.

## Estimation boundaries

The scenario uses demo conversion factors of 0.25 kg per portion and 0.18 kg per item; assumed route success shares of repurpose 90%, staff use 85%, discount 70%, donation 80%, and compost/disposal 0%; and an editable default factor of 1.8 kg CO₂e per potentially eaten kg. These are explicit teaching assumptions, not sourced measurements or a lifecycle assessment. A completed workflow is not proof that food was consumed or donated. The app does not assess food safety, confirm donations, sync teams, or connect to external datasets/services. See “Show your working” in the interface for details.
