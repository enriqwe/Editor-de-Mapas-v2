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

test('clampArcShape: sweep mínimo es 1° si era cero', () => {
    const c = ArcMath.clampArcShape({ ...baseShape, startAngle: 0, endAngle: 0 });
    assert.ok(Math.abs(c.endAngle - c.startAngle) >= ArcMath.degToRad(1) - 1e-9);
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

test('round-trip: parse(serialize(arc area)) preserva shape', () => {
    const area = { shape: baseShape, points: [] };
    const back = ArcMath.parseAreaShape(ArcMath.serializeAreaShape(area));
    assert.equal(back.kind, 'arc');
    assert.ok(approx(back.shape.startAngle, baseShape.startAngle));
    assert.ok(approx(back.shape.endAngle, baseShape.endAngle));
    assert.ok(approx(back.shape.innerR, baseShape.innerR));
    assert.ok(approx(back.shape.outerR, baseShape.outerR));
});
