// QVAC Time-Block Schedule Suggester — core logic.
// Given the user's tasks for the day and total hours available, suggests a
// time-blocked schedule using ONLY the tasks listed.

import { completion } from "@qvac/sdk";

function looksUnusable(text) {
  if (!text || text.trim().length === 0) return true;
  const bad = ["i cannot", "i can't", "as an ai", "i'm not able", "i am not able"];
  const lower = text.toLowerCase();
  return bad.some((phrase) => lower.includes(phrase));
}

function splitTasks(raw) {
  return raw
    .split(/\n|,(?=\s*[A-Za-z])/)
    .map((s) => s.replace(/^[\s\-*\d.)]+/, "").trim())
    .filter((s) => s.length > 1);
}

function clampHours(raw) {
  const n = parseFloat(raw);
  if (Number.isNaN(n)) return 8;
  return Math.max(1, Math.min(16, n));
}

function significantWords(s) {
  return s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3);
}

function matchOriginalTask(line, remainingTasks) {
  const lineWords = new Set(significantWords(line));
  const lineWordsAll = new Set(line.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
  let best = null;
  let bestScore = 0;
  for (const task of remainingTasks) {
    // A short task (e.g. "gym", "call") can have an empty word list after
    // the length>3 filter, which used to skip it entirely — meaning it
    // could NEVER match any line and always forced the fallback schedule.
    // Fall back to unfiltered words for matching when that happens.
    let taskWords = significantWords(task);
    let words = lineWords;
    if (taskWords.length === 0) {
      taskWords = task.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
      words = lineWordsAll;
    }
    if (taskWords.length === 0) continue;
    const overlap = taskWords.filter((w) => words.has(w)).length;
    const score = overlap / taskWords.length;
    if (score > bestScore) {
      bestScore = score;
      best = task;
    }
  }
  return bestScore >= 0.4 ? best : null;
}

// Parse lines like "9:00-10:30 - Task name" or "Block 1 (1.5h): Task name".
function parseBlocks(text, tasks) {
  const lines = text
    .split("\n")
    // Strip only an actual list marker ("- ", "* ", "1. ", "2) ") from the
    // start of a line — the old broad character-class strip also consumed
    // a bare leading digit, which mangled a line's own clock time (e.g.
    // "9:00-9:30 - Task" lost its leading "9" and became ":00-9:30 - Task").
    .map((l) => l.trim().replace(/^(?:[-*]\s+|\d+[.)]\s+)/, "").trim())
    .filter((l) => l.length > 1);

  const remaining = [...tasks];
  const blocks = [];
  for (const line of lines) {
    // Require whitespace around the separator so a hyphenated task (e.g.
    // "Review sign-up flow") doesn't get mis-split mid-word.
    const m = line.match(/^(.+?)\s[-–—:]\s(.+)$/);
    if (!m) continue;
    const timePart = m[1].trim();
    const taskPart = m[2].trim();
    const matched = matchOriginalTask(taskPart, remaining);
    if (!matched) continue;
    blocks.push({ time: timePart, task: matched });
    remaining.splice(remaining.indexOf(matched), 1);
  }
  return { blocks, remaining };
}

// Deterministic even split of hours across tasks as a safe fallback.
function fallbackSchedule(tasks, hours) {
  const perTask = hours / tasks.length;
  let cursor = 0;
  return tasks.map((task) => {
    const start = cursor;
    const end = cursor + perTask;
    cursor = end;
    return { time: `${formatHour(start)}–${formatHour(end)}`, task };
  });
}

function formatHour(h) {
  const totalMinutes = Math.round(h * 60);
  const hh = Math.floor(totalMinutes / 60);
  const mm = totalMinutes % 60;
  return `${hh}:${mm.toString().padStart(2, "0")}`;
}

export async function buildSchedule(modelId, body) {
  const raw = (body.tasks || "").trim();
  const hoursRaw = (body.hours || "").trim();
  if (!raw) {
    const err = new Error("Please list your tasks for the day first.");
    err.statusCode = 400;
    throw err;
  }
  const tasks = splitTasks(raw);
  if (tasks.length === 0) {
    const err = new Error("Please list at least one task.");
    err.statusCode = 400;
    throw err;
  }
  const hours = clampHours(hoursRaw || "8");

  const run = completion({
    modelId,
    history: [
      {
        role: "system",
        content:
          "You build time-blocked daily schedules. Given a list of the " +
          "person's ACTUAL tasks and total hours available, assign each task " +
          "a time block that fits within the total hours, in a sensible " +
          'order. Reply one per line as "START–END - Task text" (24-hour or ' +
          "simple hour format). Use ONLY the exact tasks given — never invent " +
          "new tasks, never drop one. No preamble.",
      },
      {
        role: "user",
        content: "Tasks: Write project proposal, Team standup, Review pull requests, Deep work on feature X. Hours available: 6",
      },
      {
        role: "assistant",
        content:
          "9:00–9:30 - Team standup\n" +
          "9:30–11:00 - Deep work on feature X\n" +
          "11:00–12:30 - Write project proposal\n" +
          "12:30–13:30 - Review pull requests",
      },
      { role: "user", content: `Tasks: ${tasks.join(", ")}. Hours available: ${hours}` },
    ],
    stream: true,
    completionOpts: { temperature: 0.4, maxTokens: 320 },
  });

  let text = "";
  for await (const token of run.tokenStream) text += token;
  text = text.trim().replace(/^here'?s[^:\n]*:\s*/i, "").trim();

  let schedule = [];
  if (!looksUnusable(text)) {
    const parsed = parseBlocks(text, tasks);
    if (parsed.remaining.length === 0) schedule = parsed.blocks;
  }
  if (schedule.length !== tasks.length) schedule = fallbackSchedule(tasks, hours);

  return { tasks, hours, schedule };
}
