// Day 1 demo tool. Proves tool-calling works end-to-end.
// On Day 3 you'll replace this with a real `queryTransactions` tool.
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

export const echoTool = createTool({
  id: 'echo',
  description: 'Echoes back a message with a timestamp. Use to confirm tool-calling works.',
  inputSchema: z.object({
    message: z.string().describe('The message to echo back'),
  }),
  outputSchema: z.object({
    echoed: z.string(),
    at: z.string(),
  }),
  execute: async ({ message }) => {
    return { echoed: message, at: new Date().toISOString() };
  },
});
