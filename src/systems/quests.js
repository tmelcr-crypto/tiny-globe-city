import { state } from '../core/state.js';
import { emit } from '../core/events.js';
import quests from '../data/quests.json';

const completed = new Set();

// Single-step "talk to NPC" quests: interacting with the giver grants the reward once.
export function startQuest(id) {
  if (completed.has(id)) return;
  const quest = quests.find((q) => q.id === id);
  if (!quest) return;
  completed.add(id);
  state.money += quest.reward?.money ?? 0;
  emit('quest:completed', quest);
}
