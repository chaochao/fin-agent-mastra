import { Mastra } from '@mastra/core';
import { financeAgent } from './agents/finance-agent.ts';

export const mastra = new Mastra({
  agents: { financeAgent },
});
