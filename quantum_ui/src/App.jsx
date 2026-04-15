import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { Plus, Trash2, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { monitorForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';

import initQuantumEngine from './wasm/quantum_engine.js'
import { SINGLE_QUBIT_GATES, MAX_QUBITS } from './constants';
import { compactCircuit } from './utils/compactCircuit';
import { simulateCircuit } from './utils/simulateCircuit';
import { circuitToCode, parseCode } from './utils/circuitCode';
import { removeGateFromCircuit, removeWireFromGrid, TWO_WIRE, insertColumnIfOccupied, writeTwoWireGateCells, writeToffoliGateCells, findToffoliWires } from './utils/circuitDnD';
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

        const gateData = source.data;
        const slotData = destination.data;

        if (gateData.type === 'gate' && gateData.name === 'BARRIER' && slotData.type === 'slot') {
          setCircuit(prev => {
            const newCircuit = prev.map(wire => [...wire]);
            const numW = prev.length;
            const step = slotData.stepIndex;

            const allWires = Array.from({ length: numW }, (_, i) => i);
            insertColumnIfOccupied(newCircuit, step, allWires);

            for (let w = 0; w < numW; w++) {
              newCircuit[w][step] = { name: 'BARRIER', topWire: 0, bottomWire: numW - 1 };
            }
            return compactCircuit(newCircuit);
          });
          return;
        }

        // Whole-barrier move
        if (gateData.type === 'barrier' && slotData.type === 'slot') {
          setCircuit(prev => {
            const newCircuit = prev.map(wire => [...wire]);
            const { topWire, bottomWire, stepIndex: oldStep } = gateData;
            const newStep = slotData.stepIndex;
            if (oldStep === newStep) return prev;
            
            for (let w = topWire; w <= bottomWire; w++) newCircuit[w][oldStep] = null;
            
            const barrierWires = Array.from({ length: bottomWire - topWire + 1 }, (_, i) => topWire + i);
            insertColumnIfOccupied(newCircuit, newStep, barrierWires);

            for (let w = topWire; w <= bottomWire; w++) {
              newCircuit[w][newStep] = { name: 'BARRIER', topWire, bottomWire };
            }
            return compactCircuit(newCircuit);
          });
          return;
        }

        // Barrier end-node resize — drop onto any slot (empty or barrier wire)
        if (gateData.type === 'barrier-end' && (slotData.type === 'slot' || slotData.type === 'gate-insert')) {
          setCircuit(prev => {
            const newCircuit = prev.map(wire => [...wire]);
            const { role, topWire, bottomWire, stepIndex: barrStep } = gateData;
            const newWire = slotData.wireIndex;
            if (slotData.stepIndex !== barrStep) return prev;

            let newTop = topWire;
            let newBottom = bottomWire;
            if (role === 'top') {
              newTop = Math.min(newWire, bottomWire);
            } else {
              newBottom = Math.max(newWire, topWire);
            }
            if (newTop === topWire && newBottom === bottomWire) return prev;

            // Clear old span
            for (let w = topWire; w <= bottomWire; w++) newCircuit[w][barrStep] = null;

            const newSpanWires = Array.from({ length: newBottom - newTop + 1 }, (_, i) => newTop + i);
            insertColumnIfOccupied(newCircuit, barrStep, newSpanWires);

            // Write new span
            for (let w = newTop; w <= newBottom; w++) {
              newCircuit[w][barrStep] = { name: 'BARRIER', topWire: newTop, bottomWire: newBottom };
            }
            return compactCircuit(newCircuit);
          });
          return;
        }

        if (gateData.type === 'gate' && slotData.type === 'slot') {
          setCircuit(prev => {
            const newCircuit = prev.map(wire => [...wire]);
            let targetWires = [];
            let cIndex, tIndex, c1, c2;

            if (TWO_WIRE.includes(gateData.name)) {
              cIndex = slotData.wireIndex;
              tIndex = cIndex < prev.length - 1 ? cIndex + 1 : cIndex - 1;
              if (tIndex < 0 || tIndex >= prev.length) return prev;
              // Validate: classical gates need a measured control wire;
              //           quantum gates need an unmeasured control wire;
              //           target must always be unmeasured.
              const ctrlMeasured = prev[cIndex]?.some(c => c?.name === 'MEASURE') ?? false;
              const tgtMeasured  = prev[tIndex]?.some(c => c?.name === 'MEASURE') ?? false;
              const isClassical  = ['FF_x', 'FF_Z'].includes(gateData.name);
              if (isClassical && !ctrlMeasured) return prev;
              if (!isClassical && ctrlMeasured) return prev;
              if (tgtMeasured) return prev;

              targetWires = [cIndex, tIndex];
            } else if (gateData.name === 'TOFFOLI') {
              c1 = slotData.wireIndex;
              if (prev.length < 3) return prev;
              ({ c2, target: tIndex } = findToffoliWires(c1, prev.length));
              const c1Measured  = prev[c1]?.some(c => c?.name === 'MEASURE') ?? false;
              const c2Measured  = prev[c2]?.some(c => c?.name === 'MEASURE') ?? false;
              const tgtMeasured = prev[tIndex]?.some(c => c?.name === 'MEASURE') ?? false;
              if (c1Measured || c2Measured || tgtMeasured) return prev;
              targetWires = [c1, c2, tIndex];
            } else {
              targetWires = [slotData.wireIndex];
            }

            const step = slotData.stepIndex;
            insertColumnIfOccupied(newCircuit, step, targetWires);

            if (TWO_WIRE.includes(gateData.name)) {
              writeTwoWireGateCells(newCircuit, cIndex, tIndex, step, gateData.name);
            } else if (gateData.name === 'TOFFOLI') {
              writeToffoliGateCells(newCircuit, c1, c2, tIndex, step);
            } else {
              newCircuit[slotData.wireIndex][step] = { name: gateData.name };
            }
            return compactCircuit(newCircuit);
          });
          return;
        }

        if (gateData.type === 'cnot-node' && slotData.type === 'slot') {
          setCircuit(prev => {
            const newCircuit = prev.map(wire => [...wire]);
            const { name: gateName, role, wireIndex: oldWire, stepIndex: oldStep, peerWire } = gateData;
            const newWire = slotData.wireIndex;
            const newStep = slotData.stepIndex;

            if (newWire === peerWire && newStep === oldStep) return prev;
            if (newStep !== oldStep) return prev;

            // Validate control-wire constraint when the control node is being moved
            if (role === 'control') {
              const isMeasured = prev[newWire]?.some(c => c?.name === 'MEASURE') ?? false;
              const isClassical = ['FF_x', 'FF_Z'].includes(gateName);
              if (isClassical && !isMeasured) return prev;
              if (!isClassical && isMeasured) return prev;
            }

            newCircuit[oldWire][oldStep] = null;
            newCircuit[newWire][newStep] = {
              name: gateName,
              role,
              [role === 'control' ? 'targetWire' : 'controlWire']: peerWire,
            };
            newCircuit[peerWire][oldStep] = {
              name: gateName,
              role: role === 'control' ? 'target' : 'control',
              [role === 'control' ? 'controlWire' : 'targetWire']: newWire,
            };

            return compactCircuit(newCircuit);
          });
          return;
        }

        if (gateData.type === 'toffoli-node' && slotData.type === 'slot') {
          setCircuit(prev => {
            const newCircuit = prev.map(wire => [...wire]);
            const { name: gateName, role, wireIndex: oldWire, stepIndex: oldStep, controls, targetWire } = gateData;
            const newWire = slotData.wireIndex;
            const newStep = slotData.stepIndex;

            if (newWire === oldWire && newStep === oldStep) return prev;
            if (newStep !== oldStep) return prev;

            if (role === 'control') {
              const otherControl = controls.find(c => c !== oldWire);
              if (newWire === otherControl || newWire === targetWire) return prev;
            } else {
              if (controls.includes(newWire)) return prev;
            }

            const isMeasured = prev[newWire]?.some(c => c?.name === 'MEASURE') ?? false;
            if (isMeasured) return prev;

            newCircuit[oldWire][oldStep] = null;
            let newControls = [...controls];
            let newTarget = targetWire;
            if (role === 'control') {
              newControls = [newWire, controls.find(c => c !== oldWire)];
            } else {
              newTarget = newWire;
            }

            newCircuit[newWire][newStep] = { name: gateName, role, controls: newControls, targetWire: newTarget };
            if (role === 'control') {
              const otherControl = controls.find(c => c !== oldWire);
              newCircuit[otherControl][oldStep].controls = newControls;
              newCircuit[targetWire][oldStep].controls = newControls;
            } else {
              newCircuit[controls[0]][oldStep].targetWire = newTarget;
              newCircuit[controls[1]][oldStep].targetWire = newTarget;
            }
            return compactCircuit(newCircuit);
          });
          return;
        }

        if (gateData.type === 'placed-gate' && slotData.type === 'slot') {
          setCircuit(prev => {
            const newCircuit = prev.map(wire => [...wire]);
            const { wireIndex: oldWire, stepIndex: oldStep, name } = gateData;
            const newWire = slotData.wireIndex;
            const newStep = slotData.stepIndex;

            if (oldWire === newWire && oldStep === newStep) return prev;

            newCircuit[oldWire][oldStep] = null;
            
            insertColumnIfOccupied(newCircuit, newStep, [newWire]);

            newCircuit[newWire][newStep] = { name };

            return compactCircuit(newCircuit);
          });
          return;
        }

        const isCnotSwap =
          gateData.type === 'cnot-node' &&
          slotData.type === 'cnot-node-drop' &&
          slotData.wireIndex === gateData.peerWire &&
          slotData.stepIndex === gateData.stepIndex;

        const isToffoliSwap =
          gateData.type === 'toffoli-node' &&
          slotData.type === 'cnot-node-drop' &&
          (gateData.controls.includes(slotData.wireIndex) || gateData.targetWire === slotData.wireIndex) &&
          slotData.stepIndex === gateData.stepIndex;

        const isInsert =
          slotData.type === 'gate-insert' ||
          (slotData.type === 'cnot-node-drop' && !isCnotSwap);

        if (isToffoliSwap) {
          setCircuit(prev => {
            const newCircuit = prev.map(wire => [...wire]);
            const oldWire = gateData.wireIndex;
            const swapWire = slotData.wireIndex;
            const step = gateData.stepIndex;
            const oldRole = newCircuit[oldWire][step].role;
            const swapRole = newCircuit[swapWire][step].role;
            if (oldRole === swapRole) return prev;
            const controls = [...gateData.controls];
            let newControls = controls;
            if (oldRole === 'control') newControls = [swapWire, controls.find(c => c !== oldWire)];
            else newControls = [oldWire, controls.find(c => c !== swapWire)];
            const newTarget = oldRole === 'control' ? oldWire : swapWire;
            newCircuit[oldWire][step].role = swapRole;
            newCircuit[swapWire][step].role = oldRole;
            newCircuit[newControls[0]][step].controls = newControls;
            newCircuit[newControls[0]][step].targetWire = newTarget;
            newCircuit[newControls[1]][step].controls = newControls;
            newCircuit[newControls[1]][step].targetWire = newTarget;
            newCircuit[newTarget][step].controls = newControls;
            newCircuit[newTarget][step].targetWire = newTarget;
            return compactCircuit(newCircuit);
          });
          return;
        }

        if (isCnotSwap) {
          setCircuit(prev => {
            const newCircuit = prev.map(wire => [...wire]);
            const oldWire = gateData.wireIndex;
            const peerWire = gateData.peerWire;
            const step = gateData.stepIndex;

            newCircuit[oldWire][step] = {
              name: gateData.name,
              role: gateData.role === 'control' ? 'target' : 'control',
              [gateData.role === 'control' ? 'controlWire' : 'targetWire']: peerWire,
            };
            newCircuit[peerWire][step] = {
              name: gateData.name,
              role: gateData.role,
              [gateData.role === 'control' ? 'targetWire' : 'controlWire']: oldWire,
            };
            return compactCircuit(newCircuit);
          });
          return;
        }

        if (isInsert) {
          setCircuit(prev => {
            let newCircuit = prev.map(wire => [...wire]);
            const insertStep = slotData.stepIndex;
            const targetWire = slotData.wireIndex;

            if (gateData.type === 'placed-gate') {
              newCircuit[gateData.wireIndex][gateData.stepIndex] = null;
            } else if (gateData.type === 'cnot-node') {
              newCircuit[gateData.wireIndex][gateData.stepIndex] = null;
              newCircuit[gateData.peerWire][gateData.stepIndex] = null;
            } else if (gateData.type === 'toffoli-node') {
              newCircuit[gateData.controls[0]][gateData.stepIndex] = null;
              newCircuit[gateData.controls[1]][gateData.stepIndex] = null;
              newCircuit[gateData.targetWire][gateData.stepIndex] = null;
            } else if (gateData.type === 'barrier') {
              for (let w = gateData.topWire; w <= gateData.bottomWire; w++) {
                newCircuit[w][gateData.stepIndex] = null;
              }
            }

            newCircuit = newCircuit.map(wire => {
              const newWire = [...wire];
              newWire.splice(insertStep, 0, null);
              return newWire;
            });

            if (gateData.type === 'gate') {
              if (TWO_WIRE.includes(gateData.name)) {
                const tIndex = targetWire < prev.length - 1 ? targetWire + 1 : targetWire - 1;
                if (tIndex < 0 || tIndex >= prev.length) return prev;
                newCircuit[targetWire][insertStep] = { name: gateData.name, role: 'control', targetWire: tIndex };
                newCircuit[tIndex][insertStep] = { name: gateData.name, role: 'target', controlWire: targetWire };
              } else if (gateData.name === 'TOFFOLI') {
                const c1 = targetWire;
                if (prev.length >= 3) {
                  const c2 = c1 + 1 < prev.length ? c1 + 1 : c1 - 1;
                  const tIndex = [c1 + 2, c1 - 1, c1 - 2].find(w => w >= 0 && w < prev.length && w !== c2) ?? 
                                 [...Array(prev.length).keys()].find(w => w !== c1 && w !== c2);
                  newCircuit[c1][insertStep] = { name: gateData.name, role: 'control', controls: [c1, c2], targetWire: tIndex };
                  newCircuit[c2][insertStep] = { name: gateData.name, role: 'control', controls: [c1, c2], targetWire: tIndex };
                  newCircuit[tIndex][insertStep] = { name: gateData.name, role: 'target', controls: [c1, c2], targetWire: tIndex };
                }
              } else {
                newCircuit[targetWire][insertStep] = { name: gateData.name };
              }
            } else if (gateData.type === 'placed-gate') {
              newCircuit[targetWire][insertStep] = { name: gateData.name };
            } else if (gateData.type === 'cnot-node') {
              newCircuit[targetWire][insertStep] = {
                name: gateData.name,
                role: gateData.role,
                [gateData.role === 'control' ? 'targetWire' : 'controlWire']: gateData.peerWire,
              };
              newCircuit[gateData.peerWire][insertStep] = {
                name: gateData.name,
                role: gateData.role === 'control' ? 'target' : 'control',
                [gateData.role === 'control' ? 'controlWire' : 'targetWire']: targetWire,
              };
            } else if (gateData.type === 'toffoli-node') {
              newCircuit[gateData.controls[0]][insertStep] = { name: gateData.name, role: 'control', controls: gateData.controls, targetWire: gateData.targetWire };
              newCircuit[gateData.controls[1]][insertStep] = { name: gateData.name, role: 'control', controls: gateData.controls, targetWire: gateData.targetWire };
              newCircuit[gateData.targetWire][insertStep] = { name: gateData.name, role: 'target', controls: gateData.controls, targetWire: gateData.targetWire };
            } else if (gateData.type === 'barrier') {
              const { topWire, bottomWire } = gateData;
              for (let w = topWire; w <= bottomWire; w++) {
                newCircuit[w][insertStep] = { name: 'BARRIER', topWire, bottomWire };
              }
            } else if (gateData.type === 'gate' && gateData.name === 'BARRIER') {
              const numW = prev.length;
              for (let w = 0; w < numW; w++) {
                newCircuit[w][insertStep] = { name: 'BARRIER', topWire: 0, bottomWire: numW - 1 };
              }
            }

            return compactCircuit(newCircuit);
          });
        }
      },
    });
  }, []);

  // ---------------------------------------------------------------------------
  // Circuit editing helpers
  // ---------------------------------------------------------------------------
  const deleteGate = useCallback((wireIndex, stepIndex) => {
    setCircuit(prev => {
      return compactCircuit(removeGateFromCircuit(prev, wireIndex, stepIndex));
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
      return compactCircuit(newCircuit);
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
    setCircuit(prev => compactCircuit(removeWireFromGrid(prev, indexToRemove)));
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
    setCircuit(parsed);
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
    <div className="fixed inset-0 flex font-sans text-slate-300 bg-slate-950">

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
              {['FF_x', 'FF_Z'].map(gate => (
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
