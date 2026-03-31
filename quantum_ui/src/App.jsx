import { useState, useEffect, useRef } from 'react'
import { Play, Settings2, Plus, Trash2 } from 'lucide-react';
import initQuantumEngine from './wasm/quantum_engine.js'
import { draggable, dropTargetForElements, monitorForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import './App.css'

const AVAILABLE_GATES = ['H', 'X', 'Y', 'Z', 'CNOT'];

const GATE_STYLES = {
  H: 'bg-blue-500/20 border-blue-500/50 text-blue-400',
  X: 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400',
  Y: 'bg-purple-500/20 border-purple-500/50 text-purple-400',
  Z: 'bg-amber-500/20 border-amber-500/50 text-amber-400',
  CNOT: 'border-transparent bg-transparent text-rose-400 hover:text-rose-300'
};

const GateVisual = ({ name }) => {
  if (name === 'CNOT') {
    return (
      <svg className="w-8 h-12" viewBox="0 0 24 32" fill="none" stroke="currentColor">
        <circle cx="12" cy="6" r="3" fill="currentColor" stroke="none" />
        <line x1="12" y1="6" x2="12" y2="21" strokeWidth="1.5" />
        <circle cx="12" cy="26" r="5" strokeWidth="1.5" />
        <path d="M12 21v10M7 26h10" strokeWidth="1.5" />
      </svg>
    );
  }
  return <span>{name}</span>;
};

const DraggableGate = ({ gate }) => {
  const ref = useRef(null);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    return draggable({
      element: el,
      getInitialData: () => ({ type: 'gate', name: gate }),
      onDragStart: () => setIsDragging(true),
      onDrop: () => setIsDragging(false),
    });
  }, [gate]);

  const baseClasses = `transition-all cursor-grab flex items-center justify-center font-bold ${isDragging ? 'opacity-50' : ''}`;

  if (gate === 'CNOT') {
    return (
      <div ref={ref} className={`${baseClasses} p-2 ${GATE_STYLES[gate]}`}>
        <GateVisual name={gate} />
      </div>
    );
  }

  return (
    <div ref={ref} className={`${baseClasses} w-14 h-14 border rounded-lg text-xl hover:brightness-125 hover:shadow-lg ${GATE_STYLES[gate]}`}>
      <GateVisual name={gate} />
    </div>
  );
};


const DraggableCnotNode = ({ cell, wireIndex, stepIndex }) => {
  const ref = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isHovered, setIsHovered] = useState(false); 

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    
    const cleanupDrag = draggable({
      element: el,
      getInitialData: () => ({ 
        type: 'cnot-node', 
        role: cell.role, 
        wireIndex, 
        stepIndex, 
        peerWire: cell.role === 'control' ? cell.targetWire : cell.controlWire 
      }),
      onDragStart: () => setIsDragging(true),
      onDrop: () => setIsDragging(false),
    });

    const cleanupDrop = dropTargetForElements({
      element: el,
      getData: () => ({ type: 'cnot-partner', wireIndex, stepIndex }),
      onDragEnter: () => setIsHovered(true),
      onDragLeave: () => setIsHovered(false),
      onDrop: () => setIsHovered(false),
    });

    return () => {
      cleanupDrag();
      cleanupDrop();
    };
  }, [cell, wireIndex, stepIndex]);

  const baseClasses = `absolute w-full h-full flex items-center justify-center cursor-grab hover:scale-110 transition-all z-20 ${isDragging ? 'opacity-0' : ''} ${isHovered ? 'bg-blue-500/30 rounded-lg scale-110' : ''}`;

  return (
    <div ref={ref} className={baseClasses}>
      {cell.role === 'control' && <div className="w-4 h-4 rounded-full bg-rose-400" />}
      {cell.role === 'target' && (
        <svg className="w-8 h-8 text-rose-400 bg-slate-950 rounded-full" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <circle cx="12" cy="12" r="10" strokeWidth="2" />
          <path d="M12 2v20M2 12h20" strokeWidth="2" />
        </svg>
      )}
    </div>
  );
};

const DraggablePlacedGate = ({ cell, wireIndex, stepIndex, handleRightClickDelete }) => {
  const ref = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isInsertHovered, setIsInsertHovered] = useState(false); 

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const cleanupDrag = draggable({
      element: el,
      getInitialData: () => ({ type: 'placed-gate', name: cell.name, wireIndex, stepIndex }),
      onDragStart: () => setIsDragging(true),
      onDrop: () => setIsDragging(false),
    });

    const cleanupDrop = dropTargetForElements({
      element: el,
      getData: () => ({ type: 'gate-insert', wireIndex, stepIndex }),
      onDragEnter: () => setIsInsertHovered(true),
      onDragLeave: () => setIsInsertHovered(false),
      onDrop: () => setIsInsertHovered(false),
    });

    return () => {
      cleanupDrag();
      cleanupDrop();
    };
  }, [cell, wireIndex, stepIndex]);

  const baseClasses = `w-full h-full border text-lg rounded flex items-center justify-center font-bold shadow-sm backdrop-blur-sm cursor-grab transition-all z-20 
    ${isDragging ? 'opacity-50' : 'hover:brightness-125'} 
    ${isInsertHovered ? 'border-l-4 border-l-blue-400 scale-105 shadow-blue-500/50' : ''} 
    ${GATE_STYLES[cell.name]}`;

  return (
    <div 
      ref={ref}
      className={baseClasses}
      onContextMenu={(e) => handleRightClickDelete(e, wireIndex, stepIndex)}
      title="Drag to move, Right-click to delete"
    >
      <GateVisual name={cell.name} />
    </div>
  );
};

const DropZone = ({ wireIndex, stepIndex }) => {
  const ref = useRef(null);
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    return dropTargetForElements({
      element: el,
      getData: () => ({ type: 'slot', wireIndex, stepIndex }),
      onDragEnter: () => setIsHovered(true),
      onDragLeave: () => setIsHovered(false),
      onDrop: () => setIsHovered(false),
    });
  }, [wireIndex, stepIndex]);

  return (
    <div 
      ref={ref} 
      className={`w-full h-full border-2 rounded transition-colors ${
        isHovered ? 'border-blue-500 bg-blue-500/20' : 'border-transparent hover:border-slate-700 border-dashed'
      }`}
    />
  );
};

const compactCircuit = (oldCircuit) => {
  const numWires = oldCircuit.length;
  const numSteps = oldCircuit[0].length;

  const newCircuit = Array.from({ length: numWires }, () => Array(numSteps).fill(null));

  const tail = Array(numWires).fill(-1);
  const processedCNOTs = new Set(); 

  for (let step = 0; step < numSteps; step++) {
    for (let wire = 0; wire < numWires; wire++) {
      const cell = oldCircuit[wire][step];
      if (!cell) continue;

      if (cell.name === 'CNOT') {
        const peerWire = cell.role === 'control' ? cell.targetWire : cell.controlWire;
        
        const cnotId = `${Math.min(wire, peerWire)}-${Math.max(wire, peerWire)}-${step}`;
        if (processedCNOTs.has(cnotId)) continue;
        processedCNOTs.add(cnotId);

        const targetStep = Math.max(tail[wire], tail[peerWire]) + 1;

        newCircuit[wire][targetStep] = { ...cell };
        newCircuit[peerWire][targetStep] = { ...oldCircuit[peerWire][step] };
        
        tail[wire] = targetStep;
        tail[peerWire] = targetStep;

      } else {
        const targetStep = tail[wire] + 1;
        
        newCircuit[wire][targetStep] = { ...cell };
        tail[wire] = targetStep; 
      }
    }
  }

  return newCircuit;
};

function App() {
  const [circuit, setCircuit] = useState([
    [null, null, null, null],
    [null, null, null, null]
  ]);

  const [engine, setEngine] = useState(null)
  const [probabilities, setProbabilities] = useState([])
  const [stateVector, setStateVector] = useState([])
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    // Find the furthest right column that has a gate in it
    let highestOccupiedIndex = -1;
    circuit.forEach(wire => {
      for (let i = wire.length - 1; i >= 0; i--) {
        if (wire[i] !== null) {
          if (i > highestOccupiedIndex) highestOccupiedIndex = i;
          break; 
        }
      }
    });

    // at least 5 empty slots at the end of the board for dropping
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

useEffect(() => {
  return monitorForElements({
    onDrop({ source, location }) {
      const destination = location.current.dropTargets[0];
      if (!destination) return; 

      const gateData = source.data;
      const slotData = destination.data;

      if (gateData.type === 'gate' && slotData.type === 'slot') {
        setCircuit(prev => {
          const newCircuit = prev.map(wire => [...wire]);
          if (gateData.name === 'CNOT') {
            const cIndex = slotData.wireIndex;
            const tIndex = cIndex < prev.length - 1 ? cIndex + 1 : cIndex - 1;

            newCircuit[cIndex][slotData.stepIndex] = { 
              name: 'CNOT', role: 'control', targetWire: tIndex 
            };

            newCircuit[tIndex][slotData.stepIndex] = { 
              name: 'CNOT', role: 'target', controlWire: cIndex 
            };
          } else {
            newCircuit[slotData.wireIndex][slotData.stepIndex] = { name: gateData.name };
          }
          
          return compactCircuit(newCircuit);
        });
      }
      if (gateData.type === 'cnot-node' && slotData.type === 'cnot-partner') {
        setCircuit(prev => {
          const newCircuit = prev.map(wire => [...wire]);
          const oldWire = gateData.wireIndex;
          const peerWire = gateData.peerWire;
          const step = gateData.stepIndex;

          if (slotData.wireIndex === peerWire && slotData.stepIndex === step) {
            
            newCircuit[oldWire][step] = {
              name: 'CNOT',
              role: gateData.role === 'control' ? 'target' : 'control',
              [gateData.role === 'control' ? 'controlWire' : 'targetWire']: peerWire
            };

            newCircuit[peerWire][step] = {
              name: 'CNOT',
              role: gateData.role,
              [gateData.role === 'control' ? 'targetWire' : 'controlWire']: oldWire
            };
          }
          return compactCircuit(newCircuit);
        });
        return; 
      }

      if (gateData.type === 'cnot-node' && slotData.type === 'slot') {
        setCircuit(prev => {
          const newCircuit = prev.map(wire => [...wire]);
          const { role, wireIndex: oldWire, stepIndex: oldStep, peerWire } = gateData;
          const newWire = slotData.wireIndex;
          const newStep = slotData.stepIndex;

          if (newWire === peerWire && newStep === oldStep) return prev;
          if (newStep !== oldStep) return prev; 
          newCircuit[oldWire][oldStep] = null;
          newCircuit[newWire][newStep] = {
            name: 'CNOT',
            role: role,
            [role === 'control' ? 'targetWire' : 'controlWire']: peerWire
          };
          newCircuit[peerWire][oldStep] = {
            name: 'CNOT',
            role: role === 'control' ? 'target' : 'control',
            [role === 'control' ? 'controlWire' : 'targetWire']: newWire
          };

          return compactCircuit(newCircuit);
        });
        }

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
        }

        if (slotData.type === 'gate-insert') {
          setCircuit(prev => {
            let newCircuit = prev.map(wire => [...wire]);
            const insertStep = slotData.stepIndex;
            const targetWire = slotData.wireIndex;

            if (gateData.type === 'placed-gate') {
              newCircuit[gateData.wireIndex][gateData.stepIndex] = null;
            } else if (gateData.type === 'cnot-node') {
              newCircuit[gateData.wireIndex][gateData.stepIndex] = null;
              newCircuit[gateData.peerWire][gateData.stepIndex] = null;
            }

            newCircuit = newCircuit.map(wire => {
              const newWire = [...wire];
              newWire.splice(insertStep, 0, null);
              return newWire;
            });

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
                name: 'CNOT', role: gateData.role, [gateData.role === 'control' ? 'targetWire' : 'controlWire']: gateData.peerWire 
              };
              newCircuit[gateData.peerWire][insertStep] = { 
                name: 'CNOT', role: gateData.role === 'control' ? 'target' : 'control', [gateData.role === 'control' ? 'controlWire' : 'targetWire']: targetWire 
              };
            }
            return compactCircuit(newCircuit);
          });
          return;
        }
    }
  });
}, []);

  const addQubit = () => {
    const numSteps = circuit[0].length;
    const newWire = Array(numSteps).fill(null);
    setCircuit([...circuit, newWire]);
  };

  const removeQubit = (indexToRemove) => {
    if (circuit.length <= 1) return; // Prevent deleting the very last wire
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

  const addTimeStep = () => {
    setCircuit(circuit.map(wire => [...wire, null]));
  };

  // Load the WebAssembly engine when the page loads
  useEffect(() => {
    async function LoadEngine() {
      try {
        const Module = await initQuantumEngine()
        setEngine(Module)
        setIsReady(true)
        console.log("Loads")
      } catch (err) {
        console.error('Failed to load WASM:', err)
      }
    }
    LoadEngine()
  }, [])

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
    for (let i = 0; i < cppProb.size(); i++) {
      probArr.push(cppProb.get(i));
    }
    setProbabilities(probArr);

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

  return (
    <div className="fixed inset-0 flex flex-col font-sans text-slate-300 bg-slate-950">
      
      <header className="bg-slate-900 border-b border-slate-800 px-6 py-4 flex items-center justify-between z-20 shrink-0">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-bold tracking-tight text-white">Quantum Circuit Visualizer</h1>
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
      </header>
  
      <div className="flex flex-1 overflow-hidden">
        
        <aside className="w-64 bg-slate-900 border-r border-slate-800 p-6 flex flex-col gap-6 z-10 shrink-0">
          <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Gates</h2>
          <div className="grid grid-cols-2 gap-4 items-center justify-items-center">
            {AVAILABLE_GATES.map((gate) => (
              <DraggableGate key={gate} gate={gate} />
            ))}
          </div>
        </aside>
  
        <main className="flex-1 p-8 overflow-auto flex flex-col gap-8 bg-slate-950">
          
          <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-2xl p-8 inline-block min-w-max self-start">
            
            {circuit.map((wire, wireIndex) => (
              <div key={`wire-${wireIndex}`} className="flex items-center mb-2 group">
                
                <div className="w-16 font-mono text-slate-500 font-medium">q[{wireIndex}]</div>
              
                <div className="flex relative items-center py-2 px-1">
                  <div className="absolute left-0 right-0 h-[2px] bg-slate-700 z-0"></div>
                  {wire.map((cell, stepIndex) => (
                    <div key={`slot-${wireIndex}-${stepIndex}`} className="w-14 h-14 relative flex items-center justify-center mx-1 z-10">
                      
                      {cell ? (
                        cell.name === 'CNOT' ? (
                          <div 
                            className="w-full h-full relative flex items-center justify-center z-20"
                            onContextMenu={(e) => handleRightClickDelete(e, wireIndex, stepIndex)}
                          >
                            <DraggableCnotNode cell={cell} wireIndex={wireIndex} stepIndex={stepIndex} />
                            
                            {cell.role === 'control' && (
                              <div 
                                className="absolute w-[2px] bg-rose-400 z-0 pointer-events-none"
                                style={{
                                  left: 'calc(50% - 1px)',
                                  top: cell.targetWire > wireIndex ? '50%' : 'auto',
                                  bottom: cell.targetWire < wireIndex ? '50%' : 'auto',
                                  height: `${Math.abs(cell.targetWire - wireIndex) * 80}px`
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
          
          {(probabilities.length > 0 || stateVector.length > 0) && (
            <div className="grid grid-cols-2 gap-6 items-start self-start min-w-max">
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-2xl">
                <h3 className="font-bold text-white mb-4 border-b border-slate-800 pb-2">Probabilities</h3>
                <div className="flex flex-col gap-2 font-mono text-sm">
                  {probabilities.map((prob, index) => {
                    const numQubits = Math.log2(probabilities.length);
                    const label = index.toString(2).padStart(numQubits, '0');
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
          )}
        </main>
      </div>
    </div>
  );
}

export default App