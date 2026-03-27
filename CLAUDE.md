# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**알이랑 우리랑** — 시나리오 기반 롤플레잉을 통한 고려인 학습자의 한국어 발음 교정 및 상황별 표현 훈련 웹앱 (Spring 2026 coursework, Team 알이랑 우리랑)

Target users: 고려인(Koryo-in) learners at '알이랑 센터'. Focus on high-difficulty real-life situations (병원, 관공서, 은행) where formal/specialized Korean is required.

Remote: `https://github.com/doisop/2026_1_VoiceRecognition.git`
Active branch: `develop_web` → merge target: `main`

## Running the App

```bash
npm install
npm run dev
# open http://localhost:5173
```

**Browser requirement:** Chrome only — Web Audio API (`AudioWorklet`) and Whisper ONNX inference require Chrome.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React + TypeScript + Vite |
| Styling | Tailwind CSS |
| Audio input | Web Audio API (AudioWorklet, AnalyserNode, MediaRecorder) |
| STT | Whisper ONNX (Small model, ~1.0–1.5 GB VRAM; quantized if needed) |
| Pitch analysis | Web Audio API DSP via AudioWorklet |
| Data | Local static files (JSON, images, audio) — no backend, no DB |

## Architecture

Five-layer local web application (no backend server, no database):

```
src/
  components/        — React UI components (ScenarioSelect, Roleplay, Feedback)
  scenarios/         — Scenario data as JSON files
  modules/
    audio.ts         — Web Audio API setup (AudioWorklet, AnalyserNode, MediaRecorder)
    stt.ts           — Whisper ONNX inference → transcript
    expressionEval.ts — Text matching: transcript vs. target expressions / keywords
    pitchAnalysis.ts  — Pitch contour extraction & comparison with reference
    feedback.ts       — Merges expression + pitch results into unified feedback object
public/
  images/            — Situation background images (hospital, bank, government office)
  audio/             — Reference audio files for pitch comparison (per scenario step)
  models/            — Whisper ONNX model files
```

**Screen flow:** `Home` → user picks scenario → `Roleplay` (mic input loop) → `Feedback` → retry or back to Home.

## Processing Pipeline

Single utterance → two parallel paths → unified feedback:

```
Mic input
  └─ Web Audio API (AudioWorklet)
       ├─ [STT path]   Whisper ONNX → transcript → expression evaluation
       │                  → text feedback (match score, missing keywords)
       └─ [Pitch path] AudioWorklet DSP → pitch contour → compare with reference contour
                          → pitch feedback (intonation graph, error region highlights)
                                    ↓
                          Unified Feedback Screen
                          (expression score + pitch contour overlay graph)
```

## Feedback Design

**Expression evaluation**
- STT transcript compared against: target sentence, core keywords, allowed alternatives
- Output: match score, list of missing/incorrect keywords, closest target expression

**Pitch analysis**
- Extract pitch contour (F0) from AudioWorklet, frame-by-frame
- Normalize both user and reference contours (to handle different vocal ranges)
- Time-align → compare: rising/falling pattern, stress peak position, sentence-final handling
- Output: overlay graph (user vs. reference), highlighted divergent regions, error type label

**Unified feedback object**
```ts
{
  transcript: string,
  expressionScore: number,       // 0–100
  expressionFeedback: string[],  // e.g. ["핵심 표현 누락: '접수하다'"]
  pitchContourUser: number[],
  pitchContourRef: number[],
  pitchFeedback: string,         // e.g. "문장 끝 음조를 조금 낮춰보세요"
  pitchDivergentRegions: [number, number][]  // [startFrame, endFrame][]
}
```

## Scenario Data Format

Each scenario is a JSON file in `src/scenarios/`. Structure:

```json
{
  "id": "hospital",
  "title": "병원",
  "titleSub": "Больница",
  "description": "아플 때 병원에서 말하는 법을 연습해요",
  "difficulty": "초급",
  "image": "images/hospital.png",
  "character": { "name": "이주연 간호사", "role": "병원 접수 담당" },
  "steps": [
    {
      "id": 0,
      "aiText": "안녕하세요! 어디가 불편하세요?",
      "targetExpressions": ["머리가 아파요", "두통이 있어요"],
      "keywords": ["머리", "아파", "두통"],
      "referenceAudio": "audio/hospital_step0_ref.wav",
      "isLast": false
    }
  ]
}
```

## Local Data Assets

- `public/images/` — situation background images
- `public/audio/` — reference audio per scenario step (for pitch comparison baseline)
- `public/models/` — Whisper ONNX model files (`whisper_small.onnx` or quantized variant)

No personal data is collected or stored. All assets are local static files.

## Key Implementation Notes

- **Whisper ONNX**: runs entirely in-browser via `onnxruntime-web`. Target model: `whisper-small` (~1.0–1.5 GB VRAM). Fall back to quantized version if memory is constrained.
- **Pitch normalization**: normalize both user and reference pitch contours before comparison to account for different vocal ranges across speakers.
- **Parallel processing**: STT and pitch analysis run concurrently on the same audio blob; results are merged before rendering the feedback screen.
- **No network dependency**: all inference and data lookup is local — the app must work fully offline after initial load.
