"""Prepare Census Bureau state boundaries for USGS spatial searches."""
import argparse
import io
import json
from pathlib import Path
from urllib.request import urlopen
from xml.etree import ElementTree
from zipfile import ZipFile

SOURCE = "https://www2.census.gov/geo/tiger/GENZ2025/kml/cb_2025_us_state_20m.zip"
NAMESPACE = {"k": "http://www.opengis.net/kml/2.2"}
OUTPUT = Path(__file__).resolve().parents[1] / "dist/us-states.json"


def arcgis_ring(element, clockwise):
    ring = []
    for coordinate in element.text.split():
        point = [round(float(value), 5) for value in coordinate.split(",")[:2]]
        if not ring or point != ring[-1]:
            ring.append(point)
    if ring[0] != ring[-1]:
        ring.append(ring[0])
    area = sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(ring, ring[1:]))
    if (area < 0) != clockwise:
        ring.reverse()
    return ring


def import_boundaries(content):
    with ZipFile(io.BytesIO(content)) as archive:
        [filename] = [name for name in archive.namelist() if name.endswith(".kml")]
        root = ElementTree.fromstring(archive.read(filename))
    states = []
    for item in root.findall(".//k:Placemark", NAMESPACE):
        fields = {field.attrib["name"]: field.text for field in item.findall(".//k:SimpleData", NAMESPACE)}
        rings = []
        for polygon in item.findall(".//k:Polygon", NAMESPACE):
            outer = polygon.find("k:outerBoundaryIs/k:LinearRing/k:coordinates", NAMESPACE)
            rings.append(arcgis_ring(outer, clockwise=True))
            for inner in polygon.findall("k:innerBoundaryIs/k:LinearRing/k:coordinates", NAMESPACE):
                rings.append(arcgis_ring(inner, clockwise=False))
        if not rings:
            raise ValueError(f"Missing geometry for {fields['NAME']}")
        states.append({"code": fields["STUSPS"], "name": fields["NAME"], "rings": rings})
    if len(states) != 52 or len({state["code"] for state in states}) != len(states):
        raise ValueError("Expected 50 states, DC, and Puerto Rico")
    return {"source": SOURCE, "states": sorted(states, key=lambda state: state["name"])}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--archive", type=Path, help="Use a previously downloaded official Census KML archive")
    args = parser.parse_args()
    if args.archive:
        data = args.archive.read_bytes()
    else:
        with urlopen(SOURCE, timeout=30) as response:
            data = response.read()
    OUTPUT.write_text(json.dumps(import_boundaries(data), separators=(",", ":")) + "\n")
    print(f"Wrote {OUTPUT.name} ({OUTPUT.stat().st_size:,} bytes)")
