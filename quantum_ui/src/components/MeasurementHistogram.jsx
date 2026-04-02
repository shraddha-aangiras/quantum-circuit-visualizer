import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

const MeasurementHistogram = ({ data, shots }) => {
  if (!data || data.length === 0) return null;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-2xl">
      <h3 className="font-bold text-white mb-6 border-b border-slate-800 pb-2">
        Measurement Histogram ({shots} Shots)
      </h3>
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <XAxis dataKey="state" stroke="#64748b" tick={{fill: '#94a3b8', fontSize: 12}} />
            <YAxis stroke="#64748b" tick={{fill: '#94a3b8', fontSize: 12}} allowDecimals={false} />
            <Tooltip 
              cursor={{fill: '#1e293b'}} 
              contentStyle={{backgroundColor: '#0f172a', borderColor: '#334155', color: '#f8fafc'}} 
            />
            <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default MeasurementHistogram;