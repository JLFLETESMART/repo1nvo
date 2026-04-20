const STORAGE_KEY = "multiplier-rounds";
const OCR_INTERVAL_MS = 3500;
const RECENT_ROUNDS_COUNT = 10;
// Recommend betting only when recent average multiplier stays at or above this level.
const BET_THRESHOLD = 2;
const MIN_ROUNDS_FOR_RECOMMENDATION = 3;
const MAX_DISPLAYED_ROUNDS = 30;

const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const clearBtn = document.getElementById("clearBtn");
const preview = document.getElementById("preview");
const canvas = document.getElementById("captureCanvas");
const lastText = document.getElementById("lastText");
const lastRound = document.getElementById("lastRound");
const recommendation = document.getElementById("recommendation");
const historyList = document.getElementById("history");

const ctx = canvas.getContext("2d", { willReadFrequently: true });

let stream;
let ocrTimer;
let lastSavedValue;
let rounds = loadRounds();

renderHistory();
updateRecommendation();

startBtn.addEventListener("click", startCapture);
stopBtn.addEventListener("click", stopCapture);
clearBtn.addEventListener("click", () => {
  rounds = [];
  lastSavedValue = undefined;
  localStorage.removeItem(STORAGE_KEY);
  renderHistory();
  updateRecommendation();
  lastRound.textContent = "Historial limpiado.";
});

async function startCapture() {
  if (stream) return;
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        frameRate: 8,
      },
      audio: false,
    });

    preview.srcObject = stream;
    await preview.play();

    startBtn.disabled = true;
    stopBtn.disabled = false;

    const track = stream.getVideoTracks()[0];
    track.addEventListener("ended", stopCapture);

    runOCR();
    ocrTimer = setInterval(runOCR, OCR_INTERVAL_MS);
  } catch (error) {
    lastText.textContent = `No se pudo iniciar captura: ${error?.message ?? "error desconocido"}`;
  }
}

function stopCapture() {
  if (!stream) return;
  stream.getTracks().forEach((track) => track.stop());
  stream = undefined;

  if (ocrTimer) {
    clearInterval(ocrTimer);
    ocrTimer = undefined;
  }

  startBtn.disabled = false;
  stopBtn.disabled = true;
}

async function runOCR() {
  if (!preview.videoWidth || !preview.videoHeight) return;

  canvas.width = preview.videoWidth;
  canvas.height = preview.videoHeight;
  ctx.drawImage(preview, 0, 0, canvas.width, canvas.height);

  try {
    const { data } = await Tesseract.recognize(canvas, "eng", {
      // Keep UI clean by disabling OCR progress logs in normal runtime use.
      logger: () => {},
    });

    const normalized = (data?.text || "").replace(/\s+/g, " ").trim();
    lastText.textContent = normalized || "Sin texto legible.";

    const multiplier = extractMultiplier(normalized);
    if (!multiplier) return;

    if (multiplier !== lastSavedValue) {
      rounds.push({
        value: multiplier,
        capturedAt: new Date().toISOString(),
      });
      lastSavedValue = multiplier;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(rounds));
      renderHistory();
      updateRecommendation();
    }

    lastRound.textContent = `${multiplier.toFixed(2)}x`;
  } catch (error) {
    lastText.textContent = `Error al procesar imagen: ${error?.message ?? "error desconocido"}`;
  }
}

function extractMultiplier(text) {
  const match = text.match(/(\d+[.,]?\d*)\s*x/i);
  if (!match) return null;

  const value = Number.parseFloat(match[1].replace(",", "."));
  if (!Number.isFinite(value)) return null;

  return value;
}

function loadRounds() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((entry) => ({
        value: Number(entry.value),
        capturedAt: String(entry.capturedAt || new Date().toISOString()),
      }))
      .filter((entry) => Number.isFinite(entry.value));
  } catch {
    return [];
  }
}

function updateRecommendation() {
  // Base strategy: wait for minimal data, then decide from a short recent average window.
  if (rounds.length < MIN_ROUNDS_FOR_RECOMMENDATION) {
    recommendation.textContent = `Aún sin suficientes rondas (mínimo ${MIN_ROUNDS_FOR_RECOMMENDATION}).`;
    return;
  }

  const recent = rounds.slice(-RECENT_ROUNDS_COUNT);
  const avg = recent.reduce((sum, round) => sum + round.value, 0) / recent.length;

  recommendation.textContent =
    avg >= BET_THRESHOLD
      ? `APOSTAR (promedio reciente: ${avg.toFixed(2)}x)`
      : `NO APOSTAR (promedio reciente: ${avg.toFixed(2)}x)`;
}

function renderHistory() {
  historyList.innerHTML = "";

  if (!rounds.length) {
    const li = document.createElement("li");
    li.textContent = "No hay rondas guardadas todavía.";
    historyList.append(li);
    return;
  }

  rounds
    .slice()
    .reverse()
    .slice(0, MAX_DISPLAYED_ROUNDS)
    .forEach((round) => {
      const li = document.createElement("li");
      const stamp = new Date(round.capturedAt).toLocaleString();
      li.textContent = `${round.value.toFixed(2)}x — ${stamp}`;
      historyList.append(li);
    });
}
