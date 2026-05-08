# 2026-05-08 개발 업데이트 — 알이랑 우리랑

> 프로젝트: 고려인 학습자 대상 한국어 발음 교정 웹앱  
> 브랜치: `develop_web`  
> 작업 범위: STT/TTS/LLM 파이프라인 개선, Step 2 발음 연습 기능 전체 설계 및 구현

---

## 1. 전체 아키텍처 개요

```
사용자 발화
  ↓
[Step 1] STT(Modal Whisper) → 텍스트 변환
          LLM(Gemini 2.5-flash) → 상황 적합성 판정 + 피드백 TTS 출력
  ↓
[Step 2] 모달 팝업 → 예시 문장 표시 → 사용자 따라 말하기
          MFCC+DTW / F0 Pitch / 발화 속도 분석 → 3섹션 결과 표시
  ↓
다음 대화 턴 또는 시나리오 종료
```

---

## 2. 완료된 작업 목록

### 2-1. LLM 파이프라인 재설계 (`src/modules/llm.ts`)

**목적**  
기존에는 표현 피드백만 반환하던 LLM 호출을 단일 API 호출로 (1) 표현 피드백과 (2) 발음 오류 수정 텍스트를 동시에 반환하도록 개선. API 호출 횟수 절감 + 발음 의도 추론 기능 추가.

**구현 내용**
- `sendToLLM()` 함수를 `analyzeUtterance()` 로 대체
- 반환 타입: `{ expressionFeedback: string, intendedText: string }`
  - `expressionFeedback`: 표현 적합성 피드백 (20자 이내 한 문장)
  - `intendedText`: STT 발음 오류 수정 후 의도 텍스트 (오류 없으면 원본 그대로)
- JSON 형식 응답 파싱 (마크다운 코드블록 처리 포함)
- 피드백 길이 제한: `"20자 이내 한 문장"` 프롬프트 지시로 TTS 재생 시간 단축

**변경 파일**: `src/modules/llm.ts`

---

### 2-2. LLM 모델 최적화

**목적**  
`gemini-2.5-pro` 사용 시 응답 시간이 9~10초로 너무 느리고, 무료 티어 할당량이 0이라 실질적 유료 호출 문제. 더 빠른 Flash 계열 모델로 교체.

**이력**
- `gemini-2.5-pro` (초기) → 응답 9.2s, 무료 할당량 0
- `gemini-2.0-flash` (교체 시도) → 404 오류: "no longer available to new users"
- `gemini-2.5-flash` (최종 채택) → 응답 ~2s, 무료 티어 지원

**변경 파일**: `src/modules/llm.ts`  
```
GEMINI_MODEL = "gemini-2.5-flash"
```

---

### 2-3. 발화 처리 파이프라인 순서 수정 (`src/components/RoleplayScreen.tsx`)

**목적**  
기존에는 LLM 피드백 TTS 출력 전에 Step 2 모달이 먼저 뜨는 순서 오류 존재. 사용자가 LLM 피드백을 듣기 전에 모달이 표시되어 혼란 발생.

**올바른 순서로 수정**
```
STT 완료
  → LLM 분석 (await)
  → LLM 피드백 TTS 출력 (await, 재생 완료까지 대기)
  → "다음 문장을 읽고 따라 말해보세요" TTS (non-blocking)
  → Step 2 모달 표시 (동시)
  → 사용자가 모달에서 "다음으로"/"건너뛰기" 클릭
  → 다음 대화 턴 진행
```

**변경 파일**: `src/components/RoleplayScreen.tsx`

---

### 2-4. Step 2 모달 UI 구현 (`src/components/PracticeModal.tsx`)

**목적**  
Step 1 상황 적합성 판정 후, 사용자가 예시 문장을 따라 발음 연습을 할 수 있는 별도 모달 UI. 비주얼 노벨 화면 위에 레이어로 올라오는 팝업 형태.

**구현 내용**

| 상태 | 화면 구성 |
|------|---------|
| `prompt` | 예시 문장 큰 글씨 + [건너뛰기] [녹음 시작] 버튼 |
| `recording` | 예시 문장 딤 처리 + [건너뛰기] [녹음 정지 🔴] 버튼 |
| `processing` | 로딩 스피너 + "분석 중..." 오버레이 |
| `result` | 종합 점수(크게) + 3섹션(발음/음조/속도) + [다시 시도] [다음으로] |

**사양**
- 화면 80% 크기, 중앙 배치, z-index 최상위 (`z-50`)
- 뒷배경(Step 1 롤플레이 화면) 딤 처리 유지
- 녹음 토글: 한 번 클릭 → 시작, 다시 클릭 → 종료

**변경 파일**: `src/components/PracticeModal.tsx`

---

### 2-5. Step 2 예시 문장 데이터 (`src/data/practiceUtterances.ts`)

**목적**  
모든 시나리오(병원/은행/관공서)의 모든 대화 턴마다 발음 연습용 예시 문장을 별도 파일로 분리 관리. 코드 변경 없이 문장만 교체 가능하도록 설계.

**고려인 발음 어려움 반영 기준**
- 된소리(ㅃ, ㅉ, ㄲ, ㅆ) vs 평음 구분 — 러시아어에 없는 음운 대비
- ㅓ 모음 — 고려말에서 ㅡ/ㅔ로 발음되는 경향
- 연음화 — 열이→[여리], 많이→[마니]
- ㅚ 이중모음 — 외국인, 쾌유
- ㅊ vs ㅈ 격음 구분

**등록된 문장 (10개)**

| 키 | 문장 | 집중 발음 포인트 |
|----|------|--------------|
| `hospital_0` | 자꾸 배가 아프고 속이 쓰려요. | ㅉ(자꾸), ㅆ(쓰려요) |
| `hospital_1` | 어제 저녁부터 갑자기 심하게 아팠어요. | ㅓ 모음(어제/저녁) |
| `hospital_2` | 열이 나고 머리가 많이 무거워요. | 연음(열이→여리, 많이→마니) |
| `hospital_3` | 감사합니다. 빠른 쾌유를 바랍니다. | ㅃ(빠른), ㅋ(쾌유) |
| `bank_0` | 통장을 새로 만들고 싶어요. | ㅆ(싶어요), ㄷ 연음 |
| `bank_1` | 여기 외국인 등록증 가져왔어요. | ㅚ 이중모음(외국인) |
| `bank_2` | 정말 감사합니다. 덕분에 잘 됐어요. | 됐어요 연음+된소리 |
| `government_0` | 주민등록등본 한 통 뽑아 주세요. | ㅃ(뽑아), 등록 연음 |
| `government_1` | 여기 외국인 등록증 드릴게요. | ㅚ(외국인), ㄷ/ㄹ 연음 |
| `government_2` | 빠른 처리 감사합니다. 수고하세요. | ㅃ(빠른), ㅊ vs ㅈ(처리) |

**변경 파일**: `src/data/practiceUtterances.ts`

---

### 2-6. 정답 오디오 파일 배치 (`public/audio/practice/`)

**목적**  
Step 2 발음 분석에서 사용자 발화와 비교할 정답(레퍼런스) 음성 파일. 직접 녹음 후 지정 경로에 배치.

**파일 목록 (10개)**
```
public/audio/practice/
  hospital_0_ref.wav  hospital_1_ref.wav  hospital_2_ref.wav  hospital_3_ref.wav
  bank_0_ref.wav      bank_1_ref.wav      bank_2_ref.wav
  government_0_ref.wav  government_1_ref.wav  government_2_ref.wav
```

**권장 포맷**: WAV, 16kHz, 모노, 16-bit PCM

---

### 2-7. 모델 로딩 시점 최적화 (`src/App.tsx`, `src/components/RoleplayScreen.tsx`)

**목적**  
기존에는 롤플레이 화면 진입 시 STT/TTS 초기화가 이루어져, 시나리오 진입 후 첫 발화까지 대기 시간 발생. 앱 시작 시 미리 초기화해 시나리오 진입 즉시 사용 가능하도록 개선.

**변경 내용**
- `App.tsx` 마운트 시: `loadWhisper()` + `initVoices()` 호출 (백그라운드 비동기)
- `RoleplayScreen.tsx` 진입 시: `warmUpAudio()`만 호출 (AudioContext 하드웨어 초기화)

**변경 파일**: `src/App.tsx`, `src/components/RoleplayScreen.tsx`

---

### 2-8. Modal STT 서버 콜드 스타트 해결 (`src/modules/stt.ts`, `src/App.tsx`)

**목적**  
Modal Whisper 서버가 유휴 상태에서 잠드는 현상으로 첫 번째 STT 요청이 27초 이상 걸리는 문제. 앱 로드 시 100ms 무음 WAV를 보내 서버를 미리 깨워둠.

**측정 결과 (타이밍 로그 기준)**
- 수정 전: 첫 발화 STT 27,393ms
- 수정 후: 첫 발화 STT 827ms (33배 단축)

**구현 내용**
- `createSilentWav()`: 100ms 무음 WAV Blob 생성 (44바이트 헤더 + PCM 0값)
- `warmUpSTT()`: 앱 로드 시 무음 오디오 POST로 서버 wake-up
- `App.tsx`: `loadWhisper().then(() => warmUpSTT())` 체인 호출

**변경 파일**: `src/modules/stt.ts`, `src/App.tsx`

---

### 2-9. 발화 파이프라인 타이밍 로그 (`src/components/RoleplayScreen.tsx`, `src/modules/tts.ts`)

**목적**  
"사용자 발화 후 다음 단계까지 20초 걸린다"는 체감 문제를 정량 분석하기 위해 각 구간 소요 시간을 측정. 로그를 통해 병목 구간 식별 후 최적화 방향 결정.

**측정 구간**
- `[CYCLE]`: 전체 사이클 시작
- `[STT_INFER]`: Modal Whisper API 요청~응답
- `[LLM_REQ]`: Gemini API 요청~응답
- `[TTS_NET]`: Google TTS 네트워크 요청~응답 ← `tts.ts` 내부
- `[TTS_PLAY]`: 오디오 재생 시작~종료 ← `tts.ts` 내부
- `[STEP1_TTS]`: Step1 피드백 TTS 전체
- `[STEP2_TTS]`: "다음 문장을 읽고 따라 말해보세요" TTS
- `[MODAL]`: 모달 표시~사용자 닫기
- `[SUMMARY]`: 사이클 요약 (모달 대기 제외)

**측정 결과 (2회 사이클 평균)**

| 구간 | 최적화 전 | 최적화 후 |
|------|---------|---------|
| STT 추론 | 27,393ms (콜드) → 782ms | 827ms (워밍업 후 일정) |
| LLM 판정 | 9,221ms (2.5-pro) | ~2,000ms (2.5-flash 예상) |
| Step1 TTS | 7,162ms (긴 피드백) | ~3,000ms (20자 제한) |
| **총합** | **43,815ms** | **~5,800ms** |

**변경 파일**: `src/components/RoleplayScreen.tsx`, `src/modules/tts.ts`

---

### 2-10. 모델 로딩 완료 로그 (`src/modules/stt.ts`, `src/modules/tts.ts`)

**목적**  
모델 로딩 요청 시점 로그는 있었지만, 실제 완료(입력 수신 준비 완료) 시점 로그 부재. 로딩 완료 타이밍 파악 및 실패 감지를 위해 추가.

**추가된 로그**
- `[STT] 모델 로딩 시작. 서버: ...`
- `[STT] 모델 로딩 완료 (Xms). 입력 수신 준비됨.`
- `[TTS] 음성 목록 로딩 시작.` / 완료
- `[TTS] 오디오 하드웨어 초기화 시작.` / 완료(Xms)
- 실패 시: `console.error('[STT/TTS] ... 실패: ...')`

**변경 파일**: `src/modules/stt.ts`, `src/modules/tts.ts`

---

### 2-11. Step 2 발음 분석 알고리즘 구현 (`src/modules/practice/`)

**목적**  
Step 2(텍스트 보고 따라 말하기)에서 사용자의 발음을 정답 음성과 비교 분석. 고려인 학습자가 어려워하는 된소리·모음·억양·속도를 정량화해 3섹션 피드백 제공.

**알고리즘 구성**

| 알고리즘 | 결과 섹션 | 잡아내는 것 |
|---------|---------|-----------|
| MFCC + DTW | 발음 방법 | 된소리(ㅃ·ㅉ·ㄲ) vs 평음 자음 강도, 모음 정확도 |
| F0 Pitch (pitchAnalysis.ts 재사용) | 음의 높낮이 | 억양 패턴, 문장 끝 음조 처리 |
| 발화 속도 (RMS VAD) | 말의 속도 | 정답 대비 빠름/느림 비율 |

**점수 산출 가중치**
```
overall_score = 발음점수 × 0.50 + 음조점수 × 0.30 + 속도점수 × 0.20
```

**생성된 파일 구조**
```
src/modules/practice/
  types.ts          — MonoAudio, MFCCResult, PitchResult, SpeedResult
  audioPreprocess.ts — WebM → 16kHz 모노 PCM, 무음 트리밍
  mfccExtract.ts    — Meyda.js MFCC 추출 (512 프레임, 13계수)
  dtw.ts            — Dynamic Time Warping 거리 계산
  pitchCompare.ts   — pitchAnalysis.ts 래퍼
  speedAnalysis.ts  — RMS 에너지 기반 유성음 구간 비율
  scoreCalculator.ts — 가중합 + 한국어 피드백 문자열 생성
  index.ts          — 메인 오케스트레이터 (병렬 실행, 레퍼런스 캐시)
```

**설치 패키지**: `meyda` (MFCC 추출용)

**변경/생성 파일**: `src/modules/practice/*`, `src/modules/pronunciationAnalysis.ts`, `src/components/PracticeModal.tsx`, `src/components/RoleplayScreen.tsx`, `src/types/index.ts`

---

### 2-12. Step 2 전체 일반화 (모든 시나리오 × 모든 턴)

**목적**  
초기에는 병원 Step 0 한 곳에만 Step 2 흐름이 연결되어 있었음. 모든 시나리오(병원/은행/관공서)의 모든 대화 턴에서 동일한 Step 1 → Step 2 흐름이 자동으로 동작하도록 일반화.

**구현 방식**
- `practiceUtterances.ts`에 예시 문장 존재 여부(`practiceUtterances[scenarioId_stepId]`)로 Step 2 진입 여부 결정
- 다음 턴 진행은 기존 `step.isLast` 분기 그대로 재사용 (추가 로직 불필요)
- 새 시나리오 또는 새 대화 턴 추가 시: `practiceUtterances.ts`에 키-값 추가 + `public/audio/practice/`에 WAV 파일 추가만 하면 자동 적용

**변경 파일**: `src/data/practiceUtterances.ts`, `src/components/RoleplayScreen.tsx`

---

## 3. 주요 변경 파일 전체 목록

| 파일 | 변경 유형 | 주요 내용 |
|------|---------|---------|
| `src/App.tsx` | 수정 | 앱 시작 시 STT/TTS 미리 로딩, STT 서버 워밍업 |
| `src/modules/stt.ts` | 수정 | 로딩 완료 로그, warmUpSTT() 추가 |
| `src/modules/tts.ts` | 수정 | TTS_NET/TTS_PLAY 타이밍 로그, initVoices 완료 로그 |
| `src/modules/llm.ts` | 수정 | analyzeUtterance() 신규, 모델 2.5-flash 교체, 피드백 20자 제한 |
| `src/modules/pronunciationAnalysis.ts` | 수정 | 스켈레톤 → practice/index.ts 재export |
| `src/modules/practice/types.ts` | 신규 | 내부 인터페이스 |
| `src/modules/practice/audioPreprocess.ts` | 신규 | WebM/WAV → 16kHz 모노 PCM |
| `src/modules/practice/mfccExtract.ts` | 신규 | Meyda.js MFCC 추출 |
| `src/modules/practice/dtw.ts` | 신규 | DTW 거리 계산 |
| `src/modules/practice/pitchCompare.ts` | 신규 | F0 음조 비교 래퍼 |
| `src/modules/practice/speedAnalysis.ts` | 신규 | 발화 속도 분석 |
| `src/modules/practice/scoreCalculator.ts` | 신규 | 점수 통합 + 한국어 피드백 |
| `src/modules/practice/index.ts` | 신규 | 오케스트레이터 |
| `src/components/RoleplayScreen.tsx` | 수정 | Step 2 흐름 연결, 타이밍 로그, enterPracticeMode |
| `src/components/PracticeModal.tsx` | 신규 | Step 2 발음 연습 모달 UI |
| `src/data/scenarios.ts` | 수정 | modelUtterance 필드 제거 (practiceUtterances.ts로 분리) |
| `src/data/practiceUtterances.ts` | 신규 | 시나리오×턴 예시 문장 10개 |
| `src/types/index.ts` | 수정 | PronunciationPracticeResult에 _scores/_raw 선택 필드 추가 |
| `public/audio/practice/*.wav` | 신규 | 정답 오디오 10개 |

---

## 4. 추후 작업 필요 항목

### 🔴 높은 우선순위

#### 4-1. MFCC 알고리즘 직접 구현 (`src/modules/practice/mfccExtract.ts`)
**목적**: Meyda.js 기반 현재 구현은 정확도가 부족함. 고려인 학습자 특유의 된소리/평음 구분을 제대로 잡으려면 직접 구현 필요.  
**작업 내용**:
- 멜 필터뱅크 구성 (삼각 필터 26개 권장)
- 로그 에너지 → DCT → 13~20개 계수 추출
- Delta-MFCC (1차 미분) 추가 — 자음 전이 구간 강조
- 참고 알고리즘: HTK, 스탠퍼드 Speech Processing 강의

#### 4-2. DTW 개선 (`src/modules/practice/dtw.ts`)
**목적**: 현재 기본 DTW는 발화 길이 차이가 클 때 비현실적 정렬을 허용.  
**작업 내용**:
- Sakoe-Chiba band 제약 추가 (윈도우 크기 = max(n,m) × 0.1 권장)
- 프레임 거리 함수를 유클리드 → 코사인 유사도로 교체 검토
- DTW_THRESHOLD(현재 2.0) 실측 캘리브레이션 — 10명 이상 테스트 필요

#### 4-3. Pitch 분석 개선 (`src/modules/practice/pitchCompare.ts`, `src/modules/pitchAnalysis.ts`)
**목적**: 현재 자기상관(ACF) 기반 F0는 단어 단위 발음 오류 감지에 한계. 고려인 특유의 억양 패턴(문장 끝 처리 등)을 잡으려면 음절 단위 분석 필요.  
**작업 내용**:
- YIN 알고리즘으로 F0 검출 정확도 향상 (ACF보다 노이즈 강인)
- 음절 경계 기반 피치 패턴 비교 (현재 프레임 단위)
- `DIVERGE_THRESHOLD`(현재 1.2) 캘리브레이션
- 고려인 특유 억양 오류 패턴 규칙 추가

#### 4-4. 발화 속도 개선 (`src/modules/practice/speedAnalysis.ts`)
**목적**: 현재 RMS 에너지 기반 VAD는 노이즈 환경에서 부정확.  
**작업 내용**:
- F0 기반 유성음 검출로 교체 (`pitchAnalysis.ts`의 `detectF0` 재사용 가능)
- 음절 Onset Detection 추가 → 음절/초 직접 측정
- `naturalRate`(현재 6.0) 및 허용 범위(0.7~1.3) 실측 조정

---

### 🟡 중간 우선순위

#### 4-5. 점수 캘리브레이션 (`src/modules/practice/scoreCalculator.ts`)
**목적**: 현재 가중치(발음 50%, 음조 30%, 속도 20%)와 DTW_THRESHOLD(2.0)는 이론값. 실제 고려인 학습자 데이터로 조정 필요.  
**작업 내용**:
- 10명 이상 학습자 테스트 수집
- 각 항목별 점수 분포 분석
- 가중치 및 임계값 최적화
- 가중치는 현재 함수 인자로 주입 가능한 구조로 설계되어 있음

#### 4-6. Step 2 LLM 피드백 확장 (`src/modules/llm.ts`, `src/modules/practice/index.ts`)
**목적**: 현재 Step 2 결과는 규칙 기반 한국어 피드백. LLM에 수치 데이터를 전달해 더 자연스럽고 맥락적인 피드백 생성.  
**작업 내용**:
- `_raw` 데이터(`dtwDistance`, `pitchDivergentRatio`, `speedRatio`)를 Gemini 프롬프트에 포함
- 예: "DTW 거리 1.85 (임계값 2.0), 음조 발산 20% → 된소리 발음 피드백 1문장 생성"
- `PronunciationPracticeResult._raw` 필드가 이미 확장 준비 완료

#### 4-7. TTS 재생 시간 단축
**목적**: Step 1 LLM 피드백 TTS 재생 시간이 5~6초로 전체 사이클에서 35% 차지. 더 짧은 피드백으로 단축 필요.  
**작업 내용**:
- 현재 프롬프트 "20자 이내 한 문장" 지시 → 실제 출력 확인 후 추가 제한 검토
- 또는 TTS 재생 속도 파라미터(`speakingRate`) 1.0 → 1.2 조정 검토

#### 4-8. 정답 오디오 품질 개선
**목적**: 현재 정답 오디오는 1명 남성 화자 녹음. 고려인 학습자(남녀 혼재)와 음역대 차이로 피치 비교 정확도 저하 가능.  
**작업 내용**:
- 여성 화자 정답 오디오 추가 녹음
- `speakers.json` 기반 화자 선택 구조 도입 (설계 문서 참조)
- 또는 TTS(Google Neural2) 생성 정답 오디오 검토

---

### 🟢 낮은 우선순위 / 장기 과제

#### 4-9. practiceUtterances 예시 문장 최종 확정
**목적**: 현재 문장은 알고리즘 테스트용 초안. 실제 고려인 학습자의 피드백을 받아 최적 문장으로 교체 필요.  
**작업 내용**:
- 알이랑 센터 교사 검토
- 학습자 5명 이상 파일럿 테스트
- `practiceUtterances.ts`에서 값만 교체 (구조 변경 불필요)

#### 4-10. FeedbackScreen 개선
**목적**: 현재 FeedbackScreen은 Step 1 피드백만 표시. Step 2 분석 결과도 포함해 종합 피드백 제공.  
**작업 내용**:
- Step 2 결과(`PronunciationPracticeResult`) 누적 저장
- FeedbackScreen에 발음 연습 결과 섹션 추가
- 시각적 개선: 피치 그래프(`PitchGraph.tsx`) 활용

#### 4-11. STT 모델 교체 검토
**목적**: 현재 Modal Whisper API는 콜드 스타트 워밍업 후 ~800ms로 개선되었지만, 서버 관리 의존성 존재.  
**작업 내용**:
- Whisper.js (브라우저 내 추론) 재검토 — 현재 너무 느리지만 모델 경량화 추세 주시
- 또는 Google Speech-to-Text API 검토 (한국어 정확도 비교)

#### 4-12. 발음 오류 시각화
**목적**: 현재는 텍스트 피드백만 제공. 어느 음절에서 오류가 발생했는지 시각적으로 표시하면 학습 효과 향상.  
**작업 내용**:
- Step 2 결과 화면에서 예시 문장의 문제 음절 하이라이트
- `SyllableError` 타입(`pronunciationAnalysis.ts`)을 활용해 오류 위치 표시
- `PitchGraph.tsx`처럼 Canvas 기반 발음 비교 그래프 추가

---

## 5. 알려진 이슈 및 임시 처리 사항

| 이슈 | 현황 | 비고 |
|------|------|------|
| MFCC 발음 분석 정확도 부족 | TODO 주석으로 마킹, 더미 동작 | 추후 직접 구현 예정 |
| DTW_THRESHOLD 캘리브레이션 미완 | 임시값 2.0 사용 | 실측 데이터 필요 |
| 정답 오디오 화자 1명 (남성) | 현재 사용 중 | 여성 화자 추가 또는 TTS 생성 검토 |
| React StrictMode 이중 초기화 | warmUpSTT 2번 실행되나 idempotent함 | 실기능 영향 없음 |
| gemini-2.5-flash 응답 시간 | 미측정 (404 이슈로 2.5-pro → flash 교체 직후) | 다음 세션에서 타이밍 로그 재측정 필요 |

---

## 6. 개발 환경 참고

```
브라우저: Chrome 전용
실행: npm run dev → http://localhost:5173
외부 API: STT(Modal Whisper), TTS(Google Neural2), LLM(Gemini 2.5-flash)
환경변수: .env.local (GOOGLE_TTS_API_KEY, VITE_GEMINI_API_KEY)
```
