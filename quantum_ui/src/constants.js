export const SINGLE_QUBIT_GATES = ['H', 'X', 'Y', 'Z', 'T', 'MEASURE'];
export const TWO_WIRE_GATES     = ['CNOT', 'CZ', 'FF_x', 'FF_Z'];
export const AVAILABLE_GATES    = [...SINGLE_QUBIT_GATES, ...TWO_WIRE_GATES];
export const BARRIER_GATE       = 'BARRIER';

// Which gates carry a classical wire (control is a measured bit, not a qubit)
export const CLASSICAL_CTRL_GATES = ['FF_x', 'FF_Z'];

export const GATE_STYLES = {
  H:       'bg-sky-500/20 border-sky-400/70 text-sky-300',
  X:       'bg-teal-500/20 border-teal-400/70 text-teal-300',
  Y:       'bg-violet-500/20 border-violet-400/70 text-violet-300',
  Z:       'bg-amber-500/20 border-amber-400/70 text-amber-300',
  T:       'bg-rose-500/20 border-rose-400/70 text-rose-300',
  MEASURE: 'bg-yellow-500/20 border-yellow-400/70 text-yellow-300',
  // Quantum 2-qubit — slate
  CNOT:    'border-transparent bg-transparent text-slate-300 hover:text-white',
  CZ:      'border-transparent bg-transparent text-slate-300 hover:text-white',
  // Classically-controlled — amber to visually separate from quantum 2q gates
  FF_x:    'border-transparent bg-transparent text-amber-300 hover:text-amber-100',
  FF_Z:    'border-transparent bg-transparent text-amber-300 hover:text-amber-100',
  // Barrier — violet
  BARRIER: 'border-transparent bg-transparent text-violet-400 hover:text-violet-200',
};
