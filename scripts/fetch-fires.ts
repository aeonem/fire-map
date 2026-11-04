import { mkdir, writeFile } from "node:fs/promises"
import { fromUrl, type GeoTIFFImage } from "geotiff"

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

// Only handles the northern and eastern hemispheres (N/E).
// Our bounding box is entirely within them.
function worldCoverTileName(lat: number, lon: number): string{
    const latTile = Math.floor(lat / 3) * 3
    const lonTile = Math.floor(lon / 3) * 3
    return `ESA_WorldCover_10m_2021_v200_N${String(latTile).padStart(2, "0")}E${String(lonTile).padStart(3, "0")}_Map.tif`
}

const WORLDCOVER_BASE_URL = "https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map"
const tileCache = new Map<string, Promise<GeoTIFFImage>>()

function openTile(name: string): Promise<GeoTIFFImage> {
    let tile = tileCache.get(name)
    if (!tile) {
        tile = fromUrl(`${WORLDCOVER_BASE_URL}/${name}`).then((tiff) => tiff.getImage())
        tileCache.set(name, tile)
    }
    return tile
}

const NATURAL_THRESHOLD = 0.2

function classifyWindow(pixels: Uint8Array): LandCoverGroup {
    const groupCounts: Record<LandCoverGroup, number> = {
        natural: 0,
        agricultural: 0,
        other: 0,
        unknown: 0,
    }

    for (const code of pixels) {
        const group = LAND_COVER_GROUPS[code] ?? "unknown"
        groupCounts[group] += 1
    }

    const naturalShare = groupCounts.natural / pixels.length
    if (naturalShare >= NATURAL_THRESHOLD) {
        return "natural"
    }

    let winner: LandCoverGroup = "unknown"
    for (const group of ["natural", "agricultural", "other", "unknown"] as const) {
        if (groupCounts[group] > groupCounts[winner]) {
            winner = group
        }
    }
    return winner
}

async function getLandCover(lat: number, lon: number): Promise<LandCoverGroup> {
    try {
        const image = await openTile(worldCoverTileName(lat, lon))
        const [originLon, originLat] = image.getOrigin()
        const [resLon, resLat] = image.getResolution()

        const x = Math.floor((lon - originLon) / resLon)
        const y = Math.floor((lat - originLat) / resLat)

        const half = 20
        const window = [
            Math.max(0, x - half),
            Math.max(0, y - half),
            Math.min(image.getWidth(), x + half),
            Math.min(image.getHeight(), y + half),
        ]

        const rasters = await image.readRasters({ window })
        return classifyWindow(rasters[0] as Uint8Array)
    } catch (error) {
        console.error(`Land cover lookup failed at ${lat}, ${lon}:`, error)
        return "unknown"
    }
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

for (const fire of allFires) {
    fire.landCover = await getLandCover(fire.latitude, fire.longitude)
}

const landCoverStats: Record<LandCoverGroup, number> = { natural: 0, agricultural: 0, other: 0, unknown: 0 }
for (const fire of allFires) {
    landCoverStats[fire.landCover] += 1
}
console.log("Land cover:", landCoverStats)

const geojson = {
    type: "FeatureCollection",
    features: allFires.map(toFeature),
    generatedAt: new Date().toISOString()
}

await mkdir("public/data", { recursive: true })
await writeFile("public/data/fires.geojson", JSON.stringify(geojson))

console.log(`Wrote ${allFires.length} fires to public/data/fires.geojson`);