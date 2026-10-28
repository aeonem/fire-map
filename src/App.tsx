import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import "maplibre-gl/dist/maplibre-gl.css";

maplibregl.setWorkerUrl(workerUrl)

type FireProperties = {
  confidence: string,
  detectedAt: string,
  frp: number,
  satellite: string
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

export default function App() {
  const [selectedFire, setSelectedFire] = useState<FireProperties | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if(!containerRef.current) return
    
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: "https://tiles.openfreemap.org/styles/liberty",
      center: [35, 39], // [lng, lat]
      zoom: 5
    })

    map.on("load", () => {
      const layers = map.getStyle().layers
      const firstSymbolLayer = layers.find((layer) => layer.type === "symbol")

      map.addSource("fires", {
        type: "geojson",
        data: "/data/fires.geojson"
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
            0,  "#fecc5c",   // açık sarı-turuncu
            5,  "#fd8d3c",   // turuncu
            15, "#f03b20",   // kırmızı
            40, "#bd0026",   // koyu kırmızı
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
    </div>
  )
}