/**
 * Question definitions for the quiz system.
 *
 * circuit[wireIndex][stepIndex] cell types:
 *   { name, locked: true }                               – locked single-qubit gate (display only)
 *   { name, role, targetWire/controlWire, locked: true } – locked multi-qubit gate node
 *   { blank: true }                                      – empty slot the student must fill
 *   null                                                 – inactive (wire passes through silently)
 *
 * answer: [{ wireIndex, stepIndex, gate }]
 *   Specifies which blank positions must hold which gate for a correct submission.
 *
 * allowedGates: string[]
 *   Gates shown in the palette for this question.
 *
 * evaluationType: string (optional)
 *   'exact' (default): checks exact gate placement matches the 'answer' array.
 *   'target_state': checks if the simulated probability of targetState > 0.99.
 *   'equivalent_state': simulates the 'answer' circuit and checks if the student's circuit produces an identical state vector (ignoring global phase).
 * 
 * restrictToBlanks: boolean (optional)
 *   If true, prevents drag-and-drop into empty grid slots, restricting placement only to 'blank' slots.
 * 
 * hiddenBlocks: [{ topWire, bottomWire, startStep, endStep }]
 *   Renders a large opaque block over parts of the circuit.
 * 
 * Add more questions to the array to scale the quiz — no other changes required.
 */
export const QUESTIONS = [
  {
    id: 1,
    title: 'Create an X Gate',
    description:
      'The circuit below has H gates on either side of a blank. ' +
      'Fill the blank with a single gate so that the whole circuit acts as an X gate. ' /*+
      'Hint: H Z H = X.'*/,
    points: 10,
    restrictToBlanks: true,
    allowedGates: ['H', 'X', 'Y', 'Z', 'T'],
    // 1 qubit, 3 steps: H | blank | H
    circuit: [
      [
        { name: 'H', locked: true },
        { blank: true },
        { name: 'H', locked: true },
      ],
    ],
    // The blank at (wire 0, step 1) must be filled with Z
    answer: [{ wireIndex: 0, stepIndex: 1, gate: 'Z' }],
  },
  {
    id: 2,
    title: 'Create Bell State |Φ⁻⟩',
    description:
      'Create the entangled Bell state (|00⟩ − |11⟩)/√2. ' +
      'The H and CNOT are already placed. ' +
      'Fill the blank on qubit 0 before the H gate.',
    points: 15,
    restrictToBlanks: true,
    allowedGates: ['H', 'X', 'Y', 'Z', 'T'],
    // 2 qubits, 3 steps
    // q[0]: blank | H | CNOT-control
    // q[1]: (inactive) | (inactive) | CNOT-target
    circuit: [
      [
        { blank: true },
        { name: 'H', locked: true },
        { name: 'CNOT', role: 'control', targetWire: 1, locked: true },
      ],
      [
        null,
        null,
        { name: 'CNOT', role: 'target', controlWire: 0, locked: true },
      ],
    ],
    // The blank at (wire 0, step 0) must be filled with X
    answer: [{ wireIndex: 0, stepIndex: 0, gate: 'X' }],
  },
  {
    id: 3,
    title: 'Undo the Hidden Circuit',
    description:
      'A secret operation has been applied to the qubits inside the hidden block. Add gates after the block to revert the qubits exactly to the |00⟩ state. Watch the Amplitudes in the Results panel to figure it out!',
    points: 20,
    allowedGates: ['H', 'X', 'Y', 'Z', 'CNOT', 'CZ', 'TOFFOLI'],
    evaluationType: 'target_state',
    targetState: '00',
    hiddenBlocks: [{ topWire: 0, bottomWire: 1, startStep: 0, endStep: 1 }],
    circuit: [
      [
        { name: 'H', locked: true },
        { name: 'CNOT', role: 'control', targetWire: 1, locked: true },
      ],
      [
        null,
        { name: 'CNOT', role: 'target', controlWire: 0, locked: true },
      ],
    ],
    answer: [
      { wireIndex: 0, stepIndex: 2, gate: 'CNOT', role: 'control', targetWire: 1 },
      { wireIndex: 1, stepIndex: 2, gate: 'CNOT', role: 'target', controlWire: 0 },
      { wireIndex: 0, stepIndex: 3, gate: 'H' }
    ]
  },
  {
    id: 4,
    title: 'Create a Bell State',
    description: 'Create the entangled Bell state (|00⟩ + |11⟩)/√2 from the starting |00⟩ state. There are multiple correct ways to do this! (Hint: apply a Hadamard, then entangle them).',
    points: 20,
    allowedGates: ['H', 'X', 'Y', 'Z', 'CNOT', 'CZ'],
    evaluationType: 'equivalent_state',
    circuit: [
      [null],
      [null]
    ],
    answer: [
      { wireIndex: 0, stepIndex: 0, gate: 'H' },
      { wireIndex: 0, stepIndex: 1, gate: 'CNOT', role: 'control', targetWire: 1 },
      { wireIndex: 1, stepIndex: 1, gate: 'CNOT', role: 'target', controlWire: 0 }
    ]
  }
];
