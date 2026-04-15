/**
 * QuestionBuilderPage — visual tool for teachers to create quiz questions.
 *
 * Workflow:
 *  1. Create/edit questions using the form (no coding required).
 *  2. Click "Save JSON backup" to preserve your work for re-loading later.
 *  3. Click "Export questionData.js" to download the file — drop it into
 *     quantum_ui/src/questions/ to replace the question bank.
 */
import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { draggable, dropTargetForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { monitorForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import GateVisual from '../components/GateVisual';
import { GATE_STYLES } from '../constants';
import { applyGateDrop, TWO_WIRE, removeGateFromCircuit, removeWireFromGrid } from '../utils/circuitDnD';
import DraggableCnotNode from '../components/DraggableCnotNode';
import DraggablePlacedGate from '../components/DraggablePlacedGate';
import DropZone from '../components/DropZone';
import CircuitCell from '../components/CircuitCell';
import { encodeStudentPackage } from '../utils/questionPackage';

// ─── Constants ────────────────────────────────────────────────────────────────

const SINGLE_GATES   = ['H', 'X', 'Y', 'Z', 'T', 'MEASURE'];
const ALL_PALETTE_GATES = ['H', 'X', 'Y', 'Z', 'T', 'MEASURE', 'CNOT', 'CZ', 'TOFFOLI'];

// Row height = h-14 (56 px) + gap-2 (8 px) = 64 px = 4 rem  (center-to-center)
const ROW_REM = 4;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeGrid(nWires, nSteps) {
  return Array.from({ length: nWires }, () => Array(nSteps).fill(null));
}

let _nextId = 1;
function newQuestion() {
  const id = _nextId++;
  return {
    id,
    title: '', description: '', points: 10,
    restrictToBlanks: true,
    allowedGates: ['H', 'X', 'Y', 'Z'],
    nQubits: 1, nSteps: 3,
    circuit: makeGrid(1, 3),
    exactAnswer: {},           // 'w_s' → gateName
    answerNQubits: 1, answerNSteps: 1,
    answerCircuit: makeGrid(1, 1),
    hiddenBlocks: [],
  };
}

function download(filename, content) {
  const el = document.createElement('a');
  el.href = URL.createObjectURL(new Blob([content], { type: 'text/plain' }));
  el.download = filename;
  el.click();
}

// ─── Serialization ────────────────────────────────────────────────────────────
// Internal cell format mirrors the output format exactly; we just add locked:true.

function serializeCell(cell) {
  if (!cell) return null;
  if (cell.blank) {
    if (cell.name === 'BLANK_2' || cell.name === 'BLANK_3') return { ...cell, locked: true };
    return { blank: true, name: 'BLANK' };
  }
  return { ...cell, locked: true };
}

function compactGridData(grid, exactAnswer = null, hiddenBlocks = null) {
  const nWires = grid.length;
  if (nWires === 0) return { newGrid: grid, newExactAnswer: exactAnswer, newHiddenBlocks: hiddenBlocks };
  const nSteps = grid[0].length;

  const colsToKeep = [];
  for (let s = 0; s < nSteps; s++) {
    let isEmpty = true;
    for (let w = 0; w < nWires; w++) {
      if (grid[w][s] !== null) {
        isEmpty = false;
        break;
      }
    }
    if (!isEmpty) colsToKeep.push(s);
  }

  const newGrid = Array.from({ length: nWires }, () => []);
  const oldToNewStep = {};

  for (let newS = 0; newS < colsToKeep.length; newS++) {
    const oldS = colsToKeep[newS];
    oldToNewStep[oldS] = newS;
    for (let w = 0; w < nWires; w++) {
      newGrid[w].push(grid[w][oldS]);
    }
  }

  let newExactAnswer = exactAnswer;
  if (exactAnswer) {
    newExactAnswer = {};
    for (const [key, gate] of Object.entries(exactAnswer)) {
      const [wStr, sStr] = key.split('_');
      const w = Number(wStr);
      const s = Number(sStr);
      if (oldToNewStep[s] !== undefined) {
        if (newGrid[w][oldToNewStep[s]]?.blank) {
          newExactAnswer[`${w}_${oldToNewStep[s]}`] = gate;
        }
      }
    }
  }

  let newHiddenBlocks = hiddenBlocks;
  if (hiddenBlocks && hiddenBlocks.length > 0) {
    newHiddenBlocks = hiddenBlocks.map(block => {
      let newStart = newGrid[0].length;
      for (let s = block.startStep; s < nSteps; s++) {
        if (oldToNewStep[s] !== undefined) {
          newStart = oldToNewStep[s];
          break;
        }
      }
      let newEnd = -1;
      for (let s = block.endStep; s >= 0; s--) {
        if (oldToNewStep[s] !== undefined) {
          newEnd = oldToNewStep[s];
          break;
        }
      }
      if (newStart > newEnd) {
        newStart = newEnd = Math.max(0, newEnd);
      }
      return { ...block, startStep: newStart, endStep: newEnd };
    });
  }

  return { newGrid, newExactAnswer, newHiddenBlocks };
}

function serializeAnswerCircuit(circuit) {
  const answer = [];
  circuit.forEach((wire, wi) => {
    wire.forEach((cell, si) => {
      if (!cell || cell.blank) return;
      const item = { wireIndex: wi, stepIndex: si, gate: cell.name };
      if (cell.role) {
        item.role = cell.role;
        if (cell.role === 'control') {
          item.targetWire = cell.targetWire;
          if (cell.controls) item.controls = cell.controls;
        } else {
          if (cell.controlWire != null) item.controlWire = cell.controlWire;
          if (cell.controls)            item.controls     = cell.controls;
          if (cell.targetWire != null)  item.targetWire   = cell.targetWire;
        }
      }
      answer.push(item);
    });
  });
  return answer;
}

function serializeQuestion(q, id) {
  let lastOcc = -1;
  q.circuit.forEach(wire => {
    for (let s = wire.length - 1; s >= 0; s--) {
      if (wire[s] !== null) {
        if (s > lastOcc) lastOcc = s;
        break;
      }
    }
  });
  const trimSteps = Math.max(0, lastOcc + 1);
  const circuit = q.circuit.map(wire => wire.slice(0, trimSteps).map(serializeCell));

  const out = {
    id, title: q.title || `Question ${id}`,
    description: q.description, points: q.points,
    allowedGates: q.allowedGates, circuit,
  };
  if (q.restrictToBlanks) out.restrictToBlanks = true;
  if (q.evaluationType) out.evaluationType = q.evaluationType;
  if (q.targetState) out.targetState = q.targetState;

  if (!q.restrictToBlanks) {
    out.answer = serializeAnswerCircuit(q.answerCircuit);
  } else {
    out.answer = Object.entries(q.exactAnswer)
      .filter(([, gate]) => gate)
      .map(([key, gate]) => { const [w, s] = key.split('_').map(Number); return { wireIndex: w, stepIndex: s, gate }; })
      .sort((a, b) => a.wireIndex - b.wireIndex || a.stepIndex - b.stepIndex);
  }
  if (q.hiddenBlocks?.length > 0) out.hiddenBlocks = q.hiddenBlocks;
  return out;
}

function generateQuizPackage(questions, meta = {}) {
  const serialized = questions.map((q, i) => serializeQuestion(q, i + 1));
  return encodeStudentPackage(serialized, meta);
}

// ─── Toggle ───────────────────────────────────────────────────────────────────

function Toggle({ value, onChange, label }) {
  return (
    <label className="flex items-center gap-2.5 cursor-pointer select-none">
      <div onClick={() => onChange(!value)} className="relative w-9 h-5 rounded-full transition-colors"
        style={{ background: value ? '#3b82f6' : '#475569' }}>
        <div className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform"
          style={{ transform: value ? 'translateX(1.25rem)' : 'translateX(0.125rem)' }} />
      </div>
      <span className="text-sm text-slate-300">{label}</span>
    </label>
  );
}

// ─── BuilderPaletteGate ───────────────────────────────────────────────────────
// Draggable gate tile in the palette.  Uses type:'builder-gate' to avoid
// conflicting with the main App's 'gate' drag type.

function BuilderPaletteGate({ gateName }) {
  const ref = useRef(null);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    if (!ref.current) return;
    return draggable({
      element: ref.current,
      getInitialData: () => ({ type: 'gate', name: gateName }),
      onDragStart: () => setIsDragging(true),
      onDrop:      () => setIsDragging(false),
    });
  }, [gateName]);

  if (gateName.startsWith('BLANK')) {
    let label = 'blank';
    let widthCls = 'w-12';
    if (gateName === 'BLANK_2') { label = '2-q blank'; widthCls = 'w-16'; }
    if (gateName === 'BLANK_3') { label = '3-q blank'; widthCls = 'w-20'; }

    return (
      <div ref={ref} title={`${label} (student fills)`}
        className={`${widthCls} h-12 border-2 border-dashed rounded-lg cursor-grab flex flex-col items-center justify-center gap-0.5 select-none transition-opacity
          ${isDragging ? 'opacity-40' : 'border-slate-400 hover:border-blue-400 text-slate-500 hover:text-blue-400'}`}>
        <span className="text-lg font-mono leading-none">?</span>
        <span className="text-[9px] leading-none text-center leading-tight">{label}</span>
      </div>
    );
  }

  const isMulti = TWO_WIRE.includes(gateName) || gateName === 'TOFFOLI' || gateName === 'BARRIER';

  if (isMulti) {
    return (
      <div ref={ref} title={gateName}
        className={`p-2 cursor-grab flex items-center justify-center font-bold select-none transition-opacity ${GATE_STYLES[gateName] || 'text-slate-300'} ${isDragging ? 'opacity-40' : 'hover:brightness-125 hover:shadow-md'}`}>
        <GateVisual name={gateName} />
      </div>
    );
  }

  return (
    <div ref={ref} title={gateName}
      className={`w-12 h-12 text-sm border rounded-lg cursor-grab flex items-center justify-center font-bold select-none transition-opacity
        ${GATE_STYLES[gateName] ?? 'bg-slate-600/30 border-slate-500 text-slate-300'}
        ${isDragging ? 'opacity-40' : 'hover:brightness-125 hover:shadow-md'}`}>
      <GateVisual name={gateName} />
    </div>
  );
}

// ─── DraggableBlankSlot ───────────────────────────────────────────────────────
function DraggableBlankSlot({ wireIndex, stepIndex, onDelete, handleRightClickDelete }) {
  const ref = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isInsertHovered, setIsInsertHovered] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const cleanupDrag = draggable({
      element: el,
      getInitialData: () => ({ type: 'placed-gate', name: 'BLANK', wireIndex, stepIndex }),
      onDragStart: () => setIsDragging(true),
      onDrop:      () => setIsDragging(false),
    });
    const cleanupDrop = dropTargetForElements({
      element: el,
      getData: () => ({ type: 'gate-insert', wireIndex, stepIndex }),
      onDragEnter: () => setIsInsertHovered(true),
      onDragLeave: () => setIsInsertHovered(false),
      onDrop:      () => setIsInsertHovered(false),
    });
    return () => { cleanupDrag(); cleanupDrop(); };
  }, [wireIndex, stepIndex]);

  const gateClasses = `w-full h-full border-2 border-dashed rounded flex flex-col items-center justify-center gap-0.5 select-none cursor-grab transition-all z-20
    ${isDragging ? 'opacity-50' : 'border-slate-500 bg-slate-800/30 hover:border-slate-400'}
    ${isInsertHovered ? 'border-l-4 border-l-blue-400 scale-105 shadow-blue-500/50' : ''}`;

  return (
    <div className="relative w-full h-full" onMouseEnter={() => setIsHovered(true)} onMouseLeave={() => setIsHovered(false)}>
      <div ref={ref} className={gateClasses} onContextMenu={(e) => handleRightClickDelete(e, wireIndex, stepIndex)} title="Drag to move">
        <span className="text-xl font-mono text-slate-600 select-none">?</span>
      </div>
      {isHovered && !isDragging && (
        <button onClick={(e) => { e.stopPropagation(); onDelete(); }} className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-slate-600 text-slate-200 hover:bg-red-500 hover:text-white text-[10px] flex items-center justify-center z-30 leading-none transition-colors" title="Delete blank">×</button>
      )}
    </div>
  );
}

// ─── BuilderCircuitGrid ───────────────────────────────────────────────────────
// Full drag-and-drop circuit grid: palette + wires + drop cells.
//
// DnD types used (namespaced with 'builder-' to avoid conflicts with App.jsx):
//   source  builder-gate      → palette gate dragged onto a cell
//   source  builder-cnot-node → placed multi-qubit node dragged to new wire
//   target  builder-slot      → any empty or occupied cell
//
// Gate placement mirrors App.jsx:
//   CNOT/CZ   → control at dropped wire, target at wire±1
//   TOFFOLI   → controls at w, w+1 (or w-1), target at w+2 (or first free)
//   single    → placed directly
//   BLANK     → blank slot (shown only when showBlanks=true)

function BuilderCircuitGrid({
  gridId, nQubits, nSteps, circuit,
  onCellsChange,
  onAddWire, onRemoveWire, onAddStep, onRemoveStep,
  showBlanks, paletteGates,
  readOnly = false,
  hideWireLabels = false,
  stepOffset = 0,
  hideControls = false
}) {
  function removeCell(w, s) {
    if (readOnly) return;
    onCellsChange(prev => removeGateFromCircuit(prev, w, s));
  }

  useEffect(() => {
    if (readOnly) return;
    return monitorForElements({
      onDrop({ source, location }) {
        const [dest] = location.current.dropTargets;
        if (!dest) return;

        const destGrid = dest.element.closest('[data-grid-id]');
        if (destGrid?.getAttribute('data-grid-id') !== gridId) return;

        const srcGrid = source.element.closest('[data-grid-id]');
        if (srcGrid && srcGrid?.getAttribute('data-grid-id') !== gridId) return;

        onCellsChange(prevCircuit => {
          let proxyName = source.data.name;
          const isBlank1 = proxyName === 'BLANK';
          const isBlank2 = proxyName === 'BLANK_2';
          const isBlank3 = proxyName === 'BLANK_3';
          
          if (isBlank1) proxyName = 'H';
          if (isBlank2) proxyName = 'CNOT';
          if (isBlank3) proxyName = 'TOFFOLI';

          const res = applyGateDrop(prevCircuit, { ...source.data, name: proxyName }, dest.data);
          
          if (isBlank1 || isBlank2 || isBlank3) {
            return res.map(wire => wire.map(c => {
              if (c && c.name === proxyName && !prevCircuit.some(pw => pw.includes(c))) {
                if (isBlank1) return { blank: true, name: 'BLANK' };
                return { ...c, name: source.data.name, blank: true };
              }
              return c;
            }));
          }
          return res;
        });
      },
    });
  }, [gridId, nQubits, onCellsChange]);

  const btnCls = 'w-6 h-6 rounded bg-slate-700 hover:bg-slate-600 text-slate-200 flex items-center justify-center text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed';

  return (
    <div data-grid-id={gridId} className={readOnly ? 'opacity-70 pointer-events-none select-none' : ''}>
      {/* ── Gate palette ─────────────────────────────────────────────────── */}
      {!readOnly && !hideControls && (
        <div className="flex gap-2 flex-wrap items-end mb-4 p-3 bg-slate-900/50 rounded-lg border border-slate-700/40">
          <span className="text-[10px] text-slate-500 uppercase tracking-widest self-center mr-1">Palette</span>
          {showBlanks && (
            <>
              <BuilderPaletteGate gateName="BLANK" />
              <BuilderPaletteGate gateName="BLANK_2" />
              <BuilderPaletteGate gateName="BLANK_3" />
            </>
          )}
          {paletteGates.map(g => <BuilderPaletteGate key={g} gateName={g} />)}
        </div>
      )}

      {/* ── Grid controls ─────────────────────────────────────────────────── */}
      {!readOnly && !hideControls && (
        <div className="flex gap-3 mb-4 items-center flex-wrap text-xs text-slate-400">
          <span>Qubits:</span>
          {onRemoveWire && <button onClick={onRemoveWire} disabled={nQubits <= 1}  className={btnCls}>−</button>}
          <span className="text-slate-200 w-4 text-center font-medium">{nQubits}</span>
          {onAddWire && <button onClick={onAddWire}    disabled={nQubits >= 10} className={btnCls}>+</button>}
          <span className={onAddWire ? "ml-4" : "ml-2"}>Steps:</span>
          {onRemoveStep && <button onClick={onRemoveStep} disabled={nSteps <= 0}   className={btnCls}>−</button>}
          <span className="text-slate-200 w-4 text-center font-medium">{nSteps}</span>
          {onAddStep && <button onClick={onAddStep}    disabled={nSteps >= 20}  className={btnCls}>+</button>}
        </div>
      )}

      {/* ── Circuit grid ─────────────────────────────────────────────────── */}
      <div className="overflow-x-auto pb-2">
        {/* Step labels */}
        <div className={`flex mb-1 ${hideWireLabels ? 'ml-1' : 'ml-14'}`}>
          {Array.from({ length: nSteps }, (_, s) => (
            <div key={s} className="w-14 text-center text-[10px] text-slate-600 mr-2">Step {s + stepOffset}</div>
          ))}
        </div>

        {/* Wire rows */}
        <div className="flex flex-col gap-2 mt-2">
          {Array.from({ length: nQubits }, (_, w) => (
            <div key={w} className="flex items-center">
              {!hideWireLabels && (
                <div className="w-12 shrink-0 text-xs text-slate-500 text-right pr-2 font-mono">q[{w}]</div>
              )}

              <div className={`relative flex items-center py-2 ${hideWireLabels ? 'pr-1' : 'px-1'}`}>
                {/* Horizontal wire line */}
                <div className="absolute left-0 right-0 h-px bg-slate-600 z-0" />

                {/* Cells */}
                {Array.from({ length: nSteps }, (_, s) => (
                  <div key={s} className="w-14 h-14 relative flex items-center justify-center mx-1 z-10">
                    <CircuitCell
                      cell={circuit[w]?.[s] ?? null}
                      wireIndex={w} stepIndex={s}
                      onDelete={(w, s) => removeCell(w, s)}
                      customRenderer={(cell, cw, cs) => {
                        if (readOnly && cell && cell.blank) {
                          return (
                            <div className="w-full h-full border-2 border-dashed border-slate-500 bg-slate-800/30 rounded flex items-center justify-center opacity-40">
                              <span className="text-xl font-mono text-slate-600">?</span>
                            </div>
                          );
                        }
                        if (!readOnly && cell && cell.blank && (!cell.name || cell.name === 'BLANK')) {
                          return <DraggableBlankSlot
                            wireIndex={cw} stepIndex={cs}
                            handleRightClickDelete={(e, w2, s2) => { e.preventDefault(); removeCell(w2, s2); }}
                            onDelete={() => removeCell(cw, cs)}
                          />;
                        }
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── QuestionEditor ───────────────────────────────────────────────────────────

function QuestionEditor({ question: q, onChange }) {
  const btnCls = 'w-6 h-6 rounded bg-slate-700 hover:bg-slate-600 text-slate-200 flex items-center justify-center text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed';

  function update(patch) { onChange({ ...q, ...patch }); }

  function handleCircuitChange(updater) {
    const prevGrid = q.circuit;
    const newCircuitRaw = typeof updater === 'function' ? updater(prevGrid) : updater;
    if (newCircuitRaw === prevGrid) return;
    
    const { newGrid, newExactAnswer, newHiddenBlocks } = compactGridData(newCircuitRaw, q.exactAnswer, q.hiddenBlocks);
    
    update({ circuit: newGrid, nSteps: newGrid[0].length, exactAnswer: newExactAnswer, hiddenBlocks: newHiddenBlocks });
  }

  function handleAnswerChange(updater) {
    const prevGrid = q.answerCircuit;
    const newCircuitRaw = typeof updater === 'function' ? updater(prevGrid) : updater;
    if (newCircuitRaw === prevGrid) return;
    
    const { newGrid } = compactGridData(newCircuitRaw);
    update({ answerCircuit: newGrid, answerNSteps: newGrid[0].length });
  }

  // ── Wire / step resize ────────────────────────────────────────────────────

  function addWire() {
    const nextNQubits = q.nQubits + 1;
    const nextAnswerCircuit = [...q.answerCircuit];
    while (nextAnswerCircuit.length < nextNQubits) {
      nextAnswerCircuit.push(Array(q.answerNSteps).fill(null));
    }
    update({
      nQubits: nextNQubits,
      circuit: [...q.circuit, Array(q.nSteps).fill(null)],
      answerNQubits: nextNQubits,
      answerCircuit: nextAnswerCircuit,
    });
  }
  function removeWire() {
    if (q.nQubits <= 1) return;
    const d = q.nQubits - 1; // index of last wire to remove
    const newCircuit = removeWireFromGrid(q.circuit, d);
    const newAnswerCircuit = removeWireFromGrid(q.answerCircuit, d);
    const newExact = Object.fromEntries(
      Object.entries(q.exactAnswer).filter(([k]) => Number(k.split('_')[0]) < d)
    );
    update({
      nQubits: d, circuit: newCircuit, exactAnswer: newExact,
      answerNQubits: d, answerCircuit: newAnswerCircuit,
    });
  }
  function addStep()    { update({ nSteps: q.nSteps + 1, circuit: q.circuit.map(w => [...w, null]) }); }
  function removeStep() {
    if (q.nSteps <= 0) return;
    const last = q.nSteps - 1;
    const newExact = Object.fromEntries(
      Object.entries(q.exactAnswer).filter(([k]) => Number(k.split('_')[1]) < last)
    );
    update({ nSteps: last, circuit: q.circuit.map(w => w.slice(0, last)), exactAnswer: newExact });
  }
  function addAnswerStep()    { update({ answerNSteps: q.answerNSteps + 1, answerCircuit: q.answerCircuit.map(w => [...w, null]) }); }
  function removeAnswerStep() {
    if (q.answerNSteps <= 0) return;
    update({ answerNSteps: q.answerNSteps - 1, answerCircuit: q.answerCircuit.map(w => w.slice(0, -1)) });
  }

  // ── Blank positions (exact answer section) ────────────────────────────────
  const blanks = [];
  q.circuit.forEach((wire, wi) =>
    wire.forEach((cell, si) => { 
      if (cell?.blank) {
        if (!cell.name || cell.name === 'BLANK') blanks.push({ wi, si, type: 'single', cell });
        else if (cell.role === 'control') {
          if (cell.name === 'BLANK_3' && cell.controls && cell.controls[0] !== wi) return;
          blanks.push({ wi, si, type: cell.name, cell });
        }
      }
    })
  );

  function swapBlank2(w, s) {
    const newCircuit = q.circuit.map(wire => [...wire]);
    const cell = newCircuit[w][s];
    const peer = cell.targetWire;
    newCircuit[w][s] = { ...cell, role: 'target', controlWire: peer, targetWire: undefined };
    newCircuit[peer][s] = { ...newCircuit[peer][s], role: 'control', targetWire: w, controlWire: undefined };
    update({ circuit: newCircuit });
  }
  function rotateBlank3(w, s) {
    const newCircuit = q.circuit.map(wire => [...wire]);
    const cell = newCircuit[w][s];
    const newT = cell.controls[0];
    const newC = [cell.targetWire, cell.controls[1]].sort((a,b) => a - b);
    newCircuit[newT][s] = { ...newCircuit[newT][s], role: 'target', controls: newC, targetWire: newT };
    newCircuit[newC[0]][s] = { ...newCircuit[newC[0]][s], role: 'control', controls: newC, targetWire: newT };
    newCircuit[newC[1]][s] = { ...newCircuit[newC[1]][s], role: 'control', controls: newC, targetWire: newT };
    update({ circuit: newCircuit });
  }

  function toggleGate(gate) {
    update({ allowedGates: q.allowedGates.includes(gate) ? q.allowedGates.filter(g => g !== gate) : [...q.allowedGates, gate] });
  }

  const sectionCls = 'bg-slate-800 rounded-xl p-5 space-y-4 border border-slate-700/50';
  const labelCls   = 'block text-xs font-medium text-slate-400 mb-1';
  const inputCls   = 'w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-slate-100 text-sm placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500';

  // Answer palette = only the gates the student is allowed to use
  const answerPalette = ALL_PALETTE_GATES.filter(g => q.allowedGates.includes(g));

  return (
    <div className="space-y-5 max-w-3xl">

      {/* ── Basic Info ─────────────────────────────────────────────────────── */}
      <section className={sectionCls}>
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Basic Info</h3>
        <div>
          <label className={labelCls}>Title</label>
          <input type="text" value={q.title} onChange={e => update({ title: e.target.value })}
            placeholder="e.g. Create an X Gate" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Description</label>
          <textarea value={q.description} onChange={e => update({ description: e.target.value })}
            rows={3} placeholder="Explain what the student needs to do..."
            className={inputCls + ' resize-none'} />
        </div>
        <div className="flex gap-6 items-end flex-wrap">
          <div>
            <label className={labelCls}>Points</label>
            <input type="number" min={1} value={q.points} onChange={e => update({ points: Number(e.target.value) })}
              className="w-24 bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-slate-100 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
          </div>
          <div className="pb-0.5 flex flex-col gap-1">
            <Toggle value={q.restrictToBlanks} onChange={v => update({ restrictToBlanks: v })}
              label="Restrict student to blank slots only" />
            <span className="text-[10px] text-slate-500 pl-11">
              {q.restrictToBlanks ? 'Exact match evaluation mode' : 'Equivalent state evaluation mode'}
            </span>
          </div>
        </div>
      </section>

      {/* ── Allowed Gates ──────────────────────────────────────────────────── */}
      <section className={sectionCls}>
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest">
          Allowed Gates&ensp;<span className="text-slate-500 normal-case font-normal">(shown in the student palette)</span>
        </h3>
        <div className="flex flex-wrap gap-2">
          {ALL_PALETTE_GATES.map(gate => (
            <button key={gate} onClick={() => toggleGate(gate)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors
                ${q.allowedGates.includes(gate)
                  ? 'bg-blue-500/20 border-blue-400/60 text-blue-300'
                  : 'bg-slate-700/50 border-slate-600 text-slate-400 hover:border-slate-400 hover:text-slate-300'}`}>
              {gate}
            </button>
          ))}
        </div>
        {q.allowedGates.length === 0 && (
          <p className="text-xs text-amber-400">No gates selected — students won't have anything to place.</p>
        )}
      </section>

      {/* ── Given Circuit ──────────────────────────────────────────────────── */}
      <section className={sectionCls}>
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Given Circuit</h3>
        <p className="text-xs text-slate-400">
          Drag gates onto the grid. Multi-qubit gates auto-place on adjacent wires — drag the nodes to reposition.
          Use <span className="font-medium text-slate-300">Blank</span> for slots the student must fill. 
          If you do not want to provide a circuit, set steps = 0. Ensure you do not have blank steps.
        </p>
        <BuilderCircuitGrid
          gridId={`given_${q.id}`}
          nQubits={q.nQubits} nSteps={q.nSteps} circuit={q.circuit}
          onCellsChange={handleCircuitChange}
          onAddWire={addWire} onRemoveWire={removeWire}
          onAddStep={addStep} onRemoveStep={removeStep}
          showBlanks={q.restrictToBlanks} paletteGates={ALL_PALETTE_GATES}
        />
      </section>

      {/* ── Answer / Solution ──────────────────────────────────────────────── */}
      <section className={sectionCls}>
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Answer / Solution</h3>

        {q.restrictToBlanks && (
          <>
            <p className="text-xs text-slate-400">
              For each blank slot in the given circuit, pick the correct gate.
            </p>
            {blanks.length === 0 ? (
              <p className="text-xs text-slate-500 italic">No blanks yet — add Blank tiles to the given circuit above.</p>
            ) : (
              <div className="space-y-2">
                {blanks.map(({ wi, si, type, cell }) => {
                  let options = [];
                  if (type === 'single') options = q.allowedGates.filter(g => SINGLE_GATES.includes(g));
                  if (type === 'BLANK_2') options = q.allowedGates.filter(g => TWO_WIRE.includes(g));
                  if (type === 'BLANK_3') options = q.allowedGates.filter(g => g === 'TOFFOLI');
                  
                  let label = `Qubit ${wi} · Step ${si}`;
                  if (type === 'BLANK_2') label = `Control: ${wi}, Target: ${cell.targetWire} · Step ${si}`;
                  if (type === 'BLANK_3') label = `Controls: ${cell.controls[0]}, ${cell.controls[1]}, Target: ${cell.targetWire} · Step ${si}`;

                  return (
                    <div key={`${wi}_${si}`} className="flex items-center gap-3 p-3 bg-slate-700/60 rounded-lg border border-slate-600/50">
                      <span className="text-xs text-slate-300 w-48 shrink-0">{label}</span>
                    <span className="text-xs text-slate-500">correct gate →</span>
                    <select
                      value={q.exactAnswer[`${wi}_${si}`] || ''}
                      onChange={e => update({ exactAnswer: { ...q.exactAnswer, [`${wi}_${si}`]: e.target.value } })}
                      className="text-xs bg-slate-800 border border-slate-600 rounded-lg px-2 py-1.5 text-slate-200">
                      <option value="">— leave blank —</option>
                        {options.map(g => <option key={g} value={g}>{g}</option>)}
                    </select>
                      {type === 'BLANK_2' && <button onClick={() => swapBlank2(wi, si)} className="ml-auto text-[10px] bg-slate-600 hover:bg-slate-500 px-2 py-1 rounded">Swap Control/Target</button>}
                      {type === 'BLANK_3' && <button onClick={() => rotateBlank3(wi, si)} className="ml-auto text-[10px] bg-slate-600 hover:bg-slate-500 px-2 py-1 rounded">Rotate Target</button>}
                  </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {!q.restrictToBlanks && (
          <div className="space-y-4">
            <p className="text-xs text-slate-400">
              Build the reference answer circuit using only the gates students are allowed. Any circuit producing the same state is accepted.
            </p>
            {answerPalette.length === 0 && (
              <p className="text-xs text-amber-400">No allowed gates selected above — enable some gates first.</p>
            )}

            {/* Answer Palette */}
            <div className="flex gap-2 flex-wrap items-end p-3 bg-slate-900/50 rounded-lg border border-slate-700/40">
              <span className="text-[10px] text-slate-500 uppercase tracking-widest self-center mr-1">Answer Palette</span>
              {answerPalette.map(g => <BuilderPaletteGate key={g} gateName={g} />)}
            </div>

            {/* Answer Steps Control */}
            <div className="flex gap-3 items-center flex-wrap text-xs text-slate-400">
              <span>Answer Steps:</span>
              <button onClick={removeAnswerStep} disabled={q.answerNSteps <= 0} className={btnCls}>−</button>
              <span className="text-slate-200 w-4 text-center font-medium">{q.answerNSteps}</span>
              <button onClick={addAnswerStep} disabled={q.answerNSteps >= 20} className={btnCls}>+</button>
            </div>

            {/* Combined Grid Visual */}
            <div className="flex items-start overflow-x-auto bg-slate-900/40 p-4 rounded-xl border border-slate-700/50">
              <div className="shrink-0 border-r-2 border-slate-600/50 pr-4 mr-2">
                <BuilderCircuitGrid
                  gridId={`given_readonly_${q.id}`}
                  nQubits={q.nQubits} nSteps={q.nSteps} circuit={q.circuit}
                  onCellsChange={() => {}}
                  showBlanks={false} paletteGates={[]}
                  readOnly={true}
                  hideControls={true}
                />
              </div>
              <div className="shrink-0">
                <BuilderCircuitGrid
                  gridId={`answer_${q.id}`}
                  nQubits={q.answerNQubits} nSteps={q.answerNSteps} circuit={q.answerCircuit}
                  onCellsChange={handleAnswerChange}
                  showBlanks={false} paletteGates={answerPalette}
                  hideWireLabels={true}
                  stepOffset={q.nSteps}
                  hideControls={true}
                />
              </div>
            </div>
          </div>
        )}
      </section>

      {/* ── Hidden Blocks (advanced) ────────────────────────────────────────── */}
      <section className={sectionCls}>
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest">
            Hidden Blocks&ensp;<span className="text-slate-500 normal-case font-normal">(advanced)</span>
          </h3>
          <button
            onClick={() => update({ hiddenBlocks: [...q.hiddenBlocks, { topWire: 0, bottomWire: Math.max(0, q.nQubits - 1), startStep: 0, endStep: 0 }] })}
            className="text-xs px-3 py-1 bg-slate-700 hover:bg-slate-600 rounded-lg text-slate-300 border border-slate-600 transition-colors">
            + Add Hidden Block
          </button>
        </div>
        {q.hiddenBlocks.length === 0 && (
          <p className="text-xs text-slate-500 italic">
            A hidden block covers part of the circuit with an opaque rectangle so students cannot see those gates.
          </p>
        )}
        {q.hiddenBlocks.map((block, i) => {
          function updateBlock(patch) { const nb = [...q.hiddenBlocks]; nb[i] = { ...block, ...patch }; update({ hiddenBlocks: nb }); }
          const ni = 'w-14 text-xs bg-slate-800 border border-slate-600 rounded px-1.5 py-1 text-slate-200';
          return (
            <div key={i} className="flex gap-3 items-center p-3 bg-slate-700/60 rounded-lg border border-slate-600/50 flex-wrap">
              {[['Top wire', 'topWire'], ['Bottom wire', 'bottomWire'], ['Start step', 'startStep'], ['End step', 'endStep']].map(([label, key]) => (
                <div key={key} className="flex items-center gap-1.5">
                  <span className="text-xs text-slate-400">{label}</span>
                  <input type="number" min={0} max={key.includes('Wire') ? q.nQubits - 1 : q.nSteps - 1}
                    value={block[key]} onChange={e => updateBlock({ [key]: Number(e.target.value) })} className={ni} />
                </div>
              ))}
              <button onClick={() => update({ hiddenBlocks: q.hiddenBlocks.filter((_, j) => j !== i) })}
                className="ml-auto text-xs text-red-400 hover:text-red-300 px-2 py-1 rounded hover:bg-red-500/10 transition-colors">
                Remove
              </button>
            </div>
          );
        })}
      </section>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function QuestionBuilderPage() {
  const [{ questions, selectedId }, _setState] = useState(() => {
    const q = newQuestion();
    return { questions: [q], selectedId: q.id };
  });

  function setQuestions(updater) {
    _setState(s => ({ ...s, questions: typeof updater === 'function' ? updater(s.questions) : updater }));
  }
  function setSelectedId(id) { _setState(s => ({ ...s, selectedId: id })); }

  const importRef = useRef(null);
  const selectedQ = questions.find(q => q.id === selectedId);

  function updateQuestion(updated) { setQuestions(qs => qs.map(q => q.id === updated.id ? updated : q)); }
  function addQuestion()           { const q = newQuestion(); setQuestions(qs => [...qs, q]); setSelectedId(q.id); }
  function deleteQuestion(id)      {
    setQuestions(qs => {
      const remaining = qs.filter(q => q.id !== id);
      if (selectedId === id && remaining.length > 0) setSelectedId(remaining[0].id);
      return remaining;
    });
  }
  function moveQuestion(id, dir) {
    setQuestions(qs => {
      const idx = qs.findIndex(q => q.id === id);
      const ni = idx + dir;
      if (ni < 0 || ni >= qs.length) return qs;
      const newQs = [...qs];
      [newQs[idx], newQs[ni]] = [newQs[ni], newQs[idx]];
      return newQs;
    });
  }

  function handleImport(e) {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const data = JSON.parse(ev.target.result);
        if (Array.isArray(data) && data.length > 0) {
          const syncedData = data.map(q => {
            let ac = q.answerCircuit || [[null]];
            while (ac.length < (q.nQubits ?? 1)) ac.push(Array(q.answerNSteps ?? 1).fill(null));
            
            let exactAnswer = q.exactAnswer || {};
            if (q.restrictToBlanks && q.answer && Object.keys(exactAnswer).length === 0) {
              q.answer.forEach(ans => {
                exactAnswer[`${ans.wireIndex}_${ans.stepIndex}`] = ans.gate;
              });
            }
            return { ...q, answerNQubits: q.nQubits || 1, answerCircuit: ac.slice(0, q.nQubits || 1), exactAnswer };
          });
          setQuestions(syncedData); setSelectedId(syncedData[0].id);
          _nextId = Math.max(...data.map(q => q.id ?? 0)) + 1;
        } else { alert('File does not contain a valid question list.'); }
      } catch { alert('Could not parse the file — make sure it is a valid JSON backup.'); }
    };
    reader.readAsText(file); e.target.value = '';
  }

  function handleExport() {
    const input = window.prompt('Enter a name for the quiz file:', 'quiz');
    if (input !== null) {
      const safeName = input.trim() || 'quiz';
      const filename = safeName.endsWith('.qpkg') ? safeName : `${safeName}.qpkg`;
      const title = safeName.replace(/\.qpkg$/i, '');
      download(filename, generateQuizPackage(questions, { title }));
    }
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col font-sans">
      <header className="bg-slate-800 border-b border-slate-700/60 px-5 py-3 flex items-center gap-4 shrink-0">
        <Link to="/questions" className="text-slate-500 hover:text-slate-300 text-xs transition-colors">← Questions</Link>
        <span className="text-slate-700 select-none">|</span>
        <h1 className="text-sm font-semibold text-white tracking-tight">Question Builder</h1>
        <div className="flex-1" />
        <div className="flex gap-2 items-center">
          <input ref={importRef} type="file" accept=".json" onChange={handleImport} className="hidden" />
          <button onClick={() => importRef.current?.click()}
            className="px-3 py-1.5 text-xs bg-slate-700 hover:bg-slate-600 rounded-lg border border-slate-600 text-slate-300 transition-colors">
            ↑ Load JSON backup
          </button>
          <button onClick={() => download('questions_backup.json', JSON.stringify(questions, null, 2))}
            className="px-3 py-1.5 text-xs bg-slate-700 hover:bg-slate-600 rounded-lg border border-slate-600 text-slate-300 transition-colors">
            ↓ Save JSON backup
          </button>
        <button onClick={handleExport}
            className="px-4 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 rounded-lg border border-blue-500 text-white font-semibold transition-colors">
            ↓ Export Quiz File
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <aside className="w-52 shrink-0 border-r border-slate-700/60 bg-slate-800/60 flex flex-col">
          <div className="p-3 border-b border-slate-700/50">
            <button onClick={addQuestion}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm text-white font-medium transition-colors">
              + New Question
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {questions.map((q, idx) => (
              <div key={q.id} onClick={() => setSelectedId(q.id)}
                className={`group flex items-start gap-1 px-2 py-2 rounded-lg cursor-pointer transition-colors
                  ${selectedId === q.id ? 'bg-blue-600/20 border border-blue-500/40' : 'hover:bg-slate-700/60 border border-transparent'}`}>
                <span className="text-[10px] text-slate-500 w-5 shrink-0 mt-0.5">{idx + 1}.</span>
                <span className="flex-1 text-xs text-slate-300 truncate leading-relaxed">{q.title || 'Untitled'}</span>
                <div className="flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  <button onClick={e => { e.stopPropagation(); moveQuestion(q.id, -1); }} disabled={idx === 0}
                    className="text-slate-500 hover:text-slate-300 disabled:opacity-30 leading-none" title="Move up">↑</button>
                  <button onClick={e => { e.stopPropagation(); moveQuestion(q.id, 1); }} disabled={idx === questions.length - 1}
                    className="text-slate-500 hover:text-slate-300 disabled:opacity-30 leading-none" title="Move down">↓</button>
                  <button onClick={e => { e.stopPropagation(); if (questions.length > 1) deleteQuestion(q.id); }} disabled={questions.length === 1}
                    className="text-red-500 hover:text-red-400 disabled:opacity-30 leading-none" title="Delete">×</button>
                </div>
              </div>
            ))}
          </div>
          <div className="p-3 border-t border-slate-700/50 text-[10px] text-slate-500 leading-relaxed">
            "Save JSON backup" preserves your work. "Export Quiz File" generates a .qpkg to distribute to students.
          </div>
        </aside>

        <main className="flex-1 overflow-y-auto p-6">
          {selectedQ
            ? <QuestionEditor question={selectedQ} onChange={updateQuestion} />
            : <div className="text-slate-500 text-sm mt-8 text-center">Select a question or click "+ New Question".</div>
          }
        </main>
      </div>
    </div>
  );
}
