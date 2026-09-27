# QVAC Time-Block Schedule Suggester

Enter your tasks for the day and total hours available, and an on-device AI suggests a time-blocked schedule. No cloud call, no API key.

## Run

```bash
npm install
npm start
```

Then open http://localhost:32019

## QVAC SDK version

`@qvac/sdk` ^0.19.0 (see `package.json`).

## How it works

Built on [Tether's QVAC SDK](https://www.npmjs.com/package/@qvac/sdk) — all inference runs on-device, no cloud call, no API key. The app loads `LLAMA_3_2_1B_INST_Q4_0` locally with `loadModel()`, generates with `completion()` (streamed via `tokenStream`), and releases the model with `unloadModel()` on shutdown.

Each time block is matched back to one of your original tasks by word overlap. If the model invents a task or drops one, the app falls back to a deterministic even split of your hours across your original task list.

## Example

Input: `{"tasks":"Write project proposal, Team standup, Review pull requests, Deep work on feature X","hours":"6"}`

`src/logic.js` asks the model for time blocks matched back to your exact tasks by word overlap. The response shape:
```json
{"tasks":["Write project proposal","Team standup","Review pull requests","Deep work on feature X"],
 "hours":6,
 "schedule":[{"time":"...","task":"..."}, ...]}
```
If the model invents a task or drops one, `schedule` falls back to `fallbackSchedule()` in `src/logic.js` — a deterministic even split of the 6 hours across your 4 original tasks in order (e.g. `0:00–1:30`, `1:30–3:00`, ...).

## License

MIT
