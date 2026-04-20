import React, { useMemo } from 'react';
import MeasurementHistogram from './MeasurementHistogram';
import ExpectationValue from './ExpectationValue';
import { RefreshCw } from 'lucide-react';
import Credits from './Credits';
import ThemeToggle from './ThemeToggle';

export default function ResultsPanel({
  isReady,
  circuit,
  measureStep,
  selectedQubit,
  simResults,
  shots,
  setShots,
  onResample,
  children
}) {
  const {
    probabilities = [],
    stateVector = [],
    expectationValueX = null,
    expectationValueY = null,
    expectationValueZ = null,
    shotResults = []
  } = simResults || {};

  const numQubits = circuit.length;

  const measureStepPerWire = circuit.map(wire => wire.findIndex(cell => cell?.name === 'MEASURE'));

  const measuredQubits = new Set(
    measureStepPerWire
      .map((mIdx, i) => {
        if (mIdx === -1) return null;
        if (measureStep === null || measureStep >= mIdx) return i;
        return null;
      })
      .filter(i => i !== null)
  );

  const quantumQubits = Array.from({ length: numQubits }, (_, i) => i)
    .filter(i => !measuredQubits.has(i));

  const quantumLabel = quantumQubits.length > 0
    ? `|${quantumQubits.map(i => `q${i}`).join(' ')}⟩`
    : null;

  const numQuantum = quantumQubits.length;
  const margProbMap = new Map();

  if (probabilities.length > 0 && numQuantum > 0) {
    for (let i = 0; i < probabilities.length; i++) {
      if (probabilities[i] === 0) continue;
      let margIdx = 0;
      for (let k = 0; k < numQuantum; k++) {
        const qubit = quantumQubits[k];
        const bit = (i >> (numQubits - 1 - qubit)) & 1;
        margIdx = (margIdx << 1) | bit;
      }
      const label = margIdx.toString(2).padStart(numQuantum, '0');
      margProbMap.set(label, (margProbMap.get(label) ?? 0) + probabilities[i]);
    }
  }

  const margAmpMap = new Map();
  let measurementLabel = null;
  const measuredQubitsKey = Array.from(measuredQubits).sort((a, b) => a - b).join(',');

  const chosenOutcome = useMemo(() => {
    if (measuredQubitsKey === '' || probabilities.length === 0) return null;
    const outcomeProbs = new Map();
    const measuredArr = measuredQubitsKey.split(',').map(Number);
    
    for (let i = 0; i < probabilities.length; i++) {
      if (probabilities[i] > 1e-8) {
        const bits = measuredArr.map(q => (i >> (numQubits - 1 - q)) & 1).join('');
        outcomeProbs.set(bits, (outcomeProbs.get(bits) ?? 0) + probabilities[i]);
      }
    }
    let maxProb = -1;
    let likelyOutcomes = [];
    for (const [bits, prob] of outcomeProbs.entries()) {
      if (prob > maxProb + 1e-8) {
        maxProb = prob;
        likelyOutcomes = [bits];
      } else if (Math.abs(prob - maxProb) <= 1e-8) {
        likelyOutcomes.push(bits);
      }
    }
    if (likelyOutcomes.length > 0) {
      return { bits: likelyOutcomes[Math.floor(Math.random() * likelyOutcomes.length)], prob: maxProb };
    }
    return null;
  }, [probabilities, measuredQubitsKey, numQubits]);

  if (stateVector.length > 0 && numQuantum > 0) {
    if (chosenOutcome !== null) {
      const measuredArr = measuredQubitsKey.split(',').map(Number);
      const qLabels = measuredArr.map(q => `q${q}`).join(' ');
      measurementLabel = `|${qLabels}⟩ = |${chosenOutcome.bits}⟩`;

      const norm = chosenOutcome.prob > 0 ? Math.sqrt(chosenOutcome.prob) : 1;
      const isMatch = (index) => measuredArr.map(q => (index >> (numQubits - 1 - q)) & 1).join('') === chosenOutcome.bits;

      let phaseR = 1, phaseI = 0;
      for (let i = 0; i < stateVector.length; i++) {
        if (isMatch(i)) {
          const { real, imag } = stateVector[i];
          const mag = Math.sqrt(real * real + imag * imag);
          if (mag > 1e-6) { phaseR = real / mag; phaseI = imag / mag; break; }
        }
      }

      for (let i = 0; i < stateVector.length; i++) {
        if (isMatch(i)) {
          let margIdx = 0;
          for (let k = 0; k < numQuantum; k++) {
            const bit = (i >> (numQubits - 1 - quantumQubits[k])) & 1;
            margIdx = (margIdx << 1) | bit;
          }
          const label = margIdx.toString(2).padStart(numQuantum, '0');
          const { real, imag } = stateVector[i];
          const rotatedReal = real * phaseR + imag * phaseI;
          const rotatedImag = imag * phaseR - real * phaseI;
          let r = rotatedReal / norm, im = rotatedImag / norm;
          if (Math.abs(r) < 1e-5) r = 0;
          if (Math.abs(im) < 1e-5) im = 0;
          if (Math.abs(r) > 1e-6 || Math.abs(im) > 1e-6) {
            const sign = im >= 0 ? '+' : '-';
            margAmpMap.set(label, `${r.toFixed(4)} ${sign} ${Math.abs(im).toFixed(4)}i`);
          }
        }
      }
    } else if (measuredQubits.size === 0) {
      let phaseR = 1, phaseI = 0;
      for (let i = 0; i < stateVector.length; i++) {
        const { real, imag } = stateVector[i];
        const mag = Math.sqrt(real * real + imag * imag);
        if (mag > 1e-6) { phaseR = real / mag; phaseI = imag / mag; break; }
      }

      for (let i = 0; i < stateVector.length; i++) {
        let margIdx = 0;
        for (let k = 0; k < numQuantum; k++) {
          const bit = (i >> (numQubits - 1 - quantumQubits[k])) & 1;
          margIdx = (margIdx << 1) | bit;
        }
        const label = margIdx.toString(2).padStart(numQuantum, '0');
        const { real, imag } = stateVector[i];
        const rotatedReal = real * phaseR + imag * phaseI;
        const rotatedImag = imag * phaseR - real * phaseI;
        let r = rotatedReal, im = rotatedImag;
        if (Math.abs(r) < 1e-5) r = 0;
        if (Math.abs(im) < 1e-5) im = 0;
        if (Math.abs(r) > 1e-6 || Math.abs(im) > 1e-6) {
          const sign = im >= 0 ? '+' : '-';
          margAmpMap.set(label, `${r.toFixed(4)} ${sign} ${Math.abs(im).toFixed(4)}i`);
        }
      }
    }
  }

  const measuredQubitsProb = new Map();
  for (const qi of measuredQubits) {
    let p1 = 0;
    for (let i = 0; i < probabilities.length; i++) {
      if ((i >> (numQubits - 1 - qi)) & 1) p1 += probabilities[i];
    }
    measuredQubitsProb.set(qi, p1);
  }

  return (
    <aside className="w-64 bg-slate-900 border-l border-slate-700/50 shrink-0 flex flex-col z-10">
      <div className="px-4 py-3 border-b border-slate-700/50 shrink-0 flex items-center gap-2">
        <p className="text-[11px] font-semibold text-slate-300 uppercase tracking-widest">Results</p>
        {measureStep !== null && <span className="text-[10px] text-purple-400 bg-purple-500/10 border border-purple-500/20 rounded px-1.5 py-0.5">step {measureStep}</span>}
        <ThemeToggle />
      </div>

      <div className="flex-1 overflow-y-auto flex flex-col divide-y divide-slate-700/40">
        {!isReady ? (
          <p className="text-[10px] text-slate-500 text-center mt-8 animate-pulse px-4">Initializing engine…</p>
        ) : (
          <>
            {selectedQubit !== null && expectationValueZ !== null && (
              <div className="px-4 py-3 flex flex-col">
                <ExpectationValue operator="Z" qubitIndex={selectedQubit} value={expectationValueZ} measureStep={measureStep} labels={['1', '0']} />
                <ExpectationValue operator="Y" qubitIndex={selectedQubit} value={expectationValueY} measureStep={measureStep} labels={['-i', '+i']} />
                <ExpectationValue operator="X" qubitIndex={selectedQubit} value={expectationValueX} measureStep={measureStep} labels={['-', '+']} />
              </div>
            )}

            {measuredQubits.size > 0 && (
              <div className="px-4 py-3">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-2.5">Measured</p>
                <div className="flex flex-col gap-2 font-mono text-xs">
                  {[...measuredQubits].map(i => {
                    const p1 = measuredQubitsProb.get(i) ?? 0;
                    const p0 = 1 - p1;
                    return (
                      <div key={i}>
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-slate-400">q[{i}]</span>
                          <span className="text-slate-500 text-[10px]"><span className="text-slate-300">{(p0 * 100).toFixed(1)}%</span> |0⟩ · <span className="text-amber-300">{(p1 * 100).toFixed(1)}%</span> |1⟩</span>
                        </div>
                        <div className="h-1 w-full bg-slate-700/60 rounded-full overflow-hidden flex">
                          <div className="h-full bg-slate-400/70 rounded-l-full" style={{ width: `${p0 * 100}%` }} />
                          <div className="h-full bg-amber-500/70 rounded-r-full" style={{ width: `${p1 * 100}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {margProbMap.size > 0 && (
              <div className="px-4 py-3">
                <div className="flex items-baseline gap-1.5 mb-2.5">
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Probabilities</p>
                  {quantumLabel && <span className="text-[10px] text-slate-500 font-mono">{quantumLabel}</span>}
                </div>
                <div className="flex flex-col gap-1.5 font-mono text-xs">
                  {[...margProbMap.entries()].map(([label, prob]) => (
                    <div key={`prob-${label}`} className="flex justify-between items-center">
                      <span className="text-slate-400">|{label}⟩</span>
                      <span className="text-white font-medium tabular-nums">{(prob * 100).toFixed(2)}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {margAmpMap.size > 0 && (
              <div className="px-4 py-3">
                <div className="flex flex-col gap-1 mb-2.5">
                  <div className="flex items-baseline gap-1.5">
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Amplitudes</p>
                    {quantumLabel && <span className="text-[10px] text-slate-500 font-mono">{quantumLabel}</span>}
                  </div>
                  {measurementLabel && <p className="text-[9px] text-amber-500/80 font-mono">(given {measurementLabel})</p>}
                </div>
                <div className="flex flex-col gap-1.5 font-mono text-[11px]">
                  {[...margAmpMap.entries()].map(([label, amp]) => (
                    <div key={`amp-${label}`} className="flex justify-between items-center gap-2">
                      <span className="text-slate-400 shrink-0">|{label}⟩</span>
                      <span className="text-slate-200 font-medium tabular-nums text-right">{amp}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="px-4 py-3">
              <MeasurementHistogram data={shotResults} shots={shots} />
            </div>

            <div className="px-4 py-3">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-2">Shots</p>
              <div className="flex gap-2">
                <input type="number" value={shots} onChange={(e) => setShots(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-slate-200 text-xs font-mono focus:outline-none focus:border-slate-500 focus:text-white" min="1" max="100000" />
                <button onClick={onResample} className="px-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded text-slate-300 hover:text-white transition-colors flex items-center justify-center shrink-0" title="Resample Histogram">
                  <RefreshCw size={14} />
                </button>
              </div>
            </div>
            
            {children}
          </>
        )}
      </div>

      <div className="border-t border-slate-700/50 bg-slate-900 mt-auto">
        <Credits />
      </div>
    </aside>
  );
}