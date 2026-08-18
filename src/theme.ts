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
  good: "#2F6B4F"
} as const;
