import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css"

type FireProperties = {
  confidence: string,
  detectedAt: string,
  frp: number,
  satellite: string
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
      })
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

console.log(selectedFire)
  return <div ref={containerRef} style={{width: "100%", height:"100%"}} />
}