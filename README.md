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

## License

MIT
