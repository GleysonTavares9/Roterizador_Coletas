import { type Point, type Coord, extractCoordinates, distSq, calculateRouteCost } from './geoUtils';

/**
 * 2-opt local search improvement
 */
function twoOptImprovement(route: Point[], cosLat: number, maxIterations: number = 2000): Point[] {
    if (route.length <= 3) return route;

    let bestRoute = [...route];
    let coords = bestRoute.map(p => extractCoordinates(p) || { lat: 0, lon: 0 });
    let n = coords.length;
    let improved = true;
    let iterations = 0;

    while (improved && iterations < maxIterations) {
        improved = false;
        iterations++;

        for (let i = 0; i < n - 1; i++) {
            const pA = coords[i];
            const pB = coords[i + 1];

            for (let j = i + 1; j < n; j++) {
                if (j === i + 1) continue;

                const pC = coords[j];
                let currentCost = distSq(pA, pB, cosLat);

                let pD: Coord | null = null;
                if (j < n - 1) {
                    pD = coords[j + 1];
                    currentCost += distSq(pC, pD, cosLat);
                }

                let newCost = distSq(pA, pC, cosLat);
                if (pD) {
                    newCost += distSq(pB, pD, cosLat);
                }

                if (newCost < currentCost - 1e-12) {
                    // Reverse section from i+1 to j
                    const reversedSection = bestRoute.slice(i + 1, j + 1).reverse();
                    const reversedCoords = coords.slice(i + 1, j + 1).reverse();

                    bestRoute.splice(i + 1, j - i, ...reversedSection);
                    coords.splice(i + 1, j - i, ...reversedCoords);

                    improved = true;
                    break;
                }
            }
            if (improved) break;
        }
    }

    return bestRoute;
}

/**
 * Node relocation (Or-opt 1)
 */
function relocateImprovement(route: Point[], cosLat: number): Point[] {
    let bestRoute = [...route];
    let currentCost = calculateRouteCost(bestRoute, cosLat);
    let improved = true;

    while (improved) {
        improved = false;
        const n = bestRoute.length;
        for (let i = 0; i < n; i++) {
            const node = bestRoute[i];
            const tempRoute = [...bestRoute.slice(0, i), ...bestRoute.slice(i + 1)];

            for (let j = 0; j <= tempRoute.length; j++) {
                if (j === i || j === i + 1) continue;

                const candidate = [...tempRoute.slice(0, j), node, ...tempRoute.slice(j)];
                const cost = calculateRouteCost(candidate, cosLat);

                if (cost < currentCost - 1e-9) {
                    currentCost = cost;
                    bestRoute = candidate;
                    improved = true;
                    break;
                }
            }
            if (improved) break;
        }
    }

    return bestRoute;
}

/**
 * Optimizes the order of points for a route (TSP)
 */
export function optimizeRouteOrder(points: Point[], depot: Point): Point[] {
    if (!points || points.length === 0) return [];

    const valid: Point[] = [];
    const invalid: Point[] = [];

    for (const p of points) {
        if (extractCoordinates(p)) valid.push(p);
        else invalid.push(p);
    }

    if (valid.length === 0) return points;

    let depCoord = extractCoordinates(depot);
    if (!depCoord) depCoord = extractCoordinates(valid[0])!;

    const cosLat = Math.cos(depCoord.lat * Math.PI / 180);

    // K-Starts: Test starting with closest points to depot
    const distances = valid.map((p, idx) => ({
        dist: distSq(depCoord as Coord, extractCoordinates(p) as Coord, cosLat),
        idx
    }));
    distances.sort((a, b) => a.dist - b.dist);

    const candidatesToStart = Math.min(valid.length, 5);
    let bestGlobalRoute: Point[] = [];
    let minGlobalCost = Infinity;

    for (let k = 0; k < candidatesToStart; k++) {
        const startIdx = distances[k].idx;
        let unvisited = valid.filter((_, j) => j !== startIdx);
        let route = [valid[startIdx]];
        let currCoord = extractCoordinates(valid[startIdx])!;

        while (unvisited.length > 0) {
            let nearestIdx = -1;
            let minDist = Infinity;

            for (let i = 0; i < unvisited.length; i++) {
                const pc = extractCoordinates(unvisited[i])!;
                const d = distSq(currCoord, pc, cosLat);
                if (d < minDist) {
                    minDist = d;
                    nearestIdx = i;
                }
            }

            if (nearestIdx !== -1) {
                const nextP = unvisited.splice(nearestIdx, 1)[0];
                route.push(nextP);
                currCoord = extractCoordinates(nextP)!;
            } else break;
        }

        // Heavy Refinement
        route = twoOptImprovement(route, cosLat);
        route = relocateImprovement(route, cosLat);
        route = twoOptImprovement(route, cosLat);

        let finalCost = calculateRouteCost(route, cosLat);

        // Desempate: deve começar perto do depósito
        const firstCoord = extractCoordinates(route[0])!;
        finalCost += distSq(depCoord, firstCoord, cosLat);

        if (finalCost < minGlobalCost) {
            minGlobalCost = finalCost;
            bestGlobalRoute = route;
        }
    }

    return [...bestGlobalRoute, ...invalid];
}
