// Speech-to-Text Voice Assistant and Multilingual Translation Coordinator
document.addEventListener('DOMContentLoaded', () => {
  const micBtns = [document.getElementById('voiceMicBtn'), document.getElementById('voiceConsoleMicBtn')];
  const langSelects = [document.getElementById('voiceLangSelect'), document.getElementById('voiceConsoleLangSelect')];
  const statusPanels = [document.getElementById('voiceStatusPanel'), document.getElementById('voiceConsoleStatusPanel')];
  const statusTexts = [document.getElementById('voiceStatusText'), document.getElementById('voiceConsoleStatusText')];
  const confidenceLabels = [document.getElementById('voiceConfidence'), document.getElementById('voiceConsoleConfidence')];
  const recognizedInputs = [document.getElementById('voiceRecognizedInput'), document.getElementById('voiceConsoleRecognizedInput')];
  const translationWrappers = [document.getElementById('voiceTranslationWrapper'), document.getElementById('voiceConsoleTranslationWrapper')];
  const translationTexts = [document.getElementById('voiceTranslationText'), document.getElementById('voiceConsoleTranslationText')];
  const cancelBtns = [document.getElementById('voiceCancelBtn'), document.getElementById('voiceConsoleCancelBtn')];
  const sendBtns = [document.getElementById('voiceSendBtn'), document.getElementById('voiceConsoleSendBtn')];

  const chatInput = document.getElementById('chatInput');
  const sendChatBtn = document.getElementById('sendChatBtn');

  // Check if Web Speech API is supported
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    console.warn('[Voice Assistant] Web Speech API is not supported in this browser.');
    micBtns.forEach(btn => {
      if (btn) {
        btn.setAttribute('title', 'Voice Speech not supported in this browser');
        btn.disabled = true;
      }
    });
    return;
  }

  let recognition = null;
  let isListening = false;

  // Sync the language selectors
  langSelects.forEach(select => {
    if (!select) return;
    select.addEventListener('change', (e) => {
      const val = e.target.value;
      localStorage.setItem('formbot_voice_lang', val);
      langSelects.forEach(s => { if (s) s.value = val; });
    });
  });

  // Enable/Disable mic buttons based on chatInput state
  const observer = new MutationObserver(() => {
    if (chatInput) {
      micBtns.forEach(btn => {
        if (btn) btn.disabled = chatInput.disabled;
      });
    }
  });
  if (chatInput) {
    observer.observe(chatInput, { attributes: true, attributeFilter: ['disabled'] });
  }

  // Bind click event to all mic buttons
  micBtns.forEach(btn => {
    if (!btn) return;
    btn.addEventListener('click', () => {
      if (isListening) {
        stopListening();
      } else {
        startListening();
      }
    });
  });

  // Helper to translate lang code to name
  function getLangName(langCode) {
    switch (langCode) {
      case 'te-IN': return 'Telugu (తెలుగు)';
      case 'hi-IN': return 'Hindi (हिन्दी)';
      case 'ta-IN': return 'Tamil (தமிழ்)';
      default: return 'English';
    }
  }

  function startListening() {
    isListening = true;
    
    // Set UI states for all mics
    micBtns.forEach(btn => {
      if (!btn) return;
      btn.classList.add('listening');
      btn.innerHTML = '<i class="fa-solid fa-stop-circle text-white fa-pulse"></i>';
    });

    statusPanels.forEach(p => { if (p) p.classList.remove('d-none'); });
    
    const selectedLang = langSelects[0] ? langSelects[0].value : 'en-US';
    
    statusTexts.forEach(t => {
      if (t) t.innerHTML = `<i class="fa-solid fa-microphone fa-beat text-danger me-2"></i>Listening... speak in ${getLangName(selectedLang)}`;
    });
    confidenceLabels.forEach(c => { if (c) c.textContent = 'Confidence: 0%'; });
    recognizedInputs.forEach(i => { if (i) i.value = ''; });
    translationWrappers.forEach(w => { if (w) w.classList.add('d-none'); });
    translationTexts.forEach(t => {
      if (t) {
        t.textContent = '';
        t.contentEditable = 'true';
      }
    });

    // Initialize Web Speech API instance
    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = selectedLang;

    recognition.onresult = (event) => {
      let interimTranscript = '';
      let finalTranscript = '';

      for (let i = 0; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
          const confidence = Math.round(event.results[i][0].confidence * 100);
          confidenceLabels.forEach(c => { if (c) c.textContent = `Confidence: ${confidence}%`; });
        } else {
          interimTranscript += event.results[i][0].transcript;
        }
      }

      const activeText = (finalTranscript + interimTranscript).trim();
      console.log("VOICE:", activeText);
      if (activeText) {
        recognizedInputs.forEach(i => { if (i) i.value = activeText; });
      }
    };

    recognition.onerror = (err) => {
      console.error('[Speech Recognition Error]:', err.error);
      if (err.error === 'not-allowed') {
        alert('Microphone permission was denied. Please unlock microphone access in your Chrome settings and try again.');
        cancelListening();
      }
    };

    recognition.onend = () => {
      if (isListening) {
        isListening = false;
        micBtns.forEach(btn => {
          if (!btn) return;
          btn.classList.remove('listening');
          btn.innerHTML = '<i class="fa-solid fa-microphone"></i>';
        });
        handleSpeechFinalized();
      }
    };

    recognition.start();
  }

  function stopListening() {
    if (!isListening) return;
    isListening = false;
    micBtns.forEach(btn => {
      if (!btn) return;
      btn.classList.remove('listening');
      btn.innerHTML = '<i class="fa-solid fa-microphone"></i>';
    });
    
    if (recognition) {
      recognition.stop();
    }
    handleSpeechFinalized();
  }

  async function handleSpeechFinalized() {
    statusTexts.forEach(t => {
      if (t) t.innerHTML = '<i class="fa-solid fa-circle-check text-success me-2"></i>Speech captured. Please review.';
    });
    
    const spokenText = recognizedInputs[0] ? recognizedInputs[0].value.trim() : '';
    if (!spokenText) {
      statusTexts.forEach(t => {
        if (t) t.innerHTML = '<i class="fa-solid fa-circle-exclamation text-warning me-2"></i>No speech detected. Try again.';
      });
      return;
    }

    const selectedLang = langSelects[0] ? langSelects[0].value : 'en-US';
    if (selectedLang !== 'en-US') {
      translationWrappers.forEach(w => { if (w) w.classList.remove('d-none'); });
      translationTexts.forEach(t => {
        if (t) t.innerHTML = '<span class="text-muted"><i class="fa-solid fa-spinner fa-spin me-2"></i>Translating to English...</span>';
      });
      
      try {
        const token = localStorage.getItem('token');
        const res = await fetch('/api/translate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            text: spokenText,
            sourceLang: selectedLang
          })
        });

        const data = await res.json();
        if (res.ok) {
          translationTexts.forEach(t => { if (t) t.textContent = data.translation; });
        } else {
          translationTexts.forEach(t => { if (t) t.innerHTML = `<span class="text-danger">Translation Error: ${data.error || 'Failed to translate'}</span>`; });
        }
      } catch (err) {
        console.error('Translation failure:', err);
        translationTexts.forEach(t => { if (t) t.innerHTML = '<span class="text-danger">Translation network error.</span>'; });
      }
    }
  }

  function cancelListening() {
    isListening = false;
    micBtns.forEach(btn => {
      if (!btn) return;
      btn.classList.remove('listening');
      btn.innerHTML = '<i class="fa-solid fa-microphone"></i>';
    });
    if (recognition) {
      recognition.abort();
    }
    statusPanels.forEach(p => { if (p) p.classList.add('d-none'); });
  }

  // Restore language preference
  const savedLang = localStorage.getItem('formbot_voice_lang');
  if (savedLang) {
    langSelects.forEach(s => { if (s) s.value = savedLang; });
  }

  cancelBtns.forEach(btn => {
    if (btn) btn.addEventListener('click', cancelListening);
  });

  sendBtns.forEach(btn => {
    if (!btn) return;
    btn.addEventListener('click', () => {
      stopListening();
      
      const selectedLang = langSelects[0] ? langSelects[0].value : 'en-US';
      let finalPayloadText = '';
      
      if (selectedLang === 'en-US') {
        finalPayloadText = recognizedInputs[0] ? recognizedInputs[0].value.trim() : '';
      } else {
        finalPayloadText = translationTexts[0] ? translationTexts[0].textContent.trim() : '';
      }

      if (!finalPayloadText || finalPayloadText.startsWith('Translation Error') || finalPayloadText.startsWith('Translating')) {
        alert('Please provide valid speech and ensure translation completes before sending.');
        return;
      }

      chatInput.value = finalPayloadText;
      console.log("VOICE TRANSCRIPT:", finalPayloadText);

window.latestVoiceTranscript = finalPayloadText;s
      statusPanels.forEach(p => { if (p) p.classList.add('d-none'); });
      
      if (typeof window.handleSendMessage === 'function') {
        window.handleSendMessage();
      } else {
        sendChatBtn.click();
      }
    });
  });
});
