export interface SwitcherOption {
  id: string;
  name: string;
}

/**
 * Options of the agent switcher (Spec F AC-9): the dashboard's agents ordered by
 * name case-insensitively (agent id breaks ties), plus the current agent when it
 * is not among them (an agent without cases is absent from the dashboard).
 */
export function switcherOptions(
  rows: readonly { agent_id: string; agent_name: string }[],
  current: SwitcherOption,
): SwitcherOption[] {
  const options: SwitcherOption[] = rows.map((r) => ({ id: r.agent_id, name: r.agent_name }));
  if (!options.some((o) => o.id === current.id)) options.push(current);
  return options.sort((a, b) => {
    const an = a.name.toLowerCase();
    const bn = b.name.toLowerCase();
    if (an !== bn) return an < bn ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}
