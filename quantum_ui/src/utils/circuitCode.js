const TWO_WIRE = ['CNOT', 'CZ', 'FF_x', 'FF_Z'];
const THREE_WIRE = ['TOFFOLI'];

// Gate name → short code
const GATE_TO_CODE = {
  H: 'h', X: 'x', Y: 'y', Z: 'z', T: 't',
  MEASURE: 'm', CNOT: 'cx', CZ: 'cz', FF_x: 'ffx', FF_Z: 'ffz',
  TOFFOLI: 'ccx', BARRIER: 'barrier',
};

// Short code (and aliases) → gate name
const CODE_TO_GATE = {
  h: 'H', x: 'X', y: 'Y', z: 'Z', t: 'T',
  m: 'MEASURE', measure: 'MEASURE',
  cx: 'CNOT', cnot: 'CNOT',
  cz: 'CZ',
  ffx: 'FF_x',
  ffz: 'FF_Z',
  ccx: 'TOFFOLI', toffoli: 'TOFFOLI',
  barrier: 'BARRIER',
};

/**
 * Convert a circuit (2-D array of cells) to a human-readable code string.
 * Two-qubit gates are only emitted once (at the control role).
 */
export function circuitToCode(circuit) {
  const numWires = circuit.length;
  const numSteps = circuit[0]?.length ?? 0;
  const instructions = [];
  const seen = new Set();

  for (let step = 0; step < numSteps; step++) {
    for (let wire = 0; wire < numWires; wire++) {
      const cell = circuit[wire][step];
      if (!cell) continue;

      if (cell.name === 'BARRIER') {
        if (wire !== cell.topWire) continue;
        const key = `barrier-${cell.topWire}-${cell.bottomWire}-${step}`;
        if (seen.has(key)) continue;
        seen.add(key);
        instructions.push(`barrier(${cell.topWire},${cell.bottomWire})`);
      } else if (TWO_WIRE.includes(cell.name)) {
        if (cell.role !== 'control') continue;
        const target = cell.targetWire;
        const key = `${step}-${Math.min(wire, target)}-${Math.max(wire, target)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        instructions.push(`${GATE_TO_CODE[cell.name]}(${wire},${target})`);
      } else if (THREE_WIRE.includes(cell.name)) {
        if (cell.role !== 'target') continue;
        const [c1, c2] = cell.controls;
        const key = `${step}-toffoli-${Math.min(c1, c2, wire)}-${Math.max(c1, c2, wire)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        instructions.push(`${GATE_TO_CODE[cell.name]}(${c1},${c2},${wire})`);
      } else {
        instructions.push(`${GATE_TO_CODE[cell.name] ?? cell.name}(${wire})`);
      }
    }
  }

  return instructions.join(', ');
}

/**
 * Parse a code string into a circuit array.
 * Implements compaction inline (no post-pass needed) — each gate is placed
 * in the earliest column where all its wires are free.
 */
export function parseCode(codeStr, minQubits = 1) {
  const ops = [];
  let maxQubit = minQubits - 1;

  const matches = [...codeStr.matchAll(/(\w+)\s*\(\s*(\d+)\s*(?:,\s*(\d+)\s*)?(?:,\s*(\d+)\s*)?\)/gi)];
  for (const m of matches) {
    const gateName = CODE_TO_GATE[m[1].toLowerCase()];
    if (!gateName) continue;
    const q0 = parseInt(m[2], 10);
    const q1 = m[3] !== undefined ? parseInt(m[3], 10) : null;
    const q2 = m[4] !== undefined ? parseInt(m[4], 10) : null;
    maxQubit = Math.max(maxQubit, q0);
    if (q1 !== null) maxQubit = Math.max(maxQubit, q1);
    if (q2 !== null) maxQubit = Math.max(maxQubit, q2);
    ops.push({ gateName, q0, q1, q2 });
  }

  if (!ops.length) return null;

  const numQubits = maxQubit + 1;

  // tail[w] = last occupied step on wire w (-1 = empty)
  const tail = new Array(numQubits).fill(-1);
  const placed = []; // { wire, step, cell }

  for (const { gateName, q0, q1, q2 } of ops) {
    if (gateName === 'BARRIER') {
      const top = q0;
      const bottom = q1 !== null ? q1 : q0;
      const lo = Math.min(top, bottom);
      const hi = Math.max(top, bottom);
      if (lo >= numQubits || hi >= numQubits) continue;
      let maxTail = -1;
      for (let w = lo; w <= hi; w++) maxTail = Math.max(maxTail, tail[w]);
      const step = maxTail + 1;
      for (let w = lo; w <= hi; w++) {
        placed.push({ wire: w, step, cell: { name: 'BARRIER', topWire: lo, bottomWire: hi } });
        tail[w] = step;
      }
    } else if (TWO_WIRE.includes(gateName)) {
      if (q1 === null || q0 === q1 || q0 >= numQubits || q1 >= numQubits) continue;
      // Gate occupies all wires between control and target
      const lo = Math.min(q0, q1);
      const hi = Math.max(q0, q1);
      let maxTail = -1;
      for (let w = lo; w <= hi; w++) maxTail = Math.max(maxTail, tail[w]);
      const step = maxTail + 1;
      placed.push({ wire: q0, step, cell: { name: gateName, role: 'control', targetWire: q1 } });
      placed.push({ wire: q1, step, cell: { name: gateName, role: 'target', controlWire: q0 } });
      for (let w = lo; w <= hi; w++) tail[w] = step;
    } else if (THREE_WIRE.includes(gateName)) {
      if (q1 === null || q2 === null || q0 === q1 || q1 === q2 || q0 === q2 || q0 >= numQubits || q1 >= numQubits || q2 >= numQubits) continue;
      const lo = Math.min(q0, q1, q2);
      const hi = Math.max(q0, q1, q2);
      let maxTail = -1;
      for (let w = lo; w <= hi; w++) maxTail = Math.max(maxTail, tail[w]);
      const step = maxTail + 1;
      placed.push({ wire: q0, step, cell: { name: gateName, role: 'control', controls: [q0, q1], targetWire: q2 } });
      placed.push({ wire: q1, step, cell: { name: gateName, role: 'control', controls: [q0, q1], targetWire: q2 } });
      placed.push({ wire: q2, step, cell: { name: gateName, role: 'target', controls: [q0, q1], targetWire: q2 } });
      for (let w = lo; w <= hi; w++) tail[w] = step;
    } else {
      if (q0 >= numQubits) continue;
      const step = tail[q0] + 1;
      placed.push({ wire: q0, step, cell: { name: gateName } });
      tail[q0] = step;
    }
  }

  if (!placed.length) return null;

  const maxStep = Math.max(...placed.map(r => r.step));
  const numCols = Math.max(10, maxStep + 6);
  const circuit = Array.from({ length: numQubits }, () => Array(numCols).fill(null));
  for (const { wire, step, cell } of placed) {
    circuit[wire][step] = cell;
  }

  return circuit;
}
