# Trail Gauge

A mobile web prototype for Design 2 from Submission 4. It uses sample trails and weather, with group settings and reviews stored in the browser.

From this directory, run:

```sh
python3 -m http.server 8000 --bind 127.0.0.1 --directory dist
```

Open http://127.0.0.1:8000 in a browser. No dependencies or API keys are required.

1. Open **Angels Landing**. The sample trail rating is **Moderate** and the seeded group’s estimate is **Hard**.
2. Choose **Edit group**. Set Jamie’s fitness to **High** and experience to **Experienced**, then save. The same trail now shows **Moderate** for the group.
3. Switch from **Extreme heat** to **Mild and dry** and watch the gauge and temperature bar move. Try **Extreme cold**, **Heavy rain**, or **Snow and ice** to see their effects on temperature, precipitation, and footing.
4. Open **Review this hike**, save a review, and refresh to see the saved comparison. Use **Reset demo** to restore the starting state.

The catalog also includes three sample hikes each in the Colorado Rockies and on Washington’s Olympic Peninsula. The gauge scores distance, altitude, and slippery footing separately from elevation gain and terrain. All weather and difficulty inputs are simulated.

Open a trail’s **Plan your hike** section for a group-aware time range, trail surface, sample ratings and crowd levels, and a link to the park’s official planning guide. Use **+ Compare** on up to three trails, then open **Compare** to see them side by side. Ratings, review counts, and crowds are illustrative. The time range is a rough estimate based on distance, climb, the slowest hiker’s fitness, terrain, altitude, and sample weather.

Open **Map** and choose one geographic area. Hover or focus a pin to preview its route, or tap a pin to keep the line visible. The map uses Leaflet and OpenStreetMap tiles, which require internet access. Pins are approximate trailheads, and the bundled route lines are illustrative rather than GPS tracks.

Use **History** for sample hikes and reviews you save. Under the header menu, **Profiles & friends** stores basic and advanced hiker profiles. **My Group** lets you select attendees, name the group, and save a reusable preset. The Weekend crew preset includes a read-only sample conversation under **View thread**. Profiles, presets, chat messages, and history are stored on the current browser and origin.

Trail mileage stays tied to the route. The planner adds a group comfort distance, a group-adjusted time range, and tips based on the profiles and weather. Advanced profiles can specify pace, comfortable distance and climb, and preferences for rough or steep terrain. These are prototype estimates.
