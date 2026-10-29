import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

// One series per chart, so one hue (validated: L 0.48-0.67 band and >= 3:1 against the dark surface).
const BAR = '#2f8fd8';
const GRID = '#1e293b';
const TICK = '#94a3b8';

export interface BarDatum {
  label: string;
  value: number;
  /** Extra line in tooltip + table, e.g. "12 of 40 attempts". */
  detail?: string;
}

interface Props {
  title: string;
  subtitle: string;
  data: BarDatum[];
  format: (v: number) => string;
  horizontal?: boolean;
  valueHeader: string;
  /** Whole-number values (counts): no fractional ticks. */
  integer?: boolean;
}

function ChartTooltip({ active, payload, format }: { active?: boolean; payload?: { payload: BarDatum }[]; format: (v: number) => string }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-xs shadow-lg">
      <p className="font-medium text-slate-100">{d.label}</p>
      <p className="mt-0.5 tabular-nums text-slate-300">{format(d.value)}</p>
      {d.detail && <p className="text-slate-500">{d.detail}</p>}
    </div>
  );
}

export function BarPanel({ title, subtitle, data, format, horizontal, valueHeader, integer }: Props) {
  const height = horizontal ? Math.max(160, data.length * 32 + 40) : 260;
  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900 p-4">
      <h2 className="font-semibold">{title}</h2>
      <p className="text-xs text-slate-500">{subtitle}</p>
      {data.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-500">No data yet.</p>
      ) : (
        <div className="mt-4" style={{ height }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data}
              layout={horizontal ? 'vertical' : 'horizontal'}
              margin={{ top: 4, right: 16, bottom: 4, left: horizontal ? 8 : -12 }}
              barCategoryGap={horizontal ? 6 : '30%'}
            >
              <CartesianGrid stroke={GRID} horizontal={!horizontal} vertical={!!horizontal} />
              {horizontal ? (
                <>
                  <XAxis
                    type="number"
                    tickFormatter={format}
                    allowDecimals={!integer}
                    tick={{ fill: TICK, fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis type="category" dataKey="label" width={150} tick={{ fill: TICK, fontSize: 12 }} axisLine={false} tickLine={false} />
                </>
              ) : (
                <>
                  <XAxis dataKey="label" tick={{ fill: TICK, fontSize: 12 }} axisLine={{ stroke: GRID }} tickLine={false} />
                  <YAxis tickFormatter={format} tick={{ fill: TICK, fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                </>
              )}
              <Tooltip cursor={{ fill: 'rgba(148,163,184,0.08)' }} content={<ChartTooltip format={format} />} />
              <Bar
                dataKey="value"
                fill={BAR}
                maxBarSize={horizontal ? 18 : 40}
                radius={horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]}
                isAnimationActive={false}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      {data.length > 0 && (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-xs text-slate-500 hover:text-slate-300">Show as table</summary>
          <table className="mt-2 w-full text-xs">
            <thead className="text-left text-slate-500">
              <tr>
                <th className="py-1">Category</th>
                <th className="py-1 text-right">{valueHeader}</th>
                <th className="py-1 text-right">Detail</th>
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.label} className="border-t border-slate-800">
                  <td className="py-1">{d.label}</td>
                  <td className="py-1 text-right tabular-nums">{format(d.value)}</td>
                  <td className="py-1 text-right text-slate-500">{d.detail ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </section>
  );
}
