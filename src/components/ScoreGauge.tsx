import { motion } from "framer-motion";

interface ScoreGaugeProps {
  label: string;
  score: number;
  explanation: string;
}

const getColor = (score: number, label: string) => {
  // For "Risk" and "Complexity", lower is better
  const inverted = label === "Risk" || label === "Complexity";
  const effective = inverted ? 100 - score : score;
  if (effective >= 70) return { stroke: "hsl(var(--success))", bg: "hsl(var(--success) / 0.1)" };
  if (effective >= 40) return { stroke: "hsl(var(--warning))", bg: "hsl(var(--warning) / 0.1)" };
  return { stroke: "hsl(var(--destructive))", bg: "hsl(var(--destructive) / 0.1)" };
};

const ScoreGauge = ({ label, score, explanation }: ScoreGaugeProps) => {
  const { stroke, bg } = getColor(score, label);
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="flex flex-col items-center rounded-xl border border-border bg-card p-6 card-shadow">
      <div className="relative mb-4">
        <svg width="128" height="128" viewBox="0 0 128 128">
          <circle cx="64" cy="64" r={radius} fill="none" stroke={bg} strokeWidth="10" />
          <motion.circle
            cx="64" cy="64" r={radius} fill="none"
            stroke={stroke} strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: offset }}
            transition={{ duration: 1.2, ease: "easeOut" }}
            transform="rotate(-90 64 64)"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <motion.span
            className="font-display text-3xl font-bold text-foreground"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
          >
            {score}
          </motion.span>
          <span className="text-xs text-muted-foreground">/ 100</span>
        </div>
      </div>
      <h3 className="font-display text-lg font-semibold text-foreground">{label}</h3>
      <p className="mt-2 text-center text-sm leading-relaxed text-muted-foreground">{explanation}</p>
    </div>
  );
};

export default ScoreGauge;
