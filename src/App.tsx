import { use, useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import "maplibre-gl/dist/maplibre-gl.css";
import type { FeatureCollection } from "geojson";

maplibregl.setWorkerUrl(workerUrl)

const FIRES_URL = import.meta.env.DEV
  ? "/data/fires.geojson"
  : "https://raw.githubusercontent.com/aeonem/fire-map/refs/heads/main/public/data/fires.geojson"

type FireProperties = {
  confidence: string,
  detectedAt: string,
  frp: number,
  satellite: string,
  landCover: string
}

type FiresData = FeatureCollection & { generatedAt?: string}
type SelectedFire = FireProperties & { lat: number; lon: number }

const FIRE_POWER_STOPS = [
  { value: 0, color: "#fecc5c", label: "0" },
  { value: 5, color: "#fd8d3c", label: "5" },
  { value: 15, color: "#f03b20", label: "15" },
  { value: 40, color: "#bd0026", label: "40" }
]

const TERRAIN_SOURCE: maplibregl.RasterDEMSourceSpecification = {
  type: "raster-dem",
  tiles: ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"],
  tileSize: 256,
  encoding: "terrarium",
  maxzoom: 15,
  attribution: "Terrain: Mapzen / AWS Terrain Tiles",
}

const LAND_COVER_GROUPS = ["woodland", "grassland", "agricultural", "other", "unknown"]

const landCoverLabels: Record<string, string> = {
  woodland: "Forest & shrubland",
  grassland: "Grassland",
  agricultural: "Farmland",
  other: "Non-vegetated",
  unknown: "Unknown",
}

const confidenceLevels: Record<string, string> = {
  l: "Low",
  n: "Normal",
  h: "High"
}

const satelliteTypes: Record<string, string> = {
  N: "Suomi NPP",
  N20: "NOAA-20",
  N21: "NOAA-21"
}

function formatRelativeTime(iso: string): string {
  const diffMs = new Date(iso).getTime() - Date.now();
  const diffMinutes = Math.round(diffMs / 60_000);

  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

  if (Math.abs(diffMinutes) < 60) {
    return rtf.format(diffMinutes, "minute");
  }
  return rtf.format(Math.round(diffMinutes / 60), "hour");
}

export default function App() {
  const [selectedFire, setSelectedFire] = useState<SelectedFire | null>(null)
  const [copied, setCopied] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const [fireCount, setFireCount] = useState<number | null>(null)
  const [generatedAt, setGeneratedAt] = useState<string | null>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const [layerReady, setLayerReady] = useState(false)
  const [visibleLands, setVisibleLands] = useState<string[]>(LAND_COVER_GROUPS)
  const [terrainOn, setTerrainOn] = useState(false)

  function toggleLand(group: string) {
    setVisibleLands((current) =>
      current.includes(group)
        ? current.filter((t) => t !== group)
        : [...current, group]
    )
  }

  async function copyCoordinates() {
    if (!selectedFire) return
    const text = `${selectedFire.lat.toFixed(4)}, ${selectedFire.lon.toFixed(4)}`
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  useEffect(() => {
    if(!containerRef.current) return
    
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: "https://tiles.openfreemap.org/styles/liberty",
      center: [35, 39], // [lng, lat]
      zoom: 5
    })
    mapRef.current = map

    map.on("load", async () => {
      const layers = map.getStyle().layers
      const firstSymbolLayer = layers.find((layer) => layer.type === "symbol")

      map.addSource("terrain", TERRAIN_SOURCE)
      map.addSource("terrain-3d", TERRAIN_SOURCE)

      map.addLayer(
        {
          id: "hillshade",
          type: "hillshade",
          source: "terrain",
          paint: {
            "hillshade-exaggeration": 0.5,
          },
        },
        firstSymbolLayer?.id
      )

      const response = await fetch(FIRES_URL)
      const data: FiresData = await response.json()

      setFireCount(data.features.length)
      setGeneratedAt(data.generatedAt ?? null)

      map.addSource("fires", {
        type: "geojson",
        data: data
      })

      map.addLayer({
        id: "fires",
        type: "circle",
        source: "fires",
        paint: {
          "circle-radius": [
            "interpolate", ["linear"], ["get", "frp"],
            0, 3,
            10, 6,
            50, 12, 
          ],
          "circle-color": [
            "interpolate", ["linear"], ["get", "frp"],
            ...FIRE_POWER_STOPS.flatMap((stop) => [stop.value, stop.color])
          ],
          "circle-stroke-width": 1,
          "circle-stroke-color": "#ffffff"
        },
      },
      firstSymbolLayer?.id
    )
      setLayerReady(true)
    })

    map.on("click", "fires", (e) => {
      const feature = e.features?.[0]
      if(!feature || feature.geometry.type !== "Point") return;
      
      const [lon, lat] = feature.geometry.coordinates
      setSelectedFire({ ...(feature.properties as FireProperties), lat, lon })
      setCopied(false)
    })

    map.on("mouseenter", "fires", () => {
      map.getCanvas().style.cursor = "pointer"
    })

    map.on("mouseleave", "fires", () => {
      map.getCanvas().style.cursor = ""
    })

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !layerReady) return

    map.setFilter("fires", [
      "in",
      ["coalesce", ["get", "landCover"], "unknown"],
      ["literal", visibleLands]
    ])
  }, [visibleLands, layerReady]
  )

  useEffect(() => {
    const map = mapRef.current
    if (!map || !layerReady) return

    if (terrainOn) {
      map.setTerrain({source: "terrain-3d", exaggeration: 1.5})
      map.easeTo({pitch: 60, duration: 1000})
    } else {
      map.setTerrain(null)
      map.easeTo({pitch:0, duration: 1000})
    }
  }, [terrainOn, layerReady])

  return (
    <div style={{position: "relative", width: "100%", height: "100%"}}>
      <div ref={containerRef} style={{width: "100%", height: "100%"}}/>

      <button
        onClick={() => setTerrainOn((on) => !on)}
        aria-pressed={terrainOn}
        style={{
          position: "absolute", top: 16, left: 16,
          background: "white", padding: "8px 12px", borderRadius: 8,
          border: "none", cursor: "pointer"
        }}
      >
        {terrainOn ? "2D view" : "3D terrain"}
      </button>

      {selectedFire && (
        <div style={{
          position: "absolute", top: 16, right: 16,
          background: "white", padding: 16, borderRadius: 8
        }}>
          <button aria-label="Close" onClick={() => setSelectedFire(null)}>X</button>
          <dl>
            <dt>Fire Radiative Power</dt>
            <dd>{selectedFire.frp.toFixed(1)} MW</dd>
            <dt>Detected at</dt>
            <dd>{new Date(selectedFire.detectedAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</dd>
            <dt>Confidence</dt>
            <dd>{confidenceLevels[selectedFire.confidence] ?? selectedFire.confidence}</dd>
            <dt>Satellite</dt>
            <dd>{satelliteTypes[selectedFire.satellite] ?? selectedFire.satellite}</dd>
            <dt>Land type</dt>
            <dd>{landCoverLabels[selectedFire.landCover] ?? landCoverLabels.unknown}</dd>
            <dt>Location</dt>
            <dd>
              {selectedFire.lat.toFixed(4)}, {selectedFire.lon.toFixed(4)}{" "}
              <button onClick={copyCoordinates}>
                {copied ? "Copied!" : "Copy"}
              </button> 
            </dd>
          </dl>
        </div>
      )}

      {fireCount === 0 && (
        <div
          role = "status"
          style={{
            position: "absolute", top: 16, left: "50%", transform: "translateX(-50%)",
            background: "white", padding: "12px 16px", borderRadius: 8,
            borderLeft: "4px solid #2e7d32", borderRight: "4px solid #2e7d32"
          }}
        >
          <strong>No active fire detections</strong>
          <div style={{fontSize: 14, color: "#555"}}>
            in the last 48 hours · Data: NASA FIRMS
          </div>
        </div>
      )}

      <div style={{
        position: "absolute", bottom: 32, left: 16,
        background: "white", padding: 12, borderRadius: 8,
      }}>
        <strong>Fire intensity (MW)</strong>
        {FIRE_POWER_STOPS.map((stop) => (
            <div key={stop.value}>
              <span style={{
                display: "inline-block", width: 12, height: 12,
                borderRadius: "50%", background: stop.color,
              }} />
              {" "}{stop.label}
            </div>
        ))}
        <strong style={{ display: "block", marginTop: 12 }}>Land type</strong>
        {LAND_COVER_GROUPS.map((group) => (
          <label key={group} style={{display: "block"}}>
            <input
              type="checkbox"
              checked={visibleLands.includes(group)}
              onChange={() => toggleLand(group)}
            />
            {" "}{landCoverLabels[group]}
          </label>
        ))}
        {generatedAt && (
        <div style={{fontSize: 12, color: "#555", marginTop: 8}}>
          Updated {formatRelativeTime(generatedAt)}
        </div>
        )}
      </div>
    </div>
  )
}