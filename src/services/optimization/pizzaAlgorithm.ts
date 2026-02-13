import { type Point, extractCoordinates, haversine } from './geoUtils';
import { optimizeRouteOrder } from './tspSolver';

export interface OptimizationSettings {
    maxPointsPerVehicle?: number;
    maxHours?: number;
    avgSpeed?: number;
    serviceTime?: number;
    forceFulfill?: boolean;
    [key: string]: any;
}

/**
 * Estimates route duration in hours
 */
function estimateRouteTime(points: Point[], depLat: number, depLon: number, settings: OptimizationSettings): number {
    if (points.length === 0) return 0;

    const avgSpeed = settings.avgSpeed || 40;
    const serviceTime = settings.serviceTime || 10;

    let distance = 0;
    let lastLat = depLat;
    let lastLon = depLon;

    for (const p of points) {
        const coords = extractCoordinates(p);
        if (coords) {
            distance += haversine([lastLon, lastLat], [coords.lon, coords.lat]);
            lastLat = coords.lat;
            lastLon = coords.lon;
        }
    }

    // Return to depot
    distance += haversine([lastLon, lastLat], [depLon, depLat]);

    const drivingTimeMin = (distance / Math.max(1, avgSpeed)) * 60;
    const serviceTimeMin = points.length * serviceTime;

    return (drivingTimeMin + serviceTimeMin) / 60.0;
}

/**
 * Pizza Algorithm - Circular/Angular sweep for compact routes
 */
export function distributePointsCompact(
    points: Point[],
    vehicles: any[],
    depot: any,
    settings: OptimizationSettings
): { distribution: Record<string, Point[]>, unserved: Point[] } {

    const targetPts = settings.maxPointsPerVehicle || 35;
    const maxHours = settings.maxHours || 10;

    const distribution: Record<string, Point[]> = {};
    const unserved: Point[] = [];
    const validPoints: Point[] = [];

    // Filter valid points
    for (const p of points) {
        const coords = extractCoordinates(p);
        if (coords) {
            validPoints.push(p);
        } else {
            unserved.push(p);
        }
    }

    if (validPoints.length === 0) return { distribution, unserved };

    // Calculate local reference (median) to avoid isolated points stretching the route
    const lats = validPoints.map(p => extractCoordinates(p)!.lat).sort((a, b) => a - b);
    const lons = validPoints.map(p => extractCoordinates(p)!.lon).sort((a, b) => a - b);
    const refLat = lats[Math.floor(lats.length / 2)];
    const refLon = lons[Math.floor(lons.length / 2)];

    // Angular sort
    const pointsWithAngle = validPoints.map(p => {
        const coords = extractCoordinates(p)!;
        const ang = Math.atan2(coords.lat - refLat, coords.lon - refLon);
        return { p, ang };
    });
    pointsWithAngle.sort((a, b) => a.ang - b.ang);

    const vehicleList = [...vehicles].sort((a, b) => (b.capacidade || 0) - (a.capacidade || 0));
    let pointIdx = 0;
    const totalPoints = pointsWithAngle.length;
    const depLat = parseFloat(depot.LATITUDE || depot.latitude);
    const depLon = parseFloat(depot.LONGITUDE || depot.longitude);

    let lastBreakReason = 'Frota Insuficiente';

    for (const vehicle of vehicleList) {
        if (pointIdx >= totalPoints) break;

        const placa = vehicle.placa;
        const capV = vehicle.capacidade || 999999;
        let weightV = 0;
        const route: Point[] = [];

        while (pointIdx < totalPoints) {
            const item = pointsWithAngle[pointIdx];
            const p = item.p;
            const weight = parseFloat(String(p.weight || p.Media_Por_Coleta || 0).replace(',', '.'));

            const routeCandidate = [...route, p];
            const estimatedHours = estimateRouteTime(routeCandidate, depLat, depLon, settings);

            const withinPointsLimit = route.length < targetPts;
            const withinWeightLimit = weightV + weight <= capV;
            const withinTimeLimit = estimatedHours <= maxHours;

            if (settings.forceFulfill || (withinPointsLimit && withinWeightLimit && withinTimeLimit)) {
                route.push(p);
                weightV += weight;
                pointIdx++;
            } else {
                // Capture reason for stopping
                if (!withinPointsLimit) lastBreakReason = `Máx. Pontos por Veículo (${targetPts})`;
                else if (!withinWeightLimit) lastBreakReason = `Capacidade do Veículo Excedida`;
                else if (!withinTimeLimit) lastBreakReason = `Jornada Máxima Excedida (${maxHours}h)`;
                break;
            }
        }

        if (route.length > 0) {
            // Optimize order for this route
            distribution[placa] = optimizeRouteOrder(route, depot);
        }
    }

    // Handle remaining points
    while (pointIdx < totalPoints) {
        const p = pointsWithAngle[pointIdx].p;
        p.reason = lastBreakReason; // Assign the specific reason
        unserved.push(p);
        pointIdx++;
    }

    return { distribution, unserved };
}
