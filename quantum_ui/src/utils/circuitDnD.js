import { TWO_WIRE_GATES } from '../constants';

// Re-export so callers that import TWO_WIRE from here don't break.
export const TWO_WIRE = TWO_WIRE_GATES;

// ─── Shared circuit-mutation helpers ─────────────────────────────────────────

/**
 * Splices a blank column at stepIndex if any of wiresToCheck are occupied there.
 * "Occupied" means non-null and not a blank slot (blanks can be overwritten).
 * Mutates circuitGrid in-place.
 */
export function insertColumnIfOccupied(circuitGrid, stepIndex, wiresToCheck) {
  const needsInsert = wiresToCheck.some(
    w => circuitGrid[w] && circuitGrid[w][stepIndex] !== null && !circuitGrid[w][stepIndex].blank
  );
  if (needsInsert) circuitGrid.forEach(wire => wire.splice(stepIndex, 0, null));
}

/** Writes both cells of a 2-wire gate. Mutates circuit in-place. */
export function writeTwoWireGateCells(circuit, ctrlW, tgtW, step, gateName) {
  circuit[ctrlW][step] = { name: gateName, role: 'control', targetWire: tgtW };
  circuit[tgtW][step]  = { name: gateName, role: 'target',  controlWire: ctrlW };
}

/** Writes all three cells of a TOFFOLI gate. Mutates circuit in-place. */
export function writeToffoliGateCells(circuit, c1, c2, target, step) {
  circuit[c1][step]     = { name: 'TOFFOLI', role: 'control', controls: [c1, c2], targetWire: target };
  circuit[c2][step]     = { name: 'TOFFOLI', role: 'control', controls: [c1, c2], targetWire: target };
  circuit[target][step] = { name: 'TOFFOLI', role: 'target',  controls: [c1, c2], targetWire: target };
}

/**
 * Picks default adjacent wires for a TOFFOLI given a primary (control) wire.
 * Returns { c2, target } — the second control and the target wire index.
 */
export function findToffoliWires(primaryWire, numWires) {
  const c2 = primaryWire + 1 < numWires ? primaryWire + 1 : primaryWire - 1;
  const target =
    [primaryWire + 2, primaryWire - 1, primaryWire - 2].find(w => w >= 0 && w < numWires && w !== c2) ??
    [...Array(numWires).keys()].find(w => w !== primaryWire && w !== c2);
  return { c2, target };
}

/** Clears all gates that appear after a MEASURE gate on any wire. */
export function clearGatesAfterMeasure(circuit) {
  let next = circuit;
  for (let w = 0; w < next.length; w++) {
    let measureStep = -1;
    for (let s = 0; s < next[w].length; s++) {
      const cell = next[w][s];
      if (cell && (cell.name === 'MEASURE' || (cell.blank && cell.filled === 'MEASURE'))) {
        measureStep = s;
        break;
      }
    }
    if (measureStep !== -1) {
      for (let s = measureStep + 1; s < next[w].length; s++) {
        const cell = next[w][s];
        if (cell) {
          const isClassicalControl = (['FF_X', 'FF_Z'].includes(cell.name) || ['FF_X', 'FF_Z'].includes(cell.filled)) && cell.role === 'control';
          if (!isClassicalControl) {
            next = removeGateFromCircuit(next, w, s);
          }
        }
      }
    }
  }
  return next;
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Centralized drag-and-drop logic for quantum circuits.
 * Used by QuestionsPage and QuestionBuilderPage to handle placing, moving,
 * swapping, and inserting gates (including multi-qubit gates like CNOT and TOFFOLI).
 */
export function applyGateDrop(prevCircuit, sourceData, destData, options = {}) {
  const { hiddenBlocks = [] } = options;

  let next = prevCircuit.map(w => [...w]);
  const wIdx = destData.wireIndex;
  const sIdx = destData.stepIndex;

  const isOccupied = (w, s) => next[w]?.[s] != null && !next[w][s].blank;
  const isMeasured = (w) => prevCircuit[w]?.some(c => c?.name === 'MEASURE' || (c?.blank && c?.filled === 'MEASURE')) ?? false;

  // 1. Dropping onto a question-blank slot (Questions tab)
  if (destData.type === 'question-blank') {
    if (sourceData.type === 'gate') {
      const gateName = sourceData.name;
      if (!TWO_WIRE.includes(gateName) && gateName !== 'TOFFOLI' && gateName !== 'BARRIER') {
        next[wIdx][sIdx] = { blank: true, filled: gateName };
        return next;
      }
    }
    return prevCircuit;
  }

  // Handle BARRIER
  if (sourceData.type === 'gate' && sourceData.name === 'BARRIER' && destData.type === 'slot') {
    const numW = next.length;
    const allWires = Array.from({ length: numW }, (_, i) => i);
    insertColumnIfOccupied(next, sIdx, allWires);
    for (let w = 0; w < numW; w++) {
      next[w][sIdx] = { name: 'BARRIER', topWire: 0, bottomWire: numW - 1 };
    }
    return next;
  }

  if (sourceData.type === 'barrier' && destData.type === 'slot') {
    const { topWire, bottomWire, stepIndex: oldStep } = sourceData;
    if (oldStep === sIdx) return prevCircuit;
    
    for (let w = topWire; w <= bottomWire; w++) next[w][oldStep] = null;
    
    const barrierWires = Array.from({ length: bottomWire - topWire + 1 }, (_, i) => topWire + i);
    insertColumnIfOccupied(next, sIdx, barrierWires);

    for (let w = topWire; w <= bottomWire; w++) {
      next[w][sIdx] = { name: 'BARRIER', topWire, bottomWire };
    }
    return next;
  }

  if (sourceData.type === 'barrier-end' && (destData.type === 'slot' || destData.type === 'gate-insert')) {
    const { role, topWire, bottomWire, stepIndex: barrStep } = sourceData;
    if (sIdx !== barrStep) return prevCircuit;

    let newTop = topWire;
    let newBottom = bottomWire;
    if (role === 'top') {
      newTop = Math.min(wIdx, bottomWire);
    } else {
      newBottom = Math.max(wIdx, topWire);
    }
    if (newTop === topWire && newBottom === bottomWire) return prevCircuit;

    for (let w = topWire; w <= bottomWire; w++) next[w][barrStep] = null;

    const newSpanWires = Array.from({ length: newBottom - newTop + 1 }, (_, i) => newTop + i);
    insertColumnIfOccupied(next, barrStep, newSpanWires);

    for (let w = newTop; w <= newBottom; w++) {
      next[w][barrStep] = { name: 'BARRIER', topWire: newTop, bottomWire: newBottom };
    }
    return next;
  }

  // 2. Handle Multi-Qubit Node Swaps
  const isCnotSwap =
    sourceData.type === 'cnot-node' &&
    destData.type === 'cnot-node-drop' &&
    destData.wireIndex === sourceData.peerWire &&
    destData.stepIndex === sourceData.stepIndex;

  const isToffoliSwap =
    sourceData.type === 'toffoli-node' &&
    destData.type === 'cnot-node-drop' &&
    (sourceData.controls?.includes(destData.wireIndex) || sourceData.targetWire === destData.wireIndex) &&
    destData.stepIndex === sourceData.stepIndex;

  if (isToffoliSwap) {
    const oldWire = sourceData.wireIndex;
    const swapWire = destData.wireIndex;
    if (isMeasured(oldWire) || isMeasured(swapWire)) return prevCircuit;

    const _tOld  = next[sourceData.wireIndex]?.[sourceData.stepIndex];
    const _tSwap = next[destData.wireIndex]?.[sourceData.stepIndex];

    const step = sourceData.stepIndex;
    const oldRole = _tOld.role;
    const swapRole = _tSwap.role;
    if (oldRole === swapRole) return prevCircuit;

    const controls = [...sourceData.controls];
    let newControls = controls;
    if (oldRole === 'control') newControls = [swapWire, controls.find(c => c !== oldWire)];
    else newControls = [oldWire, controls.find(c => c !== swapWire)];
    const newTarget = oldRole === 'control' ? oldWire : swapWire;

    // Immutable updates to preserve blank structure
    next[oldWire][step]       = { ...next[oldWire][step],       role: swapRole, controls: newControls, targetWire: newTarget };
    next[swapWire][step]      = { ...next[swapWire][step],      role: oldRole,  controls: newControls, targetWire: newTarget };
    next[newControls[0]][step] = { ...next[newControls[0]][step], controls: newControls, targetWire: newTarget };
    next[newControls[1]][step] = { ...next[newControls[1]][step], controls: newControls, targetWire: newTarget };
    next[newTarget][step]     = { ...next[newTarget][step],     controls: newControls, targetWire: newTarget };
    return next;
  }

  if (isCnotSwap) {
    const isClassical = ['FF_X', 'FF_Z'].includes(sourceData.name);
    const oldWire = sourceData.wireIndex;
    const peerWire = sourceData.peerWire;
    const step = sourceData.stepIndex;

    if (sourceData.role === 'control') {
      if (isMeasured(oldWire)) return prevCircuit;
      if (isClassical && !isMeasured(peerWire)) return prevCircuit;
      if (!isClassical && isMeasured(peerWire)) return prevCircuit;
    } else {
      if (isClassical && !isMeasured(oldWire)) return prevCircuit;
      if (!isClassical && isMeasured(oldWire)) return prevCircuit;
      if (isMeasured(peerWire)) return prevCircuit;
    }

    const _cOld  = next[sourceData.wireIndex]?.[sourceData.stepIndex];
    const _cPeer = next[sourceData.peerWire]?.[sourceData.stepIndex];

    if (_cOld?.blank && _cPeer?.blank) {
      // Swap roles within blank structure (immutable, preserves blank:true etc.)
      const { controlWire: _oCW, targetWire: _oTW, ...oldBase } = _cOld;
      const { controlWire: _pCW, targetWire: _pTW, ...peerBase } = _cPeer;
      const newOldRole = _cPeer.role;
      const newPeerRole = _cOld.role;
      next[oldWire][step] = {
        ...oldBase,
        role: newOldRole,
        ...(newOldRole === 'control' ? { targetWire: peerWire } : { controlWire: peerWire }),
      };
      next[peerWire][step] = {
        ...peerBase,
        role: newPeerRole,
        ...(newPeerRole === 'control' ? { targetWire: oldWire } : { controlWire: oldWire }),
      };
      return next;
    }

    next[oldWire][step] = {
      name: sourceData.name,
      role: sourceData.role === 'control' ? 'target' : 'control',
      [sourceData.role === 'control' ? 'controlWire' : 'targetWire']: peerWire,
    };
    next[peerWire][step] = {
      name: sourceData.name,
      role: sourceData.role,
      [sourceData.role === 'control' ? 'targetWire' : 'controlWire']: oldWire,
    };
    return next;
  }

  // 3. Handle Gate Insertion (shifting gates right)
  const isInsert = destData.type === 'gate-insert' || (destData.type === 'cnot-node-drop' && !isCnotSwap);

  if (isInsert) {
    const insertStep = destData.stepIndex;
    const targetWire = destData.wireIndex;

    // Prevent inserting into or before hidden blocks
    if (hiddenBlocks && hiddenBlocks.some(block => insertStep <= block.endStep)) {
      return prevCircuit;
    }

    if (sourceData.type === 'gate') {
      const gateName = sourceData.name;
      const isClassical = ['FF_X', 'FF_Z'].includes(gateName);
      if (TWO_WIRE.includes(gateName)) {
        const tIdx = targetWire < next.length - 1 ? targetWire + 1 : targetWire - 1;
        if (tIdx >= 0 && tIdx < next.length) {
          if (isClassical && !isMeasured(targetWire)) return prevCircuit;
          if (!isClassical && isMeasured(targetWire)) return prevCircuit;
          if (isMeasured(tIdx)) return prevCircuit;
        }
      } else if (gateName === 'TOFFOLI') {
        if (next.length >= 3) {
          const { c2, target: tIdx } = findToffoliWires(targetWire, next.length);
          if (isMeasured(targetWire) || isMeasured(c2) || isMeasured(tIdx)) return prevCircuit;
        }
      }
    } else if (sourceData.type === 'cnot-node') {
      const isClassical = ['FF_X', 'FF_Z'].includes(sourceData.name);
      if (sourceData.role === 'control') {
        if (isClassical && !isMeasured(targetWire)) return prevCircuit;
        if (!isClassical && isMeasured(targetWire)) return prevCircuit;
      } else {
        if (isMeasured(targetWire)) return prevCircuit;
      }
    } else if (sourceData.type === 'toffoli-node') {
      if (isMeasured(targetWire)) return prevCircuit;
    }

    if (sourceData.type === 'placed-gate') {
      next[sourceData.wireIndex][sourceData.stepIndex] = null;
    } else if (sourceData.type === 'cnot-node') {
      next[sourceData.wireIndex][sourceData.stepIndex] = null;
      next[sourceData.peerWire][sourceData.stepIndex] = null;
    } else if (sourceData.type === 'toffoli-node') {
      next[sourceData.controls[0]][sourceData.stepIndex] = null;
      next[sourceData.controls[1]][sourceData.stepIndex] = null;
      next[sourceData.targetWire][sourceData.stepIndex] = null;
    } else if (sourceData.type === 'barrier') {
      for (let w = sourceData.topWire; w <= sourceData.bottomWire; w++) {
        next[w][sourceData.stepIndex] = null;
      }
    }

    next.forEach(wire => wire.splice(insertStep, 0, null));

    if (sourceData.type === 'gate') {
      const gateName = sourceData.name;
      if (TWO_WIRE.includes(gateName)) {
        const tIdx = targetWire < next.length - 1 ? targetWire + 1 : targetWire - 1;
        if (tIdx >= 0 && tIdx < next.length) {
          writeTwoWireGateCells(next, targetWire, tIdx, insertStep, gateName);
        }
      } else if (gateName === 'TOFFOLI') {
        if (next.length >= 3) {
          const { c2, target: tIdx } = findToffoliWires(targetWire, next.length);
          writeToffoliGateCells(next, targetWire, c2, tIdx, insertStep);
        }
      } else if (gateName === 'BLANK') {
        next[targetWire][insertStep] = { blank: true };
      } else if (gateName === 'BARRIER') {
        const numW = next.length;
        for (let w = 0; w < numW; w++) {
          next[w][insertStep] = { name: 'BARRIER', topWire: 0, bottomWire: numW - 1 };
        }
      } else {
        next[targetWire][insertStep] = { name: gateName };
      }
    } else if (sourceData.type === 'placed-gate') {
      next[targetWire][insertStep] = sourceData.name === 'BLANK' ? { blank: true } : { name: sourceData.name };
    } else if (sourceData.type === 'cnot-node') {
      next[targetWire][insertStep] = {
        name: sourceData.name, role: sourceData.role,
        [sourceData.role === 'control' ? 'targetWire' : 'controlWire']: sourceData.peerWire
      };
      next[sourceData.peerWire][insertStep] = {
        name: sourceData.name, role: sourceData.role === 'control' ? 'target' : 'control',
        [sourceData.role === 'control' ? 'controlWire' : 'targetWire']: targetWire
      };
    } else if (sourceData.type === 'toffoli-node') {
      next[sourceData.controls[0]][insertStep] = { name: sourceData.name, role: 'control', controls: sourceData.controls, targetWire: sourceData.targetWire };
      next[sourceData.controls[1]][insertStep] = { name: sourceData.name, role: 'control', controls: sourceData.controls, targetWire: sourceData.targetWire };
      next[sourceData.targetWire][insertStep] = { name: sourceData.name, role: 'target', controls: sourceData.controls, targetWire: sourceData.targetWire };
    } else if (sourceData.type === 'barrier') {
      const { topWire, bottomWire } = sourceData;
      for (let w = topWire; w <= bottomWire; w++) {
        next[w][insertStep] = { name: 'BARRIER', topWire, bottomWire };
      }
   }
    return next;
  }

  // 4. Handle dropping onto an empty slot
  if (destData.type === 'slot') {
    if (sourceData.type === 'gate') {
      const gateName = sourceData.name;
      const isClassical = ['FF_X', 'FF_Z'].includes(gateName);
      if (TWO_WIRE.includes(gateName)) {
        const tIdx = wIdx < next.length - 1 ? wIdx + 1 : wIdx - 1;
        if (tIdx >= 0 && tIdx < next.length && !isOccupied(wIdx, sIdx) && !isOccupied(tIdx, sIdx)) {
          if (isClassical && !isMeasured(wIdx)) return prevCircuit;
          if (!isClassical && isMeasured(wIdx)) return prevCircuit;
          if (isMeasured(tIdx)) return prevCircuit;

          writeTwoWireGateCells(next, wIdx, tIdx, sIdx, gateName);
          return next;
        }
      } else if (gateName === 'TOFFOLI') {
        if (next.length >= 3) {
          const { c2, target: tIdx } = findToffoliWires(wIdx, next.length);
          if (!isOccupied(wIdx, sIdx) && !isOccupied(c2, sIdx) && !isOccupied(tIdx, sIdx)) {
            if (isMeasured(wIdx) || isMeasured(c2) || isMeasured(tIdx)) return prevCircuit;
            writeToffoliGateCells(next, wIdx, c2, tIdx, sIdx);
            return next;
          }
        }
      } else if (gateName === 'BLANK') {
        if (!isOccupied(wIdx, sIdx)) {
          next[wIdx][sIdx] = { blank: true };
          return next;
        }
      } else if (gateName !== 'BARRIER') {
        if (!isOccupied(wIdx, sIdx)) {
          next[wIdx][sIdx] = { name: gateName };
          return next;
        }
      }
      return prevCircuit;
    }

    if (sourceData.type === 'placed-gate') {
      if (!isOccupied(wIdx, sIdx)) {
        next[sourceData.wireIndex][sourceData.stepIndex] = null;
        next[wIdx][sIdx] = sourceData.name === 'BLANK' ? { blank: true } : { name: sourceData.name };
        return next;
      }
      return prevCircuit;
    }

    if (sourceData.type === 'cnot-node') {
      const { wireIndex: oldW, stepIndex: oldS, name, role, peerWire } = sourceData;
      const isClassical = ['FF_X', 'FF_Z'].includes(name);
      if (sIdx === oldS && !isOccupied(wIdx, sIdx) && wIdx !== peerWire) {
        if (role === 'control') {
          if (isClassical && !isMeasured(wIdx)) return prevCircuit;
          if (!isClassical && isMeasured(wIdx)) return prevCircuit;
        } else {
          if (isMeasured(wIdx)) return prevCircuit;
        }

        next[oldW][oldS] = null;
        next[wIdx][sIdx] = { name, role, [role === 'control' ? 'targetWire' : 'controlWire']: peerWire };
        next[peerWire][sIdx][role === 'control' ? 'controlWire' : 'targetWire'] = wIdx;
        return next;
      }
      return prevCircuit;
    }

    if (sourceData.type === 'toffoli-node') {
      const { wireIndex: oldW, stepIndex: oldS, name, role, controls, targetWire } = sourceData;
      if (sIdx === oldS && !isOccupied(wIdx, sIdx)) {
        if (isMeasured(wIdx)) return prevCircuit;
        if (role === 'control' && wIdx !== targetWire && wIdx !== controls.find(c => c !== oldW)) {
          next[oldW][oldS] = null;
          const otherC = controls.find(c => c !== oldW);
          const newControls = [wIdx, otherC];
          next[wIdx][sIdx] = { name, role, controls: newControls, targetWire };
          next[otherC][sIdx].controls = newControls;
          next[targetWire][sIdx].controls = newControls;
          return next;
        } else if (role === 'target' && !controls.includes(wIdx)) {
          next[oldW][oldS] = null;
          next[wIdx][sIdx] = { name, role, controls, targetWire: wIdx };
          next[controls[0]][sIdx].targetWire = wIdx;
          next[controls[1]][sIdx].targetWire = wIdx;
          return next;
        }
      }
      return prevCircuit;
    }
  }

  return prevCircuit;
}

/**
 * Removes an entire wire (qubit row) from a circuit grid.
 * Handles TWO_WIRE, TOFFOLI, BARRIER, and blank multi-qubit gates (BLANK_2, BLANK_3):
 *  - Any gate whose peer/target/control is the removed wire is nulled out.
 *  - Wire indices above the removed wire are decremented by 1.
 */
export function removeWireFromGrid(circuit, wireIndex) {
  // Step 1: For every occupied cell on the removed wire, use the same delete
  // logic as the × button — this nulls out partner cells on surviving wires.
  let cleaned = circuit.map(w => [...w]);
  const nSteps = cleaned[0]?.length ?? 0;
  for (let s = 0; s < nSteps; s++) {
    if (cleaned[wireIndex]?.[s]) {
      cleaned = removeGateFromCircuit(cleaned, wireIndex, s);
    }
  }

  // Step 2: Drop the wire row.
  cleaned = cleaned.filter((_, i) => i !== wireIndex);

  // Step 3: Remap partner-wire indices in any surviving multi-qubit cells
  // whose peers were above the removed wire (indices shift down by 1).
  return cleaned.map(wire => wire.map(cell => {
    if (!cell) return cell;
    if (TWO_WIRE.includes(cell.name) || (cell.blank && cell.name === 'BLANK_2')) {
      const pk = cell.role === 'control' ? 'targetWire' : 'controlWire';
      const peer = cell[pk];
      return peer > wireIndex ? { ...cell, [pk]: peer - 1 } : cell;
    }
    if (cell.name === 'TOFFOLI' || (cell.blank && cell.name === 'BLANK_3')) {
      return {
        ...cell,
        controls: cell.controls.map(c => c > wireIndex ? c - 1 : c),
        targetWire: cell.targetWire > wireIndex ? cell.targetWire - 1 : cell.targetWire,
      };
    }
    if (cell.name === 'BARRIER') {
      const newTop    = cell.topWire    > wireIndex ? cell.topWire    - 1 : cell.topWire;
      const newBottom = cell.bottomWire > wireIndex ? cell.bottomWire - 1 : cell.bottomWire;
      return newTop > newBottom ? null : { ...cell, topWire: newTop, bottomWire: newBottom };
    }
    return cell;
  }));
}

/**
 * Safely removes a gate from a circuit grid, handling multi-qubit bounds.
 * Blanks are treated identically to their gate equivalents:
 *   BLANK_2 → same as CNOT/CZ (null both cells)
 *   BLANK_3 → same as TOFFOLI  (null all three cells)
 *   BLANK   → null the single cell
 * NOTE: QuestionsPage.deleteGate intercepts blanks *before* calling this in
 * order to preserve the "clear fill only" quiz behaviour.
 */
export function removeGateFromCircuit(circuit, wireIndex, stepIndex) {
  const next = circuit.map(w => [...w]);
  const cell = next[wireIndex]?.[stepIndex];
  if (!cell || cell.locked) return next;

  if (cell.blank) {
    if (cell.name === 'BLANK_2') {
      const peerWire = cell.role === 'control' ? cell.targetWire : cell.controlWire;
      next[wireIndex][stepIndex] = null;
      if (next[peerWire]) next[peerWire][stepIndex] = null;
    } else if (cell.name === 'BLANK_3') {
      next[cell.controls[0]][stepIndex] = null;
      next[cell.controls[1]][stepIndex] = null;
      next[cell.targetWire][stepIndex] = null;
    } else {
      next[wireIndex][stepIndex] = null;
    }
    return next;
  }

  if (TWO_WIRE.includes(cell.name)) {
    const peerWire = cell.role === 'control' ? cell.targetWire : cell.controlWire;
    next[wireIndex][stepIndex] = null;
    if (next[peerWire]) next[peerWire][stepIndex] = null;
  } else if (cell.name === 'TOFFOLI') {
    next[cell.controls[0]][stepIndex] = null;
    next[cell.controls[1]][stepIndex] = null;
    next[cell.targetWire][stepIndex] = null;
  } else if (cell.name === 'BARRIER') {
    for (let w = cell.topWire; w <= cell.bottomWire; w++) {
      if (next[w]) next[w][stepIndex] = null;
    }
  } else {
    next[wireIndex][stepIndex] = null;
  }

  return next;
}