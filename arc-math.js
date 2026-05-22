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
        const midR = (sh.innerR + sh.outerR) / 2;
        let r, a;
        if (Number.isFinite(sh.seatSpacingPx) && Number.isFinite(sh.rowSpacingPx)) {
            // Modo "tamaño de celda constante": el paso entre asientos/filas se
            // mantiene en píxeles independientemente del nº de asientos del área.
            // Áreas con menos asientos sólo dejan más margen, no estiran las celdas.
            const seatMarginPx = sh.seatMarginPx || 0;
            const rowMarginPx = sh.rowMarginPx || 0;
            const seatAngle = sh.seatSpacingPx / midR;
            const marginAngle = seatMarginPx / midR;
            a = sh.startAngle + marginAngle + ((seatPos - area.seatMin) + 0.5) * seatAngle;
            r = sh.innerR + rowMarginPx + ((rowPos - area.rowMin) + 0.5) * sh.rowSpacingPx;
        } else {
            // Legacy: estirar la grilla hasta llenar todo el sweep del área.
            const rows = (area.rowMax - area.rowMin + 1) || 1;
            const seats = (area.seatMax - area.seatMin + 1) || 1;
            const rowT = (rowPos - area.rowMin + 0.5) / rows;
            const seatT = (seatPos - area.seatMin + 0.5) / seats;
            r = sh.innerR + rowT * (sh.outerR - sh.innerR);
            a = sh.startAngle + seatT * (sh.endAngle - sh.startAngle);
        }
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
        const sweep = out.endAngle - out.startAngle;
        const maxSweep = 2 * Math.PI;
        if (sweep === 0) {
            out.endAngle = out.startAngle + 1e-6;
        } else if (Math.abs(sweep) > maxSweep) {
            out.endAngle = out.startAngle + (sweep > 0 ? maxSweep : -maxSweep);
        }
        // Preservar campos opcionales (paso de asiento/fila + márgenes) que controlan
        // cómo arcSeatPos coloca los asientos sin estirar las celdas.
        ['seatSpacingPx', 'rowSpacingPx', 'seatMarginPx', 'rowMarginPx'].forEach(k => {
            if (shape[k] != null) out[k] = shape[k];
        });
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
     * Mapeo "porcentaje de curvatura" ↔ midRadius.
     *  - pct = 100 → línea recta (radio infinito)
     *  - pct = 0   → media circunferencia: el sweep cubre exactamente π rad
     *  Lineal en 1/R: k = (1 - pct/100) × π / L
     */
    function curvaturePctToMidRadius(pct, totalArcLen) {
        if (!(totalArcLen > 0)) return Infinity;
        if (pct >= 100 - 1e-6) return Infinity;
        if (pct <= 1e-6) return totalArcLen / Math.PI;
        const k = (1 - pct / 100) * Math.PI / totalArcLen;
        return 1 / k;
    }

    function midRadiusToCurvaturePct(midR, totalArcLen) {
        if (!(totalArcLen > 0)) return 100;
        if (!Number.isFinite(midR) || midR <= 0) return 100;
        const minR = totalArcLen / Math.PI;
        if (midR <= minR) return 0;
        const pct = 100 * (1 - minR / midR);
        return Math.max(0, Math.min(100, pct));
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

    function bbox(pts) {
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

    /**
     * Calcula las dimensiones "naturales" (rectangulares) de un área:
     *  - si es polígono → ancho/alto del bounding box
     *  - si es arco → arc length en midRadius × thickness radial
     */
    /**
     * Convex hull (Andrew's monotone chain). Devuelve los vértices del polígono
     * convexo mínimo que contiene a todos los puntos, en orden consistente.
     */
    function convexHull(points) {
        if (!Array.isArray(points) || points.length < 3) return (points || []).slice();
        const pts = [...points].sort((a, b) => a.x === b.x ? a.y - b.y : a.x - b.x);
        const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
        const lower = [];
        for (const p of pts) {
            while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
            lower.push(p);
        }
        const upper = [];
        for (let i = pts.length - 1; i >= 0; i--) {
            const p = pts[i];
            while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
            upper.push(p);
        }
        upper.pop();
        lower.pop();
        return lower.concat(upper);
    }

    /**
     * Simplifica un polígono cerrado: elimina vértices cuya distancia perpendicular
     * al segmento entre el vértice anterior y el siguiente sea menor que `tolerance`.
     * Útil para quitar el "staircase" que produce el convex hull sobre rejillas de
     * asientos: el resultado tiene mucho menos vértices y bordes rectos largos.
     */
    function simplifyPolygon(points, tolerance) {
        tolerance = tolerance == null ? 5 : tolerance;
        if (!Array.isArray(points) || points.length <= 3) return (points || []).slice();
        let pts = [...points];
        let changed = true;
        while (changed && pts.length > 3) {
            changed = false;
            const next = [];
            for (let i = 0; i < pts.length; i++) {
                const A = pts[(i - 1 + pts.length) % pts.length];
                const B = pts[i];
                const C = pts[(i + 1) % pts.length];
                const dx = C.x - A.x, dy = C.y - A.y;
                const len = Math.hypot(dx, dy);
                const perpDist = len < 1e-9
                    ? Math.hypot(B.x - A.x, B.y - A.y)
                    : Math.abs((B.x - A.x) * dy - (B.y - A.y) * dx) / len;
                if (perpDist >= tolerance) {
                    next.push(B);
                } else {
                    changed = true;
                }
            }
            if (next.length < 3) break;
            pts = next;
        }
        return pts;
    }

    /**
     * Devuelve el vector unitario que indica hacia dónde apunta el frente del
     * área (rowMin / fila más baja, hacia donde está el campo).
     *  - polígono: perpendicular al lado p2-p3 (mismo cálculo que el render
     *    de la flecha roja en index.html).
     *  - arco: del punto medio del arco interior hacia el centro del arco.
     */
    function computeFrontDirection(area) {
        if (area && area.shape && area.shape.type === 'arc') {
            const sh = area.shape;
            const midAngle = (sh.startAngle + sh.endAngle) / 2;
            const innerMidX = sh.center.x + sh.innerR * Math.cos(midAngle);
            const innerMidY = sh.center.y + sh.innerR * Math.sin(midAngle);
            const dx = sh.center.x - innerMidX;
            const dy = sh.center.y - innerMidY;
            const l = Math.hypot(dx, dy) || 1;
            return { x: dx / l, y: dy / l };
        }
        // Para polígonos: si hay seatGrid, su rowAxis apunta de rowMax hacia rowMin
        // (es decir, hacia el campo). Es la fuente fiable independiente del orden de
        // los vértices del polígono (que puede cambiar tras un hull/simplify).
        if (area && area.seatGrid && area.seatGrid.rowAxis) {
            return { x: area.seatGrid.rowAxis.x, y: area.seatGrid.rowAxis.y };
        }
        const pts = area && area.points;
        if (!pts || pts.length < 4) return { x: 0, y: 1 };
        const p2 = pts[2], p3 = pts[3];
        const dx = p2.x - p3.x, dy = p2.y - p3.y;
        const l = Math.hypot(dx, dy) || 1;
        return { x: -dy / l, y: dx / l };
    }

    /** Promedia los vectores unitarios de varias áreas; null si suma ~0. */
    function averageFrontDirection(areas) {
        if (!Array.isArray(areas) || areas.length === 0) return null;
        let sx = 0, sy = 0;
        areas.forEach(a => {
            const d = computeFrontDirection(a);
            sx += d.x; sy += d.y;
        });
        const l = Math.hypot(sx, sy);
        if (l < 1e-6) return null;
        return { x: sx / l, y: sy / l };
    }

    /**
     * Calcula la rejilla de asientos derivada del polígono actual.
     *  - origin: p0 (esquina superior-izquierda lógica, donde está seatMin × rowMax)
     *  - seatAxis: vector unitario p0→p1 (incremento de seatPos)
     *  - rowAxis: vector unitario p0→p3 (decremento de rowPos)
     *  - seatSpacing: paso en px por asiento (long. del lado p0p1 / nº de asientos)
     *  - rowSpacing: paso en px por fila (long. del lado p0p3 / nº de filas)
     *
     * Una vez almacenada en area.seatGrid, los asientos quedan posicionados
     * INDEPENDIENTEMENTE de los puntos del polígono: arrastrar una esquina
     * deforma el outline pero deja los asientos donde estaban.
     */
    function computeSeatGridFromPolygon(area) {
        const pts = area && area.points;
        if (!pts || pts.length < 4) return null;
        const p0 = pts[0], p1 = pts[1], p3 = pts[3];
        const seatVec = { x: p1.x - p0.x, y: p1.y - p0.y };
        const rowVec = { x: p3.x - p0.x, y: p3.y - p0.y };
        const seatLen = Math.hypot(seatVec.x, seatVec.y) || 1;
        const rowLen = Math.hypot(rowVec.x, rowVec.y) || 1;
        const nSeats = (area.seatMax - area.seatMin + 1) || 1;
        const nRows = (area.rowMax - area.rowMin + 1) || 1;
        return {
            origin: { x: p0.x, y: p0.y },
            seatAxis: { x: seatVec.x / seatLen, y: seatVec.y / seatLen },
            rowAxis: { x: rowVec.x / rowLen, y: rowVec.y / rowLen },
            seatSpacing: seatLen / nSeats,
            rowSpacing: rowLen / nRows
        };
    }

    /**
     * Devuelve la posición ABSOLUTA del rectángulo de un asiento dentro del área.
     * Coordenadas del top-left del rect (compatibles con el render que dibuja
     * rect.x=pos.x, rect.y=pos.y, ancho=GRID_STEP-3).
     */
    function seatPosFromGrid(area, rowPos, seatPos) {
        const g = area && area.seatGrid;
        if (!g) return null;
        const offSeat = (seatPos - area.seatMin) * g.seatSpacing + 2;
        const offRow = (area.rowMax - rowPos) * g.rowSpacing + 2;
        return {
            x: g.origin.x + offSeat * g.seatAxis.x + offRow * g.rowAxis.x,
            y: g.origin.y + offSeat * g.seatAxis.y + offRow * g.rowAxis.y,
            angleDeg: Math.atan2(g.seatAxis.y, g.seatAxis.x) * 180 / Math.PI
        };
    }

    /** Aplica una traslación (dx, dy) a un seatGrid. Pura. */
    function translateSeatGrid(grid, dx, dy) {
        if (!grid) return grid;
        return {
            ...grid,
            origin: { x: grid.origin.x + dx, y: grid.origin.y + dy }
        };
    }

    /** Rota un seatGrid en `deltaRad` alrededor de (cx, cy). Pura. */
    function rotateSeatGrid(grid, cx, cy, deltaRad) {
        if (!grid) return grid;
        const cos = Math.cos(deltaRad), sin = Math.sin(deltaRad);
        const ox = grid.origin.x - cx, oy = grid.origin.y - cy;
        return {
            origin: { x: cx + ox * cos - oy * sin, y: cy + ox * sin + oy * cos },
            seatAxis: {
                x: grid.seatAxis.x * cos - grid.seatAxis.y * sin,
                y: grid.seatAxis.x * sin + grid.seatAxis.y * cos
            },
            rowAxis: {
                x: grid.rowAxis.x * cos - grid.rowAxis.y * sin,
                y: grid.rowAxis.x * sin + grid.rowAxis.y * cos
            },
            seatSpacing: grid.seatSpacing,
            rowSpacing: grid.rowSpacing
        };
    }

    function computeAreaNaturalSize(area) {
        if (area && area.shape && area.shape.type === 'arc') {
            const sh = area.shape;
            const midR = (sh.innerR + sh.outerR) / 2;
            const sweep = Math.abs(sh.endAngle - sh.startAngle);
            return { width: sweep * midR, height: sh.outerR - sh.innerR };
        }
        const b = bbox(area.points || []);
        return { width: b.w, height: b.h };
    }

    function median(arr) {
        if (arr.length === 0) return 0;
        const s = [...arr].sort((a, b) => a - b);
        return s[Math.floor(s.length / 2)];
    }

    /**
     * Genera shapes de arco para N áreas preservando su ANCHO NATURAL.
     * Cada área obtiene un sweep = naturalWidth_i / midRadius. Entre adyacentes
     * se intercala un gap fijo: `gapPx` (longitud de arco en píxeles, recomendado)
     * o `gapDeg` (ángulo en grados). Si se especifican ambos, se suman.
     * Todos comparten center/innerR/outerR → acople perfecto.
     */
    function fitGroupAsArc(areas, opts) {
        const {
            center, midRadius,
            gapDeg = 0, gapPx = 0,
            orientationRad = -Math.PI / 2,
            marginRatio = 0.30,
            marginMinPx = 2,
            // Si se pasan, fuerzan el paso de celda en lugar de calcularlo desde la
            // mediana del grupo. Útil para mantener el tamaño de asiento constante
            // entre arcos distintos del mismo mapa.
            forceSeatSpacing,
            forceRowSpacing
        } = opts;
        if (!Array.isArray(areas) || areas.length === 0) throw new Error('fitGroupAsArc: areas vacío');
        if (!(midRadius > 0)) throw new Error('fitGroupAsArc: midRadius > 0');

        const stats = areas.map(a => {
            const sz = computeAreaNaturalSize(a);
            const nRows = (a.rowMax - a.rowMin + 1) || 1;
            const nSeats = (a.seatMax - a.seatMin + 1) || 1;
            return {
                seatSpacing: sz.width / nSeats,
                rowSpacing: sz.height / nRows,
                nRows, nSeats
            };
        });

        // Paso de celda UNIFORME. Si se pasa un valor forzado (p. ej. el global del mapa),
        // se usa ese; si no, la mediana del grupo.
        const seatSpacing = (forceSeatSpacing > 0) ? forceSeatSpacing : median(stats.map(s => s.seatSpacing));
        const rowSpacing = (forceRowSpacing > 0) ? forceRowSpacing : median(stats.map(s => s.rowSpacing));
        const maxRows = Math.max(...stats.map(s => s.nRows));
        const marginPx = Math.max(marginMinPx, seatSpacing * marginRatio);

        const thickness = maxRows * rowSpacing + 2 * marginPx;
        const innerR = Math.max(1, midRadius - thickness / 2);
        const outerR = innerR + thickness;

        // Ancho por área = nº asientos × paso uniforme + 2 × margen.
        const widths = stats.map(s => s.nSeats * seatSpacing + 2 * marginPx);
        const totalWidth = widths.reduce((acc, w) => acc + w, 0);

        const gap = degToRad(gapDeg) + (gapPx / midRadius);
        const totalSweep = totalWidth / midRadius + (areas.length - 1) * gap;
        const startAngle = orientationRad - totalSweep / 2;

        let cursor = startAngle;
        return areas.map((a, i) => {
            const sweep = widths[i] / midRadius;
            const slot = {
                center: { x: center.x, y: center.y },
                innerR, outerR,
                startAngle: cursor,
                endAngle: cursor + sweep
            };
            cursor += sweep + gap;
            const shape = {
                type: 'arc',
                center: { x: center.x, y: center.y },
                innerR, outerR,
                startAngle: slot.startAngle,
                endAngle: slot.endAngle,
                seatSpacingPx: seatSpacing,
                rowSpacingPx: rowSpacing,
                seatMarginPx: marginPx,
                rowMarginPx: marginPx
            };
            return { id: a.id, slot, shape };
        });
    }

    /**
     * Coloca N áreas en línea recta, preservando ancho natural por área.
     * Devuelve polígonos rectangulares con un gap pixelado entre vecinos.
     * Usado cuando la curvatura es 100% (recta perfecta).
     */
    function layAreasFlat(areas, opts) {
        const { center, directionRad = 0, gapPx = 4, forceSeatSpacing, forceRowSpacing } = opts;
        if (!Array.isArray(areas) || areas.length === 0) throw new Error('layAreasFlat: areas vacío');
        const stats = areas.map(a => {
            const sz = computeAreaNaturalSize(a);
            const nRows = (a.rowMax - a.rowMin + 1) || 1;
            const nSeats = (a.seatMax - a.seatMin + 1) || 1;
            return {
                naturalWidth: sz.width,
                seatSpacing: sz.width / nSeats,
                rowSpacing: sz.height / nRows,
                nRows, nSeats
            };
        });
        // Si se pasan globales forzados, sobrescriben los naturales para que el ancho de
        // cada área se calcule como nSeats × paso global (consistencia entre arcos).
        const rowSpacing = (forceRowSpacing > 0) ? forceRowSpacing : median(stats.map(s => s.rowSpacing));
        const seatSpacing = (forceSeatSpacing > 0) ? forceSeatSpacing : null;
        const maxRows = Math.max(...stats.map(s => s.nRows));
        const H = maxRows * rowSpacing;
        const widths = stats.map(s => seatSpacing ? s.nSeats * seatSpacing : s.naturalWidth);
        const totalW = widths.reduce((acc, w) => acc + w, 0) + (areas.length - 1) * gapPx;
        const dirX = Math.cos(directionRad), dirY = Math.sin(directionRad);
        const perpX = -dirY, perpY = dirX; // perpendicular "hacia atrás" (rowMax)
        const halfH = H / 2;
        let cursor = -totalW / 2;
        return areas.map((a, i) => {
            const w = widths[i];
            const su = cursor, eu = cursor + w;
            // Convención polygon: p0 top-left, p1 top-right, p2 bottom-right, p3 bottom-left.
            // "top" = rowMax (lejos del campo), "bottom" = rowMin (cerca del campo).
            const p0 = { x: center.x + dirX * su - perpX * halfH, y: center.y + dirY * su - perpY * halfH };
            const p1 = { x: center.x + dirX * eu - perpX * halfH, y: center.y + dirY * eu - perpY * halfH };
            const p2 = { x: center.x + dirX * eu + perpX * halfH, y: center.y + dirY * eu + perpY * halfH };
            const p3 = { x: center.x + dirX * su + perpX * halfH, y: center.y + dirY * su + perpY * halfH };
            cursor += w + gapPx;
            return { id: a.id, points: [p0, p1, p2, p3] };
        });
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
            return { kind: 'polygon', points: parsed.points, seatGrid: parsed.seatGrid || null };
        }
        if (parsed && parsed.type === 'arc' && isArcShape(parsed)) {
            return { kind: 'arc', shape: parsed };
        }
        return { kind: 'none' };
    }

    /**
     * Serializa el shape para `AREA SHAPE` en CSV.
     * Polígonos sin seatGrid se exportan como array (compat con v1).
     * Polígonos con seatGrid → objeto {type:'polygon', points, seatGrid}.
     * Arcos como objeto tipado.
     */
    function serializeAreaShape(area) {
        if (isArcArea(area)) return JSON.stringify(area.shape);
        if (area && area.seatGrid && area.points) {
            return JSON.stringify({ type: 'polygon', points: area.points, seatGrid: area.seatGrid });
        }
        return JSON.stringify(area && area.points ? area.points : []);
    }

    const api = {
        isArcShape, isArcArea,
        arcOutlinePoints, arcPathD, arcCentroid, arcSeatPos,
        degToRad, radToDeg, normalizeAngle,
        arcsAreCompatible, findSnapAngle, findSnapRadius,
        buildRingSegments, fitAreasToArc, autoFitArcParams,
        curvaturePctToMidRadius, midRadiusToCurvaturePct,
        computeAreaNaturalSize, fitGroupAsArc, layAreasFlat,
        computeFrontDirection, averageFrontDirection,
        computeSeatGridFromPolygon, seatPosFromGrid,
        translateSeatGrid, rotateSeatGrid,
        convexHull, simplifyPolygon,
        defaultArcShape, clampArcShape,
        angleFromPoint, radiusFromPoint,
        parseAreaShape, serializeAreaShape
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.ArcMath = api;
})(typeof window !== 'undefined' ? window : globalThis);
