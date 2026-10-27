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
          "circle-radius": 4,
          "circle-color": "#e4572e",
          "circle-stroke-width": 1,
          "circle-stroke-color": "#ffffff"
        },
      })
    })

    return () => map.remove()
  }, [])

  return <div ref={containerRef} style={{width: "100%", height:"100%"}} />
}