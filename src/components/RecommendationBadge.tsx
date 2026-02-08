import { motion } from "framer-motion";
import { CheckCircle2, AlertTriangle, XCircle } from "lucide-react";

interface RecommendationBadgeProps {
  recommendation: "go" | "revise" | "stop";
  reasoning: string;
  keyFactors: string[];
}

const config = {
  go: {
    icon: CheckCircle2,
    label: "Go",
    emoji: "✅",
    bg: "bg-success/10 border-success/30",
    text: "text-success",
  },
  revise: {
    icon: AlertTriangle,
    label: "Revise",
    emoji: "⚠️",
    bg: "bg-warning/10 border-warning/30",
    text: "text-warning",
  },
  stop: {
    icon: XCircle,
    label: "Stop",
    emoji: "🛑",
    bg: "bg-destructive/10 border-destructive/30",
    text: "text-destructive",
  },
};

const RecommendationBadge = ({ recommendation, reasoning, keyFactors }: RecommendationBadgeProps) => {
  const c = config[recommendation];
  const Icon = c.icon;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5 }}
      className={`rounded-xl border-2 ${c.bg} p-6 card-shadow`}
    >
      <div className="flex items-center gap-3 mb-4">
        <Icon className={`h-8 w-8 ${c.text}`} />
        <h3 className={`font-display text-2xl font-bold ${c.text}`}>
          {c.emoji} Recommendation: {c.label}
        </h3>
      </div>
      <p className="text-foreground leading-relaxed">{reasoning}</p>
      {keyFactors.length > 0 && (
        <div className="mt-4">
          <p className="text-sm font-semibold text-muted-foreground mb-2">Key Decision Factors:</p>
          <ul className="space-y-1">
            {keyFactors.map((f, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                <span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                {f}
              </li>
            ))}
          </ul>
        </div>
      )}
    </motion.div>
  );
};

export default RecommendationBadge;
