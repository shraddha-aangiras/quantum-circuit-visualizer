/**
 * Renders the visual inside a gate cell (sidebar palette tiles for multi-wire gates).
 */
const GateVisual = ({ name }) => {
  if (name === 'CNOT') {
    // Controlled-X: dot control, square-X target
    return (
      <svg className="w-8 h-12" viewBox="0 0 24 32" fill="none" stroke="currentColor">
        <circle cx="12" cy="6" r="3" fill="currentColor" stroke="none" />
        <line x1="12" y1="6" x2="12" y2="20" strokeWidth="1.5" />
        <rect x="5" y="20" width="14" height="10" rx="1.5" strokeWidth="1.5" />
        <text x="12" y="28.5" textAnchor="middle" fontSize="8" fill="currentColor"
              stroke="none" fontWeight="bold" fontFamily="monospace">X</text>
      </svg>
    );
  }

  if (name === 'TOFFOLI') {
    // CCX: two dot controls, square-X target
    return (
      <svg className="w-8 h-16" viewBox="0 0 24 44" fill="none" stroke="currentColor">
        <circle cx="12" cy="6" r="3" fill="currentColor" stroke="none" />
        <circle cx="12" cy="20" r="3" fill="currentColor" stroke="none" />
        <line x1="12" y1="6" x2="12" y2="32" strokeWidth="1.5" />
        <rect x="5" y="32" width="14" height="10" rx="1.5" strokeWidth="1.5" />
        <text x="12" y="40.5" textAnchor="middle" fontSize="8" fill="currentColor"
              stroke="none" fontWeight="bold" fontFamily="monospace">X</text>
      </svg>
    );
  }

  if (name === 'CZ') {
    // Controlled-Z: dot control, Z-box target
    return (
      <svg className="w-8 h-12" viewBox="0 0 24 32" fill="none" stroke="currentColor">
        <circle cx="12" cy="6" r="3" fill="currentColor" stroke="none" />
        <line x1="12" y1="6" x2="12" y2="20" strokeWidth="1.5" />
        <rect x="5" y="20" width="14" height="10" rx="1.5" strokeWidth="1.5" />
        <text x="12" y="28.5" textAnchor="middle" fontSize="8" fill="currentColor"
              stroke="none" fontWeight="bold" fontFamily="monospace">Z</text>
      </svg>
    );
  }

  if (name === 'FF_x') {
    // Classically-controlled X: filled-square control, square-X target
    return (
      <svg className="w-8 h-12" viewBox="0 0 24 32" fill="none" stroke="currentColor">
        <rect x="8" y="2" width="8" height="7" rx="1" fill="currentColor" stroke="none" />
        <line x1="10" y1="9" x2="10" y2="20" strokeWidth="1.2" />
        <line x1="14" y1="9" x2="14" y2="20" strokeWidth="1.2" />
        <rect x="5" y="20" width="14" height="10" rx="1.5" strokeWidth="1.5" />
        <text x="12" y="28.5" textAnchor="middle" fontSize="8" fill="currentColor"
              stroke="none" fontWeight="bold" fontFamily="monospace">X</text>
      </svg>
    );
  }

  if (name === 'FF_Z') {
    // Classically-controlled Z: filled-square control, Z-box target
    return (
      <svg className="w-8 h-12" viewBox="0 0 24 32" fill="none" stroke="currentColor">
        <rect x="8" y="2" width="8" height="7" rx="1" fill="currentColor" stroke="none" />
        <line x1="10" y1="9" x2="10" y2="20" strokeWidth="1.2" />
        <line x1="14" y1="9" x2="14" y2="20" strokeWidth="1.2" />
        <rect x="5" y="20" width="14" height="10" rx="1.5" strokeWidth="1.5" />
        <text x="12" y="28.5" textAnchor="middle" fontSize="8" fill="currentColor"
              stroke="none" fontWeight="bold" fontFamily="monospace">Z</text>
      </svg>
    );
  }

  if (name === 'BARRIER') {
    return (
      <svg className="w-6 h-12" viewBox="0 0 12 32" fill="none">
        <line x1="6" y1="0" x2="6" y2="32" stroke="currentColor" strokeWidth="2" strokeDasharray="3 3" />
      </svg>
    );
  }

  if (name === 'MEASURE') {
    return (
      <div className="flex flex-col items-center gap-0.5 leading-none">
        <span className="text-lg font-bold">M</span>
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
