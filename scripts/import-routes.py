"""Assemble verified itineraries from reviewed NPS public trail segments."""
import argparse
import datetime
import json
import math
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]
LAYER = ("https://mapservices.nps.gov/arcgis/rest/services/NationalDatasets/"
         "NPS_Public_Trails_Geographic/FeatureServer/0")


def meters(a, b):
    lat_a, lat_b = math.radians(a[1]), math.radians(b[1])
    d_lon = math.radians(b[0] - a[0])
    h = math.sin((lat_b - lat_a) / 2)**2 + math.cos(lat_a) * math.cos(lat_b) * math.sin(d_lon / 2)**2
    return 12742000 * math.asin(math.sqrt(h))


def source_url(park, segments):
    return LAYER + "/query?" + urlencode({
        "where": f"UNITCODE='{park.upper()}' AND OBJECTID IN ({','.join(str(row[0]) for row in segments)})",
        "outFields": "OBJECTID,TRLNAME,UNITCODE,UNITNAME,FEATUREID,GEOMETRYID",
        "outSR": 4326,
        "f": "geojson",
    })


def assemble(route, source, imported):
    parts = {feature["properties"]["OBJECTID"]: feature for feature in source["features"]}
    route = dict(route)
    segments = route.pop("segments")
    return_type = route.pop("return", None)
    max_parking_gap = route.pop("maxParkingGapMeters", 0)
    coordinates = []
    for object_id, name, *direction in segments:
        feature = parts[object_id]
        props, geometry = feature["properties"], feature["geometry"]
        if (props["TRLNAME"], props["UNITCODE"].lower(), props["UNITNAME"], geometry["type"]) != (
            name, route["parkCode"], route["park"], "LineString"
        ):
            raise ValueError(f"{route['id']}: NPS segment {object_id} changed")
        line = [[round(x, 7), round(y, 7)] for x, y, *_ in geometry["coordinates"]]
        if direction == ["reverse"]:
            line.reverse()
        if coordinates:
            # NPS junction vertices can differ slightly across features. Keep both
            # in that case and reject discrepancies that would need drawn linework.
            if meters(coordinates[-1], line[0]) > 2:
                raise ValueError(f"{route['id']}: disconnected NPS segment {object_id}")
            if coordinates[-1] == line[0]:
                line = line[1:]
        coordinates.extend(line)
        if object_id == segments[0][0]:
            first_leg = coordinates[:]
    if return_type == "reverse":
        coordinates.extend(reversed(coordinates[:-1]))
    elif return_type == "first-segment":
        if coordinates[-1] != first_leg[-1]:
            raise ValueError(f"{route['id']}: loop no longer joins the approach")
        coordinates.extend(reversed(first_leg[:-1]))
    endpoint_gap = meters(coordinates[0], coordinates[-1])
    if endpoint_gap > max_parking_gap:
        raise ValueError(f"{route['id']}: itinerary must return to the trailhead or its documented parking area")
    if endpoint_gap:
        route["parkingGapMeters"] = round(endpoint_gap, 1)
    measured = sum(meters(a, b) for a, b in zip(coordinates, coordinates[1:])) / 1609.344
    if abs(measured - route["miles"]) > max(.12, route["miles"] * .08):
        raise ValueError(f"{route['id']}: {measured:.2f} GIS miles differs from published itinerary")
    if route.get("upperPoint") and route["upperPoint"]["coordinates"] not in coordinates:
        raise ValueError(f"{route['id']}: upper weather point moved off the route")
    route.update(importDate=imported, trailhead=coordinates[0], gisMiles=round(measured, 3),
                 geometrySource=LAYER, geometryQuery=source_url(route["parkCode"], segments),
                 sourceSegments=[{"objectId": row[0], "name": row[1]} for row in segments])
    return {"type": "Feature", "id": route["id"], "properties": route,
            "geometry": {"type": "LineString", "coordinates": coordinates}}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--import-date", default=datetime.date.today().isoformat())
    args = parser.parse_args()
    datetime.date.fromisoformat(args.import_date)
    features = []
    for route in json.loads((ROOT / "scripts/routes.json").read_text()):
        with urlopen(source_url(route["parkCode"], route["segments"]), timeout=30) as response:
            feature = assemble(route, json.load(response), args.import_date)
        features.append(feature)
        print(f"{route['id']}: {feature['properties']['gisMiles']} GIS miles / {route['miles']} planning miles")
    output = ROOT / "dist/routes.geojson"
    output.write_text(json.dumps({"type": "FeatureCollection", "features": features},
                                 ensure_ascii=False, separators=(",", ":")) + "\n")


if __name__ == "__main__":
    main()
