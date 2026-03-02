# Cyprus Parcel Finder

Find and visualise any land parcel on the DLS (Department of Lands and Surveys) cadastral map.

## Features

- **By parcel details** — enter sheet, plan, parcel number (and optionally district) to locate a parcel
- **By Bazaraki URL** — paste a land listing URL, the app scrapes the coordinates and finds the corresponding DLS parcel
- Interactive map with DLS cadastral boundaries, parcel highlight, satellite/topo toggle
- Enrichment: district, municipality, planning zone

## Setup

```bash
pip install -r requirements.txt
```

## Run

```bash
streamlit run app.py
```
