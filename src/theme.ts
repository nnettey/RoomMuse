// The single source for the palette.
//
// Before this file the same colours were re-declared as a local `const C` in five screen files and
// inlined again in ResilientImage, so a palette change meant editing six places and they had already
// drifted (three copies had no `warn` or `good`). Screens import `C` from here instead.
export const C = {
  ink: "#17211B",
  green: "#244C3B",
  paper: "#FCFBF7",
  line: "#DEDCD3",
  clay: "#B87958",
  muted: "#68706A",
  white: "#FFF",
  // `warn` is the semantic red: errors, over-budget, destructive actions. It is NOT a decorative
  // colour, and nothing purely decorative may use it.
  warn: "#963C33",
  good: "#2F6B4F",
  // The brand accent. Deliberately a different red from `warn`: deeper, more saturated, closer to
  // lacquer than to brick, so the two never read as the same signal.
  //
  // Hue alone is not enough separation, so the two are also kept apart by FORM. A warning is always
  // a filled tinted card with an icon and an explicit word ("Over budget by ..."). The accent only
  // ever appears as a thin mark on a paper background — a rule, an underline, a small glyph — never
  // as a filled block, never carrying a message, never on a control that destroys anything.
  accent: "#A31621",
  // A barely-there wash of the accent, for the underline track behind an active tab.
  accentWash: "#F6E7E6"
} as const;
