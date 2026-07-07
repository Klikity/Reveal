import { useEffect, useMemo, useRef, useState } from "react";
import { IMAGES } from "./images";
import "./App.css";

const MAX_TIME = 60;

const DAILY_RESULT_KEY = "reveal_daily_result";
const DAILY_STATS_KEY = "reveal_daily_stats";
const CLASSIC_STATS_KEY = "reveal_classic_stats";
const SEEN_RULES_KEY = "reveal_seen_daily_rules";

const CLASSIC_PROGRESS_KEY = "reveal_classic_progress";
const XP_PER_LEVEL = 500;

function getTodayKey() {
  return new Date().toISOString().slice(0, 10);
}

function hashString(value) {
  let hash = 0;

  for (let i = 0; i < value.length; i++) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }

  return Math.abs(hash);
}

function getDailyImage() {
  const today = getTodayKey();
  const index = hashString(today) % IMAGES.length;
  return IMAGES[index];
}

function getDailyNumber() {
  const start = new Date("2026-07-01T00:00:00");
  const today = new Date(`${getTodayKey()}T00:00:00`);
  const diff = today - start;
  return Math.max(1, Math.floor(diff / 86400000) + 1);
}

function normalizeGuess(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/^the\s+/i, "")
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ");
}

function isCorrectGuess(guess, image) {
  const cleanGuess = normalizeGuess(guess);
  if (!cleanGuess) return false;

const acceptedAnswers = image.acceptedAnswers.map(normalizeGuess);

  return acceptedAnswers.some((answer) => {
    if (cleanGuess === answer) return true;

    const safePartial =
      cleanGuess.length >= 4 &&
      answer.length >= 4 &&
      (answer.includes(cleanGuess) || cleanGuess.includes(answer));

    return safePartial;
  });
}

function calculateScore(elapsedSeconds, wrongGuesses, hintUsed) {
  const hintPenalty = hintUsed ? 100 : 0;
  return Math.max(0, 1000 - elapsedSeconds * 15 - wrongGuesses * 25 - hintPenalty);
}

function getEmptyStats() {
  return {
    gamesPlayed: 0,
    wins: 0,
    losses: 0,
    currentStreak: 0,
    maxStreak: 0,
    totalScore: 0,
    averageScore: 0,
    bestScore: 0,
    bestTime: null,
    totalGuesses: 0,
    lastPlayedDate: null,
  };
}

function loadStats(key) {
  try {
    return JSON.parse(localStorage.getItem(key)) || getEmptyStats();
  } catch {
    return getEmptyStats();
  }
}

function saveStats(key, stats) {
  localStorage.setItem(key, JSON.stringify(stats));
}

function updateStats(key, result, mode) {
  const oldStats = loadStats(key);

  const gamesPlayed = oldStats.gamesPlayed + 1;
  const wins = oldStats.wins + (result.won ? 1 : 0);
  const losses = oldStats.losses + (result.won ? 0 : 1);
  const totalScore = oldStats.totalScore + result.score;
  const averageScore = Math.round(totalScore / gamesPlayed);
  const bestScore = Math.max(oldStats.bestScore || 0, result.score);

  const bestTime =
    result.won && result.elapsedTime
      ? oldStats.bestTime === null
        ? result.elapsedTime
        : Math.min(oldStats.bestTime, result.elapsedTime)
      : oldStats.bestTime;

  let currentStreak = oldStats.currentStreak || 0;
  let maxStreak = oldStats.maxStreak || 0;

  if (mode === "daily") {
    currentStreak = result.won ? currentStreak + 1 : 0;
    maxStreak = Math.max(maxStreak, currentStreak);
  }

  const newStats = {
    gamesPlayed,
    wins,
    losses,
    currentStreak,
    maxStreak,
    totalScore,
    averageScore,
    bestScore,
    bestTime,
    totalGuesses: oldStats.totalGuesses + result.guesses.length,
    lastPlayedDate: result.date,
  };

  saveStats(key, newStats);
  return newStats;
}

function getStoredDailyResult() {
  try {
    const result = JSON.parse(localStorage.getItem(DAILY_RESULT_KEY));

    if (!result) return null;

    if (result.date !== getTodayKey()) {
      return null;
    }

    return result;
  } catch {
    return null;
  }
}

function saveDailyResult(result) {
  localStorage.setItem(DAILY_RESULT_KEY, JSON.stringify(result));
}

function getShareGrid(won, elapsedSeconds) {
  if (!won) return "⬛⬛⬛⬛⬛⬛";
  if (elapsedSeconds <= 10) return "🟩🟩🟩🟩🟩🟩";
  if (elapsedSeconds <= 20) return "🟩🟩🟩🟩🟨⬛";
  if (elapsedSeconds <= 30) return "🟩🟩🟩🟨⬛⬛";
  if (elapsedSeconds <= 45) return "🟩🟩🟨⬛⬛⬛";
  return "🟨⬛⬛⬛⬛⬛";
}

function getLevelFromXp(xp) {
  return Math.floor(xp / XP_PER_LEVEL) + 1;
}

function getCurrentLevelXp(xp) {
  return xp % XP_PER_LEVEL;
}

function getEmptyClassicProgress() {
  return {
    xp: 0,
    level: 1,
    totalClassicWins: 0,
    lastXpGained: 0,
  };
}

function loadClassicProgress() {
  try {
    const saved = JSON.parse(localStorage.getItem(CLASSIC_PROGRESS_KEY));

    if (!saved) return getEmptyClassicProgress();

    const xp = saved.xp || 0;

    return {
      ...getEmptyClassicProgress(),
      ...saved,
      xp,
      level: getLevelFromXp(xp),
    };
  } catch {
    return getEmptyClassicProgress();
  }
}

function saveClassicProgress(progress) {
  localStorage.setItem(CLASSIC_PROGRESS_KEY, JSON.stringify(progress));
}

function getAllowedDifficulties(level) {
  if (level >= 8) {
    return ["Easy", "Medium", "Hard"];
  }

  if (level >= 4) {
    return ["Easy", "Medium"];
  }

  return ["Easy"];
}

function getDifficultyLabel(level) {
  const allowed = getAllowedDifficulties(level);

  if (allowed.includes("Hard")) return "Easy / Medium / Hard";
  if (allowed.includes("Medium")) return "Easy / Medium";
  return "Easy";
}

function getRandomClassicImage(level, excludeId = null) {
  const allowedDifficulties = getAllowedDifficulties(level);

  const levelImages = IMAGES.filter((image) =>
    allowedDifficulties.includes(image.difficulty)
  );

  const pool = levelImages.length > 0 ? levelImages : IMAGES;

  const availableImages = pool.filter((image) => image.id !== excludeId);
  const finalPool = availableImages.length > 0 ? availableImages : pool;

  const index = Math.floor(Math.random() * finalPool.length);

  return finalPool[index];
}

function calculateClassicXp(result) {
  if (!result.won) {
    return 15;
  }

  const baseXp = 100;
  const speedBonus = Math.max(0, MAX_TIME - result.elapsedTime);
  const noHintBonus = result.hintUsed ? 0 : 25;
  const guessBonus = Math.max(0, 30 - Math.max(0, result.guesses.length - 1) * 10);

  return baseXp + speedBonus + noHintBonus + guessBonus;
}

function addClassicXp(result) {
  const currentProgress = loadClassicProgress();
  const xpGained = calculateClassicXp(result);

  const newXp = currentProgress.xp + xpGained;

  const updatedProgress = {
    ...currentProgress,
    xp: newXp,
    level: getLevelFromXp(newXp),
    totalClassicWins:
      currentProgress.totalClassicWins + (result.won ? 1 : 0),
    lastXpGained: xpGained,
  };

  saveClassicProgress(updatedProgress);

  return {
    updatedProgress,
    xpGained,
  };
}

function buildShareText(result, mode) {
  const title = mode === "daily" ? `🖼️ Reveal #${getDailyNumber()}` : "🖼️ Reveal Classic";

  if (result.won) {
    return `${title}
✅ Solved in ${result.elapsedTime}s
Score: ${result.score}
Guesses: ${result.guesses.length}
Category: ${result.category}
${getShareGrid(true, result.elapsedTime)}`;
  }

  return `${title}
❌ Failed
Answer: ${result.finalAnswer}
Guesses: ${result.guesses.length}
${getShareGrid(false, result.elapsedTime)}`;
}

function roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function createShareImage(result, mode) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  canvas.width = 900;
  canvas.height = 1200;

  const gradient = ctx.createLinearGradient(0, 0, 900, 1200);
  gradient.addColorStop(0, "#080b12");
  gradient.addColorStop(0.55, "#111827");
  gradient.addColorStop(1, "#101622");

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "rgba(120, 242, 196, 0.16)";
  ctx.beginPath();
  ctx.arc(120, 120, 260, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "rgba(142, 183, 255, 0.14)";
  ctx.beginPath();
  ctx.arc(820, 220, 300, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "rgba(255, 255, 255, 0.06)";
  roundRect(ctx, 60, 60, 780, 1080, 42);
  ctx.fill();

  ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
  ctx.lineWidth = 2;
  roundRect(ctx, 60, 60, 780, 1080, 42);
  ctx.stroke();

  ctx.textAlign = "center";

  ctx.fillStyle = "#78f2c4";
  ctx.font = "900 34px Arial";
  ctx.fillText(
    mode === "daily" ? `REVEAL #${getDailyNumber()}` : "REVEAL CLASSIC",
    450,
    145
  );

  ctx.fillStyle = "#f5f7fb";
  ctx.font = "900 72px Arial";
  ctx.fillText(result.won ? "SOLVED" : "FAILED", 450, 235);

  ctx.font = "700 34px Arial";
  ctx.fillStyle = result.won ? "#78f2c4" : "#ff6b7a";
  ctx.fillText(result.won ? "✅ Nice reveal!" : "❌ Better luck next time", 450, 295);

  const hiddenGradient = ctx.createLinearGradient(140, 350, 760, 750);
  hiddenGradient.addColorStop(0, "#151d2b");
  hiddenGradient.addColorStop(1, "#26344d");

  ctx.fillStyle = hiddenGradient;
  roundRect(ctx, 140, 350, 620, 400, 36);
  ctx.fill();

  ctx.strokeStyle = "rgba(120, 242, 196, 0.35)";
  ctx.lineWidth = 3;
  roundRect(ctx, 140, 350, 620, 400, 36);
  ctx.stroke();

  ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
  ctx.beginPath();
  ctx.arc(450, 550, 135, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#f5f7fb";
  ctx.font = "900 180px Arial";
  ctx.fillText("?", 450, 615);

  ctx.fillStyle = "#9aa7bd";

  const stats = [
    ["Score", `${result.score}`],
    ["Time", `${result.elapsedTime}s`],
    ["Guesses", `${result.guesses.length}`],
    ["Category", "?"],
    ["Difficulty", result.difficulty],
    ["Hint used", result.hintUsed ? "Yes" : "No"],
  ];

  const startX = 115;
  const startY = 820;
  const boxW = 205;
  const boxH = 86;
  const gap = 26;

  stats.forEach((item, index) => {
    const col = index % 3;
    const row = Math.floor(index / 3);

    const x = startX + col * (boxW + gap);
    const y = startY + row * (boxH + gap);

    ctx.fillStyle = "rgba(255, 255, 255, 0.07)";
    roundRect(ctx, x, y, boxW, boxH, 18);
    ctx.fill();

    ctx.fillStyle = "#9aa7bd";
    ctx.font = "700 20px Arial";
    ctx.textAlign = "left";
    ctx.fillText(item[0], x + 20, y + 32);

    ctx.fillStyle = "#f5f7fb";
    ctx.font = "900 26px Arial";
    ctx.fillText(item[1], x + 20, y + 66);
  });

  ctx.textAlign = "center";
  ctx.fillStyle = "#f5f7fb";
  ctx.font = "700 36px Arial";
  ctx.fillText(getShareGrid(result.won, result.elapsedTime), 450, 1065);

  ctx.fillStyle = "#758197";
  ctx.font = "700 22px Arial";
  ctx.fillText("Guess the image before it fully appears", 450, 1110);

  return canvas;
}

function App() {
  const [mode, setMode] = useState("classic");
  const [showStats, setShowStats] = useState(false);
  const [showRules, setShowRules] = useState(
    localStorage.getItem(SEEN_RULES_KEY) !== "true"
  );

  const [classicProgress, setClassicProgress] = useState(() =>
    loadClassicProgress()
  );

  const [classicImage, setClassicImage] = useState(() => {
    const progress = loadClassicProgress();
    return getRandomClassicImage(progress.level);
  });

  const dailyImage = useMemo(() => getDailyImage(), []);
  const dailyResult = getStoredDailyResult();

  const activeImage = mode === "daily" ? dailyImage : classicImage;

  const [gameKey, setGameKey] = useState(0);
  const [statsRefreshKey, setStatsRefreshKey] = useState(0);

  function handleModeChange(nextMode) {
    setMode(nextMode);

    if (nextMode === "daily" && localStorage.getItem(SEEN_RULES_KEY) !== "true") {
      setShowRules(true);
    }
  }

  function handleRulesClose() {
    localStorage.setItem(SEEN_RULES_KEY, "true");
    setShowRules(false);
  }

  function handleNextClassic() {
    setClassicImage((current) =>
      getRandomClassicImage(classicProgress.level, current?.id)
    );

    setGameKey((value) => value + 1);
  }

  function refreshStats() {
    setStatsRefreshKey((value) => value + 1);
  }

  return (
    <main className="app-shell">
      <header className="site-header">
        <div className="header-left">
          <div className="logo-mark">R</div>

          <div>
            <h1>Reveal</h1>
            <p>Guess the image before it fully appears.</p>
          </div>
        </div>

        {mode === "classic" && (
          <div className="level-pill">
            ⭐ Lv. {classicProgress.level}
            <span>
              {getCurrentLevelXp(classicProgress.xp)}
              /
              {XP_PER_LEVEL}
            </span>
          </div>
        )}
      </header>

      <nav className="mode-selector" aria-label="Game mode">
        <button
          className={mode === "daily" ? "mode-button active" : "mode-button"}
          onClick={() => handleModeChange("daily")}
        >
          Daily Reveal
        </button>

        <button
          className={mode === "classic" ? "mode-button active" : "mode-button"}
          onClick={() => handleModeChange("classic")}
        >
          Classic Reveal
        </button>
      </nav>

      {mode === "classic" && (
        <ClassicProgressPanel progress={classicProgress} />
      )}

      {showRules && (
        <div className="rules-overlay">
          <div className="rules-modal">
            <h2>👋 Welcome to Reveal</h2>

            <p>
              Guess the hidden image before it fully appears.
            </p>

            <div className="rules-list">
              <div>
                🖼️ The image starts blurry and gradually reveals itself.
              </div>

              <div>
                ⌨️ Type your guess at any time.
              </div>

              <div>
                ⚡ The faster you solve it, the higher your score.
              </div>

              <div>
                💡 You can use a hint, but it costs points.
              </div>

              <div>
                📅 Daily Reveal can only be completed once per day.
              </div>

              <div>
                🔥 Build your streak by solving daily images.
              </div>
            </div>

            <button
              className="primary-button"
              onClick={handleRulesClose}
            >
              Start Playing
            </button>
          </div>
        </div>
      )}

      <RevealGame
        key={`${mode}-${activeImage.id}-${gameKey}`}
        mode={mode}
        image={activeImage}
        dailyResult={dailyResult}
        onNextClassic={handleNextClassic}
        onStatsUpdate={refreshStats}
        onClassicProgressUpdate={setClassicProgress}
      />

      <div className="top-actions">
        <button
          className="secondary-button"
          onClick={() => setShowStats((value) => !value)}
        >
          {showStats ? "Hide stats" : "Show stats"}
        </button>

        <button
          className="secondary-button"
            onClick={() => setShowRules(true)}>
          ❓ Rules
        </button>
      </div>

      {showStats && (
        <StatsPanel
          key={statsRefreshKey}
          mode={mode}
          dailyStats={loadStats(DAILY_STATS_KEY)}
          classicStats={loadStats(CLASSIC_STATS_KEY)}
        />
      )}
    </main>
  );
}

function RevealGame({ mode, image, dailyResult, onNextClassic, onStatsUpdate, onClassicProgressUpdate}) {
  const completedDaily = mode === "daily" && dailyResult?.completed;

  const [elapsedTime, setElapsedTime] = useState(
    completedDaily ? dailyResult.elapsedTime : 0
  );
  const [guesses, setGuesses] = useState(completedDaily ? dailyResult.guesses : []);
  const [guess, setGuess] = useState("");
  const [feedback, setFeedback] = useState("");
  const [hintUsed, setHintUsed] = useState(completedDaily ? dailyResult.hintUsed : false);
  const [showHint, setShowHint] = useState(completedDaily ? dailyResult.hintUsed : false);
  const [finished, setFinished] = useState(completedDaily);
  const [result, setResult] = useState(completedDaily ? dailyResult : null);
  const [textCopied, setTextCopied] = useState(false);
  const [imageCopied, setImageCopied] = useState(false);
  const [confetti, setConfetti] = useState(false);

  const timerRef = useRef(null);

  const revealProgress = Math.min(100, Math.round((elapsedTime / MAX_TIME) * 100));
  const progress = revealProgress / 100;

  const blur = finished ? 0 : Math.max(0, 35 - progress * 35);
  const overlayOpacity = finished ? 0 : Math.max(0, 0.75 - progress * 0.75);

  useEffect(() => {
    const preload = new Image();
    preload.src = image.imageUrl;
  }, [image.imageUrl]);

  useEffect(() => {
    if (finished) return;

    timerRef.current = setInterval(() => {
      setElapsedTime((currentTime) => {
        if (currentTime >= MAX_TIME) {
          clearInterval(timerRef.current);
          finishGame(false, MAX_TIME, guesses);
          return MAX_TIME;
        }

        return currentTime + 1;
      });
    }, 1000);

    return () => clearInterval(timerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished, image.id]);

  function createResult(won, finalTime, finalGuesses) {
    const wrongGuesses = won
      ? Math.max(0, finalGuesses.length - 1)
      : finalGuesses.length;

    const score = won ? calculateScore(finalTime, wrongGuesses, hintUsed) : 0;

    return {
      date: getTodayKey(),
      imageId: image.id,
      completed: true,
      won,
      elapsedTime: finalTime,
      score,
      guesses: finalGuesses,
      finalAnswer: image.title,
      category: image.category,
      difficulty: image.difficulty,
      hintUsed,
    };
  }

  function finishGame(won, finalTime, finalGuesses) {
    if (finished) return;

    clearInterval(timerRef.current);

    let finalResult = createResult(won, finalTime, finalGuesses);

    setFinished(true);
    setResult(finalResult);

    if (won) {
      setConfetti(true);
      setTimeout(() => setConfetti(false), 1600);
    }

    if (mode === "daily") {
      saveDailyResult(finalResult);
      updateStats(DAILY_STATS_KEY, finalResult, "daily");
    } else {
      const { updatedProgress, xpGained } = addClassicXp(finalResult);

      finalResult = {
        ...finalResult,
        xpGained,
        newLevel: updatedProgress.level,
      };

      updateStats(CLASSIC_STATS_KEY, finalResult, "classic");
      onClassicProgressUpdate(updatedProgress);
    }

    setResult(finalResult);
    onStatsUpdate();
  }

  function handleSubmit(event) {
    event.preventDefault();

    const cleanGuess = guess.trim();

    if (!cleanGuess) {
      setFeedback("Type a guess first.");
      return;
    }

    const nextGuesses = [...guesses, cleanGuess];

    setGuesses(nextGuesses);
    setGuess("");

    if (isCorrectGuess(cleanGuess, image)) {
      setFeedback("");
      finishGame(true, elapsedTime, nextGuesses);
    } else {
      setFeedback("Not quite. Try again.");
    }
  }

  function handleGiveUp() {
    finishGame(false, elapsedTime, guesses);
  }

  async function handleCopyImageToClipboard() {
    if (!result) return;

    const canvas = createShareImage(result, mode);

    canvas.toBlob(async (blob) => {
      if (!blob) return;

      try {
        if (!navigator.clipboard || !window.ClipboardItem) {
          throw new Error("Image clipboard is not supported in this browser.");
        }

        await navigator.clipboard.write([
          new ClipboardItem({
            "image/png": blob,
          }),
        ]);

        setImageCopied(true);
        setTimeout(() => setImageCopied(false), 1600);
      } catch (error) {
        console.error("Could not copy image to clipboard:", error);

        // Fallback: download image if clipboard image copy is not supported
        const imageUrl = URL.createObjectURL(blob);
        const link = document.createElement("a");

        link.href = imageUrl;
        link.download = "reveal-result.png";

        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        URL.revokeObjectURL(imageUrl);
      }
    }, "image/png");
  }

  return (
    <section className="game-card">
      {confetti && (
        <div className="confetti-layer" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
        </div>
      )}

      <div className="round-info">
        <div>
          <p className="eyebrow">
            {mode === "daily" ? `Daily Reveal #${getDailyNumber()}` : "Classic Reveal"}
          </p>
          <h2>{finished ? image.title : "What is hidden here?"}</h2>
        </div>

        <div className="timer-pill">
          <strong>{elapsedTime}s</strong>
          <small>{revealProgress}% revealed</small>
        </div>
      </div>

      
      <div className="image-card">
        <img
          src={image.imageUrl}
          alt={finished ? image.title : "Hidden image"}
          className="reveal-image"
          style={{
            filter: `
              blur(${blur}px)
            `,
          }}
        />
      </div>


      <div className="progress-track" aria-label="Reveal progress">
        <div className="progress-fill" style={{ width: `${revealProgress}%` }} />
      </div>

      {!finished && (
        <>
          <form className="guess-form" onSubmit={handleSubmit}>
            <input
              value={guess}
              onChange={(event) => setGuess(event.target.value)}
              placeholder="Type your guess..."
              aria-label="Your guess"
              autoComplete="off"
            />

            <button className="primary-button" type="submit">
              Guess
            </button>
          </form>

          {feedback && <p className="feedback-text">{feedback}</p>}

          <div className="game-actions">
            <button
              className="secondary-button"
              onClick={() => {
                setShowHint(true);
                setHintUsed(true);
              }}
            >
              Hint
            </button>

            <button className="danger-button" onClick={handleGiveUp}>
              Give up
            </button>

            {mode === "classic" && (
              <button className="secondary-button" onClick={onNextClassic}>
                Skip
              </button>
            )}
          </div>

          {showHint && (
            <div className="hint-card">
              <span>
                Category: <strong>{image.category}</strong>
              </span>
              <span>Hint penalty: -100 score</span>
            </div>
          )}
        </>
      )}

      {guesses.length > 0 && (
        <div className="guess-history">
          <h3>Guesses</h3>

          <div>
            {guesses.map((item, index) => (
              <span key={`${item}-${index}`}>{item}</span>
            ))}
          </div>
        </div>
      )}

      {finished && result && (
        <section className={result.won ? "result-panel win" : "result-panel loss"}>
          <div className="result-header">
            <div>
              <p className="eyebrow">{result.won ? "Solved" : "Round over"}</p>
              <h2>{result.won ? "Nice reveal!" : "Better luck next time"}</h2>
            </div>

            <div className="score-badge">{result.score} pts</div>
          </div>

          <div className="result-details">
            <div>
              <span>Answer</span>
              <strong>{result.finalAnswer}</strong>
            </div>

            <div>
              <span>Time</span>
              <strong>{result.elapsedTime}s</strong>
            </div>

            <div>
              <span>Guesses</span>
              <strong>{result.guesses.length}</strong>
            </div>

            <div>
              <span>Category</span>
              <strong>{result.category}</strong>
            </div>

            <div>
              <span>Difficulty</span>
              <strong>{result.difficulty}</strong>
            </div>

            <div>
              <span>Hint used</span>
              <strong>{result.hintUsed ? "Yes" : "No"}</strong>
            </div>
          </div>
         
          {mode === "classic" && (
            <>
              <div>
                <span>XP gained </span>
                <strong>+{result.xpGained || 0}</strong>
              </div>

              <div>
                <span>Classic level </span>
                <strong>{result.newLevel || 1}</strong>
              </div>
            </>
          )}

          <div className="result-actions">
            <button className="primary-button" onClick={handleCopyImageToClipboard}>
              {imageCopied ? "Image copied!" : "Share"}
            </button>

            {mode === "classic" && (
              <button className="secondary-button" onClick={onNextClassic}>
                Play again
              </button>
            )}
          </div>
        </section>
      )}
    </section>
  );
}

function ClassicProgressPanel({ progress }) {
  const currentLevelXp = getCurrentLevelXp(progress.xp);
  const progressPercent = Math.round((currentLevelXp / XP_PER_LEVEL) * 100);
}

function StatsPanel({ mode, dailyStats, classicStats }) {
  const stats = mode === "daily" ? dailyStats : classicStats;

  return (
    <section className="stats-panel">
      <div className="panel-heading">
        <p className="eyebrow">Stats</p>
        <h2>{mode === "daily" ? "Daily performance" : "Classic performance"}</h2>
      </div>

      <div className="stats-grid">
        <StatItem label="Played" value={stats.gamesPlayed} />
        <StatItem label="Wins" value={stats.wins} />
        <StatItem label="Losses" value={stats.losses} />
        <StatItem label="Avg score" value={stats.averageScore} />
        <StatItem label="Best score" value={stats.bestScore} />
        <StatItem label="Best time" value={stats.bestTime ?? "—"} />

        {mode === "daily" && (
          <>
            <StatItem label="Current streak" value={stats.currentStreak} />
            <StatItem label="Max streak" value={stats.maxStreak} />
          </>
        )}
      </div>
    </section>
  );
}

function StatItem({ label, value }) {
  return (
    <div className="stat-item">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export default App;