# Catalog batch 1 — Great Basin

One additional itinerary in one previously uncovered park: eight routes across seven parks, not nationwide completion. Original seven features (including all geometry/properties) remain unchanged; SHA-256 regression fixture is pinned to approved baseline 62c3794d5d28dc8ecc4650ebaba4bf575e6d7bef. No UI, photos, saved-state format, importer or geometry tolerance changed.

## Itinerary facts

[Specific NPS Alpine Lakes guide](https://www.nps.gov/thingstodo/hike-the-alpine-lakes-loop.htm), updated June 21, 2025, publishes 2.7 miles total, 440 feet elevation gain and 9,890-foot starting elevation from Bristlecone Trailhead at the end of Wheeler Peak Scenic Drive, visiting Teresa and Stella lakes. We preserve its literal gain convention; the guide does not distinguish cumulative ascent from net change. We do not substitute the older general-table elevations or add the Bristlecone extension.

The [official highlighted itinerary map](https://www.nps.gov/thingstodo/images/Alpine-Lakes-Loop.png) was visually inspected against the vector junctions. It shows the common approach, lake circuit and short shared Wheeler Peak Summit Trail section, not a summit hike. Start and finish are the mapped Bristlecone trailhead [-114.3070378,39.0100445]. The approach is intentionally traversed twice; no road approach or synthetic parking connector is included.

## Full official vector provenance

[Public NPS Trails layer](https://mapservices.nps.gov/arcgis/rest/services/NationalDatasets/NPS_Public_Trails_Geographic/FeatureServer/0), retrieved November 17, 2026. The exact query is retained in the shipped feature's geometryQuery; unmodified returned GeoJSON is retained in tests/fixtures/grba-alpine-lakes.geojson. The official service attributes the data to National Park Service units/programs and describes authoritative park/regional GIS contributions. Additional source attributes checked live: MAINTAINER National Park Service, DATAACCESS Unrestricted, TRLSTATUS Existing and TRLSURFACE Native for all four features. Some MAPSOURCE values identify WorldView2 imagery used in mapping; no imagery is redistributed.

Traversal (all source geometry is LineString):
- 19868 Alpine Lakes Loop Trail forward: trailhead to [-114.30741126503516,39.00864209680037].
- 18590 Alpine Lakes Loop Trail forward: to [-114.3169644867683,39.00800057902577].
- 17204 Wheeler Peak Summit Trail reverse: to [-114.31830614392342,39.00718180883736].
- 17552 Alpine Lakes Loop Trail forward: back to the 19868 junction.
- 19868 reverse: retrace the same approach to the original trailhead.

Every junction and closure coincides exactly in raw coordinates; no gap allowance is used. Existing importer rounds to seven decimals, deduplicates coincident junction vertices and measures 2.665 GIS miles (0.035 miles below published 2.7). Offline regression reproduces the complete output from raw features, checks exact raw junctions/retracing, and rejects omission of a connecting segment. Import date is new-route-only; originals retain their original dates.

## Access, time and rights

[NPS conditions](https://www.nps.gov/grba/planyourvisit/conditions.htm) reported Wheeler Peak Scenic Drive CLOSED at Osceola Ditch, 4.5 miles, on the page updated November 11, 2026. This is a seasonal itinerary, not an assertion that the trailhead is currently reachable by car. Check live conditions before travel. The guide warns about altitude, thunderstorms, no potable water along the drive, no roadside parking, no pets except service animals and the 24-foot vehicle restriction above Upper Lehman Creek. Those constraints are retained in route access text.

Pacific Time is represented by America/Los_Angeles. The [federal boundary](https://www.govinfo.gov/content/pkg/CFR-2021-title49-vol1/pdf/CFR-2021-title49-vol1-sec71-10.pdf) follows the Utah–Nevada border here (West Wendover exception is far north).

Only official NPS text facts and NPS public trail vector data are newly shipped, no new photographs, logos, map tiles or third-party media. [NPS copyright policy](https://www.nps.gov/aboutus/disclaimer.htm) treats official government-created work as public domain unless otherwise indicated; no contrary restriction was indicated on this trail service. No copyright protection is claimed in original United States government works. Source attribution and links remain in the app/data. This is trip-planning data, not a guarantee of navigability.

## Remaining coverage and rejected candidates

This batch covers seven parks; the broader all-national-parks objective remains unmet. The other parks have no newly qualified route in this batch. No placeholder catalog entries imply coverage.
- Capitol Reef / Hickman: current “elevation change” versus older “gain” not resolved to a comparable ascent convention; excluded by lead.
- Petrified Forest / Crystal Forest and Giant Logs: published distances but no same-itinerary official numeric gain; excluded.
- Petrified Forest / Tawa: official 1.2 miles one-way, 81 feet gain and 28 feet loss, but GIS “TEWA” alias, endpoint and direction correspondence unresolved; excluded, no connector added.
- Arches / Delicate Arch and Bryce / Mossy Cave: facts found but complete itinerary-matched vector chain not qualified; excluded.
- Difficult/remote parks: no ready full itinerary accepted from researchers. Missing or mis-keyed GIS is not proof of route coverage.

The current official roster audit is a separate research artifact, not a claim that its parks have imported hikes. Future batches must independently qualify distance, numeric gain convention, trailhead/endpoints, full connected geometry and rights for each itinerary.

## Remaining-park inventory

Researcher roster read 2026-11-17T02:42:42.085663+00:00 from [NPS system list](https://www.nps.gov/aboutus/national-park-system.htm). This is a roster, not an itinerary audit; website codes are not assumed GIS codes. 57 parks remain without a verified planning itinerary in this catalog:

- [Acadia National Park](https://www.nps.gov/acad/siteindex.htm) — not qualified in this batch.
- [Arches National Park](https://www.nps.gov/arch/index.htm) — not qualified in this batch.
- [Badlands National Park](https://www.nps.gov/badl/index.htm) — not qualified in this batch.
- [Big Bend National Park](https://www.nps.gov/bibe/index.htm) — not qualified in this batch.
- [Biscayne National Park](https://www.nps.gov/bisc/index.htm) — not qualified in this batch.
- [Black Canyon of the Gunnison National Park](https://www.nps.gov/blca/index.htm) — not qualified in this batch.
- [Bryce Canyon National Park](https://www.nps.gov/brca/index.htm) — not qualified in this batch.
- [Canyonlands National Park](https://www.nps.gov/cany/index.htm) — not qualified in this batch.
- [Capitol Reef National Park](https://www.nps.gov/care/index.htm) — not qualified in this batch.
- [Carlsbad Caverns National Park](https://www.nps.gov/cave/index.htm) — not qualified in this batch.
- [Channel Islands National Park](https://www.nps.gov/chis/index.htm) — not qualified in this batch.
- [Chiricahua National Park](https://www.nps.gov/chir/index.htm) — not qualified in this batch.
- [Congaree National Park](https://www.nps.gov/cong/index.htm) — not qualified in this batch.
- [Crater Lake National Park](https://www.nps.gov/crla/index.htm) — not qualified in this batch.
- [Cuyahoga Valley National Park](https://www.nps.gov/cuva/index.htm) — not qualified in this batch.
- [Death Valley National Park](https://www.nps.gov/deva/index.htm) — not qualified in this batch.
- [Denali National Park](https://www.nps.gov/dena/index.htm) — not qualified in this batch.
- [Dry Tortugas National Park](https://www.nps.gov/drto/index.htm) — not qualified in this batch.
- [Everglades National Park](https://www.nps.gov/ever/index.htm) — not qualified in this batch.
- [Gates of the Arctic National Park](https://www.nps.gov/gaar/index.htm) — not qualified in this batch.
- [Gateway Arch National Park](https://www.nps.gov/jeff/index.htm) — not qualified in this batch.
- [Glacier Bay National Park](https://www.nps.gov/glba/index.htm) — not qualified in this batch.
- [Glacier National Park](https://www.nps.gov/glac/index.htm) — not qualified in this batch.
- [Grand Canyon National Park](https://www.nps.gov/grca/index.htm) — not qualified in this batch.
- [Grand Teton National Park](https://www.nps.gov/grte/index.htm) — not qualified in this batch.
- [Great Sand Dunes National Park](https://www.nps.gov/grsa/index.htm) — not qualified in this batch.
- [Great Smoky Mountains National Park](https://www.nps.gov/grsm/index.htm) — not qualified in this batch.
- [Guadalupe Mountains National Park](https://www.nps.gov/gumo/index.htm) — not qualified in this batch.
- [Haleakalā National Park](https://www.nps.gov/hale/index.htm) — not qualified in this batch.
- [Hawai'i Volcanoes National Park](https://www.nps.gov/havo/index.htm) — not qualified in this batch.
- [Hot Springs National Park](https://www.nps.gov/hosp/index.htm) — not qualified in this batch.
- [Indiana Dunes National Park](https://www.nps.gov/indu/index.htm) — not qualified in this batch.
- [Isle Royale National Park](https://www.nps.gov/isro/index.htm) — not qualified in this batch.
- [Joshua Tree National Park](https://www.nps.gov/jotr/index.htm) — not qualified in this batch.
- [Katmai National Park](https://www.nps.gov/katm/index.htm) — not qualified in this batch.
- [Kenai Fjords National Park](https://www.nps.gov/kefj/index.htm) — not qualified in this batch.
- [Kings Canyon National Park](https://www.nps.gov/seki/index.htm) — not qualified in this batch.
- [Kobuk Valley National Park](https://www.nps.gov/kova/index.htm) — not qualified in this batch.
- [Lake Clark National Park](https://www.nps.gov/lacl/index.htm) — not qualified in this batch.
- [Lassen Volcanic National Park](https://www.nps.gov/lavo/index.htm) — not qualified in this batch.
- [Mammoth Cave National Park](https://www.nps.gov/maca/index.htm) — not qualified in this batch.
- [Mesa Verde National Park](https://www.nps.gov/meve/index.htm) — not qualified in this batch.
- [Mount Rainier National Park](https://www.nps.gov/mora/index.htm) — not qualified in this batch.
- [National Park of American Samoa](https://www.nps.gov/npsa/index.htm) — not qualified in this batch.
- [New River Gorge National Park and Preserve](https://www.nps.gov/neri/index.htm) — not qualified in this batch.
- [North Cascades National Park](https://www.nps.gov/noca/index.htm) — not qualified in this batch.
- [Petrified Forest National Park](https://www.nps.gov/pefo/index.htm) — not qualified in this batch.
- [Pinnacles National Park](https://www.nps.gov/pinn/index.htm) — not qualified in this batch.
- [Redwood National Park](https://www.nps.gov/redw/index.htm) — not qualified in this batch.
- [Sequoia National Park](https://www.nps.gov/seki/index.htm) — not qualified in this batch.
- [Theodore Roosevelt National Park](https://www.nps.gov/thro/index.htm) — not qualified in this batch.
- [Virgin Islands National Park](https://www.nps.gov/viis/index.htm) — not qualified in this batch.
- [Voyageurs National Park](https://www.nps.gov/voya/index.htm) — not qualified in this batch.
- [White Sands National Park](https://www.nps.gov/whsa/index.htm) — not qualified in this batch.
- [Wind Cave National Park](https://www.nps.gov/wica/index.htm) — not qualified in this batch.
- [Wrangell-St. Elias National Park](https://www.nps.gov/wrst/index.htm) — not qualified in this batch.
- [Yellowstone National Park](https://www.nps.gov/yell/index.htm) — not qualified in this batch.
