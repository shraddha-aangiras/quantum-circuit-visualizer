import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { monitorForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { QUESTIONS } from '../questions/questionData';
import { GATE_STYLES } from '../constants';
import GateVisual from '../components/GateVisual';
import DraggableGate from '../components/DraggableGate';
import QuestionBlankSlot from '../components/question/QuestionBlankSlot';
import ResultsPanel from '../components/ResultsPanel';
import DropZone from '../components/DropZone';
import CircuitCell from '../components/CircuitCell';
import DraggablePlacedGate from '../components/DraggablePlacedGate';
import DraggableCnotNode from '../components/DraggableCnotNode';
import initQuantumEngine from '../wasm/quantum_engine.js';
import { simulateCircuit } from '../utils/simulateCircuit.js';
import { applyGateDrop, TWO_WIRE, removeGateFromCircuit } from '../utils/circuitDnD.js';
import { compactCircuit } from '../utils/compactCircuit.js';
import { decodeStudentPackage } from '../utils/questionPackage.js';

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
        className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-slate-600 text-slate-200 hover:bg-red-500 hover:text-white text-[10px] flex items-center justify-center z-30 leading-none transition-colors opacity-0 group-hover/filled:opacity-100"
        title="Remove gate"
      >
        ×
      </button>
    </div>
  );
}

// ─── Circuit board ────────────────────────────────────────────────────────────

/**
 * separatorStep: if provided, draws a thin divider line before that column
 * to mark the boundary between the "given" question circuit and the
 * student-editable area (used for restrictToBlanks: false questions).
 */
function QuestionCircuit({ circuitState, hiddenBlocks, restrictToBlanks, onDelete, separatorStep, selectedQubit, onWireClick }) {
  const customRenderer = useCallback((cell, wireIndex, stepIndex) => {
    if (!cell) {
      if (restrictToBlanks) return null;
      return undefined;
    }

    if (cell.blank && !cell.filled) {
      if (cell.name === 'BLANK_2' || cell.name === 'BLANK_3') {
        return (
          <div className="w-full h-full relative flex items-center justify-center z-20 group/cnot">
            <QuestionBlankSlot wireIndex={wireIndex} stepIndex={stepIndex} />
            {cell.name === 'BLANK_3' ? (
              wireIndex === Math.min(...cell.controls, cell.targetWire) && <div className="absolute w-px bg-slate-400 z-0 pointer-events-none" style={{ left: 'calc(50% - 1px)', top: '50%', height: `${(Math.max(...cell.controls, cell.targetWire) - wireIndex) * 5}rem` }} />
            ) : (
              cell.role === 'control' && <div className="absolute w-px bg-slate-400 z-0 pointer-events-none" style={{ left: 'calc(50% - 1px)', top: cell.targetWire > wireIndex ? '50%' : 'auto', bottom: cell.targetWire < wireIndex ? '50%' : 'auto', height: `${Math.abs(cell.targetWire - wireIndex) * 5}rem` }} />
            )}
          </div>
        );
      }
      return <QuestionBlankSlot wireIndex={wireIndex} stepIndex={stepIndex} />;
    }

    if (cell.blank && cell.filled) {
      if (cell.name === 'BLANK_2' || cell.name === 'BLANK_3') {
        return <CircuitCell cell={{ ...cell, name: cell.filled }} wireIndex={wireIndex} stepIndex={stepIndex} onDelete={onDelete} onRightClickDelete={(e) => { e.preventDefault(); onDelete(wireIndex, stepIndex); }} />;
      }
      return <FilledBlankGate gateName={cell.filled} onClear={() => onDelete(wireIndex, stepIndex)} />;
    }

    if (cell.locked && TWO_WIRE.includes(cell.name) && cell.role === 'control') {
      const diff = cell.targetWire - wireIndex;
      return (
        <div className="w-full h-full relative flex items-center justify-center">
          <div className="w-3.5 h-3.5 rounded-full bg-slate-300 z-10" />
          <div className="absolute w-px bg-slate-400 pointer-events-none" style={{ left: 'calc(50% - 0.5px)', top: diff > 0 ? '50%' : 'auto', bottom: diff < 0 ? '50%' : 'auto', height: `${Math.abs(diff) * 5}rem` }} />
        </div>
      );
    }
    if (cell.locked && cell.name === 'CNOT' && cell.role === 'target') return <div className="w-full h-full flex items-center justify-center"><div className="w-9 h-9 border-2 border-slate-400/80 bg-slate-800/60 rounded flex items-center justify-center select-none"><span className="text-slate-200 text-base font-bold leading-none">X</span></div></div>;
    if (cell.locked && cell.name === 'CZ'   && cell.role === 'target') return <div className="w-full h-full flex items-center justify-center"><div className="w-9 h-9 border border-slate-400/70 bg-slate-500/10 rounded flex items-center justify-center select-none"><span className="text-slate-300 text-base font-bold leading-none">Z</span></div></div>;
    if (cell.locked && !TWO_WIRE.includes(cell.name)) return <LockedGate cell={cell} />;

    return undefined;
  }, [restrictToBlanks, onDelete]);

  return (
    <div className="bg-slate-900 border border-slate-700/50 rounded-xl shadow-xl p-5 inline-block min-w-max relative">
      {circuitState.map((wire, wireIndex) => (
        <div key={`wire-${wireIndex}`} className="flex items-center mb-2 last:mb-0">
          <button
            onClick={() => onWireClick && onWireClick(wireIndex)}
            className={`w-16 font-mono font-medium text-right pr-4 text-sm shrink-0 transition-colors ${
              selectedQubit === wireIndex
                ? 'text-purple-400'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            title={selectedQubit === wireIndex ? 'Clear ⟨Z⟩ selection' : `Show ⟨Z⟩ for q[${wireIndex}]`}
          >
            q[{wireIndex}]
          </button>
          <div className="flex relative items-center py-2 px-1">
            <div className="absolute left-0 right-0 h-px bg-slate-600 z-0" />
            {wire.flatMap((cell, stepIndex) => {
              const elements = [];
              // Divider between given circuit and student-editable area
              if (separatorStep != null && stepIndex === separatorStep) {
                elements.push(
                  <div
                    key={`sep-${wireIndex}`}
                    className="w-0.5 h-10 bg-blue-500/40 mx-1.5 shrink-0 self-center rounded-full"
                    title="Student circuit starts here"
                  />
                );
              }
              elements.push(
                <div
                  key={`slot-${wireIndex}-${stepIndex}`}
                  className="w-14 h-14 relative flex items-center justify-center mx-1 z-10"
                >
                  <CircuitCell
                    cell={cell}
                    wireIndex={wireIndex}
                    stepIndex={stepIndex}
                    customRenderer={customRenderer}
                    onDelete={onDelete}
                  />
                </div>
              );
              return elements;
            })}
          </div>
        </div>
      ))}

      {/* Hidden blocks overlay */}
      {hiddenBlocks && hiddenBlocks.map((block, i) => (
        <div
          key={`hidden-${i}`}
          className="absolute z-40 bg-slate-800/95 border border-slate-600 rounded-lg flex items-center justify-center backdrop-blur-sm shadow-xl"
          style={{
            top:    `calc(1.25rem + ${block.topWire}   * 5rem)`,
            left:   `calc(5.75rem + ${block.startStep} * 4rem)`,
            width:  `calc(${(block.endStep - block.startStep + 1)} * 4rem - 0.5rem)`,
            height: `calc(${(block.bottomWire - block.topWire  + 1)} * 5rem - 0.5rem)`,
          }}
        >
          <span className="text-slate-400 font-bold tracking-widest uppercase text-xs">Hidden Circuit</span>
        </div>
      ))}
    </div>
  );
}

// ─── Final score screen ───────────────────────────────────────────────────────

function FinalScreen({ scores, questions, onRetry }) {
  const totalPoints = scores.reduce((s, r) => s + r.points, 0);
  const maxPoints   = questions.reduce((s, q) => s + q.points, 0);
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

      <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-5 flex flex-col gap-3 min-w-80">
        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-1">Breakdown</p>
        {questions.map((q, i) => {
          const s = scores[i];
          const earned = s?.points ?? 0;
          const hint   = s?.usedHint;
          return (
            <div key={q.id} className="flex justify-between items-center text-sm gap-4">
              <span className="text-slate-300 truncate">{q.title}</span>
              <span className="shrink-0">
                {hint && <span className="text-amber-500/80 text-xs mr-2">(revealed)</span>}
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

function initCircuit(question) {
  const minLength     = Math.max(...question.circuit.map(w => w.length));
  const desiredLength = question.restrictToBlanks ? minLength : Math.max(8, minLength + 3);
  return question.circuit.map(wire =>
    [...wire.map(cell => (cell ? { ...cell } : null)), ...Array(Math.max(0, desiredLength - minLength)).fill(null)]
  );
}

export default function QuestionsPage() {
  // ── Active question set (default = built-in, replaced when a .qpkg is loaded) ──
  const [activeQuestions, setActiveQuestions] = useState(QUESTIONS);
  const [quizTitle, setQuizTitle]             = useState(null); // null = practice mode
  const quizFileRef = useRef(null);

  const [questionIndex, setQuestionIndex] = useState(0);
  const [scores, setScores]               = useState([]);
  const [phase, setPhase]                 = useState('playing');

  const question = activeQuestions[questionIndex];

  const [circuitState,    setCircuitState]    = useState(() => initCircuit(question));
  const [feedback,        setFeedback]        = useState(null);
  const [answerRevealed,  setAnswerRevealed]  = useState(false);

  const [engine,   setEngine]   = useState(null);
  const [isReady,  setIsReady]  = useState(false);
  const [simResults, setSimResults] = useState(null);
  const [shots, setShots] = useState(100);
  const [selectedQubit, setSelectedQubit] = useState(null);

  // ── Helper: reset everything for a given question set ──────────────────────
  function startQuiz(qs) {
    setActiveQuestions(qs);
    setQuestionIndex(0);
    setScores([]);
    setPhase('playing');
    setCircuitState(initCircuit(qs[0]));
    setFeedback(null);
    setAnswerRevealed(false);
  }

  // ── Load .qpkg file ─────────────────────────────────────────────────────────
  function handleLoadQuizFile(e) {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const payload = decodeStudentPackage(ev.target.result);
        setQuizTitle(payload.meta?.title || 'Quiz');
        startQuiz(payload.questions);
      } catch (err) {
        alert(err.message);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  // ── Load Quantum Engine ─────────────────────────────────────────────────────
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

  // ── Simulate circuit whenever circuitState changes ──────────────────────────
  useEffect(() => {
    if (isReady && engine) {
      const normalizedCircuit = circuitState.map(wire => wire.map(cell => {
        if (!cell) return null;
        if (cell.blank) return cell.filled ? { ...cell, name: cell.filled } : null;
        return { ...cell };
      }));
      setSimResults(simulateCircuit(engine, normalizedCircuit, null, shots, selectedQubit));
    }
  }, [circuitState, isReady, engine, shots, selectedQubit]);

  // ── Reset circuit + UI state whenever the question changes ──────────────────
  useEffect(() => {
    setCircuitState(initCircuit(question));
    setFeedback(null);
    setAnswerRevealed(false);
    setSelectedQubit(null);
  }, [questionIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-expand circuit state to always have empty buffer slots at the end ──
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

  // ── DnD monitor ─────────────────────────────────────────────────────────────
  useEffect(() => {
    return monitorForElements({
      onDrop({ source, location }) {
        const [dest] = location.current.dropTargets;
        if (!dest) return;

        const { wireIndex, stepIndex } = dest.data;
        setCircuitState(prev => {
          const cell = prev[wireIndex]?.[stepIndex];
          if (source.data.type === 'gate' && cell?.blank && (cell.name === 'BLANK_2' || cell.name === 'BLANK_3')) {
            const is2Wire = TWO_WIRE.includes(source.data.name);
            const is3Wire = source.data.name === 'TOFFOLI';
            if ((cell.name === 'BLANK_2' && is2Wire) || (cell.name === 'BLANK_3' && is3Wire)) {
              const involvedWires = [];
              if (cell.name === 'BLANK_2') {
                involvedWires.push(wireIndex);
                involvedWires.push(cell.role === 'control' ? cell.targetWire : cell.controlWire);
              } else if (cell.name === 'BLANK_3') {
                involvedWires.push(cell.targetWire);
                involvedWires.push(cell.controls[0]);
                involvedWires.push(cell.controls[1]);
              }
              involvedWires.sort((a, b) => a - b);

              return prev.map((w, wi) => w.map((c, si) => {
                if (si === stepIndex && involvedWires.includes(wi) && c?.blank && c.name === cell.name) {
                  if (is2Wire) {
                    const top = involvedWires[0];
                    const bottom = involvedWires[1];
                    if (wi === top) {
                      return { ...c, filled: source.data.name, role: 'control', targetWire: bottom, controlWire: undefined };
                    } else {
                      return { ...c, filled: source.data.name, role: 'target', controlWire: top, targetWire: undefined };
                    }
                  } else if (is3Wire) {
                    const target = involvedWires[2];
                    const controls = [involvedWires[0], involvedWires[1]];
                    if (wi === target) {
                      return { ...c, filled: source.data.name, role: 'target', controls, targetWire: target };
                    } else {
                      return { ...c, filled: source.data.name, role: 'control', controls, targetWire: target };
                    }
                  }
                }
                return c;
              }));
            }
            return prev;
          }

          if (source.data.type === 'gate' && cell?.blank && (!cell.name || cell.name === 'BLANK')) {
            return prev.map((w, wi) => w.map((c, si) => 
              (wi === wireIndex && si === stepIndex && c?.blank) ? { ...c, filled: source.data.name } : c
            ));
          }

          if (question.restrictToBlanks) {
            const isCnotSwap = source.data.type === 'cnot-node' && dest.data.type === 'cnot-node-drop' && source.data.peerWire === dest.data.wireIndex && source.data.stepIndex === dest.data.stepIndex;
            const isToffoliSwap = source.data.type === 'toffoli-node' && dest.data.type === 'cnot-node-drop' && dest.data.stepIndex === source.data.stepIndex && (source.data.controls?.includes(dest.data.wireIndex) || source.data.targetWire === dest.data.wireIndex);
            
            if (isToffoliSwap) {
              return prev.map((w, wi) => w.map((c, si) => {
                if (si !== source.data.stepIndex || !c || c.name !== 'BLANK_3') return c;
                const oldWire = source.data.wireIndex;
                const swapWire = dest.data.wireIndex;
                const oldRole = prev[oldWire][si].role;
                const swapRole = prev[swapWire][si].role;
                if (oldRole === swapRole) return c;
                
                let newControls = [...source.data.controls];
                if (oldRole === 'control') newControls = [swapWire, newControls.find(cw => cw !== oldWire)];
                else newControls = [oldWire, newControls.find(cw => cw !== swapWire)];
                const newTarget = oldRole === 'control' ? oldWire : swapWire;
                
                if (wi === oldWire) return { ...c, role: swapRole, controls: newControls, targetWire: newTarget };
                if (wi === swapWire) return { ...c, role: oldRole, controls: newControls, targetWire: newTarget };
                if (newControls.includes(wi) || newTarget === wi) return { ...c, controls: newControls, targetWire: newTarget };
                return c;
              }));
            }

            if (isCnotSwap) {
              return prev.map((w, wi) => w.map((c, si) => {
                if (si !== source.data.stepIndex || !c || c.name !== 'BLANK_2') return c;
                const oldWire = source.data.wireIndex;
                const peerWire = source.data.peerWire;
                if (wi === oldWire) {
                  const role = source.data.role === 'control' ? 'target' : 'control';
                  return { ...c, role, [role === 'control' ? 'controlWire' : 'targetWire']: undefined, [role === 'control' ? 'targetWire' : 'controlWire']: peerWire };
                }
                if (wi === peerWire) {
                  const role = source.data.role;
                  return { ...c, role, [role === 'control' ? 'controlWire' : 'targetWire']: undefined, [role === 'control' ? 'targetWire' : 'controlWire']: oldWire };
                }
                return c;
              }));
            }

            if (dest.data.type === 'gate-insert' || (dest.data.type === 'cnot-node-drop' && !isCnotSwap && !isToffoliSwap)) {
              return prev;
            }
          }
          const next = applyGateDrop(prev, source.data, dest.data, {
            hiddenBlocks: question.hiddenBlocks,
          });
          // For free-form (equivalent circuit) mode, left-align after every drop
          return question.restrictToBlanks ? next : compactCircuit(next);
        });
        setFeedback(null);
      },
    });
  }, [question]);

  // ── Delete gate ─────────────────────────────────────────────────────────────
  const deleteGate = useCallback((wireIndex, stepIndex) => {
    setCircuitState(prev => {
      const cell = prev[wireIndex]?.[stepIndex];
      // Blanks: clear the filled gate but preserve the blank structure so the
      // student can fill it again.  removeGateFromCircuit now fully deletes
      // blanks (matching builder behaviour), so we intercept here first.
      if (cell?.blank) {
        if (cell.name === 'BLANK_2' || cell.name === 'BLANK_3') {
          return prev.map(w => w.map((c, si) =>
            (si === stepIndex && c?.blank && c.name === cell.name) ? { ...c, filled: undefined } : c
          ));
        }
        // single BLANK: clear fill only
        return prev.map((w, wi) => w.map((c, si) =>
          (wi === wireIndex && si === stepIndex && c?.blank) ? { ...c, filled: undefined } : c
        ));
      }
      // removeGateFromCircuit guards cell.locked — locked question gates are never removed
      const next = removeGateFromCircuit(prev, wireIndex, stepIndex);
      // Left-align after delete in free-form mode
      return question.restrictToBlanks ? next : compactCircuit(next);
    });
    setFeedback(null);
  }, [question]);

  // ── Check answer ─────────────────────────────────────────────────────────────
  const checkCorrect = useCallback(() => {
    if (!question.restrictToBlanks) {
      if (!simResults || simResults.stateVector.length === 0 || !engine) return false;

      const expectedGrid = question.circuit.map(wire => wire.map(cell => {
        if (!cell || cell.blank) return null;
        return { ...cell };
      }));

      if (question.answer) {
        // Answer step indices from the builder are 0-based (relative to answerCircuit).
        // Offset them past the question circuit so they don't overwrite locked gates.
        const qLen = question.circuit[0].length;
        question.answer.forEach(({ wireIndex, stepIndex, gate, role, targetWire, controlWire, controls }) => {
          const absStep = stepIndex + qLen;
          while (expectedGrid[0].length <= absStep) expectedGrid.forEach(w => w.push(null));
          if (role) {
            expectedGrid[wireIndex][absStep] = { name: gate, role, targetWire, controlWire, controls };
          } else {
            expectedGrid[wireIndex][absStep] = { name: gate };
          }
        });
      }

      const expectedSim = simulateCircuit(engine, expectedGrid, null, shots, null);
      if (!expectedSim || expectedSim.stateVector.length === 0) return false;

      let realPart = 0, imagPart = 0;
      for (let i = 0; i < simResults.stateVector.length; i++) {
        realPart += simResults.stateVector[i].real * expectedSim.stateVector[i].real + simResults.stateVector[i].imag * expectedSim.stateVector[i].imag;
        imagPart += simResults.stateVector[i].imag * expectedSim.stateVector[i].real - simResults.stateVector[i].real * expectedSim.stateVector[i].imag;
      }
      return (realPart * realPart + imagPart * imagPart) > 0.99;
    }

    for (let w = 0; w < circuitState.length; w++) {
      for (let s = 0; s < circuitState[w].length; s++) {
        const cell = circuitState[w][s];
        if (cell?.blank) {
              const originalCell = question.circuit[w]?.[s];
              if (!originalCell) return false;

          if (cell.name === 'BLANK_2' || cell.name === 'BLANK_3') {
            const isSymmetric = cell.filled === 'CZ';
            if (!isSymmetric) {
              if (cell.name === 'BLANK_2') {
                if (cell.role !== originalCell.role) return false;
                if (cell.targetWire !== originalCell.targetWire) return false;
                if (cell.controlWire !== originalCell.controlWire) return false;
              } else if (cell.name === 'BLANK_3') {
                if (cell.role !== originalCell.role) return false;
                if (cell.targetWire !== originalCell.targetWire) return false;
                if (cell.controls || originalCell.controls) {
                  if (!cell.controls || !originalCell.controls) return false;
                  const c1 = [...cell.controls].sort((a, b) => a - b);
                  const c2 = [...originalCell.controls].sort((a, b) => a - b);
                  if (c1[0] !== c2[0] || c1[1] !== c2[1]) return false;
                }
              }
            }

            // Only check once per multi-qubit blank (at the original control wire)
            if (originalCell.role !== 'control') continue;
            if (originalCell.name === 'BLANK_3' && originalCell.controls && originalCell.controls[0] !== w) continue;
          }

              const expected = (question.answer || []).find(a => a.wireIndex === w && a.stepIndex === s);
              if (expected) {
                if (cell.filled !== expected.gate) return false;
              } else {
                if (cell.filled) return false;
              }
        }
      }
    }
    return true;
  }, [circuitState, question, simResults, engine, shots]);

  // ── Advance to next question ─────────────────────────────────────────────────
  const advanceQuestion = useCallback((pointsEarned) => {
    const record     = { questionId: question.id, points: pointsEarned, usedHint: answerRevealed };
    const newScores  = [...scores, record];
    setScores(newScores);
    if (questionIndex + 1 < activeQuestions.length) {
      setQuestionIndex(qi => qi + 1);
    } else {
      setPhase('done');
    }
  }, [scores, question, questionIndex, answerRevealed, activeQuestions]);

  const handleSubmit = () => {
    if (answerRevealed) { advanceQuestion(0); return; }
    if (checkCorrect()) {
      setFeedback('correct');
      setTimeout(() => advanceQuestion(question.points), 1400);
    } else {
      setFeedback('incorrect');
    }
  };

  const handleGetAnswer = () => {
    setCircuitState(prev => {
      if (!question.restrictToBlanks) {
        // Equivalent-circuit mode: clear student gates, then place answer gates
        // with the same offset used in checkCorrect so they land after the given circuit.
        let next = prev.map(w => w.map(c => (c && !c.locked) ? null : c));
        if (question.answer) {
          const qLen = question.circuit[0].length;
          question.answer.forEach(({ wireIndex, stepIndex, gate, role, targetWire, controlWire, controls }) => {
            const absStep = stepIndex + qLen;
            while (next[0].length <= absStep) next.forEach(w => w.push(null));
            if (role) {
              next[wireIndex][absStep] = { name: gate, role, targetWire, controlWire, controls };
            } else {
              next[wireIndex][absStep] = { name: gate };
            }
          });
        }
        return next;
      }

      // restrictToBlanks mode: reset blank fills, then fill each blank with its answer gate.
      let next = prev.map((w, wi) => w.map((c, si) => {
        if (c?.blank) {
          const orig = question.circuit[wi]?.[si];
          if (orig) return { ...orig, filled: undefined };
        }
        return c;
      }));
      if (question.answer) {
        question.answer.forEach(({ wireIndex, stepIndex, gate, role, targetWire, controlWire, controls }) => {
          while (next[0].length <= stepIndex) next.forEach(w => w.push(null));
          if (role) {
            next[wireIndex][stepIndex] = { name: gate, role, targetWire, controlWire, controls };
          } else {
            const cell = next[wireIndex][stepIndex];
            if (cell?.blank) {
              if (cell.name === 'BLANK_2' || cell.name === 'BLANK_3') {
                next = next.map(w => w.map((c, si) =>
                  (si === stepIndex && c?.blank && c.name === cell.name) ? { ...c, filled: gate } : c
                ));
              } else {
                next[wireIndex][stepIndex] = { ...cell, filled: gate };
              }
            }
          }
        });
      }
      return next;
    });
    setAnswerRevealed(true);
    setFeedback(null);
  };

  const handleRetry = () => startQuiz(activeQuestions);

  // ── Final screen ──────────────────────────────────────────────────────────────
  if (phase === 'done') {
    return <FinalScreen scores={scores} questions={activeQuestions} onRetry={handleRetry} />;
  }

  const maxPoints    = activeQuestions.reduce((s, q) => s + q.points, 0);
  const currentScore = scores.reduce((s, r) => s + r.points, 0);

  // For equivalent-circuit questions: show a separator after the given circuit
  const separatorStep = !question.restrictToBlanks ? question.circuit[0].length : undefined;

  return (
    <div className="fixed inset-0 flex flex-col font-sans text-slate-300 bg-slate-950">

      {/* ── Top bar ─────────────────────────────────────────────────────────── */}
      <header className="bg-slate-900 border-b border-slate-700/50 flex items-center gap-4 px-5 py-3 shrink-0">
        <Link to="/" className="text-slate-500 hover:text-slate-200 text-xs transition-colors shrink-0">
          ← Visualizer
        </Link>

        <span className="text-slate-700 select-none">|</span>

        {/* Title: quiz name when loaded, otherwise "Practice Questions" */}
        <h1 className="text-sm font-semibold text-white tracking-tight">
          {quizTitle ?? 'Practice Questions'}
        </h1>

        {/* Back to practice (only when a quiz file is loaded) */}
        {quizTitle && (
          <button
            onClick={() => { setQuizTitle(null); startQuiz(QUESTIONS); }}
            className="text-slate-500 hover:text-slate-200 text-xs transition-colors shrink-0"
          >
            ← Practice
          </button>
        )}

        <Link to="/builder" className="text-slate-500 hover:text-slate-200 text-xs transition-colors shrink-0">
          Question Builder →
        </Link>

        {/* Load quiz file */}
        <input ref={quizFileRef} type="file" accept=".qpkg" onChange={handleLoadQuizFile} className="hidden" />
        <button
          onClick={() => quizFileRef.current?.click()}
          className="px-3 py-1 text-xs bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-400 hover:text-slate-200 rounded-lg transition-colors shrink-0"
          title="Load a .qpkg quiz file from your teacher"
        >
          ↑ Load Quiz File
        </button>

        <div className="flex-1" />

        {/* Progress dots */}
        <div className="flex gap-2 items-center">
          {activeQuestions.map((q, i) => (
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

        <span className="text-[11px] text-slate-400 font-mono tabular-nums shrink-0">
          <span className="text-white font-semibold">{currentScore}</span>
          <span className="text-slate-600"> / {maxPoints} pts</span>
        </span>
      </header>

      {/* ── Body ────────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Left: gate palette */}
        <aside className="w-44 bg-slate-900 border-r border-slate-700/50 flex flex-col shrink-0">
          <div className="px-4 py-3 border-b border-slate-700/50">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Gate Palette</p>
            <p className="text-[10px] text-slate-600 mt-0.5">
              {question.restrictToBlanks ? 'Drag onto a blank' : 'Drag onto circuit'}
            </p>
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
              Question {questionIndex + 1} of {activeQuestions.length}
              <span className="text-slate-600"> · {question.points} points</span>
            </p>
            <h2 className="text-xl font-bold text-white mb-2">{question.title}</h2>
            <p className="text-sm text-slate-400 max-w-lg leading-relaxed">{question.description}</p>
            {/* Label for equivalent-circuit questions */}
            {!question.restrictToBlanks && separatorStep != null && (
              <p className="text-[10px] text-slate-600 mt-1">
                The blue line separates the given circuit (left) from your additions (right). Both count for amplitude.
              </p>
            )}
          </div>

          {/* Circuit board */}
          <div className="overflow-auto">
            <QuestionCircuit
              circuitState={circuitState}
              hiddenBlocks={question.hiddenBlocks}
              restrictToBlanks={question.restrictToBlanks}
              onDelete={deleteGate}
              separatorStep={separatorStep}
              selectedQubit={selectedQubit}
              onWireClick={wi => setSelectedQubit(prev => prev === wi ? null : wi)}
            />
          </div>

          {/* Controls + feedback */}
          <div className="flex items-center gap-3 flex-wrap">
            {answerRevealed ? (
              <>
                <div className="text-sm text-amber-400 bg-amber-400/10 border border-amber-400/20 rounded-lg px-3 py-1.5">
                  Answer revealed — 0 points for this question
                </div>
                <button
                  onClick={() => advanceQuestion(0)}
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm font-semibold rounded-lg transition-colors"
                >
                  {questionIndex + 1 < activeQuestions.length ? 'Next Question →' : 'Finish →'}
                </button>
              </>
            ) : (
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
          selectedQubit={selectedQubit}
          simResults={simResults}
          shots={shots}
          setShots={setShots}
          onResample={() => {
            const normalizedCircuit = circuitState.map(w => w.map(c => {
              if (!c) return null;
              if (c.blank) return c.filled ? { ...c, name: c.filled } : null;
              return { ...c };
            }));
            setSimResults(simulateCircuit(engine, normalizedCircuit, null, shots, selectedQubit));
          }}
        />
      </div>
    </div>
  );
}
