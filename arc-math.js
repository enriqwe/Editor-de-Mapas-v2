/**
 * Puro: matemática de áreas tipo arco.
 * Sin dependencias de DOM ni de AppState. Carga válida en navegador (anexa al
 * objeto global) y en Node (también anexa al global, importable por tests).
 *
 * Convención angular:
 *  - Radianes
 *  - 0 = eje +X (este)
 *  - Positivo = sentido horario en SVG (Y invertida)
 *  - Fila rowMin = arco interior (innerR), rowMax = arco exterior (outerR)
 */
(function (root) {
    'use strict';

    function isArcShape(shape) {
        return !!(shape && shape.type === 'arc'
            && shape.center && typeof shape.center.x === 'number' && typeof shape.center.y === 'number'
            && typeof shape.innerR === 'number' && typeof shape.outerR === 'number'
            && typeof shape.startAngle === 'number' && typeof shape.endAngle === 'number');
    }

    function isArcArea(area) {
        return !!(area && area.shape && isArcShape(area.shape));
    }

    function arcOutlinePoints(shape, segments) {
        segments = segments || 24;
        if (!isArcShape(shape)) throw new Error('arcOutlinePoints: shape inválido');
        const pts = [];
        const { center, innerR, outerR, startAngle, endAngle } = shape;
        for (let i = 0; i <= segments; i++) {
            const t = i / segments;
            const a = startAngle + t * (endAngle - startAngle);
            pts.push({ x: center.x + outerR * Math.cos(a), y: center.y + outerR * Math.sin(a) });
        }
        for (let i = segments; i >= 0; i--) {
            const t = i / segments;
            const a = startAngle + t * (endAngle - startAngle);
            pts.push({ x: center.x + innerR * Math.cos(a), y: center.y + innerR * Math.sin(a) });
        }
        return pts;
    }

    function arcPathD(shape) {
        if (!isArcShape(shape)) throw new Error('arcPathD: shape inválido');
        const { center, innerR, outerR, startAngle, endAngle } = shape;
        const sweep = endAngle - startAngle;
        const large = Math.abs(sweep) > Math.PI ? 1 : 0;
        const sf = sweep > 0 ? 1 : 0;
        const isf = sweep > 0 ? 0 : 1;
        const p1 = { x: center.x + innerR * Math.cos(startAngle), y: center.y + innerR * Math.sin(startAngle) };
        const p2 = { x: center.x + outerR * Math.cos(startAngle), y: center.y + outerR * Math.sin(startAngle) };
        const p3 = { x: center.x + outerR * Math.cos(endAngle), y: center.y + outerR * Math.sin(endAngle) };
        const p4 = { x: center.x + innerR * Math.cos(endAngle), y: center.y + innerR * Math.sin(endAngle) };
        return `M ${p1.x} ${p1.y} L ${p2.x} ${p2.y} A ${outerR} ${outerR} 0 ${large} ${sf} ${p3.x} ${p3.y} L ${p4.x} ${p4.y} A ${innerR} ${innerR} 0 ${large} ${isf} ${p1.x} ${p1.y} Z`;
    }

    function arcCentroid(shape) {
        if (!isArcShape(shape)) throw new Error('arcCentroid: shape inválido');
        const a = (shape.startAngle + shape.endAngle) / 2;
        const r = (shape.innerR + shape.outerR) / 2;
        return { x: shape.center.x + r * Math.cos(a), y: shape.center.y + r * Math.sin(a) };
    }

    function arcSeatPos(area, rowPos, seatPos) {
        if (!isArcArea(area)) throw new Error('arcSeatPos: área no es arco');
        const sh = area.shape;
        const rows = (area.rowMax - area.rowMin + 1) || 1;
        const seats = (area.seatMax - area.seatMin + 1) || 1;
        const rowT = (rowPos - area.rowMin + 0.5) / rows;
        const seatT = (seatPos - area.seatMin + 0.5) / seats;
        const r = sh.innerR + rowT * (sh.outerR - sh.innerR);
        const a = sh.startAngle + seatT * (sh.endAngle - sh.startAngle);
        return {
            x: sh.center.x + r * Math.cos(a),
            y: sh.center.y + r * Math.sin(a),
            angleDeg: ((a + Math.PI / 2) * 180 / Math.PI)
        };
    }

    function degToRad(deg) { return deg * Math.PI / 180; }
    function radToDeg(rad) { return rad * 180 / Math.PI; }
    function normalizeAngle(a) {
        const twoPi = 2 * Math.PI;
        let n = a % twoPi;
        if (n <= -Math.PI) n += twoPi;
        else if (n > Math.PI) n -= twoPi;
        return n;
    }

    /**
     * Detecta si dos arcos comparten centro y radios (tolerancia configurable),
     * lo que les permite acoplarse de forma perfecta.
     */
    function arcsAreCompatible(a, b, tol) {
        tol = tol == null ? 0.5 : tol;
        if (!isArcShape(a) || !isArcShape(b)) return false;
        return Math.abs(a.center.x - b.center.x) <= tol
            && Math.abs(a.center.y - b.center.y) <= tol
            && Math.abs(a.innerR - b.innerR) <= tol
            && Math.abs(a.outerR - b.outerR) <= tol;
    }

    /**
     * Dado un arco que está siendo arrastrado por uno de sus extremos angulares
     * (`'start'` o `'end'`) y una lista de arcos vecinos compatibles, devuelve
     * el ángulo al que el extremo debería snapear, o null si no hay ninguno
     * dentro de la tolerancia angular.
     */
    function findSnapAngle(draggedShape, edge, neighbors, snapTolRad) {
        snapTolRad = snapTolRad == null ? degToRad(2) : snapTolRad;
        if (!isArcShape(draggedShape)) return null;
        const draggedAngle = edge === 'start' ? draggedShape.startAngle : draggedShape.endAngle;
        let best = null;
        for (const n of neighbors) {
            if (!isArcShape(n)) continue;
            if (!arcsAreCompatible(draggedShape, n, 0.5)) continue;
            for (const cand of [n.startAngle, n.endAngle]) {
                const diff = Math.abs(normalizeAngle(draggedAngle - cand));
                if (diff <= snapTolRad && (best === null || diff < best.diff)) {
                    best = { angle: cand, diff };
                }
            }
        }
        return best ? best.angle : null;
    }

    /**
     * Snap de radio: si `value` está dentro de `tol` de algún radio (inner/outer)
     * de los arcos vecinos *con el mismo centro*, devuelve ese radio; si no, null.
     */
    function findSnapRadius(draggedShape, value, neighbors, tol) {
        tol = tol == null ? 6 : tol;
        if (!isArcShape(draggedShape)) return null;
        let best = null;
        for (const n of neighbors) {
            if (!isArcShape(n)) continue;
            if (Math.abs(draggedShape.center.x - n.center.x) > 0.5) continue;
            if (Math.abs(draggedShape.center.y - n.center.y) > 0.5) continue;
            for (const cand of [n.innerR, n.outerR]) {
                const diff = Math.abs(value - cand);
                if (diff <= tol && (best === null || diff < best.diff)) {
                    best = { value: cand, diff };
                }
            }
        }
        return best ? best.value : null;
    }

    /**
     * Genera un anillo completo o parcial dividido en N segmentos de igual tamaño.
     * Devuelve los `shape` de arco listos para crear áreas. Cada uno empieza donde
     * acaba el anterior + un gap angular configurable (que en el modelo es solo
     * separación visual; no se persiste como entidad).
     */
    function buildRingSegments(opts) {
        const {
            center, innerR, outerR,
            startAngleDeg = 0, endAngleDeg = 360,
            segments = 8,
            gapDeg = 0
        } = opts;
        if (segments < 1) throw new Error('buildRingSegments: segments >= 1');
        const startAngle = degToRad(startAngleDeg);
        const endAngle = degToRad(endAngleDeg);
        const total = endAngle - startAngle;
        const gap = degToRad(gapDeg);
        const totalGap = gap * (segments - (Math.abs(total - 2 * Math.PI) < 1e-6 ? 0 : 1));
        const segSweep = (total - totalGap) / segments;
        const shapes = [];
        let cursor = startAngle;
        for (let i = 0; i < segments; i++) {
            shapes.push({
                type: 'arc',
                center: { x: center.x, y: center.y },
                innerR, outerR,
                startAngle: cursor,
                endAngle: cursor + segSweep
            });
            cursor += segSweep + gap;
        }
        return shapes;
    }

    /**
     * Devuelve un shape de arco con defaults razonables centrado en (cx, cy).
     * Sweep por defecto: 45° hacia abajo (mirando al campo desde una tribuna baja).
     */
    function defaultArcShape(cx, cy) {
        return {
            type: 'arc',
            center: { x: cx, y: cy - 200 },
            innerR: 150,
            outerR: 220,
            startAngle: degToRad(60),
            endAngle: degToRad(120)
        };
    }

    /**
     * Clampea un shape de arco para que sea válido geométricamente.
     * - innerR >= 1
     * - outerR > innerR + 1
     * - sweep != 0 (mínimo 1°)
     * - sweep no excede 360°
     */
    function clampArcShape(shape) {
        if (!shape || shape.type !== 'arc') return shape;
        const minSep = 1;
        const out = {
            type: 'arc',
            center: { x: shape.center.x, y: shape.center.y },
            innerR: Math.max(1, shape.innerR),
            outerR: shape.outerR,
            startAngle: shape.startAngle,
            endAngle: shape.endAngle
        };
        if (out.outerR < out.innerR + minSep) out.outerR = out.innerR + minSep;
        let sweep = out.endAngle - out.startAngle;
        const maxSweep = 2 * Math.PI;
        const minSweep = degToRad(1);
        if (Math.abs(sweep) < minSweep) {
            sweep = sweep >= 0 ? minSweep : -minSweep;
            out.endAngle = out.startAngle + sweep;
        } else if (Math.abs(sweep) > maxSweep) {
            sweep = sweep > 0 ? maxSweep : -maxSweep;
            out.endAngle = out.startAngle + sweep;
        }
        return out;
    }

    /** atan2 desde un centro dado a un punto. Devuelve radianes en convención SVG. */
    function angleFromPoint(center, point) {
        return Math.atan2(point.y - center.y, point.x - center.x);
    }

    /** Distancia euclidiana de un punto al centro. */
    function radiusFromPoint(center, point) {
        const dx = point.x - center.x, dy = point.y - center.y;
        return Math.sqrt(dx * dx + dy * dy);
    }

    /**
     * Dado un conjunto de áreas rectangulares y un centro objetivo, calcula los
     * parámetros del arco que las acoplará SIN deformar los asientos:
     *  - innerR/outerR: derivados del nº máximo de filas × paso radial original,
     *    de modo que cada celda mantenga aproximadamente su altura.
     *  - startAngle/endAngle: derivados de Σ(nSeats × pasoAngular) para que
     *    cada celda mantenga aproximadamente su ancho a lo largo del midRadius.
     *
     * Entrada:
     *   - areas: [{ points, seatMin, seatMax, rowMin, rowMax, shape? }]
     *   - opts:  { center: {x,y}, midRadius?: number, orientationDeg?: number }
     *     Si midRadius no se da, se infiere a partir de la distancia del centroide
     *     de la selección al centro.
     *     Si orientationDeg no se da, se infiere apuntando el centro del arco
     *     hacia el centroide de la selección.
     *
     * Devuelve { center, innerR, outerR, startAngleDeg, endAngleDeg, midRadius,
     *            cellRowSpacing, cellSeatSpacing }
     */
    function autoFitArcParams(areas, opts) {
        if (!Array.isArray(areas) || areas.length === 0) throw new Error('autoFitArcParams: areas vacío');
        const { center } = opts || {};
        if (!center) throw new Error('autoFitArcParams: center requerido');

        // Bounding boxes y centroides por área.
        function bb(pts) {
            let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
            for (const p of pts) {
                if (p.x < minX) minX = p.x;
                if (p.x > maxX) maxX = p.x;
                if (p.y < minY) minY = p.y;
                if (p.y > maxY) maxY = p.y;
            }
            return { minX, maxX, minY, maxY, w: maxX - minX, h: maxY - minY,
                cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
        }

        const stats = areas.map(a => {
            const box = bb(a.points || []);
            const nRows = (a.rowMax - a.rowMin + 1) || 1;
            const nSeats = (a.seatMax - a.seatMin + 1) || 1;
            return {
                box,
                nRows, nSeats,
                rowSpacing: box.h / nRows,
                seatSpacing: box.w / nSeats
            };
        });

        // Estadísticos medianos: robustos ante áreas raras de la selección.
        const median = (arr) => {
            const s = [...arr].sort((a, b) => a - b);
            return s[Math.floor(s.length / 2)];
        };
        const rowSpacing = median(stats.map(s => s.rowSpacing));
        const seatSpacing = median(stats.map(s => s.seatSpacing));
        const maxRows = Math.max(...stats.map(s => s.nRows));

        // Centroide de la selección.
        let selCx = 0, selCy = 0;
        stats.forEach(s => { selCx += s.box.cx; selCy += s.box.cy; });
        selCx /= stats.length; selCy /= stats.length;

        const dx = selCx - center.x;
        const dy = selCy - center.y;
        let midRadius = opts.midRadius;
        if (!Number.isFinite(midRadius)) midRadius = Math.sqrt(dx * dx + dy * dy);
        if (midRadius < 1) midRadius = 1;

        const thickness = maxRows * rowSpacing;
        const innerR = Math.max(1, midRadius - thickness / 2);
        const outerR = innerR + thickness;

        // Orientación: ángulo del centro del arco hacia el centroide.
        let orientation;
        if (Number.isFinite(opts.orientationDeg)) {
            orientation = degToRad(opts.orientationDeg);
        } else {
            orientation = Math.atan2(dy, dx);
        }

        // Sweep total = Σ(nSeats × seatSpacing) / midRadius.
        const totalArcLen = stats.reduce((acc, s) => acc + s.nSeats * seatSpacing, 0);
        const totalSweep = totalArcLen / midRadius;

        const startAngle = orientation - totalSweep / 2;
        const endAngle = orientation + totalSweep / 2;

        return {
            center: { x: center.x, y: center.y },
            innerR, outerR,
            startAngleDeg: radToDeg(startAngle),
            endAngleDeg: radToDeg(endAngle),
            midRadius,
            cellRowSpacing: rowSpacing,
            cellSeatSpacing: seatSpacing
        };
    }

    /**
     * Acopla N áreas en un arco compartiendo `center`, `innerR`, `outerR`.
     * Cada área recibe una rebanada angular contigua a la anterior (sin huecos)
     * proporcional a su número de asientos (o equal si distribution='equal').
     *
     * Entrada:
     *  - areas: [{ id, seatMin, seatMax, ... }] – se respetan en orden
     *  - opts: { center, innerR, outerR, startAngleDeg, endAngleDeg, distribution }
     *      distribution: 'seats' (defecto) | 'equal'
     *
     * Salida: array de mismo length que `areas`, cada elemento:
     *   { id, shape: {type:'arc', center, innerR, outerR, startAngle, endAngle} }
     */
    function fitAreasToArc(areas, opts) {
        if (!Array.isArray(areas) || areas.length === 0) return [];
        const {
            center,
            innerR,
            outerR,
            startAngleDeg = 0,
            endAngleDeg = 60,
            distribution = 'seats'
        } = opts || {};
        if (!(innerR > 0)) throw new Error('fitAreasToArc: innerR > 0');
        if (!(outerR > innerR)) throw new Error('fitAreasToArc: outerR > innerR');

        const startAngle = degToRad(startAngleDeg);
        const endAngle = degToRad(endAngleDeg);
        const total = endAngle - startAngle;

        const weights = areas.map(a => {
            if (distribution === 'equal') return 1;
            const seats = (a.seatMax - a.seatMin + 1);
            return Math.max(1, seats);
        });
        const totalW = weights.reduce((s, w) => s + w, 0);

        const result = [];
        let cursor = startAngle;
        for (let i = 0; i < areas.length; i++) {
            const sweep = total * (weights[i] / totalW);
            result.push({
                id: areas[i].id,
                shape: {
                    type: 'arc',
                    center: { x: center.x, y: center.y },
                    innerR, outerR,
                    startAngle: cursor,
                    endAngle: cursor + sweep
                }
            });
            cursor += sweep;
        }
        return result;
    }

    /**
     * Migración de AREA SHAPE en CSV. Acepta:
     *   - array de puntos (legacy): [{x,y},...]
     *   - objeto {type:'polygon', points:[...]}
     *   - objeto {type:'arc', center, innerR, outerR, startAngle, endAngle}
     * Devuelve { kind: 'polygon'|'arc'|'none', points?, shape? }
     */
    function parseAreaShape(raw) {
        if (raw == null || raw === '') return { kind: 'none' };
        let parsed;
        try { parsed = JSON.parse(raw); } catch (e) { return { kind: 'none' }; }
        if (Array.isArray(parsed)) return { kind: 'polygon', points: parsed };
        if (parsed && parsed.type === 'polygon' && Array.isArray(parsed.points)) {
            return { kind: 'polygon', points: parsed.points };
        }
        if (parsed && parsed.type === 'arc' && isArcShape(parsed)) {
            return { kind: 'arc', shape: parsed };
        }
        return { kind: 'none' };
    }

    /**
     * Serializa el shape para `AREA SHAPE` en CSV.
     * Polígonos se exportan como array (compat con v1); arcos como objeto tipado.
     */
    function serializeAreaShape(area) {
        if (isArcArea(area)) return JSON.stringify(area.shape);
        return JSON.stringify(area.points || []);
    }

    const api = {
        isArcShape, isArcArea,
        arcOutlinePoints, arcPathD, arcCentroid, arcSeatPos,
        degToRad, radToDeg, normalizeAngle,
        arcsAreCompatible, findSnapAngle, findSnapRadius,
        buildRingSegments, fitAreasToArc, autoFitArcParams,
        defaultArcShape, clampArcShape,
        angleFromPoint, radiusFromPoint,
        parseAreaShape, serializeAreaShape
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.ArcMath = api;
})(typeof window !== 'undefined' ? window : globalThis);
