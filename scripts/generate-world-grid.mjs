import { readFile, writeFile } from "node:fs/promises";

const worldPath = new URL("../data/zones/mvp-world.json", import.meta.url);
const world = JSON.parse(await readFile(worldPath, "utf8"));
const existing = new Map(world.zones.map((zone) => [zone.id, zone]));
const den = existing.get("animalDen");

const landmarkEn = ["Reach", "Basin", "Ridge", "Vale", "Crossing", "Hollow", "March", "Crown", "Expanse", "Frontier"];
const landmarkKo = ["변경", "분지", "능선", "골짜기", "나루", "공동", "접경", "왕관", "대지", "개척지"];
const bands = [
  { en: "Whitewind", ko: "백풍", biome: "glacial-tundra", terrain: "world.greythorn", hydro: "ice-fed-stream", fish: ["char", "grayling", "whitefish"], fruits: ["cloudberry"], wildlife: ["wildlifeSpawnWolf", "wildlifeSpawnBear", "wildlifeSpawnGoat"], birds: ["Eagle", "Crow"] },
  { en: "Frostpine", ko: "서리솔", biome: "boreal-forest", terrain: "world.greythorn", hydro: "cold-lake", fish: ["salmon", "trout", "pike"], fruits: ["juniper-berry"], wildlife: ["wildlifeSpawnDeer", "wildlifeSpawnWolf", "wildlifeSpawnBear"], birds: ["Owl", "Crow"] },
  { en: "Ironspine", ko: "철등뼈", biome: "high-mountain", terrain: "world.hollowVault", hydro: "mountain-spring", fish: ["trout", "char", "minnow"], fruits: ["rowan-berry"], wildlife: ["wildlifeSpawnGoat", "wildlifeSpawnBear", "wildlifeSpawnHare"], birds: ["Eagle", "Vulture"] },
  { en: "Greythorn", ko: "회색가시", biome: "temperate-forest", terrain: "world.greythorn", hydro: "forest-creek", fish: ["carp", "pike", "perch"], fruits: ["wild-pear", "hawthorn-berry"], wildlife: ["wildlifeSpawnDeer", "wildlifeSpawnFox", "wildlifeSpawnBoar"], birds: ["Crow", "Owl"] },
  { en: "Greenwake", ko: "푸른물결", biome: "verdant-meadow", terrain: "world.untamedWilds", hydro: "river-and-pond", fish: ["carp", "perch", "trout"], fruits: ["crabapple", "wild-pear"], wildlife: ["wildlifeSpawnRabbit", "wildlifeSpawnDeer", "wildlifeSpawnBison"], birds: ["Hawk", "Crane"] },
  { en: "Amberfen", ko: "호박늪", biome: "wetland-marsh", terrain: "world.amberfen", hydro: "marsh-channel", fish: ["catfish", "eel", "carp"], fruits: ["bog-berry"], wildlife: ["wildlifeSpawnBoar", "wildlifeSpawnTurkey", "wildlifeSpawnTurtle"], birds: ["Heron", "Crane"] },
  { en: "Emerald", ko: "비취", biome: "tropical-rainforest", terrain: "world.emeraldJungle", hydro: "braided-jungle-river", fish: ["tilapia", "goby", "eel"], fruits: ["wild-fig", "jungle-plum"], wildlife: ["wildlifeSpawnBoar", "wildlifeSpawnTurkey", "wildlifeSpawnTurtle"], birds: ["Parrot", "Hornbill"] },
  { en: "Sungrass", ko: "해풀", biome: "warm-savanna", terrain: "world.untamedWilds", hydro: "seasonal-river", fish: ["bass", "carp", "tilapia"], fruits: ["savanna-fig"], wildlife: ["wildlifeSpawnBison", "wildlifeSpawnGoat", "wildlifeSpawnFox"], birds: ["Vulture", "Crane"] },
  { en: "Sunscar", ko: "태양흉터", biome: "arid-desert-oasis", terrain: "world.sunscar", hydro: "isolated-oasis", fish: ["minnow", "tilapia", "bream"], fruits: ["desert-date", "prickly-pear"], wildlife: ["wildlifeSpawnFox", "wildlifeSpawnHare", "wildlifeSpawnGoat"], birds: ["Vulture", "Falcon"] },
  { en: "Firstshore", ko: "태초해안", biome: "primordial-coast", terrain: "world.untamedWilds", hydro: "coastal-river", fish: ["mullet", "perch", "herring"], fruits: ["crabapple", "sea-berry"], wildlife: ["wildlifeSpawnRabbit", "wildlifeSpawnDeer", "wildlifeSpawnTurtle"], birds: ["Gull", "Heron"] },
];

const specialAt = new Map([
  ["9,0", "untamedWilds"],
  ["8,0", "sunscar"],
  ["6,0", "emeraldJungle"],
  ["5,0", "amberfen"],
  ["4,0", "mossward"],
  ["3,0", "greythorn"],
  ["2,0", "hollowVault"],
]);

const ids = Array.from({ length: 10 }, (_, row) => Array.from({ length: 10 }, (_, column) => specialAt.get(`${row},${column}`) ?? `region-${row + 1}-${column + 1}`));
const spawns = [
  { id: "arrival", x: 836, y: 470 },
  { id: "north-road", x: 836, y: 45 },
  { id: "east-road", x: 1637, y: 470 },
  { id: "south-road", x: 836, y: 916 },
  { id: "west-road", x: 35, y: 470 },
];

// Coordinates are measured from the painted water in each 1672×941 terrain source. Fish may only
// be attached to these anchors; generated arbitrary coordinates inevitably put them on dry land.
const waterAnchors = {
  "world.untamedWilds": [{ type: "fishingWater", x: 1340, y: 342 }],
  "world.mossward": [{ type: "riverFishingWater", x: 112, y: 704 }, { type: "fishingWater", x: 735, y: 785 }],
  "world.greythorn": [{ type: "riverFishingWater", x: 970, y: 260 }, { type: "fishingWater", x: 790, y: 735 }],
  "world.amberfen": [{ type: "riverFishingWater", x: 700, y: 420 }, { type: "fishingWater", x: 1220, y: 705 }],
  "world.hollowVault": [],
  "world.sunscar": [{ type: "fishingWater", x: 1395, y: 785 }],
  "world.emeraldJungle": [{ type: "riverFishingWater", x: 900, y: 220 }, { type: "fishingWater", x: 1090, y: 810 }],
};

// These are large rock faces already painted into the shared terrain. They need interaction anchors
// rather than another sprite laid on top, otherwise the visible rock and the mineable rock diverge.
const stoneOutcropAnchors = {
  "world.untamedWilds": [{ x: 1470, y: 758 }, { x: 985, y: 812 }],
};

const waterRadius = {
  fishingWater: { x: 165, y: 110 },
  riverFishingWater: { x: 135, y: 90 },
};
const groundClearance = {
  wildTree: 72,
  wildFruitTree: 76,
  looseStone: 60,
  fallenBranch: 48,
  copperOreDeposit: 96,
  coalDeposit: 96,
  ironOreDeposit: 96,
};
const dryGroundCandidates = [
  { x: 1540, y: 570 }, { x: 1460, y: 150 }, { x: 1180, y: 650 },
  { x: 520, y: 820 }, { x: 290, y: 520 }, { x: 620, y: 150 },
];

function groundObjectOverlapsWater(object, water) {
  const radius = waterRadius[water.type];
  const clearance = groundClearance[object.type];
  if (!radius || !clearance) return false;
  const dx = (object.x - water.x) / (radius.x + clearance);
  const dy = (object.y - water.y) / (radius.y + clearance);
  return dx * dx + dy * dy < 1;
}

function moveGroundObjectsOffWater(objects) {
  const waters = objects.filter((object) => waterRadius[object.type]);
  for (const object of objects) {
    if (!groundClearance[object.type] || !waters.some((water) => groundObjectOverlapsWater(object, water))) continue;
    const destination = dryGroundCandidates.find((candidate) =>
      !waters.some((water) => groundObjectOverlapsWater({ ...object, ...candidate }, water))
      && !objects.some((other) => other !== object && groundClearance[other.type] && Math.hypot(other.x - candidate.x, other.y - candidate.y) < groundClearance[object.type] + groundClearance[other.type]),
    );
    if (!destination) throw new Error(`No dry placement remains for ${object.id}`);
    Object.assign(object, destination);
  }
}

function generatedObjects(id, row, column, band) {
  const seed = row * 10 + column;
  const objects = [
    { id: `${id}.tree-a`, type: "wildTree", x: 220 + (seed * 137) % 330, y: 175 + (seed * 83) % 190 },
    { id: `${id}.tree-b`, type: "wildTree", x: 1160 + (seed * 59) % 280, y: 510 + (seed * 101) % 220 },
    { id: `${id}.tree-c`, type: "wildTree", x: 720 + (seed * 43) % 250, y: 690 + (seed * 67) % 120 },
    { id: `${id}.stone-a`, type: "looseStone", x: 540 + (seed * 47) % 240, y: 210 + (seed * 71) % 170 },
    { id: `${id}.stone-b`, type: "looseStone", x: 1030 + (seed * 73) % 330, y: 260 + (seed * 31) % 250 },
    { id: `${id}.stone-c`, type: "looseStone", x: 350 + (seed * 89) % 250, y: 650 + (seed * 41) % 150 },
    { id: `${id}.branch`, type: "fallenBranch", x: 880 + (seed * 61) % 260, y: 545 + (seed * 37) % 150 },
    { id: `${id}.fruit`, type: "wildFruitTree", x: 1280 + (seed * 29) % 190, y: 160 + (seed * 97) % 180 },
    { id: `${id}.wildlife-a`, type: band.wildlife[seed % band.wildlife.length], x: 410 + (seed * 79) % 310, y: 470 + (seed * 53) % 220 },
    { id: `${id}.wildlife-b`, type: band.wildlife[(seed + 1) % band.wildlife.length], x: 930 + (seed * 113) % 420, y: 350 + (seed * 43) % 270 },
    { id: `${id}.birds`, type: `ambientBirdFlock${band.birds[seed % band.birds.length]}`, x: 180 + (seed * 97) % 500, y: 110 + (seed * 37) % 170 },
  ];
  if ((row + column) % 3 !== 1) objects.push({ id: `${id}.water`, type: row === 5 || row === 6 ? "riverFishingWater" : "fishingWater", x: 820, y: 330 });
  if (seed % 5 === 0) objects.push({ id: `${id}.copper`, type: "copperOreDeposit", x: 1470, y: 720 });
  if (seed % 7 === 0) objects.push({ id: `${id}.iron`, type: "ironOreDeposit", x: 250, y: 750 });
  if (seed % 6 === 0) objects.push({ id: `${id}.coal`, type: "coalDeposit", x: 1420, y: 420 });
  return objects;
}

const zones = [];
for (let row = 0; row < 10; row += 1) {
  for (let column = 0; column < 10; column += 1) {
    const id = ids[row][column];
    const band = bands[row];
    const previous = existing.get(id);
    const isStart = id === "untamedWilds";
    const exits = [];
    if (row > 0) exits.push({ edge: "north", toZoneId: ids[row - 1][column], toSpawnId: "south-road" });
    if (column < 9) exits.push({ edge: "east", toZoneId: ids[row][column + 1], toSpawnId: "west-road" });
    if (row < 9) exits.push({ edge: "south", toZoneId: ids[row + 1][column], toSpawnId: "north-road" });
    if (column > 0) exits.push({ edge: "west", toZoneId: ids[row][column - 1], toSpawnId: "east-road" });
    const terrainAssetId = previous?.layers?.terrain?.assetId ?? band.terrain;
    const objects = (previous?.layers?.objects ? [...previous.layers.objects] : generatedObjects(id, row, column, band))
      .filter((object) => object.type !== "fishingWater" && object.type !== "riverFishingWater" && object.type !== "stoneOutcrop");
    for (const [anchorIndex, anchor] of (waterAnchors[terrainAssetId] ?? []).entries()) objects.push({ id: `${id}.water-${anchorIndex}`, ...anchor });
    for (const [anchorIndex, anchor] of (stoneOutcropAnchors[terrainAssetId] ?? []).entries()) objects.push({ id: `${id}.outcrop-${anchorIndex}`, type: "stoneOutcrop", ...anchor });
    moveGroundObjectsOffWater(objects);
    if (id === "untamedWilds") {
      const entrance = objects.find((object) => object.type === "animalDenEntrance");
      if (entrance) Object.assign(entrance, { x: 385, y: 210 });
    }
    if (!objects.some((object) => object.type.startsWith("ambientBirdFlock"))) objects.push({ id: `${id}.birds`, type: `ambientBirdFlock${band.birds[(row * 10 + column) % band.birds.length]}`, x: 220, y: 140 });
    zones.push({
      id,
      name: isStart ? { en: "Primordial Wilds", ko: "태초의 황야" } : previous?.name ?? { en: `${band.en} ${landmarkEn[column]}`, ko: `${band.ko} ${landmarkKo[column]}` },
      width: 1672,
      height: 941,
      columns: 53,
      rows: 30,
      ecology: { biome: band.biome, hydrology: { type: band.hydro, fishHabitats: band.fish.map((fish) => `fish.${fish}`) }, wildFruits: band.fruits },
      layers: {
        terrain: { assetId: terrainAssetId },
        collision: previous?.layers?.collision ?? [],
        objects,
        spawn: spawns,
      },
      exits,
    });
  }
}

world.zones = [...zones, ...(den ? [den] : [])];
await writeFile(worldPath, `${JSON.stringify(world, null, 2)}\n`);
console.log(`Generated ${zones.length} connected surface regions; start=${ids[9][0]}.`);
