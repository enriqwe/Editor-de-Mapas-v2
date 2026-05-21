'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const ArcMath = require('../arc-math.js');

const TAU = 2 * Math.PI;
const approx = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const approxPt = (p, q, eps = 1e-6) => approx(p.x, q.x, eps) && approx(p.y, q.y, eps);

const baseShape = {
    type: 'arc',
    center: { x: 100, y: 200 },
    innerR: 50, outerR: 80,
    startAngle: 0, endAngle: Math.PI / 2
};

// -------- isArcShape / isArcArea --------
test('isArcShape acepta shape válido y rechaza inválidos', () => {
    assert.equal(ArcMath.isArcShape(baseShape), true);
    assert.equal(ArcMath.isArcShape(null), false);
    assert.equal(ArcMath.isArcShape({ type: 'polygon' }), false);
    assert.equal(ArcMath.isArcShape({ type: 'arc', center: { x: 0 } }), false);
});

test('isArcArea solo cierto si area.shape es arc', () => {
    assert.equal(ArcMath.isArcArea({ shape: baseShape }), true);
    assert.equal(ArcMath.isArcArea({}), false);
    assert.equal(ArcMath.isArcArea({ shape: { type: 'polygon' } }), false);
});

// -------- arcCentroid --------
test('arcCentroid devuelve el punto medio en radio medio y ángulo medio', () => {
    const c = ArcMath.arcCentroid(baseShape);
    const expectedR = (50 + 80) / 2;
    const expectedA = Math.PI / 4;
    assert.ok(approx(c.x, 100 + expectedR * Math.cos(expectedA)));
    assert.ok(approx(c.y, 200 + expectedR * Math.sin(expectedA)));
});

// -------- arcOutlinePoints --------
test('arcOutlinePoints devuelve 2*(segments+1) puntos', () => {
    const pts = ArcMath.arcOutlinePoints(baseShape, 8);
    assert.equal(pts.length, 18);
});

test('arcOutlinePoints: primer punto está en (outerR, startAngle); último en (outerR, startAngle) de vuelta? No: último es (innerR, startAngle)', () => {
    const pts = ArcMath.arcOutlinePoints(baseShape, 4);
    const expectedFirst = {
        x: baseShape.center.x + baseShape.outerR * Math.cos(baseShape.startAngle),
        y: baseShape.center.y + baseShape.outerR * Math.sin(baseShape.startAngle)
    };
    const expectedLast = {
        x: baseShape.center.x + baseShape.innerR * Math.cos(baseShape.startAngle),
        y: baseShape.center.y + baseShape.innerR * Math.sin(baseShape.startAngle)
    };
    assert.ok(approxPt(pts[0], expectedFirst));
    assert.ok(approxPt(pts[pts.length - 1], expectedLast));
});

// -------- arcPathD --------
test('arcPathD genera path SVG sintácticamente válido', () => {
    const d = ArcMath.arcPathD(baseShape);
    assert.ok(d.startsWith('M '));
    assert.ok(d.endsWith(' Z'));
    assert.match(d, /A \d+(\.\d+)? \d+(\.\d+)?/);
});

test('arcPathD pone large-arc-flag=1 cuando sweep > PI', () => {
    const wide = { ...baseShape, startAngle: 0, endAngle: Math.PI * 1.5 };
    const d = ArcMath.arcPathD(wide);
    const flags = d.match(/A [\d.]+ [\d.]+ 0 (\d) (\d)/g);
    assert.ok(flags && flags.length >= 2);
    assert.ok(flags[0].includes('0 1 1'));
});

// -------- arcSeatPos --------
test('arcSeatPos: asiento (row1,seat1) en arco 0→90° con 1 fila y 1 asiento cae en el centroide', () => {
    const area = {
        shape: baseShape,
        rowMin: 1, rowMax: 1, seatMin: 1, seatMax: 1
    };
    const pos = ArcMath.arcSeatPos(area, 1, 1);
    const expected = ArcMath.arcCentroid(baseShape);
    assert.ok(approxPt(pos, expected));
});

test('arcSeatPos: paso angular y radial uniformes', () => {
    const area = {
        shape: baseShape,
        rowMin: 1, rowMax: 3, seatMin: 1, seatMax: 4
    };
    const p11 = ArcMath.arcSeatPos(area, 1, 1);
    const p12 = ArcMath.arcSeatPos(area, 1, 2);
    const p13 = ArcMath.arcSeatPos(area, 1, 3);
    const d12 = Math.hypot(p11.x - p12.x, p11.y - p12.y);
    const d23 = Math.hypot(p12.x - p13.x, p12.y - p13.y);
    assert.ok(approx(d12, d23, 1e-6), `paso angular no uniforme: ${d12} vs ${d23}`);

    const p21 = ArcMath.arcSeatPos(area, 2, 1);
    const p31 = ArcMath.arcSeatPos(area, 3, 1);
    const r1 = Math.hypot(p11.x - baseShape.center.x, p11.y - baseShape.center.y);
    const r2 = Math.hypot(p21.x - baseShape.center.x, p21.y - baseShape.center.y);
    const r3 = Math.hypot(p31.x - baseShape.center.x, p31.y - baseShape.center.y);
    assert.ok(approx(r2 - r1, r3 - r2, 1e-6), `paso radial no uniforme: ${r2 - r1} vs ${r3 - r2}`);
});

test('arcSeatPos: fila rowMin es la más cercana al centro', () => {
    const area = {
        shape: baseShape,
        rowMin: 1, rowMax: 5, seatMin: 1, seatMax: 1
    };
    const inner = ArcMath.arcSeatPos(area, 1, 1);
    const outer = ArcMath.arcSeatPos(area, 5, 1);
    const dInner = Math.hypot(inner.x - baseShape.center.x, inner.y - baseShape.center.y);
    const dOuter = Math.hypot(outer.x - baseShape.center.x, outer.y - baseShape.center.y);
    assert.ok(dInner < dOuter, 'rowMin debería estar más cerca del centro que rowMax');
});

// -------- normalizeAngle --------
test('normalizeAngle reduce a (-PI, PI]', () => {
    assert.ok(approx(ArcMath.normalizeAngle(0), 0));
    assert.ok(approx(ArcMath.normalizeAngle(Math.PI), Math.PI));
    assert.ok(approx(ArcMath.normalizeAngle(-Math.PI + 1e-9), -Math.PI + 1e-9, 1e-8));
    assert.ok(approx(ArcMath.normalizeAngle(3 * Math.PI), Math.PI));
    assert.ok(approx(ArcMath.normalizeAngle(-3 * Math.PI), Math.PI));
});

// -------- arcsAreCompatible --------
test('arcsAreCompatible: mismo centro y radios → true', () => {
    const a = { ...baseShape };
    const b = { ...baseShape, startAngle: Math.PI, endAngle: Math.PI * 1.5 };
    assert.equal(ArcMath.arcsAreCompatible(a, b), true);
});

test('arcsAreCompatible: diferente radio → false', () => {
    const a = { ...baseShape };
    const b = { ...baseShape, innerR: 60 };
    assert.equal(ArcMath.arcsAreCompatible(a, b), false);
});

test('arcsAreCompatible: respeta tolerancia', () => {
    const a = { ...baseShape };
    const b = { ...baseShape, center: { x: 100.3, y: 200 } };
    assert.equal(ArcMath.arcsAreCompatible(a, b, 0.5), true);
    assert.equal(ArcMath.arcsAreCompatible(a, b, 0.1), false);
});

// -------- findSnapAngle --------
test('findSnapAngle: snapea al endAngle del vecino dentro de la tolerancia', () => {
    const draggedShape = { ...baseShape, startAngle: Math.PI / 2 + ArcMath.degToRad(1) };
    const neighbor = { ...baseShape, startAngle: 0, endAngle: Math.PI / 2 };
    const snapped = ArcMath.findSnapAngle(draggedShape, 'start', [neighbor], ArcMath.degToRad(2));
    assert.ok(snapped !== null);
    assert.ok(approx(snapped, Math.PI / 2, 1e-9));
});

test('findSnapAngle: fuera de tolerancia → null', () => {
    const draggedShape = { ...baseShape, startAngle: Math.PI / 2 + ArcMath.degToRad(5) };
    const neighbor = { ...baseShape, startAngle: 0, endAngle: Math.PI / 2 };
    const snapped = ArcMath.findSnapAngle(draggedShape, 'start', [neighbor], ArcMath.degToRad(2));
    assert.equal(snapped, null);
});

test('findSnapAngle: ignora vecinos no compatibles (otro centro)', () => {
    const draggedShape = { ...baseShape, startAngle: Math.PI / 2 + ArcMath.degToRad(1) };
    const neighbor = { ...baseShape, center: { x: 0, y: 0 }, startAngle: 0, endAngle: Math.PI / 2 };
    const snapped = ArcMath.findSnapAngle(draggedShape, 'start', [neighbor], ArcMath.degToRad(2));
    assert.equal(snapped, null);
});

// -------- findSnapRadius --------
test('findSnapRadius: snapea al innerR del vecino dentro de tol', () => {
    const dragged = { ...baseShape };
    const neighbor = { ...baseShape, innerR: 100, outerR: 130 };
    const snapped = ArcMath.findSnapRadius(dragged, 103, [neighbor], 6);
    assert.equal(snapped, 100);
});

test('findSnapRadius: snapea al outerR si es más cercano', () => {
    const dragged = { ...baseShape };
    const neighbor = { ...baseShape, innerR: 100, outerR: 130 };
    const snapped = ArcMath.findSnapRadius(dragged, 128, [neighbor], 6);
    assert.equal(snapped, 130);
});

test('findSnapRadius: fuera de tolerancia → null', () => {
    const dragged = { ...baseShape };
    const neighbor = { ...baseShape, innerR: 100, outerR: 130 };
    const snapped = ArcMath.findSnapRadius(dragged, 80, [neighbor], 6);
    assert.equal(snapped, null);
});

test('findSnapRadius: ignora vecinos con otro centro', () => {
    const dragged = { ...baseShape };
    const neighbor = { ...baseShape, center: { x: 999, y: 999 }, innerR: 100 };
    const snapped = ArcMath.findSnapRadius(dragged, 102, [neighbor], 6);
    assert.equal(snapped, null);
});

// -------- buildRingSegments --------
test('buildRingSegments: 4 segmentos en anillo completo, sin gaps, son contiguos', () => {
    const shapes = ArcMath.buildRingSegments({
        center: { x: 0, y: 0 }, innerR: 100, outerR: 150,
        startAngleDeg: 0, endAngleDeg: 360, segments: 4, gapDeg: 0
    });
    assert.equal(shapes.length, 4);
    for (let i = 0; i < 4; i++) {
        const sweep = shapes[i].endAngle - shapes[i].startAngle;
        assert.ok(approx(sweep, Math.PI / 2, 1e-9), `segmento ${i} tiene sweep distinto`);
        if (i > 0) {
            assert.ok(approx(shapes[i].startAngle, shapes[i - 1].endAngle, 1e-9));
        }
    }
});

test('buildRingSegments: con gapDeg crea separación equivalente entre segmentos', () => {
    const shapes = ArcMath.buildRingSegments({
        center: { x: 0, y: 0 }, innerR: 100, outerR: 150,
        startAngleDeg: 0, endAngleDeg: 360, segments: 4, gapDeg: 2
    });
    for (let i = 1; i < 4; i++) {
        const gap = shapes[i].startAngle - shapes[i - 1].endAngle;
        assert.ok(approx(gap, ArcMath.degToRad(2), 1e-9));
    }
});

test('buildRingSegments: tribuna parcial (90° en 3 segs) cubre exactamente 90°', () => {
    const shapes = ArcMath.buildRingSegments({
        center: { x: 0, y: 0 }, innerR: 100, outerR: 150,
        startAngleDeg: -45, endAngleDeg: 45, segments: 3, gapDeg: 0
    });
    assert.equal(shapes.length, 3);
    assert.ok(approx(shapes[0].startAngle, ArcMath.degToRad(-45)));
    assert.ok(approx(shapes[shapes.length - 1].endAngle, ArcMath.degToRad(45), 1e-9));
});

// -------- seatGrid de polígonos --------
test('computeSeatGridFromPolygon: rectángulo 100×50 con 10×5 → spacing 10', () => {
    const area = {
        points: [{x:0,y:0},{x:100,y:0},{x:100,y:50},{x:0,y:50}],
        seatMin: 1, seatMax: 10, rowMin: 1, rowMax: 5
    };
    const g = ArcMath.computeSeatGridFromPolygon(area);
    assert.ok(approxPt(g.origin, {x:0, y:0}));
    assert.ok(approx(g.seatSpacing, 10));
    assert.ok(approx(g.rowSpacing, 10));
    assert.ok(approx(g.seatAxis.x, 1) && approx(g.seatAxis.y, 0));
    assert.ok(approx(g.rowAxis.x, 0) && approx(g.rowAxis.y, 1));
});

test('seatPosFromGrid: posición consistente con la bilineal en rectángulo axis-aligned', () => {
    const area = {
        points: [{x:0,y:0},{x:100,y:0},{x:100,y:50},{x:0,y:50}],
        seatMin: 1, seatMax: 10, rowMin: 1, rowMax: 5
    };
    area.seatGrid = ArcMath.computeSeatGridFromPolygon(area);
    // Fórmula bilineal original: x = p0.x + ((seatPos - seatMin) * 10 + 2) * ux
    // En rectángulo axis-aligned con spacing 10: x = (seatPos-1)*10 + 2
    const p = ArcMath.seatPosFromGrid(area, 3, 4);
    assert.ok(approx(p.x, (4-1)*10 + 2));
    assert.ok(approx(p.y, (5-3)*10 + 2));
});

test('seatPosFromGrid: cambiar el polígono NO mueve los asientos si seatGrid es fijo', () => {
    const grid = {
        origin: {x:0, y:0},
        seatAxis: {x:1, y:0},
        rowAxis: {x:0, y:1},
        seatSpacing: 10,
        rowSpacing: 10
    };
    const area = {
        points: [{x:0,y:0},{x:100,y:0},{x:100,y:50},{x:0,y:50}],
        seatMin: 1, seatMax: 10, rowMin: 1, rowMax: 5,
        seatGrid: grid
    };
    const before = ArcMath.seatPosFromGrid(area, 3, 5);
    // Arrastramos una esquina (p2) hacia abajo-derecha, deformando el polígono.
    area.points = [{x:0,y:0},{x:100,y:0},{x:200,y:120},{x:0,y:50}];
    const after = ArcMath.seatPosFromGrid(area, 3, 5);
    assert.ok(approxPt(before, after), 'el asiento debe quedarse en su sitio');
});

test('translateSeatGrid: aplica delta a origen, no a ejes', () => {
    const g = {
        origin: {x:10, y:20}, seatAxis: {x:1, y:0}, rowAxis: {x:0, y:1},
        seatSpacing: 10, rowSpacing: 10
    };
    const t = ArcMath.translateSeatGrid(g, 5, -3);
    assert.deepEqual(t.origin, {x:15, y:17});
    assert.deepEqual(t.seatAxis, g.seatAxis);
});

test('rotateSeatGrid: rota origen y ejes 90° CW alrededor del origen', () => {
    const g = {
        origin: {x:10, y:0}, seatAxis: {x:1, y:0}, rowAxis: {x:0, y:1},
        seatSpacing: 10, rowSpacing: 10
    };
    const r = ArcMath.rotateSeatGrid(g, 0, 0, Math.PI/2);
    // (1,0) → (0,1) en convención SVG (rotación positiva = horaria)
    assert.ok(approx(r.origin.x, 0, 1e-9) && approx(r.origin.y, 10, 1e-9));
    assert.ok(approx(r.seatAxis.x, 0, 1e-9) && approx(r.seatAxis.y, 1, 1e-9));
    assert.ok(approx(r.rowAxis.x, -1, 1e-9) && approx(r.rowAxis.y, 0, 1e-9));
});

// -------- computeFrontDirection / averageFrontDirection --------
test('computeFrontDirection: rectángulo estándar → (0,1) hacia abajo', () => {
    const area = rectAreaForTest(0, 0, 100, 50, 5, 10);
    const d = ArcMath.computeFrontDirection(area);
    assert.ok(approx(d.x, 0, 1e-9));
    assert.ok(approx(d.y, 1, 1e-9));
});

test('computeFrontDirection: rectángulo rotado 90° CW → (1,0) hacia la derecha', () => {
    // Rotación 90° CW alrededor del origen: (x,y) → (-y, x)?
    // Mejor: simulamos directamente los puntos rotados.
    // Original points (CW): (-50,-25),(50,-25),(50,25),(-50,25)
    // Rotar 90° CW (en SVG = (x,y)→(-y,x))... veamos:
    // Implementación simple: rota cada punto 90° CW
    function rotCW(p) { return { x: -p.y, y: p.x }; }
    const base = rectAreaForTest(0, 0, 100, 50, 5, 10);
    const area = { ...base, points: base.points.map(rotCW) };
    const d = ArcMath.computeFrontDirection(area);
    // Después de rotar 90° CW, el frente (que era abajo) ahora está a la izquierda.
    // p2 era (50, 25) → (-25, 50). p3 era (-50, 25) → (-25, -50).
    // dx = p2.x - p3.x = 0, dy = p2.y - p3.y = 100.
    // nx = -dy/l = -1, ny = dx/l = 0. Dirección (-1, 0) = izquierda.
    assert.ok(approx(d.x, -1, 1e-9));
    assert.ok(approx(d.y, 0, 1e-9));
});

test('computeFrontDirection: arco apunta del innerMid al centro', () => {
    const area = {
        shape: { type: 'arc', center: { x: 0, y: 0 }, innerR: 100, outerR: 150, startAngle: 0, endAngle: Math.PI / 2 }
    };
    const d = ArcMath.computeFrontDirection(area);
    // midAngle = π/4, innerMid = (100 cos π/4, 100 sin π/4) ≈ (70.7, 70.7).
    // Dirección del innerMid al centro (0,0): (-70.7, -70.7) normalizado = (-0.707, -0.707).
    assert.ok(approx(d.x, -Math.cos(Math.PI / 4), 1e-6));
    assert.ok(approx(d.y, -Math.sin(Math.PI / 4), 1e-6));
});

test('averageFrontDirection: tres áreas todas abajo → (0,1)', () => {
    const areas = [
        rectAreaForTest(0, 0, 100, 50, 5, 10),
        rectAreaForTest(150, 0, 100, 50, 5, 10),
        rectAreaForTest(300, 0, 100, 50, 5, 10)
    ];
    const d = ArcMath.averageFrontDirection(areas);
    assert.ok(approx(d.x, 0));
    assert.ok(approx(d.y, 1));
});

test('averageFrontDirection: direcciones opuestas se cancelan → null', () => {
    // Truco: simulamos un área "boca abajo" reordenando los points para que p2/p3 estén arriba.
    const a1 = rectAreaForTest(0, 0, 100, 50, 5, 10);
    // Reordenar puntos para invertir el frente:
    const a2 = { ...a1, points: [a1.points[2], a1.points[3], a1.points[0], a1.points[1]] };
    const d = ArcMath.averageFrontDirection([a1, a2]);
    assert.equal(d, null);
});

// -------- fitGroupAsArc / layAreasFlat / computeAreaNaturalSize --------
test('computeAreaNaturalSize: polígono devuelve dimensiones del bbox', () => {
    const area = rectAreaForTest(0, 0, 100, 50, 5, 10);
    const sz = ArcMath.computeAreaNaturalSize(area);
    assert.ok(approx(sz.width, 100));
    assert.ok(approx(sz.height, 50));
});

test('computeAreaNaturalSize: arco devuelve sweep × midR de ancho y thickness de alto', () => {
    const area = {
        shape: { type: 'arc', center: { x: 0, y: 0 }, innerR: 100, outerR: 120, startAngle: 0, endAngle: Math.PI / 4 }
    };
    const sz = ArcMath.computeAreaNaturalSize(area);
    const midR = 110;
    assert.ok(approx(sz.width, (Math.PI / 4) * midR));
    assert.ok(approx(sz.height, 20));
});

test('fitGroupAsArc: gapPx produce longitud de arco constante en píxeles a cualquier midRadius', () => {
    const areas = [
        rectAreaForTest(0, 0, 80, 50, 5, 16),
        rectAreaForTest(120, 0, 80, 50, 5, 16),
        rectAreaForTest(240, 0, 80, 50, 5, 16)
    ];
    // A radios muy distintos el gap pixelado debe seguir produciendo ~4 px de arco entre vecinos.
    for (const midR of [200, 1000, 5000, 50000]) {
        const result = ArcMath.fitGroupAsArc(areas, {
            center: { x: 0, y: midR }, midRadius: midR, gapPx: 4, orientationRad: -Math.PI/2
        });
        for (let i = 1; i < result.length; i++) {
            const gapAngular = result[i].shape.startAngle - result[i-1].shape.endAngle;
            const gapArcLen = gapAngular * midR;
            assert.ok(approx(gapArcLen, 4, 1e-6),
                `midR=${midR} gap=${gapArcLen}px (esperado 4)`);
        }
    }
});

test('fitGroupAsArc: introduce gap angular entre áreas adyacentes', () => {
    const areas = [
        rectAreaForTest(0, 0, 100, 50, 5, 20),
        rectAreaForTest(120, 0, 100, 50, 5, 20),
        rectAreaForTest(240, 0, 100, 50, 5, 20)
    ];
    const result = ArcMath.fitGroupAsArc(areas, {
        center: { x: 120, y: 1000 }, midRadius: 1000, gapDeg: 2, orientationRad: -Math.PI/2
    });
    for (let i = 1; i < result.length; i++) {
        const gap = result[i].shape.startAngle - result[i-1].shape.endAngle;
        assert.ok(approx(gap, ArcMath.degToRad(2), 1e-9));
    }
});

test('fitGroupAsArc: ancho por área = nSeats × seatSpacing uniforme + 2 × margin', () => {
    // Tres áreas con MISMO seatSpacing natural (5 px/asiento) pero distintos nSeats.
    const areas = [
        rectAreaForTest(0, 0, 80, 50, 5, 16),    // seatSpacing=5
        rectAreaForTest(0, 0, 120, 50, 5, 24),   // seatSpacing=5
        rectAreaForTest(0, 0, 200, 50, 5, 40)    // seatSpacing=5
    ];
    const result = ArcMath.fitGroupAsArc(areas, {
        center: { x: 0, y: 1000 }, midRadius: 1000, gapDeg: 0, orientationRad: -Math.PI/2,
        marginRatio: 0
    });
    const midR = (result[0].shape.innerR + result[0].shape.outerR) / 2;
    // Con marginRatio=0, marginPx=max(2, 0)=2, así que cada área añade 4px (2+2).
    [16, 24, 40].forEach((nSeats, i) => {
        const expectedWidth = nSeats * 5 + 4; // 5 = seatSpacing uniforme, +4 px margen total
        const sweep = result[i].shape.endAngle - result[i].shape.startAngle;
        assert.ok(approx(sweep * midR, expectedWidth, 1),
            `área ${i}: esperado ${expectedWidth}, obtenido ${sweep * midR}`);
    });
});

test('fitGroupAsArc: seatSpacing uniforme cuando áreas tienen densidades distintas', () => {
    // Mismo ancho, distinto nº de asientos → seatSpacing distintos.
    // El grupo debería usar la MEDIANA y todas las áreas heredarla.
    const areas = [
        rectAreaForTest(0, 0, 100, 50, 5, 10),   // seatSpacing=10
        rectAreaForTest(0, 0, 100, 50, 5, 25),   // seatSpacing=4
        rectAreaForTest(0, 0, 100, 50, 5, 50)    // seatSpacing=2
    ];
    const result = ArcMath.fitGroupAsArc(areas, {
        center: { x: 0, y: 1000 }, midRadius: 1000, gapDeg: 0, marginRatio: 0
    });
    // Median seatSpacing = 4. Todos los shapes deberían reportar seatSpacingPx=4.
    result.forEach(r => assert.equal(r.shape.seatSpacingPx, 4));
});

test('fitGroupAsArc: thickness preserva alto + 2 × margen', () => {
    const areas = [rectAreaForTest(0, 0, 100, 170, 17, 28)];
    const result = ArcMath.fitGroupAsArc(areas, {
        center: { x: 0, y: 1000 }, midRadius: 1000, gapDeg: 0, marginRatio: 0
    });
    // rowSpacing = 170/17 = 10, marginPx = max(2, seatSpacing(=3.57)*0) = 2.
    // thickness = 17*10 + 2*2 = 174.
    const thick = result[0].shape.outerR - result[0].shape.innerR;
    assert.ok(approx(thick, 174, 1));
});

test('arcSeatPos con seatSpacingPx: paso angular constante (no estira a llenar el sweep)', () => {
    // Área con 3 asientos y sweep grande. Sin seatSpacingPx, los asientos se repartirían
    // a 1/3 del sweep cada uno. Con seatSpacingPx, deberían ir al paso fijo.
    const area = {
        rowMin: 1, rowMax: 1, seatMin: 1, seatMax: 3,
        shape: {
            type: 'arc',
            center: { x: 0, y: 0 },
            innerR: 100, outerR: 110,
            startAngle: 0, endAngle: Math.PI / 4, // sweep grande
            seatSpacingPx: 5,
            rowSpacingPx: 10,
            seatMarginPx: 0,
            rowMarginPx: 0
        }
    };
    const midR = 105;
    const seatAngle = 5 / midR;
    // Asiento 1 (seatPos=1): a = 0 + 0 + (0+0.5)*seatAngle = 0.5*5/105
    const p1 = ArcMath.arcSeatPos(area, 1, 1);
    const expected = { x: midR * Math.cos(0.5 * seatAngle), y: midR * Math.sin(0.5 * seatAngle) };
    assert.ok(approx(p1.x, expected.x, 1e-9));
    assert.ok(approx(p1.y, expected.y, 1e-9));
});

test('arcSeatPos: cae al modo legacy si el shape no tiene seatSpacingPx', () => {
    const area = {
        rowMin: 1, rowMax: 1, seatMin: 1, seatMax: 1,
        shape: { type: 'arc', center: { x: 0, y: 0 }, innerR: 100, outerR: 120, startAngle: 0, endAngle: Math.PI / 2 }
    };
    // Una sola fila, un solo asiento: cae en el centroide del arco.
    const p = ArcMath.arcSeatPos(area, 1, 1);
    const c = ArcMath.arcCentroid(area.shape);
    assert.ok(approxPt(p, c));
});

test('clampArcShape preserva seatSpacingPx/rowSpacingPx/seatMarginPx/rowMarginPx', () => {
    const shape = {
        type: 'arc', center: { x: 0, y: 0 }, innerR: 100, outerR: 120, startAngle: 0, endAngle: 1,
        seatSpacingPx: 5, rowSpacingPx: 10, seatMarginPx: 2, rowMarginPx: 3
    };
    const c = ArcMath.clampArcShape(shape);
    assert.equal(c.seatSpacingPx, 5);
    assert.equal(c.rowSpacingPx, 10);
    assert.equal(c.seatMarginPx, 2);
    assert.equal(c.rowMarginPx, 3);
});

test('layAreasFlat: dispone áreas en fila con gap pixelado', () => {
    const areas = [
        rectAreaForTest(0, 0, 100, 50, 5, 20),
        rectAreaForTest(0, 0, 100, 50, 5, 20)
    ];
    const result = ArcMath.layAreasFlat(areas, {
        center: { x: 0, y: 0 }, directionRad: 0, gapPx: 10
    });
    assert.equal(result.length, 2);
    // El primer área va de x=-(100+10+100)/2=-105 a -5; el segundo de 5 a 105
    const p1Right = result[0].points[1].x;
    const p2Left = result[1].points[0].x;
    assert.ok(approx(p2Left - p1Right, 10));
});

test('layAreasFlat: ancho natural preservado por área', () => {
    const areas = [
        rectAreaForTest(0, 0, 80, 50, 5, 16),
        rectAreaForTest(0, 0, 200, 50, 5, 40)
    ];
    const result = ArcMath.layAreasFlat(areas, {
        center: { x: 0, y: 0 }, directionRad: 0, gapPx: 0
    });
    const w0 = result[0].points[1].x - result[0].points[0].x;
    const w1 = result[1].points[1].x - result[1].points[0].x;
    assert.ok(approx(w0, 80));
    assert.ok(approx(w1, 200));
});

// -------- fitAreasToArc --------
test('fitAreasToArc: bordes contiguos sin huecos (endAngle[i] = startAngle[i+1])', () => {
    const areas = [
        { id: 'a', seatMin: 1, seatMax: 20 },
        { id: 'b', seatMin: 1, seatMax: 20 },
        { id: 'c', seatMin: 1, seatMax: 20 }
    ];
    const result = ArcMath.fitAreasToArc(areas, {
        center: { x: 0, y: 0 }, innerR: 100, outerR: 150,
        startAngleDeg: 0, endAngleDeg: 90
    });
    assert.equal(result.length, 3);
    for (let i = 1; i < result.length; i++) {
        assert.ok(approx(result[i - 1].shape.endAngle, result[i].shape.startAngle, 1e-9),
            `huecos entre ${i - 1} y ${i}`);
    }
});

test('fitAreasToArc: distribución proporcional a #asientos', () => {
    const areas = [
        { id: 'small', seatMin: 1, seatMax: 5 },   // 5 asientos
        { id: 'big',   seatMin: 1, seatMax: 25 }   // 25 asientos → 5x más sweep
    ];
    const result = ArcMath.fitAreasToArc(areas, {
        center: { x: 0, y: 0 }, innerR: 100, outerR: 150,
        startAngleDeg: 0, endAngleDeg: 60
    });
    const sweepSmall = result[0].shape.endAngle - result[0].shape.startAngle;
    const sweepBig = result[1].shape.endAngle - result[1].shape.startAngle;
    assert.ok(approx(sweepBig / sweepSmall, 5, 1e-9));
});

test('fitAreasToArc: distribución equal reparte por igual', () => {
    const areas = [
        { id: 'a', seatMin: 1, seatMax: 5 },
        { id: 'b', seatMin: 1, seatMax: 25 }
    ];
    const result = ArcMath.fitAreasToArc(areas, {
        center: { x: 0, y: 0 }, innerR: 100, outerR: 150,
        startAngleDeg: 0, endAngleDeg: 60,
        distribution: 'equal'
    });
    const sweepA = result[0].shape.endAngle - result[0].shape.startAngle;
    const sweepB = result[1].shape.endAngle - result[1].shape.startAngle;
    assert.ok(approx(sweepA, sweepB, 1e-9));
});

test('fitAreasToArc: cubre exactamente el rango total', () => {
    const areas = Array.from({ length: 5 }, (_, i) => ({ id: `a${i}`, seatMin: 1, seatMax: 10 }));
    const result = ArcMath.fitAreasToArc(areas, {
        center: { x: 100, y: 200 }, innerR: 50, outerR: 80,
        startAngleDeg: -45, endAngleDeg: 45
    });
    assert.ok(approx(result[0].shape.startAngle, ArcMath.degToRad(-45), 1e-9));
    assert.ok(approx(result[result.length - 1].shape.endAngle, ArcMath.degToRad(45), 1e-9));
});

test('fitAreasToArc: todas las áreas comparten center/innerR/outerR (acople perfecto garantizado)', () => {
    const areas = [
        { id: 'a', seatMin: 1, seatMax: 10 },
        { id: 'b', seatMin: 1, seatMax: 10 }
    ];
    const result = ArcMath.fitAreasToArc(areas, {
        center: { x: 50, y: 60 }, innerR: 100, outerR: 150,
        startAngleDeg: 0, endAngleDeg: 30
    });
    result.forEach(r => {
        assert.equal(r.shape.center.x, 50);
        assert.equal(r.shape.center.y, 60);
        assert.equal(r.shape.innerR, 100);
        assert.equal(r.shape.outerR, 150);
    });
});

test('fitAreasToArc: lanza si innerR/outerR inválidos', () => {
    assert.throws(() => ArcMath.fitAreasToArc([{ id: 'a', seatMin: 1, seatMax: 5 }], {
        center: { x: 0, y: 0 }, innerR: 0, outerR: 100, startAngleDeg: 0, endAngleDeg: 30
    }));
    assert.throws(() => ArcMath.fitAreasToArc([{ id: 'a', seatMin: 1, seatMax: 5 }], {
        center: { x: 0, y: 0 }, innerR: 100, outerR: 50, startAngleDeg: 0, endAngleDeg: 30
    }));
});

test('fitAreasToArc: lista vacía → []', () => {
    const result = ArcMath.fitAreasToArc([], { center: { x: 0, y: 0 }, innerR: 1, outerR: 2 });
    assert.deepEqual(result, []);
});

// -------- curvaturePctToMidRadius / midRadiusToCurvaturePct --------
test('curvaturePctToMidRadius: 100% → infinito (recta)', () => {
    assert.equal(ArcMath.curvaturePctToMidRadius(100, 300), Infinity);
});

test('curvaturePctToMidRadius: 0% → L/π (media circunferencia)', () => {
    const r = ArcMath.curvaturePctToMidRadius(0, 300);
    assert.ok(approx(r, 300 / Math.PI, 1e-6));
});

test('curvaturePctToMidRadius: 50% → 2L/π (cuarto de circunferencia)', () => {
    const r = ArcMath.curvaturePctToMidRadius(50, 300);
    // k = (1-0.5)×π/L = 0.5×π/L → R = 2L/π
    assert.ok(approx(r, 2 * 300 / Math.PI, 1e-6));
});

test('midRadiusToCurvaturePct: ida y vuelta consistente', () => {
    const L = 500;
    for (const pct of [0, 10, 50, 75, 99]) {
        const r = ArcMath.curvaturePctToMidRadius(pct, L);
        const back = ArcMath.midRadiusToCurvaturePct(r, L);
        assert.ok(approx(back, pct, 1e-3));
    }
});

test('midRadiusToCurvaturePct: midR muy grande → 100%', () => {
    assert.ok(ArcMath.midRadiusToCurvaturePct(1e9, 300) > 99.99);
});

test('midRadiusToCurvaturePct: midR ≤ L/π → 0% (clampeado)', () => {
    assert.equal(ArcMath.midRadiusToCurvaturePct(50, 300), 0);
});

// -------- autoFitArcParams: preservación de tamaño de celda --------
function rectAreaForTest(cx, cy, w, h, nRows, nSeats) {
    return {
        points: [
            { x: cx - w/2, y: cy - h/2 },
            { x: cx + w/2, y: cy - h/2 },
            { x: cx + w/2, y: cy + h/2 },
            { x: cx - w/2, y: cy + h/2 }
        ],
        rowMin: 1, rowMax: nRows,
        seatMin: 1, seatMax: nSeats
    };
}

test('autoFitArcParams: thickness preserva altura de fila (rowSpacing × maxRows)', () => {
    // 3 áreas de 100×170 con 17 filas → rowSpacing = 10
    const areas = [
        rectAreaForTest(100, 0, 100, 170, 17, 28),
        rectAreaForTest(220, 0, 100, 170, 17, 28),
        rectAreaForTest(340, 0, 100, 170, 17, 28)
    ];
    const params = ArcMath.autoFitArcParams(areas, {
        center: { x: 220, y: 1000 },
        midRadius: 1000
    });
    // thickness ≈ 17 × 10 = 170
    assert.ok(approx(params.outerR - params.innerR, 170, 1));
    // midRadius ≈ (innerR + outerR) / 2 ≈ 1000
    assert.ok(approx((params.innerR + params.outerR) / 2, 1000, 1));
});

test('autoFitArcParams: sweep × midRadius ≈ Σ ancho-original', () => {
    // 3 áreas de 100×170 con 28 asientos → seatSpacing = 100/28 ≈ 3.57
    // Σ ancho = 300, midRadius = 1000 → sweep ≈ 0.3 rad
    const areas = [
        rectAreaForTest(100, 0, 100, 170, 17, 28),
        rectAreaForTest(220, 0, 100, 170, 17, 28),
        rectAreaForTest(340, 0, 100, 170, 17, 28)
    ];
    const params = ArcMath.autoFitArcParams(areas, {
        center: { x: 220, y: 1000 },
        midRadius: 1000
    });
    const sweepRad = ArcMath.degToRad(params.endAngleDeg - params.startAngleDeg);
    const arcLen = sweepRad * params.midRadius;
    assert.ok(approx(arcLen, 300, 2));
});

test('autoFitArcParams: midRadius por defecto = distancia del centroide al centro', () => {
    const areas = [rectAreaForTest(0, 0, 100, 50, 5, 10)];
    const params = ArcMath.autoFitArcParams(areas, { center: { x: 0, y: 500 } });
    assert.ok(approx(params.midRadius, 500, 1));
});

test('autoFitArcParams: orientation por defecto apunta del centro al centroide', () => {
    const areas = [rectAreaForTest(0, -1000, 100, 50, 5, 10)];
    const params = ArcMath.autoFitArcParams(areas, { center: { x: 0, y: 0 } });
    const midAngleDeg = (params.startAngleDeg + params.endAngleDeg) / 2;
    // El centroide está en (0,-1000) respecto al centro (0,0): ángulo = -90° (SVG)
    assert.ok(approx(midAngleDeg, -90, 0.5));
});

test('autoFitArcParams: áreas vacías lanza', () => {
    assert.throws(() => ArcMath.autoFitArcParams([], { center: { x: 0, y: 0 } }));
});

test('autoFitArcParams: sin center lanza', () => {
    assert.throws(() => ArcMath.autoFitArcParams([rectAreaForTest(0, 0, 10, 10, 1, 1)], {}));
});

// -------- parseAreaShape / serializeAreaShape --------
test('parseAreaShape: array legacy → polygon', () => {
    const r = ArcMath.parseAreaShape(JSON.stringify([{ x: 0, y: 0 }, { x: 10, y: 0 }]));
    assert.equal(r.kind, 'polygon');
    assert.equal(r.points.length, 2);
});

test('parseAreaShape: objeto polygon tipado → polygon', () => {
    const r = ArcMath.parseAreaShape(JSON.stringify({ type: 'polygon', points: [{ x: 0, y: 0 }] }));
    assert.equal(r.kind, 'polygon');
});

test('parseAreaShape: objeto arc tipado → arc', () => {
    const r = ArcMath.parseAreaShape(JSON.stringify(baseShape));
    assert.equal(r.kind, 'arc');
    assert.ok(ArcMath.isArcShape(r.shape));
});

test('parseAreaShape: vacío o basura → none', () => {
    assert.equal(ArcMath.parseAreaShape('').kind, 'none');
    assert.equal(ArcMath.parseAreaShape(null).kind, 'none');
    assert.equal(ArcMath.parseAreaShape('no-json').kind, 'none');
});

test('serializeAreaShape: polygon area → JSON array', () => {
    const area = { points: [{ x: 1, y: 2 }] };
    const s = ArcMath.serializeAreaShape(area);
    const parsed = JSON.parse(s);
    assert.ok(Array.isArray(parsed));
});

test('serializeAreaShape: arc area → JSON tipado', () => {
    const area = { shape: baseShape, points: [] };
    const s = ArcMath.serializeAreaShape(area);
    const parsed = JSON.parse(s);
    assert.equal(parsed.type, 'arc');
});

// -------- defaultArcShape --------
test('defaultArcShape: shape válido con valores positivos', () => {
    const s = ArcMath.defaultArcShape(500, 500);
    assert.equal(ArcMath.isArcShape(s), true);
    assert.ok(s.innerR > 0);
    assert.ok(s.outerR > s.innerR);
    assert.ok(s.endAngle !== s.startAngle);
});

// -------- clampArcShape --------
test('clampArcShape: corrige outerR <= innerR', () => {
    const c = ArcMath.clampArcShape({ ...baseShape, innerR: 50, outerR: 30 });
    assert.ok(c.outerR > c.innerR);
});

test('clampArcShape: corrige innerR <= 0', () => {
    const c = ArcMath.clampArcShape({ ...baseShape, innerR: -10, outerR: 80 });
    assert.ok(c.innerR >= 1);
    assert.ok(c.outerR > c.innerR);
});

test('clampArcShape: sweep cero se rescata a epsilon (no a 1° como antes)', () => {
    const c = ArcMath.clampArcShape({ ...baseShape, startAngle: 0, endAngle: 0 });
    assert.ok(c.endAngle > c.startAngle, 'epsilon positivo aplicado');
    assert.ok(c.endAngle - c.startAngle < ArcMath.degToRad(0.01), 'mucho menor que 1°');
});

test('clampArcShape: NO infla sweeps pequeños pero válidos (regresión)', () => {
    // Bug previo: minSweep=1° forzaba a 1° cualquier sweep menor, lo que en
    // fit-to-arc con midRadius grande producía solapamiento entre áreas.
    const tinySweep = ArcMath.degToRad(0.15);
    const c = ArcMath.clampArcShape({ ...baseShape, startAngle: 0, endAngle: tinySweep });
    assert.ok(approx(c.endAngle - c.startAngle, tinySweep, 1e-9));
});

test('clampArcShape: sweep máximo es 360°', () => {
    const c = ArcMath.clampArcShape({ ...baseShape, startAngle: 0, endAngle: 10 * Math.PI });
    assert.ok(Math.abs(c.endAngle - c.startAngle) <= 2 * Math.PI + 1e-9);
});

// -------- angleFromPoint / radiusFromPoint --------
test('angleFromPoint: (1,0) respecto a origen = 0', () => {
    assert.ok(approx(ArcMath.angleFromPoint({ x: 0, y: 0 }, { x: 1, y: 0 }), 0));
});

test('angleFromPoint: (0,1) respecto a origen = PI/2 (SVG)', () => {
    assert.ok(approx(ArcMath.angleFromPoint({ x: 0, y: 0 }, { x: 0, y: 1 }), Math.PI / 2));
});

test('radiusFromPoint: pitagoras 3-4-5', () => {
    assert.ok(approx(ArcMath.radiusFromPoint({ x: 0, y: 0 }, { x: 3, y: 4 }), 5));
});

// -------- Fase 3: huecos / pasillos --------
test('Fase 3: borrar asientos del medio no desplaza los demás (seatPos invariante)', () => {
    const area = {
        shape: baseShape,
        rowMin: 1, rowMax: 1, seatMin: 1, seatMax: 10
    };
    const seats = [];
    for (let s = 1; s <= 10; s++) seats.push({ rowPos: 1, seatPos: s });

    const posBeforeGap = seats.map(s => ArcMath.arcSeatPos(area, s.rowPos, s.seatPos));
    // Simulamos un pasillo: eliminamos asientos 5 y 6
    const remaining = seats.filter(s => s.seatPos !== 5 && s.seatPos !== 6);
    // El seatMin/seatMax NO cambia — el rango angular sigue siendo el mismo.
    const posAfterGap = remaining.map(s => ArcMath.arcSeatPos(area, s.rowPos, s.seatPos));
    // Cada asiento que aún existe debe estar en la MISMA posición que antes.
    remaining.forEach((s, i) => {
        const before = posBeforeGap.find(p => p && p === posBeforeGap[seats.findIndex(x => x.seatPos === s.seatPos)]);
        assert.ok(approxPt(before, posAfterGap[i]),
            `seat ${s.seatPos} cambió de posición al haber huecos`);
    });
});

test('Fase 3: serializeAreaShape de arco con huecos solo emite el shape (no info de asientos)', () => {
    // El shape es independiente de qué asientos existan: los huecos viven solo en AppState.seats
    const arc = { ...baseShape };
    const area1 = { shape: arc, points: [] };
    const area2 = { shape: arc, points: [] };
    assert.equal(ArcMath.serializeAreaShape(area1), ArcMath.serializeAreaShape(area2));
});

test('round-trip: parse(serialize(arc area)) preserva shape', () => {
    const area = { shape: baseShape, points: [] };
    const back = ArcMath.parseAreaShape(ArcMath.serializeAreaShape(area));
    assert.equal(back.kind, 'arc');
    assert.ok(approx(back.shape.startAngle, baseShape.startAngle));
    assert.ok(approx(back.shape.endAngle, baseShape.endAngle));
    assert.ok(approx(back.shape.innerR, baseShape.innerR));
    assert.ok(approx(back.shape.outerR, baseShape.outerR));
});
