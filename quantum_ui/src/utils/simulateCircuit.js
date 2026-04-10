import { simulateShots } from './simulateShots';

const TWO_WIRE = ['CNOT', 'CZ', 'FF_x', 'FF_Z'];

export function simulateCircuit(engine, circuit, targetStep = null, shots = 100, selectedQubit = null) {
  if (!engine) return null;

  const numQubits = circuit.length;
  const sim = new engine.Simulator(numQubits);
  const cppCircuitDisplay = new engine.VectorInstruction();
  const cppCircuitShots = new engine.VectorInstruction();

  const compiledInstructions = [];
  const maxStep = targetStep !== null ? targetStep : circuit[0].length - 1;

  for (let step = 0; step <= maxStep; step++) {
    for (let wire = 0; wire < numQubits; wire++) {
      const cell = circuit[wire][step];
      if (!cell) continue;

      if (cell.name === 'BARRIER') {
        // visual only — no quantum operation
      } else if (TWO_WIRE.includes(cell.name)) {
        if (cell.role === 'control') {
          compiledInstructions.push({ name: cell.name, qubits: [wire, cell.targetWire] });
        }
      } else if (cell.name === 'TOFFOLI') {
        if (cell.role === 'target') {
          compiledInstructions.push({ name: 'TOFFOLI', qubits: [cell.controls[0], cell.controls[1], wire] });
        }
      } else {
        compiledInstructions.push({ name: cell.name, qubits: [wire] });
      }
    }
  }

  compiledInstructions.forEach(inst => {
    const cppQubitsShots = new engine.VectorInt();
    inst.qubits.forEach(q => cppQubitsShots.push_back(q));
    cppCircuitShots.push_back({ name: inst.name, qubits: cppQubitsShots });
    cppQubitsShots.delete();

    if (inst.name !== 'MEASURE') {
      let deferredName = inst.name;
      if (inst.name === 'FF_x') deferredName = 'CNOT';
      else if (inst.name === 'FF_Z') deferredName = 'CZ';

      const cppQubitsDisplay = new engine.VectorInt();
      inst.qubits.forEach(q => cppQubitsDisplay.push_back(q));
      cppCircuitDisplay.push_back({ name: deferredName, qubits: cppQubitsDisplay });
      cppQubitsDisplay.delete();
    }
  });

  sim.run(cppCircuitDisplay);

  const cppProb = sim.get_probabilities();
  const probabilities = [];
  const events = [];
  for (let i = 0; i < cppProb.size(); i++) {
    probabilities.push(cppProb.get(i));
    events.push(i.toString(2).padStart(numQubits, '0'));
  }

  const cppState = sim.get_statevector();
  const stateVector = [];
  for (let i = 0; i < cppState.size(); i += 2) {
    const real = cppState.get(i);
    const imag = cppState.get(i + 1);
    stateVector.push({ real, imag });
  }

  let expectationValueX = null, expectationValueY = null, expectationValueZ = null;
  if (selectedQubit !== null) {
    if (typeof sim.get_expectation_x === 'function') expectationValueX = sim.get_expectation_x(selectedQubit);
    if (typeof sim.get_expectation_y === 'function') expectationValueY = sim.get_expectation_y(selectedQubit);
    if (typeof sim.get_expectation_z === 'function') expectationValueZ = sim.get_expectation_z(selectedQubit);
  }

  const cppBits = sim.get_classical_bits();
  const classicalBits = [];
  for (let i = 0; i < cppBits.size(); i++) classicalBits.push(cppBits.get(i));

  sim.delete();
  cppProb.delete();
  cppState.delete();
  cppBits.delete();

  const hasMeasurements = compiledInstructions.some(i => i.name === 'MEASURE');
  const numShots = parseInt(shots, 10) || 100;
  let shotResults = [];

  if (hasMeasurements) {
    const counts = Object.fromEntries(events.map(e => [e, 0]));
    for (let s = 0; s < numShots; s++) {
      const simShot = new engine.Simulator(numQubits);
      simShot.run(cppCircuitShots);
      const cppProbShot = simShot.get_probabilities();
      let r = Math.random();
      for (let i = 0; i < cppProbShot.size(); i++) {
        r -= cppProbShot.get(i);
        if (r <= 0) { counts[events[i]]++; break; }
      }
      simShot.delete();
      cppProbShot.delete();
    }
    shotResults = events.map(state => ({ state: `|${state}⟩`, count: counts[state] }));
  } else {
    const rawCounts = simulateShots(events, probabilities, numShots);
    shotResults = events.map(state => ({ state: `|${state}⟩`, count: rawCounts[state] }));
  }

  cppCircuitDisplay.delete();
  cppCircuitShots.delete();

  return {
    probabilities,
    stateVector,
    events,
    expectationValueX,
    expectationValueY,
    expectationValueZ,
    classicalBits,
    shotResults
  };
}