#!/usr/bin/env python3
"""
Cyprus Parcel Finder
Find and visualise any parcel on the DLS cadastral map.
Two modes: enter parcel details (sheet/plan/parcel) or paste a Bazaraki listing URL.
"""

import re

import json

import requests
import streamlit as st
import streamlit.components.v1 as components
from curl_cffi import requests as cffi_requests

# ── Config ────────────────────────────────────────────────────────────────────
DLS_BASE = "https://eservices.dls.moi.gov.cy/arcgis/rest/services/National/CadastralMap_EN/MapServer"

DISTRICTS = {
    "Any": None,
    "Nicosia (Lefkosia)": 1,
    "Limassol (Lemesos)": 5,
    "Larnaca (Larnaka)": 4,
    "Paphos (Pafos)": 6,
    "Famagusta (Ammochostos)": 2,
    "Kyrenia (Keryneia)": 3,
}

DISTRICT_NAMES = {1: "Lefkosia", 2: "Ammochostos", 3: "Keryneia",
                  4: "Larnaka", 5: "Lemesos", 6: "Pafos"}

BROWSERS = ["chrome", "chrome110", "chrome116", "chrome120", "safari"]

st.set_page_config(page_title="Parcel Finder", page_icon="📍", layout="wide")


# ── DLS API helpers ───────────────────────────────────────────────────────────
def dls_query_layer(layer_id, params):
    params.setdefault("f", "json")
    resp = requests.get(f"{DLS_BASE}/{layer_id}/query", params=params, timeout=30)
    resp.raise_for_status()
    return resp.json()


def find_parcel_by_details(sheet, plan, parcel_nbr, dist_code=None):
    where = f"PARCEL_NBR={parcel_nbr} AND SHEET='{sheet}' AND PLAN_NBR='{plan}'"
    if dist_code:
        where += f" AND DIST_CODE={dist_code}"
    data = dls_query_layer(0, {
        "where": where,
        "outFields": "DIST_CODE,VIL_CODE,BLCK_CODE,PARCEL_NBR,SHEET,PLAN_NBR",
        "returnGeometry": "true",
        "outSR": "4326",
    })
    return data.get("features", [])


def find_parcel_by_coords(lat, lng):
    data = dls_query_layer(0, {
        "geometry": f"{lng},{lat}",
        "geometryType": "esriGeometryPoint",
        "inSR": "4326",
        "spatialRel": "esriSpatialRelIntersects",
        "outFields": "DIST_CODE,VIL_CODE,BLCK_CODE,PARCEL_NBR,SHEET,PLAN_NBR",
        "returnGeometry": "true",
        "outSR": "4326",
    })
    feats = data.get("features", [])
    return feats[0] if feats else None


def spatial_lookup(layer_id, out_fields, lat, lng):
    data = dls_query_layer(layer_id, {
        "geometry": f"{lng},{lat}",
        "geometryType": "esriGeometryPoint",
        "inSR": "4326",
        "spatialRel": "esriSpatialRelIntersects",
        "outFields": out_fields,
        "returnGeometry": "false",
    })
    feats = data.get("features", [])
    return feats[0]["attributes"] if feats else {}


def enrich(lat, lng):
    zone = spatial_lookup(12, "PLNZNT_NAME,PLNZNT_DESC", lat, lng)
    muni = spatial_lookup(16, "VIL_NM_E", lat, lng)
    dist = spatial_lookup(15, "DIST_NM_E", lat, lng)
    return {
        "planning_zone": zone.get("PLNZNT_NAME", "—"),
        "planning_zone_desc": zone.get("PLNZNT_DESC", "—"),
        "municipality": muni.get("VIL_NM_E", "—"),
        "district": dist.get("DIST_NM_E", "—"),
    }


def centroid(rings):
    ring = rings[0]
    n = len(ring)
    return sum(p[1] for p in ring) / n, sum(p[0] for p in ring) / n


# ── Bazaraki scraper ──────────────────────────────────────────────────────────
def scrape_bazaraki(url):
    for browser in BROWSERS:
        try:
            resp = cffi_requests.get(url, impersonate=browser, timeout=20)
            if resp.status_code == 200:
                html = resp.text
                break
        except Exception:
            continue
    else:
        return None

    result = {"lat": None, "lng": None, "title": "", "price": "", "location": ""}

    coords = re.search(
        r'data-default-lat="([0-9.]+)"\s+data-default-lng="([0-9.]+)"', html
    )
    if coords:
        result["lat"] = float(coords.group(1))
        result["lng"] = float(coords.group(2))

    title_m = re.search(r'<h1[^>]*>(.*?)</h1>', html, re.S)
    if title_m:
        result["title"] = re.sub(r'<[^>]+>', '', title_m.group(1)).strip()

    price_m = re.search(r'"price"[^>]*>.*?<span>(.*?)</span>', html, re.S)
    if price_m:
        result["price"] = re.sub(r'<[^>]+>', '', price_m.group(1)).strip()

    loc_m = re.search(r'class="[^"]*announcement-loc[^"]*"[^>]*>([^<]+)', html)
    if loc_m:
        result["location"] = loc_m.group(1).strip()

    return result


# ── Map builder ───────────────────────────────────────────────────────────────
def build_map_html(feature, extra):
    """Build an HTML string with the Leaflet + esri-leaflet DLS map and highlighted parcel."""
    rings = feature["geometry"]["rings"]
    lat, lng = centroid(rings)
    attrs = feature["attributes"]

    coords_js = json.dumps([[p[1], p[0]] for p in rings[0]])

    parcel = attrs.get("PARCEL_NBR", "?")
    sheet = attrs.get("SHEET", "?")
    plan = attrs.get("PLAN_NBR", "?")
    district = extra.get("district", "—")
    municipality = extra.get("municipality", "—")

    return f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script src="https://unpkg.com/esri-leaflet@3.0.12/dist/esri-leaflet.js"></script>
  <style>
    body {{ margin: 0; padding: 0; }}
    #map {{ width: 100%; height: 100vh; }}
    .info-box {{
      position: absolute; top: 10px; right: 10px; z-index: 1000;
      background: rgba(255,255,255,0.95); border-radius: 8px;
      padding: 12px 16px; font-family: system-ui, sans-serif;
      font-size: 12px; line-height: 1.5; box-shadow: 0 2px 8px rgba(0,0,0,0.2);
      max-width: 220px;
    }}
    .info-box h3 {{ margin: 0 0 6px; font-size: 14px; }}
    .info-box .label {{ color: #666; }}
    .info-box .value {{ font-weight: 600; }}
  </style>
</head>
<body>
  <div id="map"></div>
  <div class="info-box">
    <h3>Parcel {parcel}</h3>
    <div><span class="label">District:</span> <span class="value">{district}</span></div>
    <div><span class="label">Municipality:</span> <span class="value">{municipality}</span></div>
    <div><span class="label">Sheet / Plan:</span> <span class="value">{sheet} / {plan}</span></div>
  </div>
  <script>
    var parcelCoords = {coords_js};
    var map = L.map('map', {{ maxZoom: 18 }}).setView([{lat}, {lng}], 17);

    var topoBase = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{{z}}/{{y}}/{{x}}',
      {{ attr: 'Esri', maxZoom: 18 }}
    ).addTo(map);

    var satellite = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{{z}}/{{y}}/{{x}}',
      {{ attr: 'Esri', maxZoom: 18 }}
    );

    var dlsLayer = L.esri.dynamicMapLayer({{
      url: '{DLS_BASE}',
      opacity: 1
    }}).addTo(map);

    L.control.layers({{
      'DLS Cadastral + Topo': topoBase,
      'Satellite': satellite
    }}).addTo(map);

    var parcel = L.polygon(parcelCoords, {{
      color: '#ff0000', weight: 4,
      fillColor: '#ff0000', fillOpacity: 0.3
    }}).addTo(map);

    parcel.bindPopup('<b>Parcel {parcel}</b><br>{sheet} / {plan}<br>{municipality}');
    map.fitBounds(parcel.getBounds().pad(0.3));
  </script>
</body>
</html>"""


# ── Helper: redirect to result page ──────────────────────────────────────────
def _go_to_parcel(attrs):
    """Set query params to navigate to the result page for this parcel."""
    st.query_params["sheet"] = attrs.get("SHEET", "")
    st.query_params["plan"] = attrs.get("PLAN_NBR", "")
    st.query_params["parcel"] = attrs.get("PARCEL_NBR", "")
    st.query_params["district"] = attrs.get("DIST_CODE", "")


# ── Sidebar: search panel ────────────────────────────────────────────────────
with st.sidebar:
    st.header("Parcel Finder")

    with st.form("parcel_form"):
        sheet = st.text_input("Sheet", placeholder="e.g. 47")
        plan = st.text_input("Plan", placeholder="e.g. 41")
        parcel_nbr = st.text_input("Parcel Number", placeholder="e.g. 190")
        district = st.selectbox("District (optional)", list(DISTRICTS.keys()))
        submitted = st.form_submit_button("Find Parcel", type="primary",
                                          use_container_width=True)

    if submitted:
        if not (sheet and plan and parcel_nbr):
            st.error("Fill in Sheet, Plan, and Parcel.")
        else:
            with st.spinner("Querying DLS..."):
                try:
                    features = find_parcel_by_details(
                        sheet.strip(), plan.strip(), int(parcel_nbr.strip()),
                        DISTRICTS[district],
                    )
                except Exception as e:
                    st.error(f"DLS query failed: {e}")
                    features = []

            if not features:
                st.warning("No parcel found.")
            else:
                if len(features) > 1:
                    st.info(f"{len(features)} matches — showing first. Pick a district to narrow down.")
                st.session_state["listing"] = None
                _go_to_parcel(features[0]["attributes"])

# ── Main area: map result ────────────────────────────────────────────────────
qp = st.query_params
_has_parcel = "sheet" in qp and "plan" in qp and "parcel" in qp

if _has_parcel:
    with st.spinner("Loading parcel..."):
        features = find_parcel_by_details(
            qp["sheet"], qp["plan"], int(qp["parcel"]),
            int(qp["district"]) if "district" in qp else None,
        )

    if not features:
        st.error("Parcel not found. Check the URL parameters.")
    else:
        feature = features[0]
        attrs = feature["attributes"]
        rings = feature["geometry"]["rings"]
        lat, lng = centroid(rings)
        extra = enrich(lat, lng)

        map_html = build_map_html(feature, extra)
        components.html(map_html, height=700)

        listing = st.session_state.get("listing")
        if listing:
            st.caption(f"{listing.get('title', '')} — "
                       f"{listing.get('price', '')} — "
                       f"{listing.get('location', '')}")

        with st.expander("Parcel Details"):
            details = {
                "Parcel": attrs.get("PARCEL_NBR", "—"),
                "Sheet / Plan": f"{attrs.get('SHEET', '—')} / {attrs.get('PLAN_NBR', '—')}",
                "Block": attrs.get("BLCK_CODE", "—"),
                "District": extra.get("district", "—"),
                "Municipality": extra.get("municipality", "—"),
                "Planning Zone": f"{extra.get('planning_zone', '—')} "
                                 f"({extra.get('planning_zone_desc', '—')})",
            }
            for k, v in details.items():
                st.write(f"**{k}:** {v}")
else:
    default_html = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script src="https://unpkg.com/esri-leaflet@3.0.12/dist/esri-leaflet.js"></script>
  <style>body {{ margin:0; padding:0; }} #map {{ width:100%; height:100vh; }}</style>
</head>
<body>
  <div id="map"></div>
  <script>
    var map = L.map('map', {{ maxZoom: 18 }}).setView([35.0, 33.4], 9);
    L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{{z}}/{{y}}/{{x}}',
      {{ attr: 'Esri', maxZoom: 18 }}
    ).addTo(map);
    L.esri.dynamicMapLayer({{ url: '{DLS_BASE}', opacity: 1 }}).addTo(map);
  </script>
</body>
</html>"""
    components.html(default_html, height=700)
