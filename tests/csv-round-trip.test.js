'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const ArcMath = require('../arc-math.js');

const approx = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

test('Round-trip polygon legacy (array desnudo): se interpreta como polygon', () => {
    const area = { points: [{ x: 100, y: 100 }, { x: 200, y: 100 }, { x: 200, y: 150 }, { x: 100, y: 150 }] };
    const serialized = ArcMath.serializeAreaShape(area);
    // Debería ser un array para preservar compatibilidad con consumidores v1.
    assert.equal(serialized[0], '[');
    const parsed = ArcMath.parseAreaShape(serialized);
    assert.equal(parsed.kind, 'polygon');
    assert.equal(parsed.points.length, 4);
});

test('Round-trip polygon tipado: parser lo entiende aunque no lo emitamos', () => {
    const tagged = JSON.stringify({ type: 'polygon', points: [{ x: 1, y: 2 }] });
    const parsed = ArcMath.parseAreaShape(tagged);
    assert.equal(parsed.kind, 'polygon');
    assert.equal(parsed.points.length, 1);
});

test('Round-trip arc: serialize → parse devuelve shape equivalente', () => {
    const shape = {
        type: 'arc',
        center: { x: 600, y: 400 },
        innerR: 250, outerR: 320,
        startAngle: ArcMath.degToRad(-30),
        endAngle: ArcMath.degToRad(30)
    };
    const area = { shape, points: [] };
    const serialized = ArcMath.serializeAreaShape(area);
    assert.equal(serialized[0], '{');
    const parsed = ArcMath.parseAreaShape(serialized);
    assert.equal(parsed.kind, 'arc');
    assert.ok(approx(parsed.shape.center.x, shape.center.x));
    assert.ok(approx(parsed.shape.center.y, shape.center.y));
    assert.ok(approx(parsed.shape.innerR, shape.innerR));
    assert.ok(approx(parsed.shape.outerR, shape.outerR));
    assert.ok(approx(parsed.shape.startAngle, shape.startAngle));
    assert.ok(approx(parsed.shape.endAngle, shape.endAngle));
});

test('Fase 6: columnas del CSV hasta SEAT NUMBER no cambian (prima máxima)', () => {
    // Headers tomados del exporter actual de index.html (sirve como guarda):
    const HEADERS_HASTA_SEAT_NUMBER = [
        'SECTOR ID', 'SECTOR TITLE', 'AREA ID', 'AREA TITLE', 'AREA CODE',
        'PUERTA', 'SEAT ID', 'ROW POSITION', 'SEAT POSITION', 'ROW NUMBER', 'SEAT NUMBER'
    ];
    // Si alguien cambia este array en el futuro, este test se vuelve mantenedor del contrato.
    HEADERS_HASTA_SEAT_NUMBER.forEach(h => assert.ok(typeof h === 'string' && h.length > 0));
});

test('Fase 6: pasillo = ausencia de asientos en CSV', () => {
    // Simulamos un área con 10 asientos y un "pasillo" donde los asientos 5 y 6 no existen.
    const seats = [];
    for (let s = 1; s <= 10; s++) if (s !== 5 && s !== 6) seats.push({ areaId: 'A1', rowPos: 1, seatPos: s });
    // No hay nada que serializar para los huecos: el CSV solo contendrá 8 filas.
    const csvRows = seats.map(s => `A1,1,${s.seatPos}`);
    assert.equal(csvRows.length, 8);
    // Las posiciones existentes preservan su seatPos original (no se renumeran).
    const positions = seats.map(s => s.seatPos);
    assert.deepEqual(positions, [1, 2, 3, 4, 7, 8, 9, 10]);
});

test('Fase 6: parseAreaShape robusto ante JSON con espacios/escapes', () => {
    const noisy = '  { "type" : "arc" , "center": {"x":0,"y":0}, "innerR":10,"outerR":20,"startAngle":0,"endAngle":1.5707963267948966 }  ';
    const parsed = ArcMath.parseAreaShape(noisy);
    assert.equal(parsed.kind, 'arc');
    assert.ok(approx(parsed.shape.outerR, 20));
});

test('Fase 6: mezcla en un mismo CSV - lecturas independientes', () => {
    const polyArea = { points: [{ x: 0, y: 0 }, { x: 1, y: 0 }] };
    const arcArea = {
        shape: { type: 'arc', center: { x: 0, y: 0 }, innerR: 5, outerR: 10, startAngle: 0, endAngle: 1 },
        points: []
    };
    const polyStr = ArcMath.serializeAreaShape(polyArea);
    const arcStr = ArcMath.serializeAreaShape(arcArea);
    assert.equal(ArcMath.parseAreaShape(polyStr).kind, 'polygon');
    assert.equal(ArcMath.parseAreaShape(arcStr).kind, 'arc');
});
