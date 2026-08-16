import { defaultSkillProgression, type SkillProgressionConfig } from "@eldoria/game-data";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

export type SkillConfigRepository = {
  list(): Promise<SkillProgressionConfig[]>;
  update(skillId: string, values: { actionsPerGain: number; gainAmount: number }, updatedBy: string): Promise<SkillProgressionConfig>;
};

export class MemorySkillConfigRepository implements SkillConfigRepository {
  private readonly skills = new Map(defaultSkillProgression.map((skill) => [skill.id, structuredClone(skill)]));

  async list() {
    return [...this.skills.values()].map((skill) => structuredClone(skill));
  }

  async update(skillId: string, values: { actionsPerGain: number; gainAmount: number }) {
    const current = this.skills.get(skillId);
    if (!current) throw new SkillConfigError("skill.not_found", "Skill configuration was not found.");
    const next = validateSkillUpdate({ ...current, ...values });
    this.skills.set(skillId, next);
    return structuredClone(next);
  }
}

export class FirestoreSkillConfigRepository implements SkillConfigRepository {
  constructor(private readonly firestore: Firestore) {}

  async list() {
    const snapshot = await this.firestore.collection("gameSkillConfigs").get();
    if (snapshot.empty) {
      const batch = this.firestore.batch();
      for (const skill of defaultSkillProgression) batch.set(this.firestore.collection("gameSkillConfigs").doc(skill.id), { ...skill, updatedAt: FieldValue.serverTimestamp(), updatedBy: "system.default" });
      await batch.commit();
      return defaultSkillProgression.map((skill) => structuredClone(skill));
    }
    const stored = new Map(snapshot.docs.map((document) => [document.id, document.data()]));
    const missing = defaultSkillProgression.filter((skill) => !stored.has(skill.id));
    if (missing.length > 0) {
      const batch = this.firestore.batch();
      for (const skill of missing) batch.set(this.firestore.collection("gameSkillConfigs").doc(skill.id), { ...skill, updatedAt: FieldValue.serverTimestamp(), updatedBy: "system.default" });
      await batch.commit();
    }
    return defaultSkillProgression.map((fallback) => {
      const value = stored.get(fallback.id);
      return validateSkillUpdate({ ...fallback, actionsPerGain: value?.actionsPerGain ?? fallback.actionsPerGain, gainAmount: value?.gainAmount ?? fallback.gainAmount });
    });
  }

  async update(skillId: string, values: { actionsPerGain: number; gainAmount: number }, updatedBy: string) {
    const fallback = defaultSkillProgression.find((skill) => skill.id === skillId);
    if (!fallback) throw new SkillConfigError("skill.not_found", "Skill configuration was not found.");
    const next = validateSkillUpdate({ ...fallback, ...values });
    await this.firestore.collection("gameSkillConfigs").doc(skillId).set({ ...next, updatedAt: FieldValue.serverTimestamp(), updatedBy }, { merge: true });
    return next;
  }
}

export class SkillConfigError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
  }
}

export function createFirestoreSkillConfigRepository(projectId: string) {
  const app = getApps()[0] ?? initializeApp({ credential: applicationDefault(), projectId });
  return new FirestoreSkillConfigRepository(getFirestore(app));
}

function validateSkillUpdate(skill: SkillProgressionConfig): SkillProgressionConfig {
  if (!Number.isInteger(skill.actionsPerGain) || skill.actionsPerGain < 1 || skill.actionsPerGain > 10_000) throw new SkillConfigError("skill.invalid_actions", "Actions per gain must be an integer from 1 to 10000.");
  if (!Number.isFinite(skill.gainAmount) || skill.gainAmount < 0.000001 || skill.gainAmount > 100) throw new SkillConfigError("skill.invalid_gain", "Gain amount must be from 0.000001 to 100.");
  return { id: skill.id, category: skill.category, mvp: skill.mvp, baseDifficulty: skill.baseDifficulty, name: skill.name, actionsPerGain: skill.actionsPerGain, gainAmount: skill.gainAmount, actionIds: skill.actionIds };
}
