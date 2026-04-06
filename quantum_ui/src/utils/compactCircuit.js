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
  
        const TWO_WIRE = ['CNOT', 'CC_X', 'CC_Z'];
        if (TWO_WIRE.includes(cell.name)) {
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
        } else {
          const targetStep = tail[wire] + 1;
          newCircuit[wire][targetStep] = { ...cell };
          tail[wire] = targetStep;
        }
      }
    }
  
    return newCircuit;
  };