/**
 * Web Speech API SpeechSynthesis wrapper for Text-to-Speech (TTS)
 */

let voices: SpeechSynthesisVoice[] = [];

/**
 * Initialize available voices
 */
export const initVoices = (): Promise<void> => {
  return new Promise((resolve) => {
    const synth = window.speechSynthesis;
    
    const updateVoices = () => {
      voices = synth.getVoices();
      if (voices.length > 0) {
        resolve();
      }
    };

    if (synth.onvoiceschanged !== undefined) {
      synth.onvoiceschanged = updateVoices;
    }
    
    updateVoices();

    // Fallback for browsers stays empty too long
    setTimeout(() => {
      if (voices.length === 0) {
        updateVoices();
      }
      resolve();
    }, 1000);
  });
};

/**
 * Speak text using SpeechSynthesis
 * @param text The text to speak
 * @param onEnd Callback when speech ends
 * @param onStart Callback when speech starts
 */
export const speak = (
  text: string, 
  onEnd?: () => void, 
  onStart?: () => void
): void => {
  const synth = window.speechSynthesis;
  
  // Stop any current speech
  synth.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  
  // Set language to Korean
  utterance.lang = 'ko-KR';
  
  // Try to find a good Korean voice
  const koVoice = voices.find(v => v.lang.includes('ko-KR') || v.lang.includes('ko_KR'));
  if (koVoice) {
    utterance.voice = koVoice;
  }

  utterance.onstart = () => {
    if (onStart) onStart();
  };

  utterance.onend = () => {
    if (onEnd) onEnd();
  };

  utterance.onerror = (event) => {
    console.error('TTS Error:', event);
    if (onEnd) onEnd();
  };

  synth.speak(utterance);
};

/**
 * Stop any ongoing speech
 */
export const stopSpeaking = (): void => {
  window.speechSynthesis.cancel();
};
