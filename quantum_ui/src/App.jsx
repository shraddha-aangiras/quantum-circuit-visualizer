import { useState, useEffect } from 'react'
import { Play, Plus, Trash2 } from 'lucide-react';
import { monitorForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';

import initQuantumEngine from './wasm/quantum_engine.js'
import { AVAILABLE_GATES } from './constants';
import { compactCircuit } from './utils/compactCircuit';
import { simulateShots } from './utils/simulateShots';
import DraggableGate from './components/DraggableGate';
import DraggableCnotNode from './components/DraggableCnotNode';
import DraggablePlacedGate from './components/DraggablePlacedGate';
import DropZone from './components/DropZone';
import MeasurementHistogram from './components/MeasurementHistogram'; 
import './App.css'

function App() {
  const [circuit, setCircuit] = useState([
    [null, null, null, null],
    [null, null, null, null]
  ]);

  const [engine, setEngine] = useState(null);
  const [probabilities, setProbabilities] = useState([]);
  const [stateVector, setStateVector] = useState([]);
  const [isReady, setIsReady] = useState(false);
  
  const [shots, setShots] = useState(100);
  const [shotResults, setShotResults] = useState([]);

  // ---------------------------------------------------------------------------
  // Auto-resize: keep at least 5 empty columns past the last occupied step
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

    const desiredLength = Math.max(5, highestOccupiedIndex + 5);
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

        // --- New gate from palette → empty slot ---
        if (gateData.type === 'gate' && slotData.type === 'slot') {
          setCircuit(prev => {
            const newCircuit = prev.map(wire => [...wire]);
            if (gateData.name === 'CNOT') {
              const cIndex = slotData.wireIndex;
              const tIndex = cIndex < prev.length - 1 ? cIndex + 1 : cIndex - 1;
              newCircuit[cIndex][slotData.stepIndex] = { name: 'CNOT', role: 'control', targetWire: tIndex };
              newCircuit[tIndex][slotData.stepIndex] = { name: 'CNOT', role: 'target', controlWire: cIndex };
            } else {
              newCircuit[slotData.wireIndex][slotData.stepIndex] = { name: gateData.name };
            }
            return compactCircuit(newCircuit);
          });
          return;
        }

        // --- Move a CNOT node to a different wire (same step only) ---
        if (gateData.type === 'cnot-node' && slotData.type === 'slot') {
          setCircuit(prev => {
            const newCircuit = prev.map(wire => [...wire]);
            const { role, wireIndex: oldWire, stepIndex: oldStep, peerWire } = gateData;
            const newWire = slotData.wireIndex;
            const newStep = slotData.stepIndex;

            if (newWire === peerWire && newStep === oldStep) return prev;
            if (newStep !== oldStep) return prev; // cross-step moves not supported

            newCircuit[oldWire][oldStep] = null;
            newCircuit[newWire][newStep] = {
              name: 'CNOT',
              role,
              [role === 'control' ? 'targetWire' : 'controlWire']: peerWire,
            };
            newCircuit[peerWire][oldStep] = {
              name: 'CNOT',
              role: role === 'control' ? 'target' : 'control',
              [role === 'control' ? 'controlWire' : 'targetWire']: newWire,
            };

            return compactCircuit(newCircuit);
          });
          return;
        }

        // --- Move a placed (non-CNOT) gate to an empty slot ---
        if (gateData.type === 'placed-gate' && slotData.type === 'slot') {
          setCircuit(prev => {
            const newCircuit = prev.map(wire => [...wire]);
            const { wireIndex: oldWire, stepIndex: oldStep, name } = gateData;
            const newWire = slotData.wireIndex;
            const newStep = slotData.stepIndex;

            if (oldWire === newWire && oldStep === newStep) return prev;

            newCircuit[oldWire][oldStep] = null;
            newCircuit[newWire][newStep] = { name };

            return compactCircuit(newCircuit);
          });
          return;
        }

        // --- Swap control ↔ target on a CNOT ---
        const isCnotSwap =
          gateData.type === 'cnot-node' &&
          slotData.type === 'cnot-node-drop' &&
          slotData.wireIndex === gateData.peerWire &&
          slotData.stepIndex === gateData.stepIndex;

        // --- Insert-before: dropping onto an occupied gate cell ---
        const isInsert =
          slotData.type === 'gate-insert' ||
          (slotData.type === 'cnot-node-drop' && !isCnotSwap);

        if (isCnotSwap) {
          setCircuit(prev => {
            const newCircuit = prev.map(wire => [...wire]);
            const oldWire = gateData.wireIndex;
            const peerWire = gateData.peerWire;
            const step = gateData.stepIndex;

            newCircuit[oldWire][step] = {
              name: 'CNOT',
              role: gateData.role === 'control' ? 'target' : 'control',
              [gateData.role === 'control' ? 'controlWire' : 'targetWire']: peerWire,
            };
            newCircuit[peerWire][step] = {
              name: 'CNOT',
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

            // Clear the source position(s) before splicing
            if (gateData.type === 'placed-gate') {
              newCircuit[gateData.wireIndex][gateData.stepIndex] = null;
            } else if (gateData.type === 'cnot-node') {
              newCircuit[gateData.wireIndex][gateData.stepIndex] = null;
              newCircuit[gateData.peerWire][gateData.stepIndex] = null;
            }

            // Insert a blank column at the target step
            newCircuit = newCircuit.map(wire => {
              const newWire = [...wire];
              newWire.splice(insertStep, 0, null);
              return newWire;
            });

            // Place the dragged gate at the newly created column
            if (gateData.type === 'gate') {
              if (gateData.name === 'CNOT') {
                const tIndex = targetWire < prev.length - 1 ? targetWire + 1 : targetWire - 1;
                newCircuit[targetWire][insertStep] = { name: 'CNOT', role: 'control', targetWire: tIndex };
                newCircuit[tIndex][insertStep] = { name: 'CNOT', role: 'target', controlWire: targetWire };
              } else {
                newCircuit[targetWire][insertStep] = { name: gateData.name };
              }
            } else if (gateData.type === 'placed-gate') {
              newCircuit[targetWire][insertStep] = { name: gateData.name };
            } else if (gateData.type === 'cnot-node') {
              newCircuit[targetWire][insertStep] = {
                name: 'CNOT',
                role: gateData.role,
                [gateData.role === 'control' ? 'targetWire' : 'controlWire']: gateData.peerWire,
              };
              newCircuit[gateData.peerWire][insertStep] = {
                name: 'CNOT',
                role: gateData.role === 'control' ? 'target' : 'control',
                [gateData.role === 'control' ? 'controlWire' : 'targetWire']: targetWire,
              };
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
  const addQubit = () => {
    const numSteps = circuit[0].length;
    setCircuit([...circuit, Array(numSteps).fill(null)]);
  };

  const removeQubit = (indexToRemove) => {
    if (circuit.length <= 1) return;
    setCircuit(circuit.filter((_, index) => index !== indexToRemove));
  };

  const handleRightClickDelete = (e, wireIndex, stepIndex) => {
    e.preventDefault();
    setCircuit(prev => {
      const newCircuit = prev.map(wire => [...wire]);
      const cell = newCircuit[wireIndex][stepIndex];
      if (!cell) return prev;

      if (cell.name === 'CNOT') {
        const peerWire = cell.role === 'control' ? cell.targetWire : cell.controlWire;
        newCircuit[wireIndex][stepIndex] = null;
        newCircuit[peerWire][stepIndex] = null;
      } else {
        newCircuit[wireIndex][stepIndex] = null;
      }

      return compactCircuit(newCircuit);
    });
  };

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

  const runCircuit = () => {
    if (!engine) return;

    const numQubits = circuit.length;
    const sim = new engine.Simulator(numQubits);
    const cppCircuit = new engine.VectorInstruction();

    const compiledInstructions = [];
    const numSteps = circuit[0].length;

    for (let step = 0; step < numSteps; step++) {
      for (let wire = 0; wire < numQubits; wire++) {
        const cell = circuit[wire][step];
        if (!cell) continue;

        if (cell.name === 'CNOT') {
          if (cell.role === 'control') {
            compiledInstructions.push({ name: 'CNOT', qubits: [wire, cell.targetWire] });
          }
        } else {
          compiledInstructions.push({ name: cell.name, qubits: [wire] });
        }
      }
    }

    compiledInstructions.forEach(inst => {
      const cppQubits = new engine.VectorInt();
      inst.qubits.forEach(q => cppQubits.push_back(q));
      cppCircuit.push_back({ name: inst.name, qubits: cppQubits });
      cppQubits.delete();
    });

    sim.run(cppCircuit);

    const cppProb = sim.get_probabilities();
    const probArr = [];
    const events = [];
    
    for (let i = 0; i < cppProb.size(); i++) {
      probArr.push(cppProb.get(i));
      events.push(i.toString(2).padStart(numQubits, '0'));
    }
    setProbabilities(probArr);

    const numShots = parseInt(shots, 10) || 100;
    const rawCounts = simulateShots(events, probArr, numShots);
    
    const chartData = events.map(state => ({
      state: `|${state}⟩`,
      count: rawCounts[state]
    }));
    setShotResults(chartData);

    const cppState = sim.get_statevector();
    const stateArr = [];
    for (let i = 0; i < cppState.size(); i += 2) {
      const real = cppState.get(i);
      const imag = cppState.get(i + 1);
      const sign = imag >= 0 ? '+' : '-';
      stateArr.push(`${real.toFixed(4)} ${sign} ${Math.abs(imag).toFixed(4)}i`);
    }
    setStateVector(stateArr);

    sim.delete();
    cppCircuit.delete();
    cppProb.delete();
    cppState.delete();
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div className="fixed inset-0 flex flex-col font-sans text-slate-300 bg-slate-950">

      <header className="bg-slate-900 border-b border-slate-800 px-6 py-4 flex items-center justify-between z-20 shrink-0">
        <h1 className="text-xl font-bold tracking-tight text-white">Quantum Circuit Visualizer</h1>
        
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2 text-sm text-slate-400 font-mono">
            <label htmlFor="shots">Shots:</label>
            <input
              id="shots"
              type="number"
              value={shots}
              onChange={(e) => setShots(e.target.value)}
              className="w-24 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-white focus:outline-none focus:border-blue-500"
              min="1"
              max="100000"
            />
          </div>
          <button
            onClick={runCircuit}
            disabled={!isReady}
            className={`px-4 py-2 rounded-md font-semibold flex items-center gap-2 transition-colors ${
              isReady ? 'bg-blue-600 hover:bg-blue-500 text-white' : 'bg-slate-800 text-slate-500 cursor-not-allowed'
            }`}
          >
            <Play size={18} />
            {isReady ? 'Run Circuit' : 'Loading Engine...'}
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">

        {/* Sidebar: gate palette */}
        <aside className="w-64 bg-slate-900 border-r border-slate-800 p-6 flex flex-col gap-6 z-10 shrink-0">
          <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Gates</h2>
          <div className="grid grid-cols-2 gap-4 items-center justify-items-center">
            {AVAILABLE_GATES.map(gate => (
              <DraggableGate key={gate} gate={gate} />
            ))}
          </div>
        </aside>

        {/* Main canvas */}
        <main className="flex-1 p-8 overflow-auto flex flex-col gap-8 bg-slate-950">

          <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-2xl p-8 inline-block min-w-max self-start">

            {circuit.map((wire, wireIndex) => (
              <div key={`wire-${wireIndex}`} className="flex items-center mb-2 group">

                <div className="w-16 font-mono text-slate-500 font-medium">q[{wireIndex}]</div>

                <div className="flex relative items-center py-2 px-1">
                  {/* Qubit wire line */}
                  <div className="absolute left-0 right-0 h-[2px] bg-slate-700 z-0" />

                  {wire.map((cell, stepIndex) => (
                    <div
                      key={`slot-${wireIndex}-${stepIndex}`}
                      className="w-14 h-14 relative flex items-center justify-center mx-1 z-10"
                    >
                      {cell ? (
                        cell.name === 'CNOT' ? (
                          <div
                            className="w-full h-full relative flex items-center justify-center z-20"
                            onContextMenu={(e) => handleRightClickDelete(e, wireIndex, stepIndex)}
                          >
                            <DraggableCnotNode cell={cell} wireIndex={wireIndex} stepIndex={stepIndex} />

                            {/* Vertical line connecting control to target */}
                            {cell.role === 'control' && (
                              <div
                                className="absolute w-[2px] bg-rose-400 z-0 pointer-events-none"
                                style={{
                                  left: 'calc(50% - 1px)',
                                  top: cell.targetWire > wireIndex ? '50%' : 'auto',
                                  bottom: cell.targetWire < wireIndex ? '50%' : 'auto',
                                  height: `${Math.abs(cell.targetWire - wireIndex) * 5}rem`,
                                }}
                              />
                            )}
                          </div>
                        ) : (
                          <DraggablePlacedGate
                            cell={cell}
                            wireIndex={wireIndex}
                            stepIndex={stepIndex}
                            handleRightClickDelete={handleRightClickDelete}
                          />
                        )
                      ) : (
                        <DropZone wireIndex={wireIndex} stepIndex={stepIndex} />
                      )}
                    </div>
                  ))}
                </div>

                <button
                  onClick={() => removeQubit(wireIndex)}
                  className="ml-4 text-slate-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Remove Qubit"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            ))}

            <div className="mt-6 flex gap-4">
              <button
                onClick={addQubit}
                className="flex items-center gap-1 text-sm font-semibold text-slate-400 hover:text-white transition-colors"
              >
                <Plus size={16} /> Add Qubit
              </button>
            </div>
          </div>

          {/* Results panels */}
          {(probabilities.length > 0 || stateVector.length > 0) && (
            <div className="flex flex-col gap-6 self-start min-w-[600px] w-full max-w-5xl">
              
              {/* Inserted modular Histogram component */}
              <MeasurementHistogram data={shotResults} shots={shots} />

              <div className="grid grid-cols-2 gap-6 items-start">
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-2xl">
                  <h3 className="font-bold text-white mb-4 border-b border-slate-800 pb-2">Theoretical Probabilities</h3>
                  <div className="flex flex-col gap-2 font-mono text-sm">
                    {probabilities.map((prob, index) => {
                      const numQubits = Math.log2(probabilities.length);
                      const label = index.toString(2).padStart(numQubits, '0');
                      if (prob === 0) return null;
                      return (
                        <div key={`prob-${index}`} className="flex justify-between gap-12">
                          <span className="text-slate-500">|{label}⟩</span>
                          <span className="font-semibold text-blue-400">{(prob * 100).toFixed(2)}%</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-2xl">
                  <h3 className="font-bold text-white mb-4 border-b border-slate-800 pb-2">Complex Amplitudes</h3>
                  <div className="flex flex-col gap-2 font-mono text-sm">
                    {stateVector.map((amp, index) => {
                      const numQubits = Math.log2(stateVector.length);
                      const label = index.toString(2).padStart(numQubits, '0');
                      if (amp === '0.0000 + 0.0000i' || amp === '0.0000 - 0.0000i') return null;
                      return (
                        <div key={`amp-${index}`} className="flex justify-between gap-12">
                          <span className="text-slate-500">|{label}⟩</span>
                          <span className="font-semibold text-emerald-400">{amp}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default App;