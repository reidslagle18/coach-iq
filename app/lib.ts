// ---- Types ----
export type Target = {
  id: string;
  x: number; // 0..1 relative to stage width
  y: number; // 0..1 relative to stage height
  label: string; // "1", "2", ...
};

export type Clip = {
  id: string;
  title: string;
  videoId: string;
  startTime: number; // seconds — where the rep begins
  pauseTime: number; // seconds — the decision moment
  resumeEnd: number; // seconds — stop after the play resolves
  prompt: string; // "Where does the ball go next?"
  targets: Target[];
  correctTargetId: string;
  why: string; // coach's teaching note
  createdAt: number;
};

export type ScoreEntry = {
  name: string;
  points: number;
  clipsDone: number;
  weekKey: string;
  updatedAt: number;
};

// ---- Storage ----
const CLIPS_KEY = "coachiq.clips.v1";
const SCORES_KEY = "coachiq.scores.v1";
const PROFILE_KEY = "coachiq.profile.v1";

export function loadClips(): Clip[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(CLIPS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as Clip[];
  } catch {
    return [];
  }
}

export function saveClips(clips: Clip[]) {
  localStorage.setItem(CLIPS_KEY, JSON.stringify(clips));
}

export function loadScores(): ScoreEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(SCORES_KEY);
    if (!raw) return seedRoster();
    return JSON.parse(raw) as ScoreEntry[];
  } catch {
    return seedRoster();
  }
}

export function saveScores(scores: ScoreEntry[]) {
  localStorage.setItem(SCORES_KEY, JSON.stringify(scores));
}

export function loadProfile(): string {
  if (typeof window === "undefined") return "You";
  return localStorage.getItem(PROFILE_KEY) || "You";
}
export function saveProfile(name: string) {
  localStorage.setItem(PROFILE_KEY, name);
}

// ISO week key so the leaderboard resets weekly ("nobody starts buried")
export function weekKey(d = new Date()): string {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const week =
    1 +
    Math.round(
      ((date.getTime() - firstThursday.getTime()) / 86400000 -
        3 +
        ((firstThursday.getUTCDay() + 6) % 7)) /
        7
    );
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

// Fictional teammates so a solo athlete has someone to chase.
function seedRoster(): ScoreEntry[] {
  const wk = weekKey();
  const now = Date.now();
  return [
    { name: "Jaylen M.", points: 720, clipsDone: 8, weekKey: wk, updatedAt: now },
    { name: "Chris O.", points: 665, clipsDone: 8, weekKey: wk, updatedAt: now },
    { name: "Devin R.", points: 540, clipsDone: 6, weekKey: wk, updatedAt: now },
    { name: "Marcus T.", points: 300, clipsDone: 3, weekKey: wk, updatedAt: now },
  ];
}

// ---- YouTube helpers ----
export function parseVideoId(input: string): string | null {
  const s = input.trim();
  if (!s) return null;
  // Bare 11-char id
  if (/^[a-zA-Z0-9_-]{11}$/.test(s)) return s;
  try {
    const url = new URL(s.startsWith("http") ? s : `https://${s}`);
    if (url.hostname.includes("youtu.be")) {
      const id = url.pathname.split("/").filter(Boolean)[0];
      return id && id.length === 11 ? id : null;
    }
    if (url.searchParams.get("v")) return url.searchParams.get("v");
    const parts = url.pathname.split("/").filter(Boolean);
    const embedIdx = parts.findIndex((p) => p === "embed" || p === "shorts");
    if (embedIdx >= 0 && parts[embedIdx + 1]) return parts[embedIdx + 1];
  } catch {
    return null;
  }
  return null;
}

export function thumbUrl(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
}

export function fmtTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

// ---- YouTube IFrame API loader (singleton) ----
let ytReady: Promise<void> | null = null;
export function loadYouTubeAPI(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (ytReady) return ytReady;
  ytReady = new Promise<void>((resolve) => {
    const w = window as any;
    if (w.YT && w.YT.Player) {
      resolve();
      return;
    }
    const prev = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => {
      if (typeof prev === "function") prev();
      resolve();
    };
    if (!document.getElementById("yt-iframe-api")) {
      const tag = document.createElement("script");
      tag.id = "yt-iframe-api";
      tag.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(tag);
    }
  });
  return ytReady;
}

export function uid(): string {
  return Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);
}

// Scoring: full points for the correct read, scaled down the slower you lock in.
export function scoreRead(correct: boolean, secondsToAnswer: number): number {
  if (!correct) return 0;
  const base = 100;
  const speedBonus = Math.max(0, Math.round((10 - Math.min(secondsToAnswer, 10)) * 4));
  return base + speedBonus; // 100..140
}
