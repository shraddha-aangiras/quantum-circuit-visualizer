import { useRef, useEffect, useState } from 'react';
import { draggable, dropTargetForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';

/**
 * Renders one node of a placed two-wire gate: CNOT, CC_X, or CC_Z.
 *  - CNOT  control: filled circle (slate)   target: ⊕ (slate)
 *  - CC_X  control: filled square (amber)   target: ⊕ (amber)
 *  - CC_Z  control: filled square (amber)   target: Z-box (amber)
 *
 * Both draggable (to move/swap) and a drop target (for swap / insert).
 */
const DraggableCnotNode = ({ cell, wireIndex, stepIndex }) => {
  const ref = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isPartnerHovered, setIsPartnerHovered] = useState(false);
  const [isInsertHovered, setIsInsertHovered] = useState(false);

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
        peerWire: cell.role === 'control' ? cell.targetWire : cell.controlWire,
      }),
      onDragStart: () => setIsDragging(true),
      onDrop:      () => setIsDragging(false),
    });

    const cleanupDrop = dropTargetForElements({
      element: el,
      getData: () => ({ type: 'cnot-node-drop', wireIndex, stepIndex }),
      onDragEnter: ({ source }) => {
        if (
          source.data.type === 'cnot-node' &&
          source.data.peerWire === wireIndex &&
          source.data.stepIndex === stepIndex
        ) {
          setIsPartnerHovered(true);
        } else {
          setIsInsertHovered(true);
        }
      },
      onDragLeave: () => { setIsPartnerHovered(false); setIsInsertHovered(false); },
      onDrop:      () => { setIsPartnerHovered(false); setIsInsertHovered(false); },
    });

    return () => { cleanupDrag(); cleanupDrop(); };
  }, [cell, wireIndex, stepIndex]);

  const isClassical = cell.name !== 'CNOT';

  const baseClasses = `absolute w-full h-full flex items-center justify-center cursor-grab transition-all z-20
    ${isDragging       ? 'opacity-0'                              : 'hover:scale-110'}
    ${isPartnerHovered ? 'bg-blue-500/30 rounded-lg scale-110'   : ''}
    ${isInsertHovered  ? 'border-l-4 border-l-blue-400 scale-105': ''}`;

  return (
    <div ref={ref} className={baseClasses}>
      {cell.role === 'control' && !isClassical && (
        /* CNOT: filled circle */
        <div className="w-3.5 h-3.5 rounded-full bg-slate-300" />
      )}

      {cell.role === 'control' && isClassical && (
        /* CC_X / CC_Z: filled square — classical source */
        <div className="w-3.5 h-3.5 rounded-sm bg-amber-400" />
      )}

      {cell.role === 'target' && cell.name !== 'CC_Z' && (
        /* CNOT or CC_X target: ⊕ */
        <svg
          className={`w-8 h-8 rounded-full ${isClassical ? 'text-amber-300 bg-slate-900' : 'text-slate-300 bg-slate-900'}`}
          viewBox="0 0 24 24" fill="none" stroke="currentColor"
        >
          <circle cx="12" cy="12" r="10" strokeWidth="1.5" />
          <path d="M12 2v20M2 12h20" strokeWidth="1.5" />
        </svg>
      )}

      {cell.role === 'target' && cell.name === 'CC_Z' && (
        /* CC_Z target: Z box */
        <div className="w-9 h-9 border border-amber-400/70 bg-amber-500/10 rounded flex items-center justify-center">
          <span className="text-amber-300 text-base font-bold leading-none">Z</span>
        </div>
      )}
    </div>
  );
};

export default DraggableCnotNode;
