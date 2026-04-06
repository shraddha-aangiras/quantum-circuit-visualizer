import { useRef, useEffect, useState } from 'react';
import { draggable } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import GateVisual from './GateVisual';
import { GATE_STYLES } from '../constants';

const TWO_WIRE = ['CNOT', 'CC_X', 'CC_Z'];

/**
 * A draggable gate tile shown in the sidebar palette.
 * Two-wire gates (CNOT, CC_X, CC_Z) use a compact icon layout.
 * Single-qubit gates use a square tile.
 */
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

  if (TWO_WIRE.includes(gate)) {
    return (
      <div ref={ref} className={`${baseClasses} p-2 ${GATE_STYLES[gate]}`}>
        <GateVisual name={gate} />
      </div>
    );
  }

  return (
    <div
      ref={ref}
      className={`${baseClasses} w-14 h-14 border rounded-lg text-xl hover:brightness-125 hover:shadow-lg ${GATE_STYLES[gate]}`}
    >
      <GateVisual name={gate} />
    </div>
  );
};

export default DraggableGate;
