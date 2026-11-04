import { mkdir, writeFile } from "node:fs/promises"

type Fire = {
    latitude: number
    longitude: number
    frp: number
    confidence: string
    satellite: string
    detectedAt: string,
    landCover: LandCoverGroup
}

type LandCoverGroup = "natural" | "agricultural" | "other" | "unknown"

const LAND_COVER_GROUPS : Record<number, LandCoverGroup> = {
  10: "natural",
  20: "natural",
  30: "natural",
  40: "agricultural",
  50: "other" ,
  60: "other",
  70: "other",
  80: "other",
  90: "natural",
  95: "natural",
  100: "natural" 
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
        detectedAt: toIsoTime(row.acq_date, row.acq_time),
        landCover: "unknown"
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
            detectedAt: fire.detectedAt,
            landCover: fire.landCover
        }
    }
}

const MAP_KEY = process.env.FIRMS_MAP_KEY

if(!MAP_KEY){
    throw new Error("Couldn't find FIRMS_MAP_KEY")
}

async function fetchFires(source: string): Promise<Fire[]> {
    const url = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${MAP_KEY}/${source}/26,36,45,42/2`

    const response = await fetch(url)
    if(!response.ok) {
        throw new Error(`FIRMS REQUEST FAILED: ${response.status} ${source}`)
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

    return rows.map(toFire)
}

const SOURCES = ["VIIRS_NOAA20_NRT", "VIIRS_NOAA21_NRT","VIIRS_SNPP_NRT"]

const allFires: Fire[] = []
const failed: string[] = []

for(const source of SOURCES) {
    try{
        const fires = await fetchFires(source)
        console.log(`${source}: ${fires.length} detections`)
        allFires.push(...fires)
    } catch (error) {
        console.error(`${source} failed:`, error)
        failed.push(source)
    }
}

if(failed.length === SOURCES.length) {
    throw new Error("All sources failed; not writing any data")
}

const geojson = {
    type: "FeatureCollection",
    features: allFires.map(toFeature),
    generatedAt: new Date().toISOString()
}

await mkdir("public/data", { recursive: true })
await writeFile("public/data/fires.geojson", JSON.stringify(geojson))

console.log(`Wrote ${allFires.length} fires to public/data/fires.geojson`);