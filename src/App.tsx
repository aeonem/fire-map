import { useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css"


export default function App() {
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

    return () => map.remove()
  }, [])

  return <div ref={containerRef} style={{width: "100%", height:"100%"}} />
}