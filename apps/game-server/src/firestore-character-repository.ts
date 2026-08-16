import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, Timestamp, getFirestore, type Firestore } from "firebase-admin/firestore";
import type { CharacterSummary, Position } from "@eldoria/game-protocol";
import { createInitialSurvivalState } from "@eldoria/game-data";
import { CharacterRepositoryError, MAX_CHARACTERS_PER_ACCOUNT, STARTING_POSITION, validateCharacterName, type CharacterRepository } from "./character-repository";

type StoredCharacter = {
  ownerUid: string;
  name: string;
  position: Position;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  survival?: CharacterSummary["survival"];
  startVersion?: number;
};

const CURRENT_START_VERSION = 2;

export class FirestoreCharacterRepository implements CharacterRepository {
  constructor(private readonly firestore: Firestore) {}

  async list(ownerUid: string): Promise<CharacterSummary[]> {
    const snapshot = await this.firestore.collection("characters").where("ownerUid", "==", ownerUid).get();
    const documentsToMigrate = snapshot.docs.filter((document) => !document.data().survival || document.data().startVersion !== CURRENT_START_VERSION);
    if (documentsToMigrate.length > 0) {
      const batch = this.firestore.batch();
      for (const document of documentsToMigrate) {
        const update: Record<string, unknown> = {};
        if (!document.data().survival) update.survival = createInitialSurvivalState(document.data().createdAt?.toDate?.().toISOString());
        if (document.data().startVersion !== CURRENT_START_VERSION) {
          update.position = STARTING_POSITION;
          update.startVersion = CURRENT_START_VERSION;
        }
        batch.set(document.ref, update, { merge: true });
      }
      await batch.commit();
    }
    return snapshot.docs.map(toCharacter).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async create(ownerUid: string, rawName: string): Promise<CharacterSummary> {
    const name = validateCharacterName(rawName);
    const characterRef = this.firestore.collection("characters").doc();
    const ownerRef = this.firestore.collection("users").doc(ownerUid);
    const now = Timestamp.now();
    const stored: StoredCharacter = { ownerUid, name, position: { ...STARTING_POSITION }, createdAt: now, updatedAt: now, survival: createInitialSurvivalState(now.toDate().toISOString()), startVersion: CURRENT_START_VERSION };

    await this.firestore.runTransaction(async (transaction) => {
      const existing = await transaction.get(this.firestore.collection("characters").where("ownerUid", "==", ownerUid));
      if (existing.size >= MAX_CHARACTERS_PER_ACCOUNT) throw new CharacterRepositoryError("character.limit", "The account already has the maximum number of characters.");
      transaction.set(characterRef, stored);
      transaction.set(ownerRef, { characterCount: existing.size + 1, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    });
    return toCharacter({ id: characterRef.id, data: () => stored });
  }

  async getOwned(ownerUid: string, characterId: string): Promise<CharacterSummary | null> {
    const snapshot = await this.firestore.collection("characters").doc(characterId).get();
    if (!snapshot.exists || snapshot.data()?.ownerUid !== ownerUid) return null;
    const update: Record<string, unknown> = {};
    if (!snapshot.data()?.survival) update.survival = createInitialSurvivalState(snapshot.data()?.createdAt?.toDate?.().toISOString());
    if (snapshot.data()?.startVersion !== CURRENT_START_VERSION) {
      update.position = STARTING_POSITION;
      update.startVersion = CURRENT_START_VERSION;
    }
    if (Object.keys(update).length > 0) await snapshot.ref.set(update, { merge: true });
    return toCharacter(snapshot);
  }

  async savePosition(ownerUid: string, characterId: string, position: Position): Promise<void> {
    const reference = this.firestore.collection("characters").doc(characterId);
    await this.firestore.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(reference);
      if (!snapshot.exists || snapshot.data()?.ownerUid !== ownerUid) throw new CharacterRepositoryError("character.not_found", "Character was not found.");
      transaction.update(reference, { position, updatedAt: FieldValue.serverTimestamp() });
    });
  }
}

export function createFirestoreCharacterRepository(projectId: string): FirestoreCharacterRepository {
  const app = getApps()[0] ?? initializeApp({ credential: applicationDefault(), projectId });
  return new FirestoreCharacterRepository(getFirestore(app));
}

function toCharacter(snapshot: { id: string; data(): unknown }): CharacterSummary {
  const data = snapshot.data() as StoredCharacter | undefined;
  if (!data) throw new Error(`Character ${snapshot.id} has no data.`);
  const createdAt = data.createdAt.toDate().toISOString();
  return { id: snapshot.id, name: data.name, position: data.startVersion === CURRENT_START_VERSION ? data.position : { ...STARTING_POSITION }, createdAt, survival: data.survival ?? createInitialSurvivalState(createdAt) };
}
