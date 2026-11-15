/**
 * Decorative Apex network: many small nodes linked in a lattice (many voices), used very quietly behind
 * the hero. Purely decorative (aria-hidden); a slow drift runs only when the visitor has not asked for
 * reduced motion (see .motif-drift in globals.css). Colour comes from --motif.
 */
const NODES: [number, number][] = [
  [60, 40], [180, 20], [300, 60], [420, 30], [520, 80],
  [20, 140], [130, 120], [250, 150], [370, 130], [480, 170],
  [80, 240], [200, 220], [320, 250], [440, 230], [540, 260],
  [40, 330], [160, 320], [280, 350], [400, 330], [510, 350],
];
const EDGES: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4], [0, 6], [1, 6], [1, 7], [2, 7], [2, 8], [3, 8], [4, 9], [3, 9],
  [5, 6], [6, 7], [7, 8], [8, 9], [5, 10], [6, 10], [6, 11], [7, 11], [7, 12], [8, 12], [8, 13], [9, 13], [9, 14],
  [10, 11], [11, 12], [12, 13], [13, 14], [10, 15], [11, 15], [11, 16], [12, 16], [12, 17], [13, 18], [14, 19], [16, 17], [17, 18], [18, 19],
];

export function ApexMotif({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden focusable="false" viewBox="0 0 560 380" className={`motif motif-drift ${className}`} fill="none">
      <defs>
        <radialGradient id="motif-glow">
          <stop offset="0" stopColor="#c8a24a" stopOpacity="0.9" />
          <stop offset="1" stopColor="#c8a24a" stopOpacity="0" />
        </radialGradient>
      </defs>
      <g stroke="currentColor" strokeWidth="1.6" style={{ opacity: "var(--motif-opacity)" }}>
        {EDGES.map(([a, b]) => (
          <line key={`${a}-${b}`} x1={NODES[a][0]} y1={NODES[a][1]} x2={NODES[b][0]} y2={NODES[b][1]} />
        ))}
      </g>
      <g fill="currentColor" style={{ opacity: "var(--motif-opacity)" }}>
        {NODES.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={i === 7 ? 6 : 4.2} />
        ))}
      </g>
      {/* The apex node picks up a faint gold glow (the svg's own opacity keeps this decorative and quiet). */}
      <circle cx={NODES[7][0]} cy={NODES[7][1]} r="46" fill="url(#motif-glow)" opacity="0.28" />
      <circle cx={NODES[7][0]} cy={NODES[7][1]} r="6.5" fill="#c8a24a" opacity="0.45" />
    </svg>
  );
}

/** The Apex mark (icon-02) as a quiet illustration, for when there is no Campaign to show. */
export function ApexMark({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden focusable="false" viewBox="0 0 64 64" className={className}>
      <g stroke="currentColor" strokeWidth="2.6" fill="none">
        <path d="M32 12 19 34M32 12 45 34M19 34 8 54M19 34 32 54M45 34 32 54M45 34 56 54" />
      </g>
      <g fill="currentColor">
        {[[19, 34], [45, 34], [8, 54], [32, 54], [56, 54]].map(([x, y]) => (
          <circle key={`${x}-${y}`} cx={x} cy={y} r="5" />
        ))}
      </g>
      <circle cx="32" cy="12" r="7.5" className="fill-gold-mark" />
    </svg>
  );
}
