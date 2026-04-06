/**
 * Renders the visual inside a gate cell (sidebar palette tiles only for multi-wire gates).
 * Single-qubit gates render their label; CNOT / CC_X / CC_Z get custom SVGs.
 */
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

  if (name === 'CC_X') {
    return (
      <svg className="w-8 h-12" viewBox="0 0 24 32" fill="none" stroke="currentColor">
        {/* Classical control: filled square */}
        <rect x="8" y="2" width="8" height="7" rx="1" fill="currentColor" stroke="none" />
        {/* Double-line classical wire */}
        <line x1="10" y1="9" x2="10" y2="21" strokeWidth="1.2" strokeDasharray="3,2" />
        <line x1="14" y1="9" x2="14" y2="21" strokeWidth="1.2" strokeDasharray="3,2" />
        {/* ⊕ target */}
        <circle cx="12" cy="26" r="5" strokeWidth="1.5" />
        <path d="M12 21v10M7 26h10" strokeWidth="1.5" />
      </svg>
    );
  }

  if (name === 'CC_Z') {
    return (
      <svg className="w-8 h-12" viewBox="0 0 24 32" fill="none" stroke="currentColor">
        {/* Classical control: filled square */}
        <rect x="8" y="2" width="8" height="7" rx="1" fill="currentColor" stroke="none" />
        {/* Double-line classical wire */}
        <line x1="10" y1="9" x2="10" y2="21" strokeWidth="1.2" strokeDasharray="3,2" />
        <line x1="14" y1="9" x2="14" y2="21" strokeWidth="1.2" strokeDasharray="3,2" />
        {/* Z box target */}
        <rect x="6" y="21" width="12" height="9" rx="1" strokeWidth="1.5" />
        <text x="12" y="29" textAnchor="middle" fontSize="7" fill="currentColor"
              stroke="none" fontWeight="bold" fontFamily="monospace">Z</text>
      </svg>
    );
  }

  if (name === 'MEASURE') {
    return (
      <div className="flex flex-col items-center gap-0.5 leading-none">
        <span className="text-lg font-bold">M</span>
        {/* Meter arc */}
        <svg className="w-5 h-3" viewBox="0 0 20 10" fill="none" stroke="currentColor">
          <path d="M2 9 A8 8 0 0 1 18 9" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="10" y1="9" x2="15" y2="3" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </div>
    );
  }

  return <span>{name}</span>;
};

export default GateVisual;
