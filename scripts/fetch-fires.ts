import { mkdir, writeFile } from "node:fs/promises"

type Fire = {
    latitude: number
    longitude: number
    frp: number
    confidence: string
    satellite: string
    detectedAt: string
}

function toIsoTime(date: string, time: string): string{
    const fullTime = time.padStart(4, "0")
    const hour = fullTime.slice(0, 2)
    const minute = fullTime.slice(2, 4)

    return `${date}T${hour}:${minute}:00Z`
}

function toFire(row: Record<string, string>): Fire {
    return {
        latitude: Number(row.latitude),
        longitude: Number(row.longitude),
        frp: Number(row.frp),
        confidence: row.confidence,
        satellite: row.satellite,
        detectedAt: toIsoTime(row.acq_date, row.acq_time)
    }
}

function toFeature(fire: Fire) {
    return {
        type: "Feature",
        geometry: {
            type: "Point",
            coordinates: [fire.longitude, fire.latitude]
        },
        properties: {
            frp: fire.frp,
            confidence: fire.confidence,
            satellite: fire.satellite,
            detectedAt: fire.detectedAt
        }
    }
}

const MAP_KEY = process.env.FIRMS_MAP_KEY

if(!MAP_KEY){
    throw new Error("Coulnd't find FIRMS_MAP_KEY")
}

const url = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${MAP_KEY}/VIIRS_SNPP_NRT/26,36,45,42/2`

const response = await fetch(url)
if(!response.ok) {
    throw new Error(`FIRMS REQUEST FAILED: ${response.status}`)
}

const text = await response.text()
const lines = text.trim().split("\n")

const [headerLine, ...dataLines] = lines
const headers = headerLine.split(",")

const rows = dataLines.map((line) => {
    const values = line.split(",")
    const row: Record<string, string> = {}
    headers.forEach((header, idx) => {
        row[header] = values[idx]
    })
    return row
})

const fires = rows.map(toFire)

const geojson = {
    type: "FeatureCollection",
    features: fires.map(toFeature)
}

await mkdir("public/data", { recursive: true })
await writeFile("public/data/fires.geojson", JSON.stringify(geojson))

console.log(`Wrote ${fires.length} fires to public/data/fires.geojson`);