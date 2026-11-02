import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowUpRight, CheckCheck, Clock3, Coffee } from "lucide-react";
import { buildStackedChartData } from "../domain/chartData";
import { formatMinutes } from "../domain/taskRules";
import type { MetricsPeriod, ProductivitySummary } from "../domain/metrics";

interface MetricsViewProps {
  period: MetricsPeriod;
  today: string;
  metrics: ProductivitySummary;
  onPeriodChange: (period: MetricsPeriod) => void;
}

const periodOptions: Array<{ key: MetricsPeriod; label: string }> = [
  { key: "day", label: "Día" },
  { key: "week", label: "Semana" },
  { key: "month", label: "Mes" },
];

export function MetricsView({ period, today, metrics, onPeriodChange }: MetricsViewProps) {
  const chart = buildStackedChartData(period, today, metrics.series);
  const hasSessions = metrics.series.length > 0;

  return (
    <div className="view-stack">
      <div className="page-heading metrics-heading">
        <div>
          <p className="eyebrow">UNA MIRADA A TU PROCESO</p>
          <h1>Estadísticas</h1>
          <p className="page-description">El progreso se construye foco a foco. Acá podés ver el tiempo que realmente terminaste.</p>
        </div>
        <div className="segmented-control" aria-label="Período de métricas">
          {periodOptions.map((option) => (
            <button
              key={option.key}
              type="button"
              aria-pressed={period === option.key}
              className={period === option.key ? "segment segment-active" : "segment"}
              onClick={() => onPeriodChange(option.key)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <section className="metric-cards" aria-label="Resumen del período">
        <article className="metric-card panel">
          <span className="metric-icon metric-icon-sage"><CheckCheck size={17} /></span>
          <p>Tareas completadas</p>
          <strong>{metrics.completedTasks}</strong>
          <span className="metric-hint">Terminadas con ciclos de enfoque</span>
        </article>
        <article className="metric-card panel">
          <span className="metric-icon metric-icon-blue"><Clock3 size={17} /></span>
          <p>Tiempo acreditado</p>
          <strong>{formatMinutes(metrics.creditedMinutes)}</strong>
          <span className="metric-hint">Solo ciclos completos</span>
        </article>
        <article className="metric-card panel">
          <span className="metric-icon metric-icon-terra"><Coffee size={17} /></span>
          <p>Ciclos completados</p>
          <strong>{metrics.completedCycles}</strong>
          <span className="metric-hint">Los descansos no se contabilizan</span>
        </article>
      </section>

      <section className="chart-panel panel" aria-labelledby="chart-title">
        <div className="section-heading chart-heading">
          <div>
            <p className="eyebrow">TIEMPO POR TAREA</p>
            <h2 id="chart-title">Horas enfocadas</h2>
          </div>
          <span className="chart-unit"><ArrowUpRight size={14} /> Cada bloque representa minutos acreditados</span>
        </div>
        {hasSessions ? (
          <>
            <div className="chart-legend">
              {chart.series.map((series) => (
                <span className="legend-item" key={series.key}>
                  <span className="legend-swatch" style={{ backgroundColor: series.color }} />
                  {series.title}
                </span>
              ))}
            </div>
            <div className="chart-canvas" role="img" aria-label="Gráfico apilado del tiempo acreditado por día y tarea">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chart.rows} margin={{ top: 10, right: 12, left: -14, bottom: 0 }} barCategoryGap="38%">
                  <CartesianGrid vertical={false} stroke="var(--line-soft)" strokeDasharray="3 5" />
                  <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "var(--text-muted)", fontSize: 12 }} dy={10} />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "var(--text-muted)", fontSize: 11 }}
                    tickFormatter={(value: number) => `${Number(value) / 60} h`}
                  />
                  <Tooltip
                    cursor={{ fill: "var(--surface-hover)" }}
                    labelFormatter={(_, payload) => {
                      const date = payload?.[0]?.payload?.date;
                      return typeof date === "string" ? new Date(`${date}T12:00:00`).toLocaleDateString("es-AR", { dateStyle: "full" }) : "";
                    }}
                    formatter={(value) => [formatMinutes(Number(value)), "Acreditado"]}
                    contentStyle={{ backgroundColor: "var(--surface-raised)", border: "1px solid var(--line)", borderRadius: 12, color: "var(--text)" }}
                  />
                  {chart.series.map((series) => (
                    <Bar
                      key={series.key}
                      dataKey={series.key}
                      name={series.title}
                      stackId="focus"
                      fill={series.color}
                      radius={[4, 4, 0, 0]}
                      maxBarSize={42}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </>
        ) : (
          <div className="chart-empty">
            <div className="empty-icon"><Clock3 size={19} /></div>
            <h3>Todavía no hay ciclos completos</h3>
            <p>Cuando termines un ciclo, el tiempo va a aparecer acá, separado por tarea.</p>
          </div>
        )}
      </section>
      <p className="metrics-footnote">Las métricas se calculan desde tus sesiones completadas. No se cuentan los ciclos interrumpidos ni los descansos.</p>
    </div>
  );
}

