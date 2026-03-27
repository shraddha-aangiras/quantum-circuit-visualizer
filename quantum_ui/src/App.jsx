import { useState, useEffect } from 'react'
import { Play, Settings2, Plus, Trash2 } from 'lucide-react';
import initQuantumEngine from './wasm/quantum_engine.js'
import './App.css'

const AVAILABLE_GATES = ['H', 'X', 'Y', 'Z', 'CNOT'];

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

    if (currentLength < desiredLength) {
      const difference = desiredLength - currentLength;
      setCircuit(prevCircuit => 
        prevCircuit.map(wire => [...wire, ...Array(difference).fill(null)])
      );
    }
  }, [circuit]);

  const addQubit = () => {
    const numSteps = circuit[0].length;
    const newWire = Array(numSteps).fill(null);
    setCircuit([...circuit, newWire]);
  };

  const removeQubit = (indexToRemove) => {
    if (circuit.length <= 1) return; // Prevent deleting the very last wire
    setCircuit(circuit.filter((_, index) => index !== indexToRemove));
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

  const runTestCircuit = () => {
    if (!engine) return
    const sim = new engine.Simulator(2)
    const cppCircuit = new engine.VectorInstruction()
    const jsCircuit = [
      {name: 'X', qubits: [0]},
      {name: 'H', qubits: [0]},
      {name: 'H', qubits: [1]},
      {name: 'CNOT', qubits: [0, 1]},
      {name: 'H', qubits: [0]},
      {name: 'H', qubits: [1]}
    ]

    const jsCircuit2 = [
      {name: 'X', qubits: [0]},
      {name: 'Z', qubits: [0]},
      {name: 'H', qubits: [0]},
      {name: 'CNOT', qubits: [0, 1]},
    ]

    jsCircuit.forEach(inst => {
      // C++ vector for the ints
      const cppQubits = new engine.VectorInt()
      
      // Push JS numbers to the C++ vector
      inst.qubits.forEach(q => cppQubits.push_back(q))
      
      cppCircuit.push_back({
        name: inst.name,
        qubits: cppQubits
      })
      
      cppQubits.delete()
    })
    
    sim.run(cppCircuit)
    const cppProb = sim.get_probabilities()

    const probArr = []
    for (let i = 0; i < cppProb.size(); i++) {
      probArr.push(cppProb.get(i))
    }

    setProbabilities(probArr)

    const cppState = sim.get_statevector()
    const stateArr = []
    for (let i = 0; i < cppState.size(); i += 2) {
      const real = cppState.get(i)
      const imag = cppState.get(i + 1)
      const sign = imag >= 0 ? '+' : '-'
      const formattedAmplitude = `${real.toFixed(4)} ${sign} ${Math.abs(imag).toFixed(4)}i`
      stateArr.push(formattedAmplitude)
    }

    setStateVector(stateArr)

    sim.delete()
    cppCircuit.delete()
    cppProb.delete()
  } 

  return (
    <div className="fixed inset-0 flex flex-col font-sans text-slate-300 bg-slate-950">
      
      <header className="bg-slate-900 border-b border-slate-800 px-6 py-4 flex items-center justify-between z-20 shrink-0">
        <div className="flex items-center gap-2">
          <Settings2 className="text-blue-500" />
          <h1 className="text-xl font-bold tracking-tight text-white">Quantum Circuit Visualizer</h1>
        </div>
        <button 
          onClick={runTestCircuit}
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
          <div className="grid grid-cols-2 gap-3">
            {AVAILABLE_GATES.map((gate) => (
              <div key={gate} className="bg-slate-800 border border-slate-700 text-slate-300 h-12 rounded flex items-center justify-center font-bold text-lg cursor-grab hover:bg-slate-700 hover:text-white transition-colors">
                {gate}
              </div>
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
                         <div className="w-full h-full bg-emerald-500/20 border border-emerald-500/50 text-emerald-400 rounded flex items-center justify-center font-bold text-lg shadow-sm backdrop-blur-sm">
                           {cell.name}
                         </div>
                      ) : (
                         <div className="w-full h-full border-2 border-transparent hover:border-slate-700 border-dashed rounded transition-colors"></div>
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