"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Clip,
  ScoreEntry,
  Target,
  fmtTime,
  loadClips,
  loadProfile,
  loadScores,
  loadYouTubeAPI,
  parseVideoId,
  saveClips,
  saveProfile,
  saveScores,
  scoreRead,
  thumbUrl,
  uid,
  weekKey,
} from "./lib";

type Role = "athlete" | "coach";

/* ----------------------------------------------------------------
   YouTube player hook — creates the player when its host node mounts
   (via callback ref), and queues a cue until the player is ready.
------------------------------------------------------------------ */
function useYT() {
  const playerRef = useRef<any>(null);
  const pending = useRef<{ videoId: string; start: number } | null>(null);
  const [ready, setReady] = useState(false);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState<number | null>(null);

  const cueInternal = useCallback((videoId: string, start = 0) => {
    try {
      setError(null);
      playerRef.current?.cueVideoById({ videoId, startSeconds: start });
      setTimeout(() => {
        try {
          setDuration(playerRef.current?.getDuration?.() || 0);
        } catch {}
      }, 700);
    } catch {}
  }, []);

  // Callback ref: fires with the wrapper node on mount, null on unmount.
  const hostRef = useCallback(
    (wrapper: HTMLDivElement | null) => {
      if (!wrapper) {
        try {
          playerRef.current?.destroy?.();
        } catch {}
        playerRef.current = null;
        setReady(false);
        setDuration(0);
        return;
      }
      if (playerRef.current) return;
      // YT replaces the target node with an iframe — use a child so our
      // React-managed wrapper stays intact.
      const target = document.createElement("div");
      wrapper.appendChild(target);
      loadYouTubeAPI().then(() => {
        const YT = (window as any).YT;
        if (!YT?.Player) return;
        playerRef.current = new YT.Player(target, {
          width: "100%",
          height: "100%",
          playerVars: {
            controls: 0,
            rel: 0,
            modestbranding: 1,
            disablekb: 1,
            playsinline: 1,
            fs: 0,
            iv_load_policy: 3,
          },
          events: {
            onReady: () => {
              setReady(true);
              try {
                setDuration(playerRef.current.getDuration() || 0);
              } catch {}
              if (pending.current) {
                const p = pending.current;
                pending.current = null;
                cueInternal(p.videoId, p.start);
              }
            },
            onStateChange: (e: any) => {
              setIsPlaying(e.data === 1); // 1 = PLAYING
              if (e.data === 1) setError(null);
            },
            onError: (e: any) => {
              // 101 & 150 = embedding disabled by owner; 100 = removed/private; 2 = bad id
              setError(e?.data ?? -1);
            },
          },
        });
      });
    },
    [cueInternal]
  );

  const cue = useCallback(
    (videoId: string, start = 0) => {
      if (playerRef.current && ready) cueInternal(videoId, start);
      else pending.current = { videoId, start };
    },
    [ready, cueInternal]
  );

  const play = useCallback(() => {
    try {
      // Muted playback is always allowed by autoplay policy — programmatic
      // play with sound gets blocked and the clip never advances.
      playerRef.current?.mute?.();
      playerRef.current?.playVideo?.();
    } catch {}
  }, []);
  const pause = useCallback(() => {
    try {
      playerRef.current?.pauseVideo?.();
    } catch {}
  }, []);
  const seek = useCallback((s: number, allowSeekAhead = true) => {
    try {
      playerRef.current?.seekTo?.(s, allowSeekAhead);
    } catch {}
  }, []);
  const time = useCallback((): number => {
    try {
      return playerRef.current?.getCurrentTime?.() || 0;
    } catch {
      return 0;
    }
  }, []);
  const refreshDuration = useCallback(() => {
    try {
      const d = playerRef.current?.getDuration?.() || 0;
      if (d) setDuration(d);
      return d;
    } catch {
      return 0;
    }
  }, []);

  return {
    ready,
    duration,
    isPlaying,
    error,
    hostRef,
    cue,
    play,
    pause,
    seek,
    time,
    refreshDuration,
  };
}

// Human-readable reason for a YouTube player error code.
function ytErrorMessage(code: number | null): string | null {
  if (code == null) return null;
  if (code === 101 || code === 150)
    return "This video's owner disabled playing it on other sites. Pick a different clip — most highlight channels, breakdowns, and school/Hudl uploads work.";
  if (code === 100)
    return "That video is private or was removed. Try another link.";
  if (code === 2) return "That doesn't look like a valid YouTube link.";
  if (code === 5) return "This clip couldn't load in the player. Try another.";
  return "This clip couldn't play. Try a different YouTube link.";
}

/* ----------------------------------------------------------------
   Root
------------------------------------------------------------------ */
export default function Page() {
  const [role, setRole] = useState<Role>("athlete");
  const [clips, setClips] = useState<Clip[]>([]);
  const [scores, setScores] = useState<ScoreEntry[]>([]);
  const [name, setName] = useState("You");
  const [toast, setToast] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setClips(loadClips());
    setScores(loadScores());
    setName(loadProfile());
    setHydrated(true);
  }, []);

  const flash = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 1600);
  }, []);

  const persistClips = useCallback((next: Clip[]) => {
    setClips(next);
    saveClips(next);
  }, []);

  const persistScores = useCallback((next: ScoreEntry[]) => {
    setScores(next);
    saveScores(next);
  }, []);

  return (
    <div className="app">
      <div className="topbar">
        <div className="brand">
          <span className="mark">IQ</span>
          <span>
            Coach<span className="iq">IQ</span>
          </span>
        </div>
        <div className="role-toggle">
          <button
            className={role === "athlete" ? "active" : ""}
            onClick={() => setRole("athlete")}
          >
            Athlete
          </button>
          <button
            className={role === "coach" ? "active" : ""}
            onClick={() => setRole("coach")}
          >
            Coach
          </button>
        </div>
      </div>

      <div className="content">
        {!hydrated ? null : role === "athlete" ? (
          <AthleteMode
            clips={clips}
            scores={scores}
            name={name}
            setName={(n) => {
              setName(n);
              saveProfile(n);
            }}
            onScore={persistScores}
            flash={flash}
          />
        ) : (
          <CoachMode clips={clips} persistClips={persistClips} flash={flash} />
        )}
        <div className="footer-note">
          Hudl tells you who watched. Coach IQ tells you who learned.
        </div>
      </div>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

/* ----------------------------------------------------------------
   Athlete Mode
------------------------------------------------------------------ */
type Phase = "menu" | "playing" | "decision" | "resolving" | "reveal";

function AthleteMode({
  clips,
  scores,
  name,
  setName,
  onScore,
  flash,
}: {
  clips: Clip[];
  scores: ScoreEntry[];
  name: string;
  setName: (n: string) => void;
  onScore: (s: ScoreEntry[]) => void;
  flash: (m: string) => void;
}) {
  const yt = useYT();
  const [tab, setTab] = useState<"play" | "board">("play");
  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState<Phase>("menu");
  const [picked, setPicked] = useState<string | null>(null);
  const [gained, setGained] = useState(0);
  const [sessionPoints, setSessionPoints] = useState(0);
  const [sessionDone, setSessionDone] = useState(0);
  const [streak, setStreak] = useState(0);
  const decisionStart = useRef(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const watchTo = useRef<{ target: number; onArrive: () => void } | null>(null);
  const [paused, setPaused] = useState(false);

  const clip = clips[idx];

  const stopTick = () => {
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = null;
  };

  const runTick = () => {
    stopTick();
    tickRef.current = setInterval(() => {
      const w = watchTo.current;
      if (!w) return;
      if (yt.time() >= w.target) {
        watchTo.current = null;
        stopTick();
        w.onArrive();
      }
    }, 80);
  };

  // Play toward a timestamp, then fire onArrive. No seek-on-arrive → smooth.
  const beginWatch = (target: number, onArrive: () => void) => {
    watchTo.current = { target, onArrive };
    setPaused(false);
    yt.play();
    runTick();
  };

  const togglePlay = () => {
    if (paused) {
      setPaused(false);
      yt.play();
      runTick();
    } else {
      setPaused(true);
      yt.pause();
      stopTick();
    }
  };

  useEffect(() => () => stopTick(), []);

  // reset when clip changes
  useEffect(() => {
    setPhase("menu");
    setPicked(null);
    setGained(0);
    setPaused(false);
    watchTo.current = null;
    stopTick();
  }, [idx]);

  const arriveDecision = () => {
    yt.pause();
    decisionStart.current = Date.now();
    setPhase("decision");
  };

  const startClip = () => {
    if (!clip || !yt.ready) return;
    setPicked(null);
    setGained(0);
    yt.seek(clip.startTime, true);
    setPhase("playing");
    beginWatch(clip.pauseTime, arriveDecision);
  };

  // Re-watch the lead-up without losing your pick.
  const replayLeadup = () => {
    if (!clip) return;
    yt.seek(clip.startTime, true);
    setPhase("playing");
    beginWatch(clip.pauseTime, arriveDecision);
  };

  const lockIn = () => {
    if (!clip || !picked) return;
    const secs = (Date.now() - decisionStart.current) / 1000;
    const correct = picked === clip.correctTargetId;
    const pts = scoreRead(correct, secs);
    setGained(pts);
    setSessionPoints((p) => p + pts);
    setSessionDone((d) => d + 1);
    setStreak((s) => (correct ? s + 1 : 0));
    setPhase("resolving");
    // Play on from the decision frame (no seek) to let the play resolve.
    if (clip.resumeEnd > clip.pauseTime + 0.1) {
      beginWatch(clip.resumeEnd, () => {
        yt.pause();
        setPhase("reveal");
        commitScore(pts);
      });
    } else {
      yt.pause();
      setPhase("reveal");
      commitScore(pts);
    }
  };

  // Replay the whole rep with the answer shown.
  const watchAgain = () => {
    if (!clip) return;
    yt.seek(clip.startTime, true);
    beginWatch(clip.resumeEnd, () => yt.pause());
  };

  const commitScore = (pts: number) => {
    const wk = weekKey();
    const next = [...scores];
    const meIdx = next.findIndex((s) => s.name === name && s.weekKey === wk);
    if (meIdx >= 0) {
      next[meIdx] = {
        ...next[meIdx],
        points: next[meIdx].points + pts,
        clipsDone: next[meIdx].clipsDone + 1,
        updatedAt: Date.now(),
      };
    } else {
      next.push({
        name,
        points: pts,
        clipsDone: 1,
        weekKey: wk,
        updatedAt: Date.now(),
      });
    }
    onScore(next);
  };

  const nextClip = () => {
    if (idx + 1 < clips.length) setIdx(idx + 1);
    else {
      setPhase("menu");
      setTab("board");
      flash("Session complete 🔥");
    }
  };

  // cue current clip video
  useEffect(() => {
    if (clip && yt.ready) yt.cue(clip.videoId, clip.startTime);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clip?.id, yt.ready]);

  if (clips.length === 0) {
    return (
      <div className="fadeup">
        <div className="eyebrow">Film room</div>
        <div className="h1">No reps loaded yet</div>
        <p className="sub">
          Switch to <b>Coach</b> mode to drop in a YouTube clip, mark the read,
          and it lands here as a rep to study.
        </p>
      </div>
    );
  }

  return (
    <div className="fadeup">
      <div className="seg">
        <button
          className={tab === "play" ? "active" : ""}
          onClick={() => setTab("play")}
        >
          🎬 Film reps
        </button>
        <button
          className={tab === "board" ? "active" : ""}
          onClick={() => setTab("board")}
        >
          🏆 Leaderboard
        </button>
      </div>

      {tab === "board" ? (
        <Leaderboard scores={scores} me={name} onName={setName} />
      ) : (
        <>
          <div className="stage">
            <div className="yt-host" ref={yt.hostRef} />

            {/* HUD */}
            {phase !== "menu" && (
              <div className="hud">
                <span className="pill tabnum">
                  Rep {idx + 1}/{clips.length}
                </span>
                {streak > 0 && (
                  <span className="pill flame tabnum">🔥 {streak}</span>
                )}
              </div>
            )}

            {/* Decision overlay */}
            {(phase === "decision" ||
              phase === "resolving" ||
              phase === "reveal") &&
              clip && (
                <div
                  className={
                    "overlay" + (phase === "decision" ? " dim" : "")
                  }
                >
                  {clip.targets.map((t) => {
                    let cls = "target";
                    if (phase === "decision") {
                      if (picked === t.id) cls += " picked";
                    } else {
                      if (t.id === clip.correctTargetId) cls += " correct";
                      else if (picked === t.id) cls += " wrong";
                    }
                    return (
                      <button
                        key={t.id}
                        className={cls}
                        style={{
                          left: `${t.x * 100}%`,
                          top: `${t.y * 100}%`,
                        }}
                        disabled={phase !== "decision"}
                        onClick={() => phase === "decision" && setPicked(t.id)}
                      >
                        {t.label}
                        {phase !== "decision" &&
                          t.id === clip.correctTargetId && (
                            <span className="tag">✓</span>
                          )}
                      </button>
                    );
                  })}
                </div>
              )}

            {/* Tap the video to pause / resume */}
            {(phase === "playing" || phase === "resolving") && (
              <button
                className="tap-layer"
                onClick={togglePlay}
                aria-label="Play or pause"
              >
                {paused && <span className="tap-icon">▶</span>}
              </button>
            )}

            {/* Prompt bar */}
            {phase === "decision" && clip && (
              <div className="stage-prompt">
                {clip.prompt || "What happens next?"}
                <small>Tap your read, then lock it in</small>
              </div>
            )}
            {phase === "playing" && (
              <div className="stage-prompt">
                {paused ? "Paused — tap to resume" : "Watch the rep…"}
                <small>It freezes at the decision</small>
              </div>
            )}
            {phase === "resolving" && (
              <div className="stage-prompt">Watching it play out…</div>
            )}
          </div>

          {yt.error != null && (
            <div
              className="note"
              style={{ borderLeftColor: "var(--bad)", marginTop: 12 }}
            >
              <b style={{ color: "var(--bad)" }}>This clip can’t play. </b>
              {ytErrorMessage(yt.error)}
            </div>
          )}

          {/* Controls below stage */}
          <div style={{ marginTop: 14 }}>
            {phase === "menu" && (
              <>
                <div className="card" style={{ marginBottom: 12 }}>
                  <div style={{ fontWeight: 800, fontSize: 16 }}>
                    {clip?.title || "Rep"}
                  </div>
                  <div className="sub" style={{ marginTop: 4 }}>
                    Watch the rep. It’ll freeze at the decision. Make your read
                    before the defense tells you.
                  </div>
                </div>
                <button
                  className="btn primary"
                  disabled={!yt.ready}
                  onClick={startClip}
                >
                  {yt.ready ? "▶  Start the rep" : "Loading film…"}
                </button>
              </>
            )}

            {phase === "playing" && (
              <button className="btn ghost" onClick={togglePlay}>
                {paused ? "▶  Resume" : "⏸  Pause"}
              </button>
            )}

            {phase === "decision" && (
              <div className="stack">
                <button
                  className="btn primary"
                  disabled={!picked}
                  onClick={lockIn}
                >
                  🔒 Lock in my read
                </button>
                <button className="btn ghost" onClick={replayLeadup}>
                  ↻ Replay the lead-up
                </button>
              </div>
            )}

            {phase === "resolving" && (
              <button className="btn ghost" onClick={togglePlay}>
                {paused ? "▶  Resume" : "⏸  Pause"}
              </button>
            )}

            {phase === "reveal" && clip && (
              <div className="fadeup">
                <div className="reveal">
                  <div
                    className={
                      "verdict " +
                      (picked === clip.correctTargetId ? "good" : "bad")
                    }
                  >
                    {picked === clip.correctTargetId
                      ? "Correct read"
                      : "Missed it"}
                  </div>
                  <div
                    className="points tabnum"
                    style={{
                      color:
                        picked === clip.correctTargetId
                          ? "var(--good)"
                          : "var(--text-faint)",
                    }}
                  >
                    +{gained}
                  </div>
                  <div className="note">
                    <b>Why:</b> {clip.why || "The correct read is highlighted above."}
                  </div>
                </div>
                <div className="stack" style={{ marginTop: 16 }}>
                  <button className="btn primary" onClick={nextClip}>
                    {idx + 1 < clips.length
                      ? "Next rep  →"
                      : "Finish session  →"}
                  </button>
                  <button className="btn ghost" onClick={watchAgain}>
                    ↻ Watch it again
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="help tabnum" style={{ textAlign: "center" }}>
            Session: {sessionPoints} pts · {sessionDone} reps
          </div>
        </>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------
   Leaderboard
------------------------------------------------------------------ */
function Leaderboard({
  scores,
  me,
  onName,
}: {
  scores: ScoreEntry[];
  me: string;
  onName: (n: string) => void;
}) {
  const wk = weekKey();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(me);

  const ranked = useMemo(() => {
    return scores
      .filter((s) => s.weekKey === wk)
      .sort((a, b) => b.points - a.points);
  }, [scores, wk]);

  return (
    <div className="fadeup">
      <div className="eyebrow">This week · {wk}</div>
      <div className="h1">Who knows the playbook</div>
      <p className="sub" style={{ marginBottom: 16 }}>
        Resets every Monday — nobody starts buried.
      </p>

      <div className="stack">
        {ranked.length === 0 && (
          <div className="empty">
            <div className="em">🏀</div>
            No reps this week yet. Go make some reads.
          </div>
        )}
        {ranked.map((s, i) => {
          const isMe = s.name === me;
          return (
            <div key={s.name + i} className={"row" + (isMe ? " you" : "")}>
              <div className={"rank tabnum" + (i < 3 ? " top" : "")}>
                {i + 1}
              </div>
              <div className="grow">
                <div className="name">
                  {s.name}
                  {isMe ? " (you)" : ""}
                </div>
                <div className="meta tabnum">{s.clipsDone} reps</div>
              </div>
              <div className="big-score tabnum">{s.points}</div>
            </div>
          );
        })}
      </div>

      <hr className="divider" />
      {editing ? (
        <div className="stack">
          <input
            className="field"
            value={draft}
            maxLength={18}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Your name"
          />
          <button
            className="btn primary"
            onClick={() => {
              const n = draft.trim() || "You";
              onName(n);
              setEditing(false);
            }}
          >
            Save name
          </button>
        </div>
      ) : (
        <button className="btn ghost" onClick={() => setEditing(true)}>
          ✎ You’re playing as “{me}”
        </button>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------
   Coach Mode — annotate a clip
------------------------------------------------------------------ */
type Step = "list" | "load" | "marks" | "details";

function CoachMode({
  clips,
  persistClips,
  flash,
}: {
  clips: Clip[];
  persistClips: (c: Clip[]) => void;
  flash: (m: string) => void;
}) {
  const yt = useYT();
  const [step, setStep] = useState<Step>(clips.length ? "list" : "load");
  const [urlInput, setUrlInput] = useState("");
  const [videoId, setVideoId] = useState<string | null>(null);
  const [scrub, setScrub] = useState(0);
  const [startTime, setStartTime] = useState(0);
  const [pauseTime, setPauseTime] = useState(0);
  const [resumeEnd, setResumeEnd] = useState(0);
  const [placing, setPlacing] = useState(false);
  const [targets, setTargets] = useState<Target[]>([]);
  const [correctId, setCorrectId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [prompt, setPrompt] = useState("Where does the ball go next?");
  const [why, setWhy] = useState("");
  const scrubTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => {
    if (scrubTimer.current) clearInterval(scrubTimer.current);
  }, []);

  // While the coach previews playback, keep the scrubber tracking the video.
  useEffect(() => {
    if (step !== "marks" || !yt.isPlaying) return;
    const id = setInterval(() => setScrub(yt.time()), 200);
    return () => clearInterval(id);
  }, [step, yt.isPlaying, yt.time]);

  const resetBuilder = () => {
    setUrlInput("");
    setVideoId(null);
    setScrub(0);
    setStartTime(0);
    setPauseTime(0);
    setResumeEnd(0);
    setPlacing(false);
    setTargets([]);
    setCorrectId(null);
    setTitle("");
    setPrompt("Where does the ball go next?");
    setWhy("");
  };

  const loadUrl = () => {
    const id = parseVideoId(urlInput);
    if (!id) {
      flash("Couldn’t read that YouTube link");
      return;
    }
    setVideoId(id);
    yt.cue(id, 0);
    setStep("marks");
    // keep our scrub state synced to the player while on this step
    if (scrubTimer.current) clearInterval(scrubTimer.current);
  };

  const onScrub = (v: number) => {
    setScrub(v);
    yt.seek(v, true);
  };

  const placeTarget = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!placing) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const y = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
    const t: Target = {
      id: uid(),
      x,
      y,
      label: String(targets.length + 1),
    };
    setTargets((prev) => [...prev, t]);
  };

  const removeTarget = (id: string) => {
    setTargets((prev) =>
      prev
        .filter((t) => t.id !== id)
        .map((t, i) => ({ ...t, label: String(i + 1) }))
    );
    if (correctId === id) setCorrectId(null);
  };

  const canSave =
    videoId &&
    targets.length >= 2 &&
    correctId &&
    pauseTime > startTime &&
    resumeEnd >= pauseTime;

  const save = () => {
    if (!canSave || !videoId || !correctId) return;
    const clip: Clip = {
      id: uid(),
      title: title.trim() || "Untitled rep",
      videoId,
      startTime,
      pauseTime,
      resumeEnd: resumeEnd || pauseTime + 4,
      prompt: prompt.trim() || "Where does the ball go next?",
      targets,
      correctTargetId: correctId,
      why: why.trim(),
      createdAt: Date.now(),
    };
    persistClips([...clips, clip]);
    resetBuilder();
    setStep("list");
    flash("Rep saved to the film room ✓");
  };

  const del = (id: string) => {
    persistClips(clips.filter((c) => c.id !== id));
  };

  // ---- LIST ----
  if (step === "list") {
    return (
      <div className="fadeup">
        <div className="eyebrow">Coach console</div>
        <div className="h1">Your film room</div>
        <p className="sub" style={{ marginBottom: 16 }}>
          {clips.length} rep{clips.length === 1 ? "" : "s"} loaded. Each one
          becomes a scored decision for your players.
        </p>

        <button
          className="btn primary"
          onClick={() => {
            resetBuilder();
            setStep("load");
          }}
        >
          + Add a rep from film
        </button>

        <div className="stack" style={{ marginTop: 16 }}>
          {clips.map((c) => (
            <div key={c.id} className="clipcard">
              <img className="thumb" src={thumbUrl(c.videoId)} alt="" />
              <div className="grow">
                <div className="t">{c.title}</div>
                <div className="d tabnum">
                  Decision @ {fmtTime(c.pauseTime)} · {c.targets.length} options
                </div>
              </div>
              <button
                className="btn danger"
                style={{ width: "auto", padding: "8px 12px" }}
                onClick={() => del(c.id)}
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ---- LOAD URL ----
  if (step === "load") {
    return (
      <div className="fadeup">
        <div className="eyebrow">Step 1 of 3</div>
        <div className="h1">Drop in film</div>
        <p className="sub" style={{ marginBottom: 16 }}>
          Paste any YouTube link — a game, a highlight, a breakdown. That’s your
          rep.
        </p>
        <div className="label">YouTube URL</div>
        <input
          className="field"
          placeholder="https://youtube.com/watch?v=…"
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
        />
        <div className="help">
          Beta note: use publicly available film (YouTube, Hudl share links that
          open on YouTube). Some uploads have embedding disabled by their owner —
          if the frame stays black, try another clip.
        </div>
        <div className="stack" style={{ marginTop: 16 }}>
          <button className="btn primary" onClick={loadUrl}>
            Load this clip →
          </button>
          {clips.length > 0 && (
            <button className="btn ghost" onClick={() => setStep("list")}>
              ← Back to film room
            </button>
          )}
        </div>
      </div>
    );
  }

  // ---- MARKS (scrub + place targets) ----
  if (step === "marks") {
    return (
      <div className="fadeup">
        <div className="eyebrow">Step 2 of 3</div>
        <div className="h1">Mark the decision</div>

        {yt.error != null && (
          <div
            className="note"
            style={{ borderLeftColor: "var(--bad)", marginTop: 10 }}
          >
            <b style={{ color: "var(--bad)" }}>Can’t play this clip. </b>
            {ytErrorMessage(yt.error)}
            <div style={{ marginTop: 8 }}>
              <button className="chip" onClick={() => setStep("load")}>
                ← Try another link
              </button>
            </div>
          </div>
        )}

        <div className="stage" style={{ marginTop: 8 }}>
          <div className="yt-host" ref={yt.hostRef} />
          <div
            className={"overlay" + (placing ? " placing" : "")}
            onClick={(e) => {
              if (placing) placeTarget(e);
              else if (yt.isPlaying) yt.pause();
              else yt.play();
            }}
          >
            {!placing && !yt.isPlaying && (
              <span
                className="tap-icon"
                style={{
                  position: "absolute",
                  left: "50%",
                  top: "50%",
                  transform: "translate(-50%, -50%)",
                  pointerEvents: "none",
                }}
              >
                ▶
              </span>
            )}
            {targets.map((t) => (
              <button
                key={t.id}
                className={"target" + (correctId === t.id ? " correct" : "")}
                style={{ left: `${t.x * 100}%`, top: `${t.y * 100}%` }}
                onClick={(e) => {
                  e.stopPropagation();
                  if (placing) return;
                  setCorrectId(t.id);
                }}
              >
                {t.label}
                {correctId === t.id && <span className="tag">✓</span>}
              </button>
            ))}
          </div>
        </div>

        <div className="card" style={{ marginTop: 12 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              marginBottom: 8,
            }}
          >
            <button
              className="chip"
              disabled={!yt.ready}
              onClick={() => (yt.isPlaying ? yt.pause() : yt.play())}
            >
              {yt.isPlaying ? "⏸ Pause" : "▶ Play"}
            </button>
            <div className="label" style={{ margin: 0 }}>
              <span className="tabnum">{fmtTime(scrub)}</span>
              {yt.duration ? (
                <span className="tabnum"> / {fmtTime(yt.duration)}</span>
              ) : null}
            </div>
          </div>
          <input
            className="range"
            type="range"
            min={0}
            max={Math.max(1, Math.floor(yt.duration || 1))}
            step={0.5}
            value={scrub}
            onFocus={() => yt.refreshDuration()}
            onChange={(e) => onScrub(parseFloat(e.target.value))}
          />
          <div className="chiprow" style={{ marginTop: 10 }}>
            <button
              className="chip"
              onClick={() => {
                setStartTime(scrub);
                flash(`Start @ ${fmtTime(scrub)}`);
              }}
            >
              ⏮ Start = {fmtTime(startTime)}
            </button>
            <button
              className="chip"
              onClick={() => {
                setPauseTime(scrub);
                flash(`Decision @ ${fmtTime(scrub)}`);
              }}
            >
              ⏸ Decision = {fmtTime(pauseTime)}
            </button>
            <button
              className="chip"
              onClick={() => {
                setResumeEnd(scrub);
                flash(`Resolve @ ${fmtTime(scrub)}`);
              }}
            >
              ⏭ Resolve = {fmtTime(resumeEnd)}
            </button>
          </div>
          <div className="help">
            <b>Tap the video</b> to play / pause (or drag the slider). At the
            right spot, tap <b>Start</b> (rep begins), <b>Decision</b> (player
            must choose), and <b>Resolve</b> (just after it plays out).
          </div>
        </div>

        <div className="card" style={{ marginTop: 12 }}>
          <div className="label">
            Place the options ({targets.length})
          </div>
          <div className="chiprow">
            <button
              className={"chip" + (placing ? " on" : "")}
              onClick={() => setPlacing((p) => !p)}
            >
              {placing ? "● Tap the frame to drop markers" : "+ Add markers"}
            </button>
            {targets.map((t) => (
              <button
                key={t.id}
                className="chip"
                onClick={() => removeTarget(t.id)}
              >
                ✕ {t.label}
              </button>
            ))}
          </div>
          <div className="help">
            Drop 2–4 markers on the frozen frame (receivers, cutters, spots).
            Turn off <b>Add markers</b>, then tap the marker that’s the{" "}
            <b>correct read</b> — it turns green.
          </div>
        </div>

        <div className="stack" style={{ marginTop: 14 }}>
          <button
            className="btn primary"
            disabled={
              !(
                targets.length >= 2 &&
                correctId &&
                pauseTime > startTime &&
                resumeEnd >= pauseTime
              )
            }
            onClick={() => setStep("details")}
          >
            Next: label it →
          </button>
          <button className="btn ghost" onClick={() => setStep("load")}>
            ← Change clip
          </button>
        </div>
      </div>
    );
  }

  // ---- DETAILS ----
  return (
    <div className="fadeup">
      <div className="eyebrow">Step 3 of 3</div>
      <div className="h1">Coach it up</div>
      <div className="stack-lg" style={{ marginTop: 8 }}>
        <div>
          <div className="label">Rep title</div>
          <input
            className="field"
            placeholder="e.g. Horns set — weak-side dive"
            value={title}
            maxLength={60}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        <div>
          <div className="label">The question your player answers</div>
          <input
            className="field"
            value={prompt}
            maxLength={80}
            onChange={(e) => setPrompt(e.target.value)}
          />
        </div>
        <div>
          <div className="label">Why it’s the right read (shown after they answer)</div>
          <textarea
            className="field"
            rows={3}
            placeholder="e.g. Weak-side defender cheats the screen — the backdoor lane opens the moment the big lifts."
            value={why}
            onChange={(e) => setWhy(e.target.value)}
          />
        </div>
        <button className="btn primary" disabled={!canSave} onClick={save}>
          ✓ Save rep to film room
        </button>
        <button className="btn ghost" onClick={() => setStep("marks")}>
          ← Back to markers
        </button>
      </div>
    </div>
  );
}
