import React from "react";
import { pillStyle, type PillTone } from "./styles";

/** A labelled state: the text, not the colour, names it (NFR-1). */
export function StatePill({ label, title, tone }: { label: string; title?: string; tone: PillTone }) {
  return (
    <span style={pillStyle(tone)} title={title}>
      {label}
    </span>
  );
}
