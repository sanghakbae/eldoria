import { loadConfig } from "./config";
import { createFirestoreSkillConfigRepository } from "./skill-config-repository";

const config = loadConfig();
const skills = await createFirestoreSkillConfigRepository(config.firebaseProjectId).list();
console.log(`Seeded ${skills.length} survival skill configurations into Firestore project ${config.firebaseProjectId}.`);
