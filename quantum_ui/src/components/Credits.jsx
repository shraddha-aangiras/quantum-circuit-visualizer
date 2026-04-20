import React from 'react';

export default function Credits({ className = '' }) {
  return (
    <div className={`p-3 text-[9px] text-slate-500 flex flex-col items-center text-center gap-1.5 leading-tight ${className}`}>
      <div className="bg-white px-2 py-1 rounded-md [.light-mode_&]:bg-transparent">
        <img 
          src="/iqc-logo.png" 
          alt="Institute for Quantum Computing Logo" 
          className="h-7" 
        />
      </div>
      <p>
        Developed in 2026 by Shraddha Aangiras and the Scientific Outreach team at the Institute for Quantum Computing (IQC), University of Waterloo.
      </p>
      <p>
        Questions / Bug Reports:<br />
        <a href="mailto:iqc-outreach@uwaterloo.ca" className="text-blue-400 hover:text-blue-300 transition-colors">
          iqc-outreach@uwaterloo.ca
        </a>
      </p>
    </div>
  );
}