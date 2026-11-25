export type AchievementCategory =
  "getting_started" | "consistency" | "discipline" | "growth" | "resilience" | "milestones";

export type AchievementTier = "common" | "rare" | "epic" | "legendary";

export type AchievementKey =
  // Getting Started
  | "first_step"
  | "getting_started"
  | "early_bird"
  | "first_five"
  | "routine_builder"
  | "first_ten"
  // Consistency
  | "on_fire"
  | "perfect_week"
  | "unstoppable"
  | "champion"
  | "iron_will"
  | "legendary_streak"
  // Discipline
  | "consistency_pro"
  | "discipline_master"
  | "perfectionist"
  | "dedicated"
  | "unbreakable"
  // Growth
  | "bookworm"
  | "knowledge_seeker"
  | "fast_learner"
  | "fitness_freak"
  // Resilience
  | "comeback"
  | "second_chance"
  | "never_give_up"
  | "stronger_again"
  | "survivor"
  // Milestones
  | "rising_star"
  | "elite"
  | "high_achiever"
  | "level_10"
  | "level_20"
  | "ultimate_achiever"
  // Backward compatibility alias
  | "legend";

export type AchievementDefinition = {
  key: AchievementKey;
  name: string;
  description: string;
  rewardXp: number;
  tier: AchievementTier;
  category: AchievementCategory;
  target: number;
  unit?: string;
  sortOrder: number;
};

export const ACHIEVEMENT_CATEGORIES: {
  id: AchievementCategory;
  name: string;
  description: string;
}[] = [
  {
    id: "getting_started",
    name: "Getting Started",
    description: "Boshlang'ich qadamlar va odat shakllantirish",
  },
  { id: "consistency", name: "Consistency", description: "Ketma-ketlik va kuchli streaklar" },
  { id: "discipline", name: "Discipline", description: "Uzoq muddatli intizom va faollik" },
  { id: "growth", name: "Growth", description: "Kitobxonlik, ta'lim va sport odatlari" },
  { id: "resilience", name: "Resilience", description: "Qaytish, iroda va taslim bo'lmaslik" },
  { id: "milestones", name: "Milestones", description: "XP va daraja cho'qqilari" },
];

export const ACHIEVEMENTS: AchievementDefinition[] = [
  // Getting Started
  {
    key: "first_step",
    name: "First Step",
    description: "Birinchi odatni bir marta muvaffaqiyatli bajarish.",
    rewardXp: 10,
    tier: "common",
    category: "getting_started",
    target: 1,
    sortOrder: 1,
  },
  {
    key: "getting_started",
    name: "Getting Started",
    description: "Jami 3 ta habit completion bajarish.",
    rewardXp: 40,
    tier: "common",
    category: "getting_started",
    target: 3,
    sortOrder: 2,
  },
  {
    key: "early_bird",
    name: "Early Bird",
    description: "Ertalab rejalashtirilgan odatni 5 marta bajarish.",
    rewardXp: 70,
    tier: "common",
    category: "getting_started",
    target: 5,
    sortOrder: 3,
  },
  {
    key: "first_five",
    name: "First Five",
    description: "Kamida 5 ta turli odat yaratish.",
    rewardXp: 100,
    tier: "common",
    category: "getting_started",
    target: 5,
    sortOrder: 4,
  },
  {
    key: "routine_builder",
    name: "Routine Builder",
    description: "3 kun ketma-ket kamida bitta rejalashtirilgan odatni bajarish.",
    rewardXp: 50,
    tier: "rare",
    category: "getting_started",
    target: 3,
    sortOrder: 5,
  },
  {
    key: "first_ten",
    name: "First Ten",
    description: "Barcha odatlar bo'yicha jami 10 ta habit completion.",
    rewardXp: 100,
    tier: "common",
    category: "getting_started",
    target: 10,
    sortOrder: 6,
  },

  // Consistency
  {
    key: "on_fire",
    name: "On Fire",
    description: "Bitta odatda 7 kunlik streak hosil qilish.",
    rewardXp: 50,
    tier: "rare",
    category: "consistency",
    target: 7,
    sortOrder: 7,
  },
  {
    key: "perfect_week",
    name: "Perfect Week",
    description: "7 kun davomida har kuni rejalashtirilgan barcha odatlarni bajarish.",
    rewardXp: 100,
    tier: "epic",
    category: "consistency",
    target: 7,
    sortOrder: 8,
  },
  {
    key: "unstoppable",
    name: "Unstoppable",
    description: "Bitta odatda 14 kunlik streak hosil qilish.",
    rewardXp: 150,
    tier: "epic",
    category: "consistency",
    target: 14,
    sortOrder: 9,
  },
  {
    key: "champion",
    name: "Champion",
    description: "Bitta odatda 30 kunlik streak hosil qilish.",
    rewardXp: 250,
    tier: "epic",
    category: "consistency",
    target: 30,
    sortOrder: 10,
  },
  {
    key: "iron_will",
    name: "Iron Will",
    description: "Bitta odatda 60 kunlik streak hosil qilish.",
    rewardXp: 600,
    tier: "legendary",
    category: "consistency",
    target: 60,
    sortOrder: 11,
  },
  {
    key: "legendary_streak",
    name: "Legendary",
    description: "Bitta odatda 100 kunlik streak hosil qilish.",
    rewardXp: 1000,
    tier: "legendary",
    category: "consistency",
    target: 100,
    sortOrder: 12,
  },

  // Discipline
  {
    key: "consistency_pro",
    name: "Consistency Pro",
    description: "Jami har bir odatdan 100 ta completion to'plash.",
    rewardXp: 100,
    tier: "rare",
    category: "discipline",
    target: 100,
    sortOrder: 13,
  },
  {
    key: "discipline_master",
    name: "Discipline Master",
    description: "Jami 500 ta habit completion to'plash.",
    rewardXp: 600,
    tier: "epic",
    category: "discipline",
    target: 500,
    sortOrder: 14,
  },
  {
    key: "perfectionist",
    name: "Perfectionist",
    description: "30 kunlik davrda rejalashtirilgan odatlarning kamida 90 foizini bajarish.",
    rewardXp: 500,
    tier: "epic",
    category: "discipline",
    target: 90,
    unit: "%",
    sortOrder: 15,
  },
  {
    key: "dedicated",
    name: "Dedicated",
    description: "Jami 1 000 ta habit completion to'plash.",
    rewardXp: 1000,
    tier: "legendary",
    category: "discipline",
    target: 1000,
    sortOrder: 16,
  },
  {
    key: "unbreakable",
    name: "Unbreakable",
    description: "Ilovada 365 xil kunda kamida bittadan odat bajarish.",
    rewardXp: 2000,
    tier: "legendary",
    category: "discipline",
    target: 365,
    sortOrder: 17,
  },

  // Growth
  {
    key: "bookworm",
    name: "Bookworm",
    description: "Reading turidagi odatni 10 marta bajarish.",
    rewardXp: 100,
    tier: "common",
    category: "growth",
    target: 10,
    sortOrder: 18,
  },
  {
    key: "knowledge_seeker",
    name: "Knowledge Seeker",
    description: "Learning turidagi odatni 25 marta bajarish.",
    rewardXp: 150,
    tier: "rare",
    category: "growth",
    target: 25,
    sortOrder: 19,
  },
  {
    key: "fast_learner",
    name: "Fast Learner",
    description: "Learning odatini 7 kunlik streak bilan bajarish.",
    rewardXp: 150,
    tier: "rare",
    category: "growth",
    target: 7,
    sortOrder: 20,
  },
  {
    key: "fitness_freak",
    name: "Fitness Freak",
    description: "Workout/Fitness turidagi odatni 30 marta bajarish.",
    rewardXp: 200,
    tier: "epic",
    category: "growth",
    target: 30,
    sortOrder: 21,
  },

  // Resilience
  {
    key: "comeback",
    name: "Comeback",
    description: "Kamida 7 kunlik nofaollikdan so'ng odatni qayta bajarish.",
    rewardXp: 100,
    tier: "common",
    category: "resilience",
    target: 1,
    sortOrder: 22,
  },
  {
    key: "second_chance",
    name: "Second Chance",
    description: "Qaytishdan keyin 7 kunlik streak hosil qilish.",
    rewardXp: 200,
    tier: "rare",
    category: "resilience",
    target: 7,
    sortOrder: 23,
  },
  {
    key: "never_give_up",
    name: "Never Give Up",
    description: "Uch marta alohida comeback siklini muvaffaqiyatli yakunlash.",
    rewardXp: 350,
    tier: "epic",
    category: "resilience",
    target: 3,
    sortOrder: 24,
  },
  {
    key: "stronger_again",
    name: "Stronger Again",
    description: "Comebackdan keyin 30 kunlik streak hosil qilish.",
    rewardXp: 500,
    tier: "epic",
    category: "resilience",
    target: 30,
    sortOrder: 25,
  },
  {
    key: "survivor",
    name: "Survivor",
    description: "Comebackdan keyin 90 kun kunda faol bo'lish.",
    rewardXp: 800,
    tier: "legendary",
    category: "resilience",
    target: 90,
    sortOrder: 26,
  },

  // Milestones
  {
    key: "rising_star",
    name: "Rising Star",
    description: "Jami 500 XP to'plash.",
    rewardXp: 100,
    tier: "common",
    category: "milestones",
    target: 500,
    unit: "XP",
    sortOrder: 27,
  },
  {
    key: "elite",
    name: "Elite",
    description: "Jami 2 000 XP to'plash.",
    rewardXp: 250,
    tier: "rare",
    category: "milestones",
    target: 2000,
    unit: "XP",
    sortOrder: 28,
  },
  {
    key: "high_achiever",
    name: "High Achiever",
    description: "Jami 5 000 XP to'plash.",
    rewardXp: 500,
    tier: "epic",
    category: "milestones",
    target: 5000,
    unit: "XP",
    sortOrder: 29,
  },
  {
    key: "level_10",
    name: "Level 10",
    description: "10-darajaga chiqish.",
    rewardXp: 200,
    tier: "rare",
    category: "milestones",
    target: 10,
    unit: "lvl",
    sortOrder: 30,
  },
  {
    key: "level_20",
    name: "Level 20",
    description: "20-darajaga chiqish.",
    rewardXp: 400,
    tier: "epic",
    category: "milestones",
    target: 20,
    unit: "lvl",
    sortOrder: 31,
  },
  {
    key: "ultimate_achiever",
    name: "Ultimate Achiever",
    description: "50-darajaga chiqish.",
    rewardXp: 900,
    tier: "legendary",
    category: "milestones",
    target: 50,
    unit: "lvl",
    sortOrder: 32,
  },
  // Backward compatibility alias for 'legend'
  {
    key: "legend",
    name: "Legend",
    description: "Reach level 20.",
    rewardXp: 500,
    tier: "epic",
    category: "milestones",
    target: 20,
    unit: "lvl",
    sortOrder: 33,
  },
];

export const LEVEL_TITLES = [
  "Beginner",
  "Starter",
  "Explorer",
  "Disciplined",
  "Consistent",
  "Pro",
  "Master",
  "Legend",
] as const;

export const LEVEL_XP_THRESHOLDS = [0, 150, 400, 800, 1400, 2300, 3600, 5500] as const;

export type LevelProgress = {
  name: (typeof LEVEL_TITLES)[number];
  level: number;
  minXp: number;
  nextLevelXp: number | null;
  progressPercent: number;
};

export function getLevelProgress(totalXp: number): LevelProgress {
  const xp = Math.max(0, Math.floor(totalXp));
  const thresholds: readonly number[] = LEVEL_XP_THRESHOLDS;
  const levelIndex = thresholds.reduce<number>(
    (current, threshold, index) => (xp >= threshold ? index : current),
    0,
  );
  const level = levelIndex + 1;
  const minXp = thresholds[levelIndex] ?? 0;
  const nextLevelXp = thresholds[levelIndex + 1] ?? null;
  const name = LEVEL_TITLES.find((_, index) => index === levelIndex) ?? "Legend";

  return {
    name,
    level,
    minXp,
    nextLevelXp,
    progressPercent:
      nextLevelXp === null ? 100 : Math.floor(((xp - minXp) / (nextLevelXp - minXp)) * 100),
  };
}

export const LEVEL_REWARDS = [
  { level: 2, name: "First Steps Frame", description: "A frame for your growing routine." },
  { level: 3, name: "Explorer Frame", description: "A frame earned through discovery." },
  { level: 4, name: "Discipline Frame", description: "A frame that marks steady effort." },
  { level: 5, name: "Consistency Frame", description: "A frame for showing up again and again." },
  { level: 6, name: "Pro Frame", description: "A frame for reaching pro-level focus." },
  { level: 7, name: "Master Frame", description: "A frame that honors your mastery." },
  { level: 8, name: "Legend Frame", description: "The highest-level avatar frame." },
] as const;

export type HabitDifficulty = "easy" | "medium" | "hard";

export const HABIT_COMPLETION_XP: Record<HabitDifficulty, number> = {
  easy: 5,
  medium: 10,
  hard: 15,
};

export const STREAK_XP_MILESTONES: Record<number, number> = {
  3: 30,
  7: 100,
  30: 300,
};

export type XpReward = {
  amount: number;
  reason: string;
  idempotencyKey: string;
};

export function habitCompletionXp(difficulty?: string | null): number {
  return difficulty === "easy" || difficulty === "hard"
    ? HABIT_COMPLETION_XP[difficulty]
    : HABIT_COMPLETION_XP.medium;
}

/** Returns difficulty-based completion XP and any once-per-milestone streak bonus. */
export function xpRewardsForCompletion(
  habitId: string,
  day: string,
  streak: number,
  difficulty?: string | null,
): XpReward[] {
  const completionXp = habitCompletionXp(difficulty);
  const rewards: XpReward[] = [
    {
      amount: completionXp,
      reason: "Habit completion",
      idempotencyKey: `completion:${habitId}:${day}`,
    },
  ];

  const milestoneXp = STREAK_XP_MILESTONES[streak];

  if (milestoneXp) {
    rewards.push({
      amount: milestoneXp,
      reason: `${streak}-day habit streak`,
      idempotencyKey: `streak:${habitId}:${streak}`,
    });
  }

  return rewards;
}

export function currentStreak(days: Iterable<string>, today: string): number {
  const completed = new Set(days);
  const cursor = new Date(`${today}T12:00:00`);
  if (!completed.has(today)) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (completed.has(localDayKey(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export function streakStats(
  days: Iterable<string>,
  today: string,
): { current: number; longest: number } {
  const completed = [...new Set(days)].sort();
  let longest = 0;
  let run = 0;
  let previous: number | null = null;
  for (const day of completed) {
    const [year = 0, month = 1, date = 1] = day.split("-").map(Number);
    const timestamp = Date.UTC(year, month - 1, date);
    const consecutive = previous !== null && timestamp - previous === 86400000;
    run = consecutive ? run + 1 : 1;
    longest = Math.max(longest, run);
    previous = timestamp;
  }
  return { current: currentStreak(completed, today), longest };
}

export type HabitSchedule = {
  frequency?: string | null;
  schedule_days?: number[] | null;
  start_date?: string | null;
  end_date?: string | null;
  created_at?: string | null;
  skipped_dates?: string[] | null;
};

export function isHabitScheduledOnDay(habit: HabitSchedule, day: string): boolean {
  const startDate = habit.start_date ?? habit.created_at?.slice(0, 10);
  if (startDate && day < startDate) return false;
  if (habit.end_date && day > habit.end_date) return false;
  if (habit.frequency === "daily" || !habit.frequency) return true;
  const dayOfWeek = new Date(`${day}T12:00:00`).getDay();
  if (habit.frequency === "weekdays") return dayOfWeek >= 1 && dayOfWeek <= 5;
  const scheduleDays = habit.schedule_days ?? [];
  return scheduleDays.length === 0 || scheduleDays.includes(dayOfWeek);
}

export function scheduledStreakStats(
  days: Iterable<string>,
  today: string,
  habit: HabitSchedule,
): { current: number; longest: number } {
  const completed = new Set(days);
  const cursor = new Date(`${today}T12:00:00`);
  if (isHabitScheduledOnDay(habit, today) && !completed.has(today)) {
    cursor.setDate(cursor.getDate() - 1);
  }
  let current = 0;
  for (let offset = 0; offset < 366; offset++) {
    const key = localDayKey(cursor);
    if (isHabitScheduledOnDay(habit, key)) {
      if (habit.skipped_dates?.includes(key)) {
        cursor.setDate(cursor.getDate() - 1);
        continue;
      }
      if (!completed.has(key)) break;
      current++;
    }
    cursor.setDate(cursor.getDate() - 1);
  }

  const dates = [...completed].sort();
  if (!dates.length) return { current, longest: 0 };
  const first = new Date(`${dates[0]}T12:00:00`);
  const last = new Date(`${dates[dates.length - 1]}T12:00:00`);
  let longest = 0;
  let run = 0;
  for (const date = new Date(first); date <= last; date.setDate(date.getDate() + 1)) {
    const key = localDayKey(date);
    if (!isHabitScheduledOnDay(habit, key)) continue;
    if (habit.skipped_dates?.includes(key)) continue;
    if (completed.has(key)) {
      run++;
      longest = Math.max(longest, run);
    } else {
      run = 0;
    }
  }
  return { current, longest };
}

function localDayKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export type AchievementUserStats = {
  habitsCount: number;
  totalCompletions: number;
  morningCompletions: number;
  readingCompletions: number;
  learningCompletions: number;
  workoutCompletions: number;
  longestStreak: number;
  longestLearningStreak: number;
  perfectDaysCount: number;
  activeUniqueDays: number;
  totalXp: number;
  level: number;
  comebackCount: number;
  postComebackLongestStreak: number;
  postComebackActiveDays: number;
  thirtyDayCompletionRate: number; // 0 to 100
};

export type AchievementProgress = {
  current: number;
  target: number;
  percentage: number;
  isUnlocked: boolean;
  label: string;
};

export function getAchievementProgress(
  achievement: AchievementDefinition,
  stats: Partial<AchievementUserStats>,
  isUnlocked = false,
): AchievementProgress {
  if (isUnlocked) {
    return {
      current: achievement.target,
      target: achievement.target,
      percentage: 100,
      isUnlocked: true,
      label: achievement.unit
        ? `${achievement.target} ${achievement.unit}`
        : `${achievement.target} / ${achievement.target}`,
    };
  }

  let current = 0;
  switch (achievement.key) {
    case "first_step":
      current = Math.min(stats.totalCompletions ?? 0, 1);
      break;
    case "getting_started":
      current = stats.totalCompletions ?? 0;
      break;
    case "early_bird":
      current = stats.morningCompletions ?? 0;
      break;
    case "first_five":
      current = stats.habitsCount ?? 0;
      break;
    case "routine_builder":
      current = stats.longestStreak ?? 0;
      break;
    case "first_ten":
      current = stats.totalCompletions ?? 0;
      break;
    case "on_fire":
    case "unstoppable":
    case "champion":
    case "iron_will":
    case "legendary_streak":
      current = stats.longestStreak ?? 0;
      break;
    case "perfect_week":
      current = stats.perfectDaysCount ?? 0;
      break;
    case "consistency_pro":
    case "discipline_master":
    case "dedicated":
      current = stats.totalCompletions ?? 0;
      break;
    case "perfectionist":
      current = Math.round(stats.thirtyDayCompletionRate ?? 0);
      break;
    case "unbreakable":
      current = stats.activeUniqueDays ?? 0;
      break;
    case "bookworm":
      current = stats.readingCompletions ?? 0;
      break;
    case "knowledge_seeker":
      current = stats.learningCompletions ?? 0;
      break;
    case "fast_learner":
      current = stats.longestLearningStreak ?? 0;
      break;
    case "fitness_freak":
      current = stats.workoutCompletions ?? 0;
      break;
    case "comeback":
      current = stats.comebackCount ?? 0;
      break;
    case "second_chance":
    case "stronger_again":
      current = stats.postComebackLongestStreak ?? 0;
      break;
    case "never_give_up":
      current = stats.comebackCount ?? 0;
      break;
    case "survivor":
      current = stats.postComebackActiveDays ?? 0;
      break;
    case "rising_star":
    case "elite":
    case "high_achiever":
      current = stats.totalXp ?? 0;
      break;
    case "level_10":
    case "level_20":
    case "ultimate_achiever":
    case "legend":
      current = stats.level ?? 1;
      break;
    default:
      current = 0;
  }

  const cappedCurrent = Math.min(Math.max(0, current), achievement.target);
  const percentage = Math.min(100, Math.round((cappedCurrent / achievement.target) * 100));

  const label = achievement.unit
    ? `${cappedCurrent} / ${achievement.target} ${achievement.unit}`
    : `${cappedCurrent} / ${achievement.target}`;

  return {
    current: cappedCurrent,
    target: achievement.target,
    percentage,
    isUnlocked: cappedCurrent >= achievement.target,
    label,
  };
}

/**
 * Checks for a comeback condition (inactivity of >= thresholdDays days followed by return).
 */
export function detectComeback(
  completedDays: Iterable<string>,
  today: string,
  thresholdDays = 7,
): {
  isComeback: boolean;
  daysInactive: number;
  lastActiveDay: string | null;
  comebackCycles: number;
} {
  const sorted = [...new Set(completedDays)].sort();
  if (sorted.length === 0) {
    return { isComeback: false, daysInactive: 0, lastActiveDay: null, comebackCycles: 0 };
  }

  let comebackCycles = 0;
  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(`${sorted[i - 1]}T12:00:00`).getTime();
    const curr = new Date(`${sorted[i]}T12:00:00`).getTime();
    const diffDays = Math.round((curr - prev) / 86400000);
    if (diffDays >= thresholdDays) {
      comebackCycles++;
    }
  }

  const lastActiveDay = sorted[sorted.length - 1] ?? null;
  const lastActiveTime = new Date(`${lastActiveDay}T12:00:00`).getTime();
  const todayTime = new Date(`${today}T12:00:00`).getTime();
  const daysInactive = Math.max(0, Math.round((todayTime - lastActiveTime) / 86400000));

  // It's a current comeback if today's inactivity gap is >= thresholdDays
  // or if the most recent completion today ended a gap of >= thresholdDays
  const isComeback = daysInactive >= thresholdDays;

  return {
    isComeback,
    daysInactive,
    lastActiveDay,
    comebackCycles,
  };
}
