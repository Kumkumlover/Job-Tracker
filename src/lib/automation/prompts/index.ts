import fs from "fs";
import path from "path";

export function loadPrompt(name: string, variables: Record<string, string>): string {
  const filePath = path.join(process.cwd(), "src/lib/automation/prompts", `${name}.txt`);
  let content = fs.readFileSync(filePath, "utf-8");
  for (const [key, value] of Object.entries(variables)) {
    content = content.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value);
  }
  return content;
}
