export const SINGLE_QUBIT_GATES = ['H', 'X', 'Y', 'Z', 'T', 'MEASURE'];
export const TWO_WIRE_GATES     = ['CNOT', 'CC_X', 'CC_Z'];
export const AVAILABLE_GATES    = [...SINGLE_QUBIT_GATES, ...TWO_WIRE_GATES];

export const GATE_STYLES = {
  H:       'bg-sky-500/20 border-sky-400/70 text-sky-300',
  X:       'bg-teal-500/20 border-teal-400/70 text-teal-300',
  Y:       'bg-violet-500/20 border-violet-400/70 text-violet-300',
  Z:       'bg-amber-500/20 border-amber-400/70 text-amber-300',
  T:       'bg-rose-500/20 border-rose-400/70 text-rose-300',
  MEASURE: 'bg-yellow-500/20 border-yellow-400/70 text-yellow-300',
  CNOT:    'border-transparent bg-transparent text-slate-300 hover:text-white',
  CC_X:    'border-transparent bg-transparent text-amber-300 hover:text-amber-100',
  CC_Z:    'border-transparent bg-transparent text-amber-300 hover:text-amber-100',
};
