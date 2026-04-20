import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { Plus, Trash2, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { monitorForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';

import initQuantumEngine from './wasm/quantum_engine.js'
import { SINGLE_QUBIT_GATES, MAX_QUBITS } from './constants';
import { compactCircuit } from './utils/compactCircuit';
import { simulateCircuit } from './utils/simulateCircuit';
import { circuitToCode, parseCode } from './utils/circuitCode';
import { removeGateFromCircuit, removeWireFromGrid, insertColumnIfOccupied, clearGatesAfterMeasure, applyGateDrop } from './utils/circuitDnD';
import DraggableGate from './components/DraggableGate';
import DraggableCnotNode from './components/DraggableCnotNode';
import DraggablePlacedGate from './components/DraggablePlacedGate';
import DraggableBarrier from './components/DraggableBarrier';
import CircuitCell from './components/CircuitCell';
import DropZone from './components/DropZone';
import ResultsPanel from './components/ResultsPanel';
import './App.css'

function App() {
  const [circuit, setCircuit] = useState([
    [null, null, null, null],
    [null, null, null, null]
  ]);

  const [engine, setEngine] = useState(null);
  const [isReady, setIsReady] = useState(false);
  const [simResults, setSimResults] = useState(null);

  const [shots, setShots] = useState(100);
  const [measureStep, setMeasureStep] = useState(null);
  const [selectedQubit, setSelectedQubit] = useState(null);
  const [hoveredBarrier, setHoveredBarrier] = useState(null);

  // Circuit code input state
  const [codeInput, setCodeInput] = useState('');
  const [codeError, setCodeError] = useState(null);
  const codeInputFocused = useRef(false);

  // For each wire: the first step index that contains a MEASURE gate (-1 if none)
  const measureStepPerWire = circuit.map(wire => {
    const idx = wire.findIndex(cell => cell?.name === 'MEASURE');
    return idx;
  });

  // ---------------------------------------------------------------------------
  // WASM engine
  // ---------------------------------------------------------------------------
  useEffect(() => {
    async function loadEngine() {
      try {
        const Module = await initQuantumEngine();
        setEngine(Module);
        setIsReady(true);
      } catch (err) {
        console.error('Failed to load WASM:', err);
      }
    }
    loadEngine();
  }, []);

  const runCircuit = useCallback((targetStep = null) => {
    setSimResults(simulateCircuit(engine, circuit, targetStep, shots, selectedQubit));
  }, [circuit, engine, shots, selectedQubit]);

  useEffect(() => {
    if (isReady && engine) {
      runCircuit(measureStep);
    }
  }, [measureStep, circuit, shots, isReady, engine, runCircuit]);

  // Sync code input when circuit changes externally (drag-drop, etc.)
  useEffect(() => {
    if (!codeInputFocused.current) {
      setCodeInput(circuitToCode(circuit));
    }
  }, [circuit]);

  // ---------------------------------------------------------------------------
  // Auto-resize
  // ---------------------------------------------------------------------------
  useEffect(() => {
    let highestOccupiedIndex = -1;
    circuit.forEach(wire => {
      for (let i = wire.length - 1; i >= 0; i--) {
        if (wire[i] !== null) {
          if (i > highestOccupiedIndex) highestOccupiedIndex = i;
          break;
        }
      }
    });

    const desiredLength = Math.max(10, highestOccupiedIndex + 6);
    const currentLength = circuit[0].length;

    if (currentLength !== desiredLength) {
      setCircuit(prevCircuit =>
        prevCircuit.map(wire => {
          if (currentLength < desiredLength) {
            return [...wire, ...Array(desiredLength - currentLength).fill(null)];
          } else {
            return wire.slice(0, desiredLength);
          }
        })
      );
    }
  }, [circuit]);

  // ---------------------------------------------------------------------------
  // Drag-and-drop monitor
  // ---------------------------------------------------------------------------
  useEffect(() => {
    return monitorForElements({
      onDrop({ source, location }) {
        const destination = location.current.dropTargets[0];
        if (!destination) return;

        setCircuit(prev => {
          const next = applyGateDrop(prev, source.data, destination.data);
          if (next === prev) return prev;
          return compactCircuit(clearGatesAfterMeasure(next));
        });
      },
    });
  }, []);

  // ---------------------------------------------------------------------------
  // Circuit editing helpers
  // ---------------------------------------------------------------------------
  const deleteGate = useCallback((wireIndex, stepIndex) => {
    setCircuit(prev => {
      return compactCircuit(clearGatesAfterMeasure(removeGateFromCircuit(prev, wireIndex, stepIndex)));
    });
  }, []);


  const resizeBarrier = useCallback((wireIndex, stepIndex, action) => {
    setCircuit(prev => {
      const newCircuit = prev.map(wire => [...wire]);
      const cell = newCircuit[wireIndex][stepIndex];
      if (!cell || cell.name !== 'BARRIER') return prev;

      for (let w = cell.topWire; w <= cell.bottomWire; w++) newCircuit[w][stepIndex] = null;

      let newTop = cell.topWire;
      let newBottom = cell.bottomWire;
      if (action === 'extendTop')    newTop    = Math.max(0, newTop - 1);
      if (action === 'shrinkTop')    newTop    = Math.min(newTop + 1, newBottom);
      if (action === 'extendBottom') newBottom = Math.min(prev.length - 1, newBottom + 1);
      if (action === 'shrinkBottom') newBottom = Math.max(newBottom - 1, newTop);

      const newSpanWires = Array.from({ length: newBottom - newTop + 1 }, (_, i) => newTop + i);
      insertColumnIfOccupied(newCircuit, stepIndex, newSpanWires);

      for (let w = newTop; w <= newBottom; w++) {
        newCircuit[w][stepIndex] = { name: 'BARRIER', topWire: newTop, bottomWire: newBottom };
      }
      return compactCircuit(clearGatesAfterMeasure(newCircuit));
    });
  }, []);

  const handleRightClickDelete = (e, wireIndex, stepIndex) => {
    e.preventDefault();
    deleteGate(wireIndex, stepIndex);
  };

  const addQubit = () => {
    if (circuit.length >= MAX_QUBITS) return;
    const numSteps = circuit[0].length;
    setCircuit([...circuit, Array(numSteps).fill(null)]);
  };

  const removeQubit = (indexToRemove) => {
    if (circuit.length <= 1) return;
    setCircuit(prev => compactCircuit(clearGatesAfterMeasure(removeWireFromGrid(prev, indexToRemove))));
  };

  // ---------------------------------------------------------------------------
  // Circuit code load
  // ---------------------------------------------------------------------------
  const loadFromCode = () => {
    const parsed = parseCode(codeInput, circuit.length);
    if (!parsed) {
      setCodeError('Could not parse — check syntax e.g. h(0), cx(0,1), m(1)');
      return;
    }
    if (parsed.length > MAX_QUBITS) {
      setCodeError(`Maximum ${MAX_QUBITS} qubits supported`);
      return;
    }
    setCodeError(null);
    setCircuit(compactCircuit(clearGatesAfterMeasure(parsed)));
  };

  const handleCodeKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      loadFromCode();
    }
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div className="fixed inset-0 w-full flex font-sans text-slate-300 bg-slate-950">

      {/* Left sidebar */}
      <aside className="w-55 bg-slate-900 border-r border-slate-700/50 flex flex-col shrink-0 z-10">
        <div className="px-4 py-3 border-b border-slate-700/50">
          <h1 className="text-sm font-semibold text-white tracking-tight leading-tight">Circuit Visualizer</h1>
          {!isReady && <p className="text-[10px] text-amber-400 animate-pulse mt-0.5">Initializing…</p>}
          <Link
            to="/questions"
            className="text-[10px] text-blue-400 hover:text-blue-300 transition-colors mt-1.5 block"
          >
            Practice Questions →
          </Link>
          <Link
            to="/builder"
            className="text-[10px] text-slate-500 hover:text-slate-300 transition-colors mt-0.5 block"
          >
            Question Builder →
          </Link>
        </div>

        <div className="p-4 flex flex-col gap-4 overflow-y-auto flex-1">
          <div>
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-3">Single-qubit</p>
            <div className="grid grid-cols-2 gap-3 items-center justify-items-center">
              {SINGLE_QUBIT_GATES.map(gate => (
                <DraggableGate key={gate} gate={gate} />
              ))}
            </div>
          </div>
          <div>
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-2">Quantum 2q</p>
            <div className="flex gap-2 justify-center">
              {['CNOT', 'CZ'].map(gate => (
                <DraggableGate key={gate} gate={gate} />
              ))}
            </div>
          </div>
          <div>
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-2">Quantum 3q</p>
            <div className="flex gap-2 justify-center">
              {['TOFFOLI'].map(gate => (
                <DraggableGate key={gate} gate={gate} />
              ))}
            </div>
          </div>
          <div>
            <p className="text-[10px] font-semibold text-amber-500/70 uppercase tracking-widest mb-2">Classical ctrl</p>
            <div className="flex gap-2 justify-center">
              {['FF_X', 'FF_Z'].map(gate => (
                <DraggableGate key={gate} gate={gate} />
              ))}
            </div>
          </div>
          <div>
            <p className="text-[10px] font-semibold text-violet-400/70 uppercase tracking-widest mb-2">Barrier</p>
            <div className="flex justify-center">
              <DraggableGate gate="BARRIER" />
            </div>
          </div>
        </div>
      </aside>

      {/* Circuit board */}
      <div className="flex-1 overflow-auto p-3 bg-slate-950">
        <div className="bg-slate-900 border border-slate-700/50 rounded-xl shadow-xl p-5 inline-block min-w-max">

          {/* Time scrubber row */}
          <div className="flex items-center mb-3">
            <div className="w-16 text-[10px] text-slate-400 font-semibold uppercase tracking-widest text-right pr-4">Time</div>
            <div className="flex relative items-center py-2 px-9">
              {circuit[0]?.map((_, stepIndex) => (
                <div
                  key={`time-${stepIndex}`}
                  onClick={() => setMeasureStep(measureStep === stepIndex ? null : stepIndex)}
                  className="w-14 h-5 relative flex items-center justify-center mx-1 z-30 cursor-pointer group/timeline"
                  title={measureStep === stepIndex ? 'Clear scrubber' : `Measure at step ${stepIndex}`}
                >
                  <div className={`w-3 h-3 rounded-full border-2 transition-all ${
                    measureStep === stepIndex
                      ? 'bg-purple-500 border-purple-300 shadow-[0_0_8px_rgba(168,85,247,0.5)] scale-125'
                      : 'bg-slate-800 border-slate-600 group-hover/timeline:bg-slate-700'
                  }`} />
                  {measureStep === stepIndex && (
                    <div
                      className="absolute top-4 left-1/2 w-[2px] bg-purple-500/50 -translate-x-1/2 pointer-events-none"
                      style={{ height: `${circuit.length * 5}rem` }}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Qubit wires */}
          {circuit.map((wire, wireIndex) => (
            <div key={`wire-${wireIndex}`} className="flex items-center mb-2 group">

              <button
                onClick={() => setSelectedQubit(selectedQubit === wireIndex ? null : wireIndex)}
                className={`w-16 font-mono font-medium text-right pr-4 text-sm transition-colors shrink-0 ${
                  selectedQubit === wireIndex
                    ? 'text-purple-400'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title={selectedQubit === wireIndex ? 'Clear ⟨Z⟩ selection' : `Show ⟨Z⟩ for q[${wireIndex}]`}
              >
                q[{wireIndex}]
              </button>

              <div className="flex relative items-center py-2 px-1">
                {measureStepPerWire[wireIndex] === -1 ? (
                  <div className="absolute left-0 right-0 h-px bg-slate-600 z-0" />
                ) : (
                  <>
                    <div
                      className="absolute left-0 h-px bg-slate-600 z-0"
                      style={{ width: `calc(${measureStepPerWire[wireIndex]} * (3.5rem + 0.5rem) + 2rem)` }}
                    />
                    <div
                      className="absolute right-0 z-0"
                      style={{
                        left: `calc(${measureStepPerWire[wireIndex]} * (3.5rem + 0.5rem) + 2rem)`,
                        top: 'calc(50% - 2px)',
                        height: '4px',
                        borderTop:    '1.5px solid rgba(251,191,36,0.55)',
                        borderBottom: '1.5px solid rgba(251,191,36,0.55)',
                      }}
                    />
                  </>
                )}

                {wire.map((cell, stepIndex) => (
                  <div
                    key={`slot-${wireIndex}-${stepIndex}`}
                    className={`w-14 h-14 relative flex items-center justify-center mx-1 z-10 ${cell?.name === 'BARRIER' ? 'overflow-visible' : ''}`}
                  >
                    <CircuitCell
                      cell={cell}
                      wireIndex={wireIndex}
                      stepIndex={stepIndex}
                      onDelete={deleteGate}
                      onRightClickDelete={handleRightClickDelete}
                      hoveredBarrier={hoveredBarrier}
                      onHoverBarrier={setHoveredBarrier}
                      onResizeBarrier={resizeBarrier}
                    />
                  </div>
                ))}
              </div>

              <button
                onClick={() => removeQubit(wireIndex)}
                className="ml-3 text-slate-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                title="Remove qubit"
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}

          <div className="mt-4">
            <button
              onClick={addQubit}
              disabled={circuit.length >= MAX_QUBITS}
              className="flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:text-slate-500"
            >
              <Plus size={13} /> Add Qubit
            </button>
          </div>
        </div>
      </div>

      <ResultsPanel
        isReady={isReady}
        circuit={circuit}
        measureStep={measureStep}
        selectedQubit={selectedQubit}
        simResults={simResults}
        shots={shots}
        setShots={setShots}
        onResample={() => runCircuit(measureStep)}
      >
              {/* Circuit code */}
              <div className="px-4 py-3">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-2">Circuit Code</p>
                <textarea
                  value={codeInput}
                  onChange={(e) => { setCodeInput(e.target.value); setCodeError(null); }}
                  onFocus={() => { codeInputFocused.current = true; }}
                  onBlur={() => { codeInputFocused.current = false; }}
                  onKeyDown={handleCodeKeyDown}
                  rows={3}
                  spellCheck={false}
                  placeholder="h(0), cx(0,1), m(1)"
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-slate-200 text-[11px] font-mono focus:outline-none focus:border-slate-500 resize-none leading-relaxed"
                />
                {codeError && (
                  <p className="text-[10px] text-red-400 mt-1">{codeError}</p>
                )}
                <button
                  onClick={loadFromCode}
                  className="mt-1.5 w-full text-[10px] font-semibold text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded py-1 transition-colors"
                >
                  Load ↵
                </button>
                <p className="text-[9px] text-slate-600 mt-1.5 leading-relaxed">
                  Gates: h x y z t m cx cz ccx ffx ffz<br />
                  e.g. <span className="text-slate-500">h(0), cx(0,1), ccx(0,1,2)</span>
                </p>
              </div>
      </ResultsPanel>
    </div>
  );
}

export default App;
