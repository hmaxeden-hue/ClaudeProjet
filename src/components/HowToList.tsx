interface HowToListProps {
  steps: string[];
  color: string;
  /** Compact rendering for the dashboard card. */
  dense?: boolean;
}

/**
 * The "und wie?" part of a skill. Numbered on purpose: these are steps to work
 * through, not a bullet list of considerations.
 */
export function HowToList({ steps, color, dense = false }: HowToListProps) {
  if (steps.length === 0) return null;

  return (
    <ol className={dense ? 'space-y-1' : 'space-y-1.5'}>
      {steps.map((step, index) => (
        <li key={index} className="flex gap-2.5">
          <span
            className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold"
            style={{ backgroundColor: `${color}1f`, color }}
          >
            {index + 1}
          </span>
          <span
            className={`${dense ? 'text-xs' : 'text-sm'} leading-snug text-slate-300`}
          >
            {step}
          </span>
        </li>
      ))}
    </ol>
  );
}
