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
      center: [35, 39],
      zoom: 5
    })

    return () => map.remove()
  }, [])

  return <div ref={containerRef} style={{width: "100%", height:"100%"}} />
}