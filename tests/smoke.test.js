import { describe, it, expect } from 'vitest';
import quests from '../src/data/quests.json';

describe('data', () => {
  it('quests load', () => expect(quests.length).toBeGreaterThan(0));
});
