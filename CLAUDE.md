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

**Browser requirement:** Chrome only — Web Speech API (`SpeechRecognition`) and Web Audio API require Chrome.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React + TypeScript + Vite |
| Styling | Tailwind CSS + shadcn/ui |
| Audio input | Web Audio API (MediaRecorder) |
| STT | Web Speech API (`SpeechRecognition`) — Chrome 내장, 실시간, 한국어 지원 |
| TTS | Web Speech API (`SpeechSynthesis`) — AI 캐릭터 발화 |
| Pitch analysis | Web Audio API DSP — pitch contour 추출 및 비교 |
| 2D Avatar | SVG 기반 커스텀 캐릭터 (idle / listening / thinking / talking 상태) |
| Data | 로컬 정적 파일 (JSON, 이미지) + 인터넷 연결 허용 |

## Architecture

```
src/
  components/        — React UI components
    HomeScreen.tsx       — 시나리오 선택 화면 (shadcn/ui 기반 그리드)
    RoleplayScreen.tsx   — 비주얼 노벨 스타일 롤플레이 화면 (아바타 + 대화 박스)
    FeedbackScreen.tsx   — 발음·표현 피드백 화면
    AvatarCharacter.tsx  — SVG 2D 아바타 캐릭터
    PitchGraph.tsx       — Canvas 기반 음조 비교 그래프
  data/
    scenarios.ts         — 시나리오 데이터 (병원, 은행, 관공서)
  modules/
    audio.ts         — MediaRecorder 래퍼 (AudioRecorder 클래스)
    stt.ts           — Web Speech API SpeechRecognition → transcript
    tts.ts           — Web Speech API SpeechSynthesis (AI 캐릭터 발화)
    expressionEval.ts — transcript vs. targetExpressions / keywords 평가
    pitchAnalysis.ts  — F0 pitch contour 추출 및 레퍼런스 비교
    conversation.ts   — 대화 히스토리 관리
public/
  images/            — 상황별 배경 이미지 (hospital, bank, government)
  audio/             — 레퍼런스 오디오 (음조 비교용, 미준비)
```

**Screen flow:** `Home` → user picks scenario → `Roleplay` (mic input loop) → `Feedback` → retry or back to Home.

## Screen Flow

```
Home (시나리오 선택)
  └─ RoleplayScreen (비주얼 노벨 스타일)
       ├─ AI 캐릭터가 aiText를 TTS로 발화 (SpeechSynthesis)
       ├─ 사용자 마이크 입력 → Web Speech API → 실시간 transcript
       ├─ transcript vs. targetExpressions 평가 → 스텝 진행
       └─ 마지막 스텝 완료 → FeedbackScreen
```

## Processing Pipeline

Single utterance → two parallel paths → unified feedback:

```
Mic input (MediaRecorder)
  ├─ [STT path]   Web Speech API SpeechRecognition → 실시간 transcript
  │                  → expressionEval → match score, missing keywords
  └─ [Pitch path] Web Audio API → F0 pitch contour → reference 비교
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

## Data Assets

- `public/images/` — 상황별 배경 이미지 (hospital.png, bank.png, government.png)
- `public/audio/` — 레퍼런스 오디오 (음조 비교 기준선, 미준비 — Google TTS로 생성 예정)
- 시나리오 데이터: `src/data/scenarios.ts` (JSON 아닌 TypeScript 정적 데이터)

## Key Implementation Notes

- **STT**: Web Speech API `SpeechRecognition` 사용. Chrome 내장이므로 모델 다운로드 불필요, 실시간 인식 가능. 인터넷 연결 필요 (Google 음성인식 서버 사용).
- **TTS**: Web Speech API `SpeechSynthesis` 사용. AI 캐릭터 발화에 활용.
- **롤플레이 UI**: 비주얼 노벨 스타일 — 배경 이미지 풀스크린, SVG 아바타 중앙 배치, 하단 반투명 대화 박스.
- **아바타 상태**: `idle | listening | thinking | talking` — TTS/STT 상태에 따라 자동 전환.
- **Pitch normalization**: 사용자와 레퍼런스 pitch contour를 log2 스케일 + z-score 정규화 후 비교.
- **누적 점수**: 롤플레이 전 스텝의 표현 점수를 평균내어 최종 FeedbackScreen에 전달.
