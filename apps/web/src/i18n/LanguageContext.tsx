import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type Language = "en" | "ko";

const translations = {
  en: {
    frontier: "THE VERDANT FRONTIER", wanderer: "WANDERER", location: "Mossward · Dawn", health: "Health", mana: "Mana", stamina: "Stamina",
    activeSkills: "ACTIVE SKILLS", swordsmanship: "Swordsmanship", unarmed: "Unarmed", observation: "Observation", butchering: "Butchery", lumberjacking: "Lumberjacking", worldAria: "Eldoria game world",
    mossward: "Mossward Crossing", safeSettlement: "Safe settlement", roadHint: "The eastern road leads into Greythorn Wood", journal: "FIELD JOURNAL",
    untamedWilds: "The Untamed Wilds", greythorn: "Greythorn Wood", amberfen: "Amberfen Wilds", hollowVault: "The Hollow Vault", wildZone: "Frontier zone",
    quietBeginning: "A quiet beginning", meetRoadwarden: "Meet the roadwarden beneath the old lantern tree.", exploreMossward: "Explore Mossward Crossing",
    findRoad: "Find the forest road", worldNotes: "WORLD NOTES", wolvesNote: "Wolves have been seen beyond the east gate after dusk.", system: "System",
    quickActions: "Quick actions", blade: "Blade", bandage: "Bandage", torch: "Torch", fists: "Fists", gather: "Gather", fire: "Fire", map: "Map", signOut: "Sign out", foundation: "FOUNDATION BUILD",
    bodyCondition: "BODY CONDITION", wholeBodyHealthy: "Whole body stable", nutritionBalanced: "No nutrient deficiency is affecting an organ.",
    authIntro: "A living world remembers every path you choose.", email: "Email", password: "Password", openingGate: "Opening the gate…", enterRealm: "Enter the realm",
    createAccount: "Create account", or: "or", google: "Continue with Google", newAccount: "New to Eldoria? Create an account", existingAccount: "Already have an account? Sign in",
    originalWorld: "ORIGINAL WORLD · PRE-ALPHA", authInvalid: "The email or password is incorrect.", authExists: "That email is already in use.", authWeak: "Password must be at least 6 characters.",
    authCancelled: "Google sign-in was cancelled.", authDisabled: "Enable this sign-in method in Firebase Console.", authGeneric: "Sign-in failed. Please try again shortly.",
    worldMap: "WORLD MAP", explored: "Explored", undiscovered: "Undiscovered region", close: "Close map", clickMove: "Click a path to move", wheelZoom: "Mouse wheel to zoom",
    characterArchive: "CHARACTER ARCHIVE", chooseCharacter: "Choose your wanderer", characterPersistence: "Characters and their last safe position persist between journeys.", loadingCharacters: "Reading the archive…", noCharacters: "No character has begun their journey yet.", lastLocation: "Last location", enterWorld: "Enter world", newCharacterName: "New character name", characterNamePlaceholder: "2–20 characters", createCharacter: "Create character",
  },
  ko: {
    frontier: "초록 변경의 세계", wanderer: "방랑자", location: "모스워드 · 새벽", health: "생명력", mana: "마나", stamina: "기력",
    activeSkills: "활성 기술", swordsmanship: "검술", unarmed: "맨손 격투", observation: "관찰", butchering: "해체", lumberjacking: "벌목", worldAria: "엘도리아 게임 월드",
    mossward: "모스워드 교차로", safeSettlement: "안전 정착지", roadHint: "동쪽 길은 그레이쏜 숲으로 이어집니다", journal: "여행 일지",
    untamedWilds: "태초의 황야", greythorn: "그레이쏜 숲", amberfen: "앰버펜 황야", hollowVault: "공허의 금고", wildZone: "변경 지역",
    quietBeginning: "고요한 시작", meetRoadwarden: "오래된 등불나무 아래에서 길지기를 만나세요.", exploreMossward: "모스워드 교차로 탐험",
    findRoad: "숲길 찾기", worldNotes: "세계의 소문", wolvesNote: "해 질 무렵 동문 너머에서 늑대가 목격되었습니다.", system: "시스템",
    quickActions: "빠른 행동", blade: "검", bandage: "붕대", torch: "횃불", fists: "주먹", gather: "채집", fire: "불 피우기", map: "지도", signOut: "로그아웃", foundation: "기반 빌드",
    bodyCondition: "신체 상태", wholeBodyHealthy: "전신 상태 안정", nutritionBalanced: "영양 결핍으로 영향을 받는 장기가 없습니다.",
    authIntro: "살아 숨 쉬는 세계는 당신이 선택한 모든 길을 기억합니다.", email: "이메일", password: "비밀번호", openingGate: "세계의 문을 여는 중…", enterRealm: "세계 입장",
    createAccount: "계정 만들기", or: "또는", google: "Google로 계속", newAccount: "처음 오셨나요? 계정 만들기", existingAccount: "이미 계정이 있나요? 로그인",
    originalWorld: "오리지널 세계 · 프리 알파", authInvalid: "이메일 또는 비밀번호가 올바르지 않습니다.", authExists: "이미 사용 중인 이메일입니다.", authWeak: "비밀번호는 6자 이상이어야 합니다.",
    authCancelled: "Google 로그인이 취소되었습니다.", authDisabled: "Firebase Console에서 이 로그인 방식을 활성화해야 합니다.", authGeneric: "로그인 중 문제가 발생했습니다. 잠시 후 다시 시도해주세요.",
    worldMap: "전체 지도", explored: "탐험 완료", undiscovered: "미발견 지역", close: "지도 닫기", clickMove: "길을 클릭하면 이동합니다", wheelZoom: "마우스 휠로 확대·축소",
    characterArchive: "캐릭터 기록", chooseCharacter: "방랑자를 선택하세요", characterPersistence: "캐릭터와 마지막 안전 위치는 여정이 끝난 뒤에도 저장됩니다.", loadingCharacters: "기록을 불러오는 중…", noCharacters: "아직 여정을 시작한 캐릭터가 없습니다.", lastLocation: "마지막 위치", enterWorld: "세계 입장", newCharacterName: "새 캐릭터 이름", characterNamePlaceholder: "2~20자", createCharacter: "캐릭터 생성",
  },
} as const;

export type TranslationKey = keyof typeof translations.en;

type LanguageContextValue = { language: Language; setLanguage: (language: Language) => void; t: (key: TranslationKey) => string };
const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>(() => localStorage.getItem("eldoria.language") === "ko" ? "ko" : "en");
  useEffect(() => {
    localStorage.setItem("eldoria.language", language);
    document.documentElement.lang = language;
  }, [language]);
  const value = useMemo(() => ({ language, setLanguage, t: (key: TranslationKey) => translations[language][key] }), [language]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error("useLanguage must be used within LanguageProvider");
  return context;
}

export function LanguageToggle() {
  const { language, setLanguage } = useLanguage();
  return <div className="language-toggle" aria-label="Language"><button className={language === "en" ? "active" : ""} onClick={() => setLanguage("en")}>EN</button><span>/</span><button className={language === "ko" ? "active" : ""} onClick={() => setLanguage("ko")}>한국어</button></div>;
}
