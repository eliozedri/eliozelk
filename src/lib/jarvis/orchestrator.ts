import "server-only";
import type { JarvisInput, JarvisResponse, Skill } from "./types";
import { text } from "./types";
import { orderIntakeSkill } from "./skills/orderIntake/skill";

/**
 * Jarvis brain / orchestrator.
 *
 * Channel adapters call `runJarvis(input)` and render the returned messages. The brain
 * selects skill(s) by sender role + conversation state and returns the first handled
 * result. Today the registry holds the Order Intake skill (external customer context);
 * future skills (OCR, CEO request, personal tasks, inventory) register here, and the
 * owner menu will migrate into this layer too. Keeping selection here means adding a
 * skill never touches the adapters.
 */

function selectSkills(_input: JarvisInput): Skill[] {
  // External customer context → order intake. (Registry grows; order matters = priority.)
  return [orderIntakeSkill];
}

export async function runJarvis(input: JarvisInput): Promise<JarvisResponse> {
  for (const skill of selectSkills(input)) {
    const result = await skill.handle({ input });
    if (result.handled) return { messages: result.messages };
  }
  // Safety net — a skill should always handle; never leave the user with silence.
  return { messages: [text("קיבלתי 🙂 כתוב לי בקצרה מה צריך לבצע ואשמח לעזור.")] };
}
