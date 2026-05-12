import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { DeterministicLlmClient } from "@nexus/ai-core";
import type { AgentId } from "@nexus/shared";

interface EvalCase {
  name: string;
  input: {
    message: string;
  };
  expected: {
    mustInclude?: string[];
    mustNotInclude?: string[];
  };
}

const agentByDirectory: Record<string, AgentId> = {
  "dialogue-agent": "dialogue",
  "planning-agent": "planning",
  "review-agent": "review",
};

async function main() {
  const root = join(process.cwd(), "evals");
  const client = new DeterministicLlmClient();
  const failures: string[] = [];
  let total = 0;

  for (const directory of await readdir(root)) {
    const agentId = agentByDirectory[directory];
    if (!agentId) continue;
    const evalDirectory = join(root, directory);
    for (const file of await readdir(evalDirectory)) {
      if (!file.endsWith(".json")) continue;
      total += 1;
      const testCase = JSON.parse(await readFile(join(evalDirectory, file), "utf8")) as EvalCase;
      const response = await client.complete({
        agentId,
        modelTier: agentId === "review" ? "opus" : agentId === "planning" ? "sonnet" : "haiku",
        messages: [{ role: "user", content: testCase.input.message }],
      });

      for (const needle of testCase.expected.mustInclude ?? []) {
        if (!response.content.includes(needle)) {
          failures.push(`${directory}/${file} missing required text: ${needle}`);
        }
      }
      for (const needle of testCase.expected.mustNotInclude ?? []) {
        if (response.content.includes(needle)) {
          failures.push(`${directory}/${file} included forbidden text: ${needle}`);
        }
      }
    }
  }

  if (failures.length > 0) {
    console.error(failures.join("\n"));
    process.exit(1);
  }
  console.log(`Eval runner passed ${total} cases.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
