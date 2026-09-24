/** True when this snapshot is the skill's live version number. */
export function isCurrentVersion(version: number, current: number): boolean {
  return version === current;
}
