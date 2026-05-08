/**
 * Step 2 발음 연습 분석 — 메인 오케스트레이터
 *
 * 사용자 녹음 Blob + 시나리오/스텝 정보를 받아:
 *   1) 오디오 전처리 (16kHz 모노 PCM)
 *   2) 정답 오디오 로드 (/audio/practice/{scenarioId}_{stepId}_ref.wav)
 *   3) MFCC+DTW / F0Pitch / 속도 병렬 분석
 *   4) 점수 통합 + 한국어 피드백 생성
 */

import type { PronunciationPracticeResult } from '../../types'
import { decodeToMono } from './audioPreprocess'
import { extractMFCC } from './mfccExtract'
import { computeDTW } from './dtw'
import { comparePitch } from './pitchCompare'
import { analyzeSpeed } from './speedAnalysis'
import { generateFeedback } from './scoreCalculator'
import type { MFCCResult, MonoAudio } from './types'

// 정답 오디오 메모리 캐시 (재시도 시 재로드 방지)
const refCache = new Map<string, MonoAudio>()

async function loadReference(scenarioId: string, stepId: number): Promise<MonoAudio | null> {
  const key = `${scenarioId}_${stepId}`
  if (refCache.has(key)) return refCache.get(key)!

  const path = `/audio/practice/${key}_ref.wav`
  try {
    const res = await fetch(path)
    if (!res.ok) {
      console.warn(`[Practice] 정답 오디오 없음: ${path}`)
      return null
    }
    const audio = await decodeToMono(await res.blob())
    refCache.set(key, audio)
    console.log(`[Practice] 정답 오디오 로드 완료: ${path} (${audio.durationSec.toFixed(2)}s)`)
    return audio
  } catch (err) {
    console.warn(`[Practice] 정답 오디오 로드 실패:`, err)
    return null
  }
}

const DTW_THRESHOLD = 2.0

function calcMFCCResult(userFrames: number[][], refFrames: number[][] | null): MFCCResult {
  if (!refFrames || refFrames.length === 0 || userFrames.length === 0) {
    return { score: 0, dtwDistance: Infinity, hasReference: false }
  }
  const dtwDistance = computeDTW(userFrames, refFrames)
  const score = Math.round(100 * Math.max(0, 1 - dtwDistance / DTW_THRESHOLD))
  return { score, dtwDistance, hasReference: true }
}

/**
 * 고려인 한국어 학습자 발음을 분석한다.
 * 분석 항목: MFCC+DTW(발음 방법), F0 피치(음조), 발화 속도
 *
 * @param userBlob   - PracticeModal에서 녹음된 사용자 오디오
 * @param scenarioId - 'hospital' | 'bank' | 'government'
 * @param stepId     - 0, 1, 2, ...
 */
export async function analyzePronunciationPractice(
  userBlob: Blob,
  scenarioId: string,
  stepId: number,
): Promise<PronunciationPracticeResult> {
  const refPath = `/audio/practice/${scenarioId}_${stepId}_ref.wav`
  const startedAt = performance.now()

  // 1. 병렬: 사용자 오디오 디코딩 + 정답 오디오 로드
  const [userAudio, refAudio] = await Promise.all([
    decodeToMono(userBlob),
    loadReference(scenarioId, stepId),
  ])

  console.log(`[Practice] 오디오 준비 완료 (${Math.round(performance.now() - startedAt)}ms)`)

  // 2. 병렬: MFCC, 피치, 속도 분석
  const [mfccResult, pitchResult, speedResult] = await Promise.all([
    // MFCC + DTW — 된소리/평음 등 자음·모음 스펙트럼 비교
    (async () => {
      const userFrames = extractMFCC(userAudio.samples, userAudio.sampleRate)
      const refFrames = refAudio ? extractMFCC(refAudio.samples, refAudio.sampleRate) : null
      return calcMFCCResult(userFrames, refFrames)
    })(),

    // F0 Pitch — 기존 pitchAnalysis.ts 재사용
    comparePitch(userBlob, refAudio ? refPath : null),

    // 발화 속도 — 유성음 프레임 비율
    Promise.resolve(analyzeSpeed(userAudio.samples, refAudio?.samples ?? null)),
  ])

  const totalMs = Math.round(performance.now() - startedAt)
  console.log(
    `[Practice] 분석 완료 (${totalMs}ms) — 발음:${mfccResult.score} 음조:${pitchResult.score} 속도:${speedResult.score}`
  )

  return generateFeedback(mfccResult, pitchResult, speedResult)
}
