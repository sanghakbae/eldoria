import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { foodCatalog } from "@eldoria/game-data";
import { loadConfig } from "./config";

const config = loadConfig();
const app = getApps()[0] ?? initializeApp({ credential: applicationDefault(), projectId: config.firebaseProjectId });
const firestore = getFirestore(app);
const batch = firestore.batch();

for (const food of foodCatalog) batch.set(firestore.collection("gameContentFoods").doc(food.id), food, { merge: true });
batch.set(firestore.collection("gameContent").doc("foodCatalog"), {
  schemaVersion: 1,
  itemCount: foodCatalog.length,
  categories: Object.fromEntries(["fish", "bird", "meat", "vegetable", "fruit"].map((category) => [category, foodCatalog.filter((food) => food.category === category).length])),
  updatedAt: FieldValue.serverTimestamp(),
}, { merge: true });

await batch.commit();
console.log(`Seeded ${foodCatalog.length} food definitions into Firestore project ${config.firebaseProjectId}.`);
