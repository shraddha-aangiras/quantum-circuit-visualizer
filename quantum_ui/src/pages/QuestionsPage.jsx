import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { monitorForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { QUESTIONS } from '../questions/questionData';
import { GATE_STYLES } from '../constants';
import GateVisual from '../components/GateVisual';
import DraggableGate from '../components/DraggableGate';
import QuestionBlankSlot from '../components/question/QuestionBlankSlot';
import ResultsPanel from '../components/ResultsPanel';
import DropZone from '../components/DropZone';
import DraggablePlacedGate from '../components/DraggablePlacedGate';
import DraggableCnotNode from '../components/DraggableCnotNode';
import initQuantumEngine from '../wasm/quantum_engine.js';
import { simulateCircuit } from '../utils/simulateCircuit.js';

// ─── Small display components ────────────────────────────────────────────────

/** A locked (given) single-qubit gate — display only, no drag or delete. */
function LockedGate({ cell }) {
  return (
    <div
      className={`w-full h-full border text-lg rounded flex items-center justify-center font-bold shadow-sm select-none ${GATE_STYLES[cell.name]}`}
      title="Given (locked)"
    >
      <GateVisual name={cell.name} />
    </div>
  );
}

/** A filled blank — shows the placed gate with an × button to remove it. */
function FilledBlankGate({ gateName, onClear }) {
  return (
    <div className="relative w-full h-full group/filled">
      <div
        className={`w-full h-full border text-lg rounded flex items-center justify-center font-bold shadow-sm ring-2 ring-blue-400/60 ${GATE_STYLES[gateName]}`}
      >
        <GateVisual name={gateName} />
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); onClear(); }}
        className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-slate-600 text-slate-200 hover:bg-red-500 hover:text-white text-[10px] flex items-center justify-center z-30 leading-none transition-colors"
        title="Remove gate"
      >
        ×
      </button>
    </div>
  );
}

// ─── Cell renderer ────────────────────────────────────────────────────────────

const TWO_WIRE = ['CNOT', 'CZ', 'FF_x', 'FF_Z'];

/**
 * Renders a single cell in the question circuit grid.
 * Returns null for inactive cells so the horizontal wire still shows through.
 */
function CellContent({ cell, wireIndex, stepIndex, restrictToBlanks, onClear, onDelete }) {
  if (!cell) {
    if (restrictToBlanks) return null;
    return <DropZone wireIndex={wireIndex} stepIndex={stepIndex} />;
  }

  // Blank slot (unfilled)
  if (cell.blank && !cell.filled) {
    return <QuestionBlankSlot wireIndex={wireIndex} stepIndex={stepIndex} />;
  }

  // Blank slot (filled by student)
  if (cell.blank && cell.filled) {
    return (
      <FilledBlankGate
        gateName={cell.filled}
        onClear={() => onClear(wireIndex, stepIndex)}
      />
    );
  }

  // Locked single-qubit gate
  if (cell.locked && !TWO_WIRE.includes(cell.name)) {
    return <LockedGate cell={cell} />;
  }

  // Locked multi-qubit control node + connecting line
  if (cell.locked && TWO_WIRE.includes(cell.name) && cell.role === 'control') {
    const diff = cell.targetWire - wireIndex;
    return (
      <div className="w-full h-full relative flex items-center justify-center">
        <div className="w-3.5 h-3.5 rounded-full bg-slate-300 z-10" />
        <div
          className="absolute w-px bg-slate-400 pointer-events-none"
          style={{
            left: 'calc(50% - 0.5px)',
            top: diff > 0 ? '50%' : 'auto',
            bottom: diff < 0 ? '50%' : 'auto',
            height: `${Math.abs(diff) * 5}rem`,
          }}
        />
      </div>
    );
  }

  // Locked CNOT target node
  if (cell.locked && cell.name === 'CNOT' && cell.role === 'target') {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <div className={`w-9 h-9 border-2 border-slate-400/80 bg-slate-800/60 rounded flex items-center justify-center select-none`}>
          <span className="text-slate-200 text-base font-bold leading-none">X</span>
        </div>
      </div>
    );
  }

  // Locked CZ target node
  if (cell.locked && cell.name === 'CZ' && cell.role === 'target') {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <div className={`w-9 h-9 border border-slate-400/70 bg-slate-500/10 rounded flex items-center justify-center select-none`}>
          <span className="text-slate-300 text-base font-bold leading-none">Z</span>
        </div>
      </div>
    );
  }

  if (cell.locked && !TWO_WIRE.includes(cell.name)) {
    return <LockedGate cell={cell} />;
  }

  // Placed unlocked gates (student placed in empty slots)
  if (TWO_WIRE.includes(cell.name) || cell.name === 'TOFFOLI') {
    return (
      <div className="w-full h-full relative flex items-center justify-center z-20 group/cnot" onContextMenu={(e) => { e.preventDefault(); onDelete(wireIndex, stepIndex); }}>
        <DraggableCnotNode cell={cell} wireIndex={wireIndex} stepIndex={stepIndex} />
        {cell.name === 'TOFFOLI' ? (
          wireIndex === Math.min(...cell.controls, cell.targetWire) && (
            <>
              <div className="absolute w-px bg-slate-400 z-0 pointer-events-none" style={{ left: 'calc(50% - 1px)', top: '50%', height: `${(Math.max(...cell.controls, cell.targetWire) - wireIndex) * 5}rem` }} />
              <button onClick={(e) => { e.stopPropagation(); onDelete(wireIndex, stepIndex); }} className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-slate-700 text-slate-300 hover:bg-red-500 hover:text-white text-[10px] flex items-center justify-center z-40 opacity-0 group-hover/cnot:opacity-100 transition-opacity leading-none">×</button>
            </>
          )
        ) : (
          cell.role === 'control' && (
            <>
              <div className="absolute w-px bg-slate-400 z-0 pointer-events-none" style={{ left: 'calc(50% - 1px)', top: cell.targetWire > wireIndex ? '50%' : 'auto', bottom: cell.targetWire < wireIndex ? '50%' : 'auto', height: `${Math.abs(cell.targetWire - wireIndex) * 5}rem` }} />
              <button onClick={(e) => { e.stopPropagation(); onDelete(wireIndex, stepIndex); }} className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-slate-700 text-slate-300 hover:bg-red-500 hover:text-white text-[10px] flex items-center justify-center z-40 opacity-0 group-hover/cnot:opacity-100 transition-opacity leading-none">×</button>
            </>
          )
        )}
      </div>
    );
  }

  return (
    <DraggablePlacedGate
      cell={cell}
      wireIndex={wireIndex}
      stepIndex={stepIndex}
      handleRightClickDelete={(e, w, s) => { e.preventDefault(); onDelete(w, s); }}
      onDelete={() => onDelete(wireIndex, stepIndex)}
    />
  );
}

// ─── Circuit board ────────────────────────────────────────────────────────────

function QuestionCircuit({ circuitState, hiddenBlocks, restrictToBlanks, onClear, onDelete }) {
  return (
    <div className="bg-slate-900 border border-slate-700/50 rounded-xl shadow-xl p-5 inline-block min-w-max relative">
      {circuitState.map((wire, wireIndex) => (
        <div key={`wire-${wireIndex}`} className="flex items-center mb-2 last:mb-0">
          {/* Wire label */}
          <div className="w-16 font-mono font-medium text-right pr-4 text-sm text-slate-400 shrink-0">
            q[{wireIndex}]
          </div>

          {/* Slots with wire line */}
          <div className="flex relative items-center py-2 px-1">
            <div className="absolute left-0 right-0 h-px bg-slate-600 z-0" />
            {wire.map((cell, stepIndex) => (
              <div
                key={`slot-${wireIndex}-${stepIndex}`}
                className="w-14 h-14 relative flex items-center justify-center mx-1 z-10"
              >
                <CellContent
                  cell={cell}
                  wireIndex={wireIndex}
                  stepIndex={stepIndex}
                  restrictToBlanks={restrictToBlanks}
                  onClear={onClear}
                  onDelete={onDelete}
                />
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Hidden blocks overlay */}
      {hiddenBlocks && hiddenBlocks.map((block, i) => (
        <div
          key={`hidden-${i}`}
          className="absolute z-40 bg-slate-800/95 border border-slate-600 rounded-lg flex items-center justify-center backdrop-blur-sm shadow-xl"
          style={{
            top: `calc(1.25rem + ${block.topWire} * 5rem)`,
            left: `calc(5.75rem + ${block.startStep} * 4rem)`,
            width: `calc(${(block.endStep - block.startStep + 1)} * 4rem - 0.5rem)`,
            height: `calc(${(block.bottomWire - block.topWire + 1)} * 5rem - 0.5rem)`
          }}
        >
          <span className="text-slate-400 font-bold tracking-widest uppercase text-xs">Hidden Circuit</span>
        </div>
      ))}
    </div>
  );
}

// ─── Final score screen ───────────────────────────────────────────────────────

function FinalScreen({ scores, onRetry }) {
  const totalPoints = scores.reduce((s, r) => s + r.points, 0);
  const maxPoints = QUESTIONS.reduce((s, q) => s + q.points, 0);
  const pct = maxPoints > 0 ? Math.round((totalPoints / maxPoints) * 100) : 0;

  return (
    <div className="fixed inset-0 bg-slate-950 text-slate-300 flex flex-col items-center justify-center font-sans gap-6 p-8">
      <div className="text-5xl">{pct === 100 ? '🏆' : pct >= 50 ? '🎉' : '💡'}</div>
      <h1 className="text-2xl font-bold text-white">Quiz Complete!</h1>
      <p className="text-base text-slate-400">
        Final score:{' '}
        <span className="text-white font-semibold">{totalPoints}</span>
        <span className="text-slate-500"> / {maxPoints} points</span>
        <span className="text-slate-600 ml-2">({pct}%)</span>
      </p>

      {/* Per-question breakdown */}
      <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-5 flex flex-col gap-3 min-w-80">
        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-1">
          Breakdown
        </p>
        {QUESTIONS.map((q, i) => {
          const s = scores[i];
          const earned = s?.points ?? 0;
          const hint = s?.usedHint;
          return (
            <div key={q.id} className="flex justify-between items-center text-sm gap-4">
              <span className="text-slate-300 truncate">{q.title}</span>
              <span className="shrink-0">
                {hint && (
                  <span className="text-amber-500/80 text-xs mr-2">(revealed)</span>
                )}
                <span className={earned > 0 ? 'text-emerald-400 font-semibold' : 'text-slate-500'}>
                  {earned} / {q.points} pts
                </span>
              </span>
            </div>
          );
        })}
      </div>

      <div className="flex gap-3 mt-2">
        <button
          onClick={onRetry}
          className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm font-semibold rounded-lg transition-colors"
        >
          Try Again
        </button>
        <Link
          to="/"
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-lg transition-colors"
        >
          Back to Visualizer
        </Link>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

/** Build fresh mutable circuit state from a question definition. */
function initCircuit(question) {
  const minLength = Math.max(...question.circuit.map(w => w.length));
  const desiredLength = question.restrictToBlanks ? minLength : Math.max(8, minLength + 3);
  return question.circuit.map(wire =>
    [...wire.map(cell => (cell ? { ...cell } : null)), ...Array(Math.max(0, desiredLength - minLength)).fill(null)]
  );
}

export default function QuestionsPage() {
  const [questionIndex, setQuestionIndex] = useState(0);
  const [scores, setScores] = useState([]); // [{ questionId, points, usedHint }]
  const [phase, setPhase] = useState('playing'); // 'playing' | 'done'

  const question = QUESTIONS[questionIndex];

  const [circuitState, setCircuitState] = useState(() => initCircuit(question));
  const [feedback, setFeedback] = useState(null); // null | 'correct' | 'incorrect'
  const [answerRevealed, setAnswerRevealed] = useState(false);

  const [engine, setEngine] = useState(null);
  const [isReady, setIsReady] = useState(false);
  const [simResults, setSimResults] = useState(null);
  const [shots, setShots] = useState(100);

  // Load Quantum Engine
  useEffect(() => {
    async function loadEngine() {
      try {
        const Module = await initQuantumEngine();
        setEngine(Module);
        setIsReady(true);
      } catch (err) { console.error(err); }
    }
    loadEngine();
  }, []);

  // Simulate circuit whenever circuitState changes
  useEffect(() => {
    if (isReady && engine) {
      const normalizedCircuit = circuitState.map(wire => wire.map(cell => {
        if (!cell) return null;
        if (cell.blank) return cell.filled ? { name: cell.filled } : null;
        return { ...cell };
      }));
      setSimResults(simulateCircuit(engine, normalizedCircuit, null, shots, null));
    }
  }, [circuitState, isReady, engine, shots]);

  // Reset circuit + UI state whenever the question changes
  useEffect(() => {
    setCircuitState(initCircuit(question));
    setFeedback(null);
    setAnswerRevealed(false);
  }, [questionIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-expand circuit state to always have empty buffer slots at the end
  useEffect(() => {
    let highestOccupiedIndex = -1;
    circuitState.forEach(wire => {
      for (let i = wire.length - 1; i >= 0; i--) {
        if (wire[i] !== null) {
          if (i > highestOccupiedIndex) highestOccupiedIndex = i;
          break;
        }
      }
    });
    const minLength = Math.max(...question.circuit.map(w => w.length));
    const desiredLength = question.restrictToBlanks 
      ? minLength 
      : Math.max(minLength + 3, highestOccupiedIndex + 4);
    const currentLength = circuitState[0].length;

    if (currentLength < desiredLength) {
      setCircuitState(prev => prev.map(wire => [...wire, ...Array(desiredLength - currentLength).fill(null)]));
    } else if (currentLength > desiredLength) {
      setCircuitState(prev => prev.map(wire => wire.slice(0, desiredLength)));
    }
  }, [circuitState, question]);

  // DnD monitor: handle gate drops from palette onto blank slots
  useEffect(() => {
    return monitorForElements({
      onDrop({ source, location }) {
        const [dest] = location.current.dropTargets;
        if (!dest) return;

        const { wireIndex, stepIndex } = dest.data;
        setCircuitState(prev => {
          const next = prev.map(w => [...w]);
          const wIdx = wireIndex;
          const sIdx = stepIndex;
          
          const isOccupied = (w, s) => next[w]?.[s] != null && !next[w][s].blank;

          if (!question.restrictToBlanks) {
            const isCnotSwap =
              source.data.type === 'cnot-node' &&
              dest.data.type === 'cnot-node-drop' &&
              dest.data.wireIndex === source.data.peerWire &&
              dest.data.stepIndex === source.data.stepIndex;

            const isToffoliSwap =
              source.data.type === 'toffoli-node' &&
              dest.data.type === 'cnot-node-drop' &&
              (source.data.controls?.includes(dest.data.wireIndex) || source.data.targetWire === dest.data.wireIndex) &&
              dest.data.stepIndex === source.data.stepIndex;

            if (isToffoliSwap) {
              const oldWire = source.data.wireIndex;
              const swapWire = dest.data.wireIndex;
              const step = source.data.stepIndex;
              const oldRole = next[oldWire][step].role;
              const swapRole = next[swapWire][step].role;
              if (oldRole === swapRole) return next;
              const controls = [...source.data.controls];
              let newControls = controls;
              if (oldRole === 'control') newControls = [swapWire, controls.find(c => c !== oldWire)];
              else newControls = [oldWire, controls.find(c => c !== swapWire)];
              const newTarget = oldRole === 'control' ? oldWire : swapWire;
              next[oldWire][step].role = swapRole;
              next[swapWire][step].role = oldRole;
              next[newControls[0]][step].controls = newControls;
              next[newControls[0]][step].targetWire = newTarget;
              next[newControls[1]][step].controls = newControls;
              next[newControls[1]][step].targetWire = newTarget;
              next[newTarget][step].controls = newControls;
              next[newTarget][step].targetWire = newTarget;
              return next;
            }

            if (isCnotSwap) {
              const oldWire = source.data.wireIndex;
              const peerWire = source.data.peerWire;
              const step = source.data.stepIndex;
              next[oldWire][step] = {
                name: source.data.name,
                role: source.data.role === 'control' ? 'target' : 'control',
                [source.data.role === 'control' ? 'controlWire' : 'targetWire']: peerWire,
              };
              next[peerWire][step] = {
                name: source.data.name,
                role: source.data.role,
                [source.data.role === 'control' ? 'targetWire' : 'controlWire']: oldWire,
              };
              return next;
            }

            const isInsert =
              dest.data.type === 'gate-insert' ||
              (dest.data.type === 'cnot-node-drop' && !isCnotSwap);

            if (isInsert) {
              const insertStep = dest.data.stepIndex;
              const targetWire = dest.data.wireIndex;

              // Prevent inserting into or before hidden blocks to maintain spatial alignment
              const affectsHiddenBlock = question.hiddenBlocks?.some(
                block => insertStep <= block.endStep
              );

              if (affectsHiddenBlock) {
                return next;
              }

              if (source.data.type === 'placed-gate') {
                next[source.data.wireIndex][source.data.stepIndex] = null;
              } else if (source.data.type === 'cnot-node') {
                next[source.data.wireIndex][source.data.stepIndex] = null;
                next[source.data.peerWire][source.data.stepIndex] = null;
              } else if (source.data.type === 'toffoli-node') {
                next[source.data.controls[0]][source.data.stepIndex] = null;
                next[source.data.controls[1]][source.data.stepIndex] = null;
                next[source.data.targetWire][source.data.stepIndex] = null;
              }

              next.forEach(wire => {
                wire.splice(insertStep, 0, null);
              });

              if (source.data.type === 'gate') {
                const gateName = source.data.name;
                if (TWO_WIRE.includes(gateName)) {
                  const tIdx = targetWire < next.length - 1 ? targetWire + 1 : targetWire - 1;
                  if (tIdx >= 0 && tIdx < next.length) {
                    next[targetWire][insertStep] = { name: gateName, role: 'control', targetWire: tIdx };
                    next[tIdx][insertStep] = { name: gateName, role: 'target', controlWire: targetWire };
                  }
                } else if (gateName === 'TOFFOLI') {
                  const c1 = targetWire;
                  if (next.length >= 3) {
                    const c2 = c1 + 1 < next.length ? c1 + 1 : c1 - 1;
                    const tIdx = [c1 + 2, c1 - 1, c1 - 2].find(w => w >= 0 && w < next.length && w !== c2) ?? [...Array(next.length).keys()].find(w => w !== c1 && w !== c2);
                    next[c1][insertStep] = { name: gateName, role: 'control', controls: [c1, c2], targetWire: tIdx };
                    next[c2][insertStep] = { name: gateName, role: 'control', controls: [c1, c2], targetWire: tIdx };
                    next[tIdx][insertStep] = { name: gateName, role: 'target', controls: [c1, c2], targetWire: tIdx };
                  }
                } else {
                  next[targetWire][insertStep] = { name: gateName };
                }
              } else if (source.data.type === 'placed-gate') {
                next[targetWire][insertStep] = { name: source.data.name };
              } else if (source.data.type === 'cnot-node') {
                next[targetWire][insertStep] = {
                  name: source.data.name,
                  role: source.data.role,
                  [source.data.role === 'control' ? 'targetWire' : 'controlWire']: source.data.peerWire
                };
                next[source.data.peerWire][insertStep] = {
                  name: source.data.name,
                  role: source.data.role === 'control' ? 'target' : 'control',
                  [source.data.role === 'control' ? 'controlWire' : 'targetWire']: targetWire
                };
              } else if (source.data.type === 'toffoli-node') {
                next[source.data.controls[0]][insertStep] = { name: source.data.name, role: 'control', controls: source.data.controls, targetWire: source.data.targetWire };
                next[source.data.controls[1]][insertStep] = { name: source.data.name, role: 'control', controls: source.data.controls, targetWire: source.data.targetWire };
                next[source.data.targetWire][insertStep] = { name: source.data.name, role: 'target', controls: source.data.controls, targetWire: source.data.targetWire };
              }
              return next;
            }
          }

          if (source.data.type === 'gate') {
            const gateName = source.data.name;
            if (dest.data.type === 'question-blank') {
              if (!TWO_WIRE.includes(gateName) && gateName !== 'TOFFOLI') {
                next[wIdx][sIdx] = { blank: true, filled: gateName };
              }
              return next;
            }
            if (dest.data.type === 'slot') {
              if (TWO_WIRE.includes(gateName)) {
                const tIdx = wIdx < next.length - 1 ? wIdx + 1 : wIdx - 1;
                if (tIdx >= 0 && tIdx < next.length && !isOccupied(wIdx, sIdx) && !isOccupied(tIdx, sIdx)) {
                  next[wIdx][sIdx] = { name: gateName, role: 'control', targetWire: tIdx };
                  next[tIdx][sIdx] = { name: gateName, role: 'target', controlWire: wIdx };
                }
              } else if (gateName === 'TOFFOLI') {
                if (next.length >= 3) {
                  const c2 = wIdx + 1 < next.length ? wIdx + 1 : wIdx - 1;
                  const tIdx = [wIdx + 2, wIdx - 1, wIdx - 2].find(w => w >= 0 && w < next.length && w !== c2) ?? [...Array(next.length).keys()].find(w => w !== wIdx && w !== c2);
                  if (!isOccupied(wIdx, sIdx) && !isOccupied(c2, sIdx) && !isOccupied(tIdx, sIdx)) {
                    next[wIdx][sIdx] = { name: gateName, role: 'control', controls: [wIdx, c2], targetWire: tIdx };
                    next[c2][sIdx] = { name: gateName, role: 'control', controls: [wIdx, c2], targetWire: tIdx };
                    next[tIdx][sIdx] = { name: gateName, role: 'target', controls: [wIdx, c2], targetWire: tIdx };
                  }
                }
              } else {
                if (!isOccupied(wIdx, sIdx)) {
                  next[wIdx][sIdx] = { name: gateName };
                }
              }
              return next;
            }
          }

          if (source.data.type === 'placed-gate' && dest.data.type === 'slot') {
            if (!isOccupied(wIdx, sIdx)) {
              next[source.data.wireIndex][source.data.stepIndex] = null;
              next[wIdx][sIdx] = { name: source.data.name };
            }
            return next;
          }

          if (source.data.type === 'cnot-node' && dest.data.type === 'slot') {
            const { wireIndex: oldW, stepIndex: oldS, name, role, peerWire } = source.data;
            if (sIdx === oldS && !isOccupied(wIdx, sIdx) && wIdx !== peerWire) {
              next[oldW][oldS] = null;
              next[wIdx][sIdx] = { name, role, [role === 'control' ? 'targetWire' : 'controlWire']: peerWire };
              next[peerWire][sIdx][role === 'control' ? 'controlWire' : 'targetWire'] = wIdx;
            }
            return next;
          }

          if (source.data.type === 'toffoli-node' && dest.data.type === 'slot') {
            const { wireIndex: oldW, stepIndex: oldS, name, role, controls, targetWire } = source.data;
            if (sIdx === oldS && !isOccupied(wIdx, sIdx)) {
              if (role === 'control' && wIdx !== targetWire && wIdx !== controls.find(c => c !== oldW)) {
                next[oldW][oldS] = null;
                const otherC = controls.find(c => c !== oldW);
                const newControls = [wIdx, otherC];
                next[wIdx][sIdx] = { name, role, controls: newControls, targetWire };
                next[otherC][sIdx].controls = newControls;
                next[targetWire][sIdx].controls = newControls;
              } else if (role === 'target' && !controls.includes(wIdx)) {
                next[oldW][oldS] = null;
                next[wIdx][sIdx] = { name, role, controls, targetWire: wIdx };
                next[controls[0]][sIdx].targetWire = wIdx;
                next[controls[1]][sIdx].targetWire = wIdx;
              }
            }
            return next;
          }

          return next;
        });
        setFeedback(null);
      },
    });
  }, [question]);

  const clearBlank = useCallback((wireIndex, stepIndex) => {
    setCircuitState(prev => {
      const next = prev.map(w => [...w]);
      const cell = next[wireIndex][stepIndex];
      if (cell?.blank) next[wireIndex][stepIndex] = { blank: true };
      return next;
    });
    setFeedback(null);
  }, []);

  const deleteGate = useCallback((wireIndex, stepIndex) => {
    setCircuitState(prev => {
      const next = prev.map(w => [...w]);
      const cell = next[wireIndex][stepIndex];
      if (!cell || cell.locked || cell.blank) return prev;

      if (TWO_WIRE.includes(cell.name)) {
        const peerWire = cell.role === 'control' ? cell.targetWire : cell.controlWire;
        next[wireIndex][stepIndex] = null;
        next[peerWire][stepIndex] = null;
      } else if (cell.name === 'TOFFOLI') {
        next[cell.controls[0]][stepIndex] = null;
        next[cell.controls[1]][stepIndex] = null;
        next[cell.targetWire][stepIndex] = null;
      } else {
        next[wireIndex][stepIndex] = null;
      }
      return next;
    });
  }, []);

  const checkCorrect = useCallback(() => {
    if (question.evaluationType === 'target_state') {
      if (!simResults || simResults.probabilities.length === 0) return false;
      const targetIndex = parseInt(question.targetState, 2);
      return simResults.probabilities[targetIndex] > 0.99;
    }

    if (question.evaluationType === 'equivalent_state') {
      if (!simResults || simResults.stateVector.length === 0 || !engine) return false;

      // Build the teacher's expected circuit
      const expectedGrid = question.circuit.map(wire => wire.map(cell => {
        if (!cell || cell.blank) return null;
        return { ...cell };
      }));

      if (question.answer) {
        question.answer.forEach(({ wireIndex, stepIndex, gate, role, targetWire, controlWire, controls }) => {
          while (expectedGrid[0].length <= stepIndex) expectedGrid.forEach(w => w.push(null));
          if (role) {
            expectedGrid[wireIndex][stepIndex] = { name: gate, role, targetWire, controlWire, controls };
          } else {
            expectedGrid[wireIndex][stepIndex] = { name: gate };
          }
        });
      }

      const expectedSim = simulateCircuit(engine, expectedGrid, null, shots, null);
      if (!expectedSim || expectedSim.stateVector.length === 0) return false;

      // Compute fidelity |<psi|phi>|^2
      let realPart = 0, imagPart = 0;
      for (let i = 0; i < simResults.stateVector.length; i++) {
        realPart += simResults.stateVector[i].real * expectedSim.stateVector[i].real + simResults.stateVector[i].imag * expectedSim.stateVector[i].imag;
        imagPart += simResults.stateVector[i].imag * expectedSim.stateVector[i].real - simResults.stateVector[i].real * expectedSim.stateVector[i].imag;
      }
      return (realPart * realPart + imagPart * imagPart) > 0.99;
    }

    return question.answer.every(({ wireIndex, stepIndex, gate }) => {
      const cell = circuitState[wireIndex]?.[stepIndex];
      return cell?.blank && cell?.filled === gate;
    });
  }, [circuitState, question, simResults, engine, shots]);

  const advanceQuestion = useCallback((pointsEarned) => {
    const record = { questionId: question.id, points: pointsEarned, usedHint: answerRevealed };
    const newScores = [...scores, record];
    setScores(newScores);
    if (questionIndex + 1 < QUESTIONS.length) {
      setQuestionIndex(qi => qi + 1);
    } else {
      setPhase('done');
    }
  }, [scores, question, questionIndex, answerRevealed]);

  const handleSubmit = () => {
    if (answerRevealed) {
      advanceQuestion(0);
      return;
    }
    if (checkCorrect()) {
      setFeedback('correct');
      setTimeout(() => advanceQuestion(question.points), 1400);
    } else {
      setFeedback('incorrect');
    }
  };

  const handleGetAnswer = () => {
    setCircuitState(prev => {
      const next = prev.map(w => [...w]);
      if (question.answer) {
        question.answer.forEach(({ wireIndex, stepIndex, gate, role, targetWire, controlWire, controls }) => {
          while (next[0].length <= stepIndex) next.forEach(w => w.push(null));
          if (role) {
            next[wireIndex][stepIndex] = { name: gate, role, targetWire, controlWire, controls };
          } else {
            if (next[wireIndex][stepIndex]?.blank) {
              next[wireIndex][stepIndex] = { blank: true, filled: gate };
            } else {
              next[wireIndex][stepIndex] = { name: gate };
            }
          }
        });
      }
      return next;
    });
    setAnswerRevealed(true);
    setFeedback(null);
  };

  const handleRetry = () => {
    setScores([]);
    setQuestionIndex(0);
    setPhase('playing');
  };

  // ── Final screen ──────────────────────────────────────────────────────────
  if (phase === 'done') {
    return <FinalScreen scores={scores} onRetry={handleRetry} />;
  }

  // ── Header totals ─────────────────────────────────────────────────────────
  const maxPoints = QUESTIONS.reduce((s, q) => s + q.points, 0);
  const currentScore = scores.reduce((s, r) => s + r.points, 0);

  return (
    <div className="fixed inset-0 flex flex-col font-sans text-slate-300 bg-slate-950">

      {/* ── Top bar ───────────────────────────────────────────────────────── */}
      <header className="bg-slate-900 border-b border-slate-700/50 flex items-center gap-4 px-5 py-3 shrink-0">
        <Link
          to="/"
          className="text-slate-500 hover:text-slate-200 text-xs transition-colors shrink-0"
        >
          ← Visualizer
        </Link>

        <span className="text-slate-700 select-none">|</span>

        <h1 className="text-sm font-semibold text-white tracking-tight">
          Practice Questions
        </h1>

        <div className="flex-1" />

        {/* Progress dots */}
        <div className="flex gap-2 items-center">
          {QUESTIONS.map((q, i) => (
            <div
              key={q.id}
              className={`w-2.5 h-2.5 rounded-full border-2 transition-all ${
                i < questionIndex
                  ? 'bg-emerald-500 border-emerald-400'
                  : i === questionIndex
                  ? 'bg-blue-500 border-blue-300 shadow-[0_0_6px_rgba(59,130,246,0.5)] scale-125'
                  : 'bg-slate-700 border-slate-600'
              }`}
              title={`Q${i + 1}: ${q.title}`}
            />
          ))}
        </div>

        <span className="text-slate-700 select-none">|</span>

        {/* Running score */}
        <span className="text-[11px] text-slate-400 font-mono tabular-nums shrink-0">
          <span className="text-white font-semibold">{currentScore}</span>
          <span className="text-slate-600"> / {maxPoints} pts</span>
        </span>
      </header>

      {/* ── Body ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Left: gate palette */}
        <aside className="w-44 bg-slate-900 border-r border-slate-700/50 flex flex-col shrink-0">
          <div className="px-4 py-3 border-b border-slate-700/50">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">
              Gate Palette
            </p>
            <p className="text-[10px] text-slate-600 mt-0.5">Drag onto a blank</p>
          </div>
          <div className="p-4 overflow-y-auto">
            <div className="grid grid-cols-2 gap-3 items-center justify-items-center">
              {question.allowedGates.map(gate => (
                <DraggableGate key={gate} gate={gate} />
              ))}
            </div>
          </div>
        </aside>

        {/* Center: question content */}
        <div className="flex-1 overflow-auto p-6 flex flex-col gap-5">

          {/* Question header */}
          <div>
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-1">
              Question {questionIndex + 1} of {QUESTIONS.length}
              <span className="text-slate-600"> · {question.points} points</span>
            </p>
            <h2 className="text-xl font-bold text-white mb-2">{question.title}</h2>
            <p className="text-sm text-slate-400 max-w-lg leading-relaxed">
              {question.description}
            </p>
          </div>

          {/* Circuit board */}
          <div className="overflow-auto">
            <QuestionCircuit circuitState={circuitState} hiddenBlocks={question.hiddenBlocks} restrictToBlanks={question.restrictToBlanks} onClear={clearBlank} onDelete={deleteGate} />
          </div>

          {/* Controls + feedback */}
          <div className="flex items-center gap-3 flex-wrap">
            {answerRevealed ? (
              /* After "Get Answer" — offer Next/Finish, no points */
              <>
                <div className="text-sm text-amber-400 bg-amber-400/10 border border-amber-400/20 rounded-lg px-3 py-1.5">
                  Answer revealed — 0 points for this question
                </div>
                <button
                  onClick={() => advanceQuestion(0)}
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm font-semibold rounded-lg transition-colors"
                >
                  {questionIndex + 1 < QUESTIONS.length ? 'Next Question →' : 'Finish →'}
                </button>
              </>
            ) : (
              /* Normal play state */
              <>
                <button
                  onClick={handleSubmit}
                  disabled={feedback === 'correct'}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors"
                >
                  Submit
                </button>
                <button
                  onClick={handleGetAnswer}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-300 text-sm font-semibold rounded-lg transition-colors"
                >
                  Get Answer (0 pts)
                </button>

                {feedback === 'correct' && (
                  <div className="text-sm text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 rounded-lg px-3 py-1.5 animate-pulse">
                    ✓ Correct! +{question.points} points — moving on…
                  </div>
                )}
                {feedback === 'incorrect' && (
                  <div className="text-sm text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-1.5">
                    ✗ Not quite — try a different gate
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Right: Results Panel */}
        <ResultsPanel
          isReady={isReady}
          circuit={circuitState}
          measureStep={null}
          selectedQubit={null}
          simResults={simResults}
          shots={shots}
          setShots={setShots}
          onResample={() => {
            const normalizedCircuit = circuitState.map(w => w.map(c => {
              if (!c) return null;
              if (c.blank) return c.filled ? { name: c.filled } : null;
              return { ...c };
            }));
            setSimResults(simulateCircuit(engine, normalizedCircuit, null, shots, null));
          }}
        />
      </div>
    </div>
  );
}
