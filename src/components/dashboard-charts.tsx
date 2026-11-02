"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Card } from "@/components/ui";
import { cn } from "@/lib/utils";

export interface MonthlyPoint {
  month: string;
  quotations: number;
  accepted: number;
}

export interface StatusSlice {
  status: string;
  label: string;
  count: number;
  amount: number;
  currency: string;
}

const CHART_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-5))",
  "hsl(var(--chart-4))",
];

// Status colours stay semantic across themes: green paid, amber unpaid, rose
// cancelled and blue part-paid. The chart series themselves follow the theme.
const STATUS_COLORS: Record<string, string> = {
  paid: "hsl(var(--status-paid))",
  part_paid: "hsl(var(--status-part-paid))",
  unpaid: "hsl(var(--status-unpaid))",
  cancelled: "hsl(var(--status-cancelled))",
};

const TOOLTIP_STYLE = {
  borderRadius: 10,
  border: "1px solid hsl(var(--border))",
  background: "hsl(var(--popover))",
  color: "hsl(var(--popover-foreground))",
  fontSize: 12,
  boxShadow: "0 12px 32px -16px rgb(0 0 0 / 0.35)",
};

export function QuotationVolumeChart({ data }: { data: MonthlyPoint[] }) {
  const created = data.reduce((sum, point) => sum + point.quotations, 0);
  const accepted = data.reduce((sum, point) => sum + point.accepted, 0);
  const conversion = created > 0 ? Math.round((accepted / created) * 100) : 0;

  return (
    <Card
      className="h-full"
      title="Quotation volume"
      subtitle="Created and accepted over the last six months"
      actions={
        <span className="rounded-md border bg-muted/40 px-2 py-1 text-xs text-muted-foreground">
          {conversion}% accepted
        </span>
      }
    >
      <div className="mb-4 flex flex-wrap items-end gap-x-6 gap-y-2">
        <div>
          <p className="text-xs text-muted-foreground">Created</p>
          <p className="text-2xl font-semibold tracking-tight">{created}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Accepted</p>
          <p className="text-2xl font-semibold tracking-tight">{accepted}</p>
        </div>
        <div className="ml-auto flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm" style={{ background: "hsl(var(--chart-1))" }} />
            Created
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm" style={{ background: "hsl(var(--chart-2))" }} />
            Accepted
          </span>
        </div>
      </div>
      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} barGap={4} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="month"
              tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
              axisLine={false}
              tickLine={false}
              dy={6}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
              width={36}
            />
            <Tooltip
              cursor={{ fill: "hsl(var(--muted) / 0.6)" }}
              contentStyle={TOOLTIP_STYLE}
              labelStyle={{ color: "hsl(var(--foreground))", fontWeight: 600 }}
            />
            <Bar
              dataKey="quotations"
              name="Created"
              fill="hsl(var(--chart-1))"
              radius={[4, 4, 0, 0]}
              maxBarSize={26}
              isAnimationActive={false}
            />
            <Bar
              dataKey="accepted"
              name="Accepted"
              fill="hsl(var(--chart-2))"
              radius={[4, 4, 0, 0]}
              maxBarSize={26}
              isAnimationActive={false}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

export function ProformaMixCard({ slices, totalLabel }: { slices: StatusSlice[]; totalLabel: string }) {
  const data = slices.filter((slice) => slice.count > 0);
  const total = slices.reduce((sum, slice) => sum + slice.count, 0);

  return (
    <Card className="h-full" title="Pro forma mix" subtitle="Documents by payment status">
      <div className="flex h-full flex-col items-center justify-center gap-6 sm:flex-row">
        <div className="relative h-44 w-44 shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data.length > 0 ? data : [{ status: "empty", label: "None", count: 1 }]}
                dataKey="count"
                nameKey="label"
                innerRadius={56}
                outerRadius={80}
                paddingAngle={data.length > 1 ? 3 : 0}
                cornerRadius={4}
                strokeWidth={0}
                isAnimationActive={false}
              >
                {(data.length > 0 ? data : [{ status: "empty", count: 1 }]).map((slice) => (
                  <Cell
                    key={slice.status}
                    fill={STATUS_COLORS[slice.status] ?? "hsl(var(--muted))"}
                  />
                ))}
              </Pie>
              {data.length > 0 ? (
                <Tooltip contentStyle={TOOLTIP_STYLE} />
              ) : null}
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
            <div>
              <p className="text-[11px] text-muted-foreground">Outstanding</p>
              <p className="mt-0.5 text-sm font-semibold tracking-tight">{totalLabel}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {total} document{total === 1 ? "" : "s"}
              </p>
            </div>
          </div>
        </div>
        <ul className="w-full flex-1 space-y-3">
          {slices.map((slice) => (
            <li key={slice.status} className="flex items-center gap-2 text-[13px]">
              <span
                className="h-2.5 w-2.5 rounded-sm"
                style={{ background: STATUS_COLORS[slice.status] ?? "hsl(var(--muted))" }}
              />
              <span className="flex-1 text-muted-foreground">{slice.label}</span>
              <span className="font-medium tabular-nums">{slice.count}</span>
            </li>
          ))}
          {total === 0 ? (
            <li className="text-[13px] text-muted-foreground">No pro formas issued yet.</li>
          ) : null}
        </ul>
      </div>
    </Card>
  );
}

export function MethodBars({
  rows,
}: {
  rows: { method: string; label: string; amount: string; share: number }[];
}) {
  return (
    <Card title="Payments by method" subtitle="Share of recorded receipts">
      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">No payments recorded yet.</p>
      ) : (
        <ul className="space-y-4">
          {rows.map((row, index) => (
            <li key={row.method}>
              <div className="mb-1.5 flex items-center justify-between text-[13px]">
                <span className="flex items-center gap-2 font-medium">
                  <span
                    className="h-2 w-2 rounded-sm"
                    style={{ background: CHART_COLORS[index % CHART_COLORS.length] }}
                  />
                  {row.label}
                </span>
                <span className="tabular-nums text-muted-foreground">{row.amount}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn("h-full rounded-full")}
                  style={{
                    width: row.share > 0 ? `${Math.max(2, Math.round(row.share * 100))}%` : 0,
                    background: CHART_COLORS[index % CHART_COLORS.length],
                  }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
