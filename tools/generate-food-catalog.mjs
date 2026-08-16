import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = resolve(root, "data/foods/catalog.json");

const categories = {
  fish: {
    ko: "어류",
    names: `Salmon|연어\nTrout|송어\nCod|대구\nHerring|청어\nMackerel|고등어\nSardine|정어리\nAnchovy|멸치\nTuna|참치\nCarp|잉어\nCatfish|메기\nEel|뱀장어\nPike|강꼬치고기\nPerch|농어\nBass|배스\nFlounder|가자미\nHalibut|넙치\nSole|서대\nPollock|명태\nHaddock|해덕\nBream|도미\nSnapper|퉁돔\nMullet|숭어\nSturgeon|철갑상어\nSmelt|빙어\nMinnow|피라미\nChar|곤들매기\nGrayling|살기\nWhitefish|백어\nSwordfish|황새치\nMarlin|청새치\nBonito|가다랑어\nSaury|꽁치\nSprat|스프랫\nShad|전어\nGoby|망둑어\nLoach|미꾸라지\nTilapia|틸라피아\nGrouper|바리\nBarracuda|꼬치고기\nWrasse|놀래기\nRockfish|볼락\nMonkfish|아귀\nPufferfish|복어\nFlying Fish|날치\nLamprey|칠성장어\nBurbot|모오케\nDace|황어\nTench|유럽잉어\nRoach|로치\nChub|처브`,
    base: { protein: 21, fat: 11, carbohydrate: 0, iron: 8, vitaminA: 8, vitaminC: 1, vitaminD: 20, vitaminB12: 22, calcium: 9, iodine: 18, water: 16 },
    parts: ["flesh", "liver", "roe", "skin"],
    acquisitionMethods: ["fishing"],
  },
  bird: {
    ko: "조류",
    names: `Chicken|닭\nDuck|오리\nGoose|거위\nTurkey|칠면조\nQuail|메추라기\nPheasant|꿩\nPartridge|자고새\nGrouse|들꿩\nGuineafowl|뿔닭\nPigeon|비둘기\nDove|산비둘기\nWoodcock|멧도요\nSnipe|도요\nTeal|쇠오리\nMallard|청둥오리\nWigeon|홍머리오리\nPintail|고방오리\nShoveler|넓적부리\nCoot|물닭\nMoorhen|쇠물닭\nRail|뜸부기\nCurlew|마도요\nLapwing|댕기물떼새\nPlover|물떼새\nSandgrouse|사막꿩\nPtarmigan|뇌조\nPeafowl|공작\nSwan|백조\nCrane|두루미\nBustard|느시\nOstrich|타조\nEmu|에뮤\nRhea|레아\nCassowary|화식조\nFrancolin|프랑콜린\nChukar|추카\nBobwhite|흰목메추라기\nCapercaillie|큰들꿩\nBlack Grouse|검은들꿩\nHazel Grouse|들꿩\nTurtledove|멧비둘기\nScaup|검은머리흰죽지\nEider|아이더오리\nShelduck|황오리\nGoldeneye|흰뺨오리\nMerganser|비오리\nGrebe|논병아리\nCormorant|가마우지\nIbis|따오기\nSpoonbill|저어새`,
    base: { protein: 23, fat: 10, carbohydrate: 0, iron: 10, vitaminA: 9, vitaminC: 0, vitaminD: 7, vitaminB12: 14, calcium: 5, iodine: 3, water: 13 },
    parts: ["breast", "leg", "liver", "heart", "egg"],
    acquisitionMethods: ["hunting", "trapping"],
  },
  meat: {
    ko: "육류",
    names: `Cattle|소\nPig|돼지\nSheep|양\nGoat|염소\nDeer|사슴\nElk|엘크\nMoose|말코손바닥사슴\nReindeer|순록\nBison|들소\nBuffalo|물소\nWild Boar|멧돼지\nRabbit|토끼\nHare|산토끼\nHorse|말\nCamel|낙타\nYak|야크\nLlama|라마\nAlpaca|알파카\nAntelope|영양\nGazelle|가젤\nIbex|아이벡스\nChamois|샤무아\nMouflon|무플론\nAurochs|오록스\nZebu|제부\nMusk Ox|사향소\nWater Deer|고라니\nRoe Deer|노루\nFallow Deer|다마사슴\nRed Deer|붉은사슴\nSika Deer|꽃사슴\nKudu|쿠두\nEland|일런드\nImpala|임팔라\nWildebeest|누\nOryx|오릭스\nSpringbok|스프링복\nKangaroo|캥거루\nWallaby|왈라비\nCapybara|카피바라\nBeaver|비버\nPorcupine|호저\nSquirrel|다람쥐\nMarmot|마멋\nBadger|오소리\nBear|곰\nSeal|물개\nWalrus|바다코끼리\nTapir|맥\nPeccary|페커리`,
    base: { protein: 25, fat: 14, carbohydrate: 0, iron: 17, vitaminA: 5, vitaminC: 0, vitaminD: 4, vitaminB12: 20, calcium: 4, iodine: 2, water: 11 },
    parts: ["muscle", "liver", "heart", "kidney", "stomach", "brain", "marrow", "fat"],
    acquisitionMethods: ["hunting", "trapping"],
  },
  vegetable: {
    ko: "채소",
    names: `Spinach|시금치\nKale|케일\nCabbage|양배추\nLettuce|상추\nCarrot|당근\nTurnip|순무\nRadish|무\nBeet|비트\nOnion|양파\nGarlic|마늘\nLeek|리크\nCelery|셀러리\nBroccoli|브로콜리\nCauliflower|콜리플라워\nCucumber|오이\nPumpkin|호박\nSquash|스쿼시\nZucchini|주키니\nEggplant|가지\nOkra|오크라\nAsparagus|아스파라거스\nArtichoke|아티초크\nPea|완두\nLentil|렌틸\nChickpea|병아리콩\nBroad Bean|잠두\nGreen Bean|풋콩\nYam|얌\nSweet Potato|고구마\nPotato|감자\nTaro|토란\nCassava|카사바\nParsnip|파스닙\nRutabaga|루타바가\nFennel|회향\nChard|근대\nMustard Greens|갓\nWatercress|물냉이\nArugula|루콜라\nDandelion Greens|민들레잎\nNettle|쐐기풀\nBurdock Root|우엉\nLotus Root|연근\nBamboo Shoot|죽순\nSeaweed|해조류\nMushroom|버섯\nBell Pepper|피망\nChili Pepper|고추\nTomato|토마토\nCorn|옥수수`,
    base: { protein: 5, fat: 1, carbohydrate: 12, iron: 8, vitaminA: 18, vitaminC: 22, vitaminD: 2, vitaminB12: 0, calcium: 11, iodine: 4, water: 23 },
    parts: ["leaf", "root", "stem", "seed", "fruitingBody"],
    acquisitionMethods: ["gathering"],
  },
  fruit: {
    ko: "과일",
    names: `Apple|사과\nPear|배\nPeach|복숭아\nPlum|자두\nCherry|체리\nApricot|살구\nGrape|포도\nFig|무화과\nDate|대추야자\nPomegranate|석류\nOrange|오렌지\nLemon|레몬\nLime|라임\nCitron|유자\nGrapefruit|자몽\nMandarin|귤\nPomelo|포멜로\nBanana|바나나\nPlantain|플랜틴\nMango|망고\nPapaya|파파야\nPineapple|파인애플\nGuava|구아바\nKiwi|키위\nPersimmon|감\nQuince|모과\nMulberry|오디\nBlackberry|블랙베리\nRaspberry|라즈베리\nStrawberry|딸기\nBlueberry|블루베리\nCranberry|크랜베리\nGooseberry|구스베리\nElderberry|엘더베리\nBilberry|빌베리\nCloudberry|클라우드베리\nLingonberry|링곤베리\nMelon|멜론\nWatermelon|수박\nCantaloupe|칸탈루프\nCoconut|코코넛\nOlive|올리브\nAvocado|아보카도\nJujube|대추\nLoquat|비파\nLychee|리치\nLongan|용안\nPassion Fruit|패션프루트\nBreadfruit|빵나무열매\nPrickly Pear|백년초열매`,
    base: { protein: 2, fat: 2, carbohydrate: 20, iron: 3, vitaminA: 9, vitaminC: 24, vitaminD: 0, vitaminB12: 0, calcium: 4, iodine: 1, water: 25 },
    parts: ["flesh", "juice", "seed", "skin"],
    acquisitionMethods: ["gathering"],
  },
};

const nutrientRegions = {
  protein: ["muscles", "skin"], fat: ["brain", "nervousSystem"], carbohydrate: ["brain", "muscles"], iron: ["blood", "heart"],
  vitaminA: ["eyes", "skin"], vitaminC: ["gumsSkin", "immuneSystem"], vitaminD: ["bonesMuscles"], vitaminB12: ["blood", "nervousSystem"],
  calcium: ["bonesMuscles", "heart"], iodine: ["thyroid"], water: ["kidneysBrain"],
};

const slug = (value) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const hash = (value) => [...value].reduce((total, character) => (total * 31 + character.charCodeAt(0)) >>> 0, 2166136261);
const vary = (value, seed, index) => Math.max(0, Math.round(value * (0.72 + ((seed >> (index % 16)) % 57) / 100)));

const foods = Object.entries(categories).flatMap(([category, definition]) => definition.names.split("\n").map((line, index) => {
  const [en, ko] = line.split("|");
  const seed = hash(`${category}:${en}`);
  const nutrients = Object.fromEntries(Object.entries(definition.base).map(([nutrient, value], nutrientIndex) => [nutrient, vary(value, seed, nutrientIndex)]));
  const strongest = Object.entries(nutrients).filter(([, value]) => value >= 8).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([nutrient]) => nutrient);
  return {
    id: `${category}.${slug(en)}`,
    category,
    categoryName: { en: category === "meat" ? "Meat" : `${category[0].toUpperCase()}${category.slice(1)}`, ko: definition.ko },
    name: { en, ko },
    edibleParts: definition.parts,
    acquisitionMethods: definition.acquisitionMethods,
    nutrients,
    bodyBenefits: [...new Set(strongest.flatMap((nutrient) => nutrientRegions[nutrient]))],
    gameplayNotice: "Normalized gameplay values; not clinical nutrition guidance.",
    catalogIndex: index + 1,
  };
}));

const counts = Object.fromEntries(Object.keys(categories).map((category) => [category, foods.filter((food) => food.category === category).length]));
if (Object.values(counts).some((count) => count < 50)) throw new Error(`Every category needs at least 50 entries: ${JSON.stringify(counts)}`);

await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify({ schemaVersion: 1, nutrientScale: "normalized-gameplay-0-100", counts, foods }, null, 2)}\n`);
console.log(`Generated ${foods.length} food definitions at ${output}`);
