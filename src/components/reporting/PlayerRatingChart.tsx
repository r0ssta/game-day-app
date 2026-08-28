import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { PlayerRatingTrendPoint } from '@/lib/player-rating'

type PlayerRatingChartProps = {
  points: PlayerRatingTrendPoint[]
}

type TooltipPayloadItem = {
  payload?: PlayerRatingTrendPoint
  value?: number | string
}

function RatingTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: TooltipPayloadItem[]
}) {
  if (!active || !payload?.length) return null
  const point = payload[0]?.payload
  if (!point) return null

  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-md">
      <p className="text-xs font-semibold text-foreground">{point.opponent}</p>
      <p className="mt-0.5 text-[10px] text-muted-foreground">{point.dateLabel}</p>
      <p className="mt-1 font-display text-sm font-black tabular-nums text-neon">
        {point.rating}/5
      </p>
    </div>
  )
}

export function PlayerRatingChart({ points }: PlayerRatingChartProps) {
  if (points.length === 0) {
    return (
      <p className="py-8 text-center text-sm italic text-muted-foreground">
        No post-match ratings yet. Finalize a Game Recap to start the trend.
      </p>
    )
  }

  return (
    <div className="h-52 w-full min-w-0 sm:h-56">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 8, right: 8, left: -12, bottom: 4 }}>
          <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="shortLabel"
            tick={{ fill: 'var(--color-muted-foreground)', fontSize: 10 }}
            tickLine={false}
            axisLine={{ stroke: 'var(--color-border)' }}
            interval="preserveStartEnd"
            minTickGap={18}
          />
          <YAxis
            domain={[1, 5]}
            ticks={[1, 2, 3, 4, 5]}
            allowDecimals={false}
            tick={{ fill: 'var(--color-muted-foreground)', fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={28}
          />
          <Tooltip
            content={<RatingTooltip />}
            cursor={{ stroke: 'var(--color-border)', strokeWidth: 1 }}
          />
          <Line
            type="monotone"
            dataKey="rating"
            name="Rating"
            stroke="var(--color-neon)"
            strokeWidth={2.5}
            dot={{
              r: 4,
              fill: 'var(--color-neon)',
              stroke: 'var(--color-card)',
              strokeWidth: 2,
            }}
            activeDot={{
              r: 6,
              fill: 'var(--color-neon)',
              stroke: 'var(--color-foreground)',
              strokeWidth: 2,
            }}
            isAnimationActive={points.length < 40}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
