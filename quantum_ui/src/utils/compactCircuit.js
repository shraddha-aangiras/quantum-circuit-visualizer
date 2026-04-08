/**
 * Compacts a circuit by pushing all gates as far left as possible,
 * while preserving CNOT pair alignment across wires.
 */
export const compactCircuit = (oldCircuit) => {
    const numWires = oldCircuit.length;
    const numSteps = oldCircuit[0].length;
  
    const newCircuit = Array.from({ length: numWires }, () => Array(numSteps).fill(null));
  
    const tail = Array(numWires).fill(-1);
    const processedCNOTs = new Set();
  
    for (let step = 0; step < numSteps; step++) {
      for (let wire = 0; wire < numWires; wire++) {
        const cell = oldCircuit[wire][step];
        if (!cell) continue;
  
        const TWO_WIRE = ['CNOT', 'CZ', 'FF_x', 'FF_Z'];
        const THREE_WIRE = ['TOFFOLI'];

        if (cell.name === 'BARRIER') {
          const { topWire, bottomWire } = cell;
          const barrId = `barrier-${topWire}-${bottomWire}-${step}`;
          if (processedCNOTs.has(barrId)) continue;
          processedCNOTs.add(barrId);

          let maxTail = -1;
          for (let w = topWire; w <= bottomWire; w++) {
            if (tail[w] > maxTail) maxTail = tail[w];
          }
          const targetStep = maxTail + 1;
          for (let w = topWire; w <= bottomWire; w++) {
            newCircuit[w][targetStep] = { name: 'BARRIER', topWire, bottomWire };
            tail[w] = targetStep;
          }
        } else if (TWO_WIRE.includes(cell.name)) {
          const peerWire = cell.role === 'control' ? cell.targetWire : cell.controlWire;
  
          const cnotId = `${Math.min(wire, peerWire)}-${Math.max(wire, peerWire)}-${step}`;
          if (processedCNOTs.has(cnotId)) continue;
          processedCNOTs.add(cnotId);
  
          const minWire = Math.min(wire, peerWire);
          const maxWire = Math.max(wire, peerWire);
  
          let maxTail = -1;
          for (let w = minWire; w <= maxWire; w++) {
            if (tail[w] > maxTail) maxTail = tail[w];
          }
  
          const targetStep = maxTail + 1;
          newCircuit[wire][targetStep] = { ...cell };
          newCircuit[peerWire][targetStep] = { ...oldCircuit[peerWire][step] };
  
          for (let w = minWire; w <= maxWire; w++) {
            tail[w] = targetStep;
          }
        } else if (THREE_WIRE.includes(cell.name)) {
          const c1 = cell.controls[0];
          const c2 = cell.controls[1];
          const t = cell.targetWire;

          const minWire = Math.min(c1, c2, t);
          const maxWire = Math.max(c1, c2, t);

          const gateId = `toffoli-${minWire}-${maxWire}-${step}`;
          if (processedCNOTs.has(gateId)) continue;
          processedCNOTs.add(gateId);

          let maxTail = -1;
          for (let w = minWire; w <= maxWire; w++) {
            if (tail[w] > maxTail) maxTail = tail[w];
          }

          const targetStep = maxTail + 1;
          newCircuit[c1][targetStep] = { ...oldCircuit[c1][step] };
          newCircuit[c2][targetStep] = { ...oldCircuit[c2][step] };
          newCircuit[t][targetStep]  = { ...oldCircuit[t][step] };

          for (let w = minWire; w <= maxWire; w++) {
            tail[w] = targetStep;
          }
        } else {
          const targetStep = tail[wire] + 1;
          newCircuit[wire][targetStep] = { ...cell };
          tail[wire] = targetStep;
        }
      }
    }
  
    return newCircuit;
  };