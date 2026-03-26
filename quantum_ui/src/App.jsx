import { useState, useEffect } from 'react'
import initQuantumEngine from './wasm/quantum_engine.js'
import './App.css'

function App() {
  const [engine, setEngine] = useState(null)
  const [results, setResults] = useState([])
  const [stateVector, setStateVector] = useState([])
  const [isReady, setIsReady] = useState(false)

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
      //{name: 'H', qubits: [1]},
      {name: 'CNOT', qubits: [0, 1]},
      //{name: 'H', qubits: [0]},
      //{name: 'H', qubits: [1]}
    ]

    const jsCircuit2 = [
      {name: 'X', qubits: [0]},
      {name: 'Z', qubits: [0]},
      {name: 'H', qubits: [0]},
      {name: 'CNOT', qubits: [0, 1]},
    ]

    jsCircuit2.forEach(inst => {
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

    setResults(probArr)

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
    <div>
      <h1>Quantum Math Engine Test</h1>
      
      {!isReady ? (
        <p>Loading C++ Engine...</p>
      ) : (
        <div>
          <p>Engine is Ready!</p>
          <button onClick={runTestCircuit}>
            Run Circuit
          </button>
        </div>
      )}

      {results.length > 0 && (
        <div>
          <h3>Results:</h3>
          {results.map((probability, index) => {
            const numQubits = Math.log2(results.length);
            const binaryLabel = index.toString(2).padStart(numQubits, '0');
            return (
              <p key={index}>
                |{binaryLabel}⟩: {probability.toFixed(4)}
              </p>
            );
          })}
        </div>
      )}

      {stateVector.length > 0 && (
          <div>
            <h3>Complex Amplitudes:</h3>
            {stateVector.map((amplitude, index) => {
              const numQubits = Math.log2(stateVector.length);
              const binaryLabel = index.toString(2).padStart(numQubits, '0');
              return (
                <p key={index} style={{ fontFamily: 'monospace' }}>
                  |{binaryLabel}⟩: {amplitude}
                </p>
              );
            })}
          </div>
        )}
    </div>
  )
}

export default App