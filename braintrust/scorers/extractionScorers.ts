import { Factuality } from "autoevals";

export const missionRelevance = async (args: { input: string, output: string, expected?: string }) => {
  return await Factuality({
    input: `Evaluate if the output accurately captures the core mission of the company based on the job description.
    Job Description: ${args.input}`,
    output: args.output,
    expected: args.expected
  });
};

export const strengthsAlignment = async (args: { input: string, output: string, expected?: string }) => {
  return await Factuality({
    input: `Evaluate if the output accurately highlights relevant strengths or responsibilities aligned with the job description.
    Job Description: ${args.input}`,
    output: args.output,
    expected: args.expected
  });
};
