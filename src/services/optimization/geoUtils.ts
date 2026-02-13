// Simple hash function to replace Node.js crypto for browser compatibility
function simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(16);
}

export interface Point {
    Latitude: number | string;
    Longitude: number | string;
    weight?: number;
    id?: string;
    point_id?: string;
    Cliente?: string;
    Endereco?: string;
    fixed_vehicle?: string;
    [key: string]: any;
}

export interface Coord {
    lat: number;
    lon: number;
}

export function generatePointId(clientName: string, address: string, lat?: number, lon?: number): string {
    const client = String(clientName || '').trim().toUpperCase();
    const addr = String(address || '').trim().toUpperCase();
    let uniqueString = `${client}|${addr}`;

    if (lat !== undefined && lon !== undefined) {
        uniqueString += `|${lat.toFixed(6)}|${lon.toFixed(6)}`;
    }

    return simpleHash(uniqueString);
}

export function extractCoordinates(ponto: any): Coord | null {
    try {
        if (!ponto) return null;
        if (ponto.ponto && !ponto.Latitude) return extractCoordinates(ponto.ponto);

        let lat: any = null;
        let lon: any = null;

        if (typeof ponto === 'object' && !Array.isArray(ponto)) {
            const latKeys = ['Latitude', 'LATITUDE', 'latitude', 'lat', 'LAT'];
            const lonKeys = ['Longitude', 'LONGITUDE', 'longitude', 'lon', 'LON', 'lng', 'LNG'];

            for (const key of latKeys) {
                if (ponto[key] !== undefined && ponto[key] !== '') { lat = ponto[key]; break; }
            }
            for (const key of lonKeys) {
                if (ponto[key] !== undefined && ponto[key] !== '') { lon = ponto[key]; break; }
            }
        } else if (Array.isArray(ponto) && ponto.length >= 2) {
            lat = ponto[0]; lon = ponto[1];
        }

        if (lat !== null && lon !== null) {
            const sLat = String(lat).replace(',', '.');
            const sLon = String(lon).replace(',', '.');
            const fLat = parseFloat(sLat);
            const fLon = parseFloat(sLon);
            if (fLat === 0 && fLon === 0) return null;
            if (isNaN(fLat) || isNaN(fLon)) return null;
            return { lat: fLat, lon: fLon };
        }
    } catch (e) { }
    return null;
}

export function haversine(p1: [number, number], p2: [number, number]): number {
    const [lon1, lat1] = p1;
    const [lon2, lat2] = p2;
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

export function distSq(p1: Coord, p2: Coord, cosLat: number): number {
    const dy = p1.lat - p2.lat;
    const dx = (p1.lon - p2.lon) * cosLat;
    return dx * dx + dy * dy;
}

export function calculateRouteCost(route: Point[], cosLat: number): number {
    if (route.length < 2) return 0;
    const coords = route.map(p => extractCoordinates(p)).filter(c => c !== null) as Coord[];
    if (coords.length < 2) return 0;
    let cost = 0;
    for (let i = 0; i < coords.length - 1; i++) {
        cost += distSq(coords[i], coords[i + 1], cosLat);
    }
    return cost;
}
