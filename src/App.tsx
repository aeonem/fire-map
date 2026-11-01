import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import "maplibre-gl/dist/maplibre-gl.css";
import type { FeatureCollection } from "geojson";

maplibregl.setWorkerUrl(workerUrl)

const FIRES_URL = "https://raw.githubusercontent.com/aeonem/fire-map/refs/heads/main/public/data/fires.geojson"

type FireProperties = {
  confidence: string,
  detectedAt: string,
  frp: number,
  satellite: string
}

const FIRE_POWER_STOPS = [
  { value: 0, color: "#fecc5c", label: "0" },
  { value: 5, color: "#fd8d3c", label: "5" },
  { value: 15, color: "#f03b20", label: "15" },
  { value: 40, color: "#bd0026", label: "40" }
]

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

export default function App() {
  const [selectedFire, setSelectedFire] = useState<FireProperties | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [fireCount, setFireCount] = useState<number | null>(null)

  useEffect(() => {
    if(!containerRef.current) return
    
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: "https://tiles.openfreemap.org/styles/liberty",
      center: [35, 39], // [lng, lat]
      zoom: 5
    })

    map.on("load", async () => {
      const layers = map.getStyle().layers
      const firstSymbolLayer = layers.find((layer) => layer.type === "symbol")
      const response = await fetch(FIRES_URL)
      const data: FeatureCollection = await response.json()

      setFireCount(data.features.length)

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
    })

    map.on("click", "fires", (e) => {
      const feature = e.features?.[0]
      if(!feature) return;
      setSelectedFire(feature.properties as FireProperties)
    })

    map.on("mouseenter", "fires", () => {
      map.getCanvas().style.cursor = "pointer"
    })

    map.on("mouseleave", "fires", () => {
      map.getCanvas().style.cursor = ""
    })

    return () => map.remove()
  }, [])

  return (
    <div style={{position: "relative", width: "100%", height: "100%"}}>
      <div ref={containerRef} style={{width: "100%", height: "100%"}}/>
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
        {
          FIRE_POWER_STOPS.map((stop) => (
            <div key={stop.value}>
              <span style={{
                display: "inline-block", width: 12, height: 12,
                borderRadius: "50%", background: stop.color,
              }} />
              {" "}{stop.label}
            </div>
          ))
        }
      </div>
    </div>
  )
}