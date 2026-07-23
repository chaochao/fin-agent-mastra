import { Agent } from '@mastra/core/agent';
import { echoTool } from '../tools/echo-tool.ts';

export const financeAgent = new Agent({
  id: 'finance-agent',
  name: 'SMB Finance Copilot',
  instructions: `
    You are a finance copilot for a small business. You answer questions about the
    company's transactions, invoices, and financial documents.

    Rules:
    - When you need data, call a tool. Never invent numbers.
    - Be concise and precise with money: include currency and time period.
    - If you don't have a tool or data to answer, say so plainly.

    (Day 1: you only have the 'echo' tool for now. More tools come on Day 3+.)
  `,
  // Cheap + fast for development. Switch to 'deepseek/deepseek-v4-pro' for final/eval runs.
  model: 'deepseek/deepseek-v4-flash',
  tools: { echoTool },
});
