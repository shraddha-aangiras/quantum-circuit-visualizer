import { useRef, useEffect, useState } from 'react';
import { draggable, dropTargetForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';

/**
 * One wire-slot of a placed barrier.
 *
 * Layout (per wire cell):
 *   - A narrow 8px draggable strip centered on the cell (cursor: grab) — move the whole barrier
 *   - A pointer-events-none dotted line drawn full-height from topWire (visual only)
 *   - On topWire: ▲/▼ buttons for top-end resize + delete button (siblings of drag strip, cursor: pointer)
 *   - On bottomWire: ▲/▼ buttons for bottom-end resize (siblings of drag strip)
 *
 * The drag strip and the buttons are siblings — NOT nested — so grab never swallows button clicks.
 */
const DraggableBarrier = ({
  cell, wireIndex, stepIndex,
  isHovered, onHoverChange,
  onDelete, onResize,
}) => {
  const stripRef = useRef(null);
  const dropRef  = useRef(null);
  const [isDragging, setIsDragging] = useState(false);

  const isTop    = wireIndex === cell.topWire;
  const isBottom = wireIndex === cell.bottomWire;
  const numSpan  = cell.bottomWire - cell.topWire;

  // Height of the visual line from topWire top to bottomWire bottom
  const lineHeightRem = numSpan * 5 + 3.5;

  const canExtendTop    = cell.topWire > 0;
  const canShrinkTop    = numSpan > 0;
  const canExtendBottom = cell.bottomWire < 99; // actual limit passed via prop if needed
  const canShrinkBottom = numSpan > 0;

  // Drag: move whole barrier
  useEffect(() => {
    const el = stripRef.current;
    if (!el) return;
    return draggable({
      element: el,
      getInitialData: () => ({
        type: 'barrier',
        topWire: cell.topWire,
        bottomWire: cell.bottomWire,
        stepIndex,
      }),
      onDragStart: () => { setIsDragging(true); onHoverChange(false); },
      onDrop:      () => setIsDragging(false),
    });
  }, [cell, stepIndex, onHoverChange]);

  // Drop target: insert-before behaviour (same as other gate types)
  useEffect(() => {
    const el = dropRef.current;
    if (!el) return;
    return dropTargetForElements({
      element: el,
      getData: () => ({ type: 'gate-insert', wireIndex, stepIndex }),
    });
  }, [wireIndex, stepIndex]);

  const btnBase = 'w-5 h-4 rounded bg-slate-700/90 text-violet-300 hover:bg-violet-600 ' +
                  'text-[9px] flex items-center justify-center leading-none transition-colors ' +
                  'select-none';

  return (
    <div
      className="w-full h-full relative"
      ref={dropRef}
      onMouseEnter={() => onHoverChange(true)}
      onMouseLeave={() => onHoverChange(false)}
    >
      {/* ── dotted visual line (topWire only, spans full height) ── */}
      {isTop && (
        <div
          className="absolute pointer-events-none"
          style={{
            left: '50%',
            top: 0,
            transform: 'translateX(-50%)',
            height: `${lineHeightRem}rem`,
            borderLeft: `2px dashed ${
              isDragging ? 'rgba(167,139,250,0.15)' :
              isHovered  ? 'rgba(196,181,253,0.9)'  :
                           'rgba(167,139,250,0.45)'
            }`,
          }}
        />
      )}

      {/* ── narrow draggable strip (move whole barrier) ── */}
      <div
        ref={stripRef}
        className={`absolute top-0 bottom-0 z-20 ${isDragging ? 'opacity-20' : ''}`}
        style={{ left: 'calc(50% - 4px)', width: '8px', cursor: 'grab' }}
        title="Drag to move barrier"
      />

      {/* ── top-wire controls ── */}
      {isTop && isHovered && !isDragging && (
        <>
          {/* delete */}
          <button
            className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-slate-700
                       text-slate-300 hover:bg-red-500 hover:text-white text-[10px]
                       flex items-center justify-center z-40 leading-none transition-colors"
            style={{ cursor: 'pointer' }}
            onClick={e => { e.stopPropagation(); onDelete(); }}
            title="Delete barrier"
          >×</button>

          {/* top-end buttons */}
          <div
            className="absolute flex flex-col gap-0.5 z-40"
            style={{ top: '2px', left: 'calc(50% + 6px)', cursor: 'pointer' }}
          >
            {canExtendTop && (
              <button className={btnBase} style={{ cursor: 'pointer' }}
                onClick={e => { e.stopPropagation(); onResize('extendTop'); }}
                title="Extend up">▲</button>
            )}
            {canShrinkTop && (
              <button className={btnBase} style={{ cursor: 'pointer' }}
                onClick={e => { e.stopPropagation(); onResize('shrinkTop'); }}
                title="Shrink from top">▼</button>
            )}
          </div>
        </>
      )}

      {/* ── bottom-wire controls ── */}
      {isBottom && isHovered && !isDragging && (
        <div
          className="absolute flex flex-col gap-0.5 z-40"
          style={{ bottom: '2px', left: 'calc(50% + 6px)', cursor: 'pointer' }}
        >
          {canShrinkBottom && (
            <button className={btnBase} style={{ cursor: 'pointer' }}
              onClick={e => { e.stopPropagation(); onResize('shrinkBottom'); }}
              title="Shrink from bottom">▲</button>
          )}
          {canExtendBottom && (
            <button className={btnBase} style={{ cursor: 'pointer' }}
              onClick={e => { e.stopPropagation(); onResize('extendBottom'); }}
              title="Extend down">▼</button>
          )}
        </div>
      )}
    </div>
  );
};

export default DraggableBarrier;
