import { SKILL_PRIORITY_ORDER } from '../skills/index.js';

export interface NotificationItem {
  skill: string;
  text: string;
}

export function orderByPriority(items: NotificationItem[]): NotificationItem[] {
  const rank = (skill: string) => {
    const i = (SKILL_PRIORITY_ORDER as readonly string[]).indexOf(skill);
    return i === -1 ? SKILL_PRIORITY_ORDER.length : i;
  };
  return [...items].sort((a, b) => rank(a.skill) - rank(b.skill));
}
