import { defaultSkillProgression } from "@eldoria/game-data";
import { loadConfig } from "./config";
import { createFirestoreSkillConfigRepository } from "./skill-config-repository";

// Stored documents win over the content defaults, so shipping a new balance pass needs --reset
// to push those defaults back over whatever an earlier seed or admin edit left behind.
const reset = process.argv.includes("--reset");
const config = loadConfig();
const repository = createFirestoreSkillConfigRepository(config.firebaseProjectId);

if (reset) {
  for (const skill of defaultSkillProgression) {
    await repository.update(skill.id, { actionsPerGain: skill.actionsPerGain, gainAmount: skill.gainAmount }, "system.reset");
  }
}

const skills = await repository.list();
console.log(`${reset ? "Reset" : "Seeded"} ${skills.length} survival skill configurations in Firestore project ${config.firebaseProjectId}.`);
