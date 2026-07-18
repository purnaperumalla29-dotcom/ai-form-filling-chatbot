document.addEventListener('DOMContentLoaded', () => {
  const usernameInput = document.getElementById('username');
  const fillBtn = document.getElementById('fillBtn');
  const clearBtn = document.getElementById('clearBtn');
  const statusText = document.getElementById('statusText');
  const autoFillToggle = document.getElementById('autoFillToggle');

  // Tabs Selectors
  const btnProfileTab = document.getElementById('btnProfileTab');
  const btnVoiceTab = document.getElementById('btnVoiceTab');
  const profileTab = document.getElementById('profileTab');
  const voiceTab = document.getElementById('voiceTab');

  // Voice Assistant UI Selectors
  const voiceStartBtn = document.getElementById('voiceStartBtn');
  const voiceStopBtn = document.getElementById('voiceStopBtn');
  const transcriptBox = document.getElementById('transcriptBox');
  const reviewContainer = document.getElementById('reviewContainer');
  const voiceFillBtn = document.getElementById('voiceFillBtn');
  const voiceLangSelect = document.getElementById('voiceLangSelect');

  // Global storage for dynamic form fields detected on active page
  let detectedPageFields = [];

  // Load last used username, auto-fill state, and voice language selection
  chrome.storage.local.get(['lastUsername', 'autoFillEnabled', 'voiceLang'], (result) => {
    if (result.lastUsername) {
      usernameInput.value = result.lastUsername;
    }
    autoFillToggle.checked = result.autoFillEnabled !== false;
    if (result.voiceLang && voiceLangSelect) {
      voiceLangSelect.value = result.voiceLang;
    }
  });

  // Save auto-fill state on change
  autoFillToggle.addEventListener('change', (e) => {
    chrome.storage.local.set({ autoFillEnabled: e.target.checked });
  });

  if (voiceLangSelect) {
    voiceLangSelect.addEventListener('change', (e) => {
      chrome.storage.local.set({ voiceLang: e.target.value });
    });
  }

  // Tabs Event Handlers
  btnProfileTab.addEventListener('click', () => {
    btnProfileTab.classList.add('active');
    btnVoiceTab.classList.remove('active');
    profileTab.classList.remove('d-none');
    voiceTab.classList.add('d-none');
    statusText.textContent = 'Enter username and click Fill.';
    statusText.style.color = '#94a3b8';
  });

  btnVoiceTab.addEventListener('click', () => {
    btnVoiceTab.classList.add('active');
    btnProfileTab.classList.remove('active');
    voiceTab.classList.remove('d-none');
    profileTab.classList.add('d-none');
    statusText.textContent = 'Click Start to speak your profile.';
    statusText.style.color = '#94a3b8';
  });

  // If opened in a tab with #request-mic, request permission directly
  if (window.location.hash === '#request-mic') {
    navigator.mediaDevices.getUserMedia({ audio: true })
      .then((stream) => {
        stream.getTracks().forEach(track => track.stop());
        statusText.textContent = 'Microphone permission granted! You can now close this tab.';
        statusText.style.color = '#10b981';
      })
      .catch((err) => {
        console.error('Permission request failed:', err);
        statusText.textContent = 'Please click "Allow" on the microphone prompt at the top-left.';
        statusText.style.color = '#ef4444';
      });
  }

  // Standard Profile Autofill click handler - Now fully unified and advanced!
  fillBtn.addEventListener('click', async () => {
    const username = usernameInput.value.trim();
    if (!username) {
      statusText.textContent = 'Please enter a username.';
      statusText.style.color = '#ef4444';
      return;
    }

    chrome.storage.local.set({ lastUsername: username });
    statusText.textContent = 'Fetching profile details...';
    statusText.style.color = '#94a3b8';

    try {
      const response = await fetch(`http://localhost:3000/api/extension/data/${username}`);
      if (!response.ok) {
        throw new Error('Profile not found or server offline.');
      }

      const data = await response.json();
      if (Object.keys(data).length === 0) {
        statusText.textContent = 'No saved details found for this user.';
        statusText.style.color = '#f59e0b';
        return;
      }

      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) {
        statusText.textContent = 'Cannot access current page.';
        statusText.style.color = '#ef4444';
        return;
      }

      statusText.textContent = 'Scanning fields...';
      statusText.style.color = '#6366f1';

      // 1. Scan the current webpage inputs (standard + Google Forms widgets)
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: scanPageFieldsToExtract
      });
      const pageFields = (results && results[0]) ? results[0].result : [];

      // 2. Map profile database values to form labels using advanced semantic synonyms matcher
      const fillData = [];
      pageFields.forEach(field => {
        const val = findProfileValueForLabel(data, field.label);
        if (val !== null && val !== undefined) {
          fillData.push({
            label: field.label,
            value: String(val),
            inputs: field.inputs
          });
        }
      });

      statusText.textContent = 'Filling form...';
      statusText.style.color = '#6366f1';

      // 3. Inject and execute the unified index-based fill script on the page
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: fillFormOnPageByIndexWrapper,
        args: [fillData]
      });

      statusText.textContent = 'Form filled successfully!';
      statusText.style.color = '#10b981';

    } catch (err) {
      console.error(err);
      statusText.textContent = err.message || 'Error occurred.';
      statusText.style.color = '#ef4444';
    }
  });

  // Physical Clear button event handler
  clearBtn.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;

    statusText.textContent = 'Clearing webpage form...';
    statusText.style.color = '#94a3b8';

    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: clearFormOnPageWrapper
      });
      statusText.textContent = 'Form cleared successfully!';
      statusText.style.color = '#10b981';
    } catch (err) {
      console.error(err);
      statusText.textContent = 'Clearing failed.';
      statusText.style.color = '#ef4444';
    }
  });

  // Voice Recognition Handler
  let isRecording = false;
  let speechRecognition = null;
  let finalTranscript = '';
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (SpeechRecognition) {
    voiceStartBtn.addEventListener('click', async () => {
      isRecording = true;
      finalTranscript = '';
      voiceStartBtn.disabled = true;
      voiceStopBtn.disabled = false;
      voiceStartBtn.classList.add('recording');
      voiceStartBtn.textContent = 'Recording...';
      transcriptBox.textContent = 'Listening... Speak your details clearly.';

      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab) {
        try {
          // Immediately scan active webpage fields (now including role="radio" and role="checkbox")
          const results = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: scanPageFieldsToExtract
          });
          detectedPageFields = (results && results[0]) ? results[0].result : [];
          renderInitialPageFields(detectedPageFields);
        } catch (e) {
          console.error('[Popup Scan Error]:', e);
        }
      }

      speechRecognition = new SpeechRecognition();
      speechRecognition.continuous = true;
      speechRecognition.interimResults = true;
      speechRecognition.lang = voiceLangSelect ? voiceLangSelect.value : 'en-US';

      speechRecognition.onresult = (event) => {
        let currentTranscript = '';
        for (let i = 0; i < event.results.length; ++i) {
          currentTranscript += event.results[i][0].transcript;
        }
        transcriptBox.textContent = (finalTranscript + ' ' + currentTranscript).trim();
      };

      speechRecognition.onerror = (err) => {
        console.error('[Popup Speech Error]:', err.error);
        if (err.error === 'not-allowed') {
          chrome.tabs.create({ url: chrome.runtime.getURL('popup.html#request-mic') });
          statusText.textContent = 'Opening permission tab... Click "Allow" at the top-left.';
          statusText.style.color = '#f59e0b';
          stopRecording();
        }
      };

      speechRecognition.onend = () => {
        if (isRecording) {
          // Accumulate captured text to prevent erasure when the new session begins
          const currentText = transcriptBox.textContent.trim();
          if (currentText && currentText !== 'Listening... Speak your details clearly.') {
            finalTranscript = currentText;
          }
          console.log('[Popup Speech] Auto-restarting recognition after pause...');
          setTimeout(() => {
            try {
              if (isRecording) speechRecognition.start();
            } catch (e) {
              console.error('Failed to auto-restart recognition:', e);
            }
          }, 300);
        }
      };

      speechRecognition.start();
    });

    voiceStopBtn.addEventListener('click', stopRecording);
  } else {
    voiceStartBtn.disabled = true;
    voiceStartBtn.textContent = 'Voice Speech Not Supported';
  }

  async function stopRecording() {
    if (!isRecording) return;
    isRecording = false;
    voiceStartBtn.disabled = false;
    voiceStopBtn.disabled = true;
    voiceStartBtn.classList.remove('recording');
    voiceStartBtn.textContent = '🎤 Start Voice Filling';

    if (speechRecognition) {
      speechRecognition.stop();
    }

    let text = transcriptBox.textContent.trim();
    if (!text || text.startsWith('Listening') || text.startsWith('Click Start')) {
      transcriptBox.textContent = 'No transcript captured. Try again.';
      return;
    }

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;

    const cleanText = text.toLowerCase().trim();

    // 1. Dynamic Voice Command: Clear Form
    if (cleanText === 'clear form' || cleanText === 'reset form') {
      transcriptBox.textContent = 'Voice Command Detected: Clearing form...';
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: clearFormOnPageWrapper
        });
        statusText.textContent = 'Form cleared via voice command!';
        statusText.style.color = '#10b981';
      } catch (err) {
        console.error(err);
      }
      return;
    }

    const selectedLang = voiceLangSelect ? voiceLangSelect.value : 'en-US';

    // If speaking in a non-English language, translate it to English first
    if (selectedLang !== 'en-US') {
      transcriptBox.innerHTML = '<span style="color: #f59e0b;"><i class="fa-solid fa-spinner fa-spin me-2"></i>Translating speech to English...</span>';
      try {
        const transResponse = await fetch('http://localhost:3000/api/translate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, sourceLang: selectedLang })
        });
        
        if (transResponse.ok) {
          const transResult = await transResponse.json();
          text = transResult.translation;
          console.log('[Popup Translate] Spoken text translated to English:', text);
        } else {
          console.warn('[Popup Translate] Translation failed, using original transcript.');
        }
      } catch (err) {
        console.error('[Popup Translate Error]:', err);
      }
    }

    transcriptBox.innerHTML = '<span style="color: #38bdf8;">Extracting entities via AI...</span>';
    
    try {
      const fieldsList = detectedPageFields.map(f => f.label);

      // Fetch extracted entities specifically matching those page fields
      const response = await fetch('http://localhost:3000/api/voice-extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, fields: fieldsList })
      });
      
      if (response.ok) {
        const result = await response.json();
        transcriptBox.textContent = text;
        updateExtractedFieldsDynamic(result.data.entities, result.data.confidence);
      } else {
        transcriptBox.textContent = 'Failed to extract: Server error.';
      }
    } catch (err) {
      console.error('[Voice Extract request failure]:', err);
      transcriptBox.textContent = 'Failed: Offline or server unreachable.';
    }
  }

  function renderInitialPageFields(pageFields) {
    reviewContainer.innerHTML = '';
    
    if (pageFields.length === 0) {
      reviewContainer.innerHTML = `
        <div style="text-align: center; color: #94a3b8; font-size: 11px; padding: 25px 0;">
          No input fields detected on the active webpage.
        </div>
      `;
      return;
    }

    pageFields.forEach((field, index) => {
      const row = document.createElement('div');
      row.className = 'review-row';
      row.innerHTML = `
        <div class="label-row">
          <label style="font-size: 10px; color: #94a3b8;">${field.label}</label>
          <span class="confidence-badge low" style="background: rgba(148, 163, 184, 0.15); color: #94a3b8;">Waiting...</span>
        </div>
        <input type="text" class="review-input" data-group-index="${index}" value="" placeholder="Speak to fill..." style="padding: 4px 8px; font-size: 11px;">
      `;
      reviewContainer.appendChild(row);
    });
  }

  function updateExtractedFieldsDynamic(entities, confidence) {
    const inputs = reviewContainer.querySelectorAll('.review-input');
    inputs.forEach(input => {
      const groupIndex = parseInt(input.getAttribute('data-group-index'), 10);
      const field = detectedPageFields[groupIndex];
      if (field) {
        const val = entities[field.label] !== null && entities[field.label] !== undefined ? entities[field.label] : '';
        const conf = confidence[field.label] !== null && confidence[field.label] !== undefined ? confidence[field.label] : 0;
        
        input.value = val;
        
        // Find confidence badge for this row
        const badge = input.previousElementSibling.querySelector('.confidence-badge');
        if (badge) {
          badge.textContent = `${conf}% Conf`;
          badge.className = 'confidence-badge'; // reset
          if (conf >= 80) badge.classList.add('high');
          else if (conf >= 50) badge.classList.add('medium');
          else badge.classList.add('low');
          badge.style.background = ''; // reset waiting style
          badge.style.color = '';
        }
      }
    });

    voiceFillBtn.disabled = false;
  }

  // Voice fill execution click handler (fills by exact DOM index)
  voiceFillBtn.addEventListener('click', async () => {
    const inputs = reviewContainer.querySelectorAll('.review-input');
    const fillData = [];
    inputs.forEach(input => {
      const groupIndex = parseInt(input.getAttribute('data-group-index'), 10);
      const field = detectedPageFields[groupIndex];
      if (field) {
        fillData.push({
          label: field.label,
          value: input.value.trim(),
          inputs: field.inputs
        });
      }
    });

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) {
      statusText.textContent = 'Cannot access current page.';
      statusText.style.color = '#ef4444';
      return;
    }

    statusText.textContent = 'Filling webpage form...';
    statusText.style.color = '#6366f1';

    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: fillFormOnPageByIndexWrapper,
        args: [fillData]
      });

      statusText.textContent = 'Page fields filled successfully!';
      statusText.style.color = '#10b981';
    } catch (err) {
      console.error(err);
      statusText.textContent = 'Filling failed.';
      statusText.style.color = '#ef4444';
    }
  });

  // Advanced semantic synonyms matcher mapping profile properties to form labels
  function findProfileValueForLabel(profileData, label) {
    const cleanLabel = label.toLowerCase().replace(/[^a-z0-9]/g, '');
    
    const synonymsMap = {
      fullName: ['fullname', 'name', 'fname', 'username', 'candidate', 'studentname', 'nameofthecandidate', 'candidatefullname'],
      registerNumber: ['registernumber', 'regno', 'rollnumber', 'rollno', 'register', 'roll', 'reg'],
      email: ['email', 'emailid', 'mail', 'emailaddress'],
      phone: ['phone', 'mobile', 'tel', 'contact', 'phonenumber', 'mobilenumber', 'contactnumber'],
      address: ['address', 'location', 'street', 'residence'],
      dob: ['dob', 'dateofbirth', 'birthdate', 'birth'],
      gender: ['gender', 'sex'],
      collegeName: ['collegename', 'college', 'university', 'school', 'institute', 'institution'],
      degree: ['degree', 'course', 'branch', 'qualification', 'study'],
      skills: ['skills', 'tech', 'technicalskills', 'technologies'],
      experience: ['experience', 'exp', 'years'],
      companyName: ['companyname', 'company', 'employer', 'workplace'],
      city: ['city', 'town'],
      country: ['country', 'nation'],
      position: ['position', 'role', 'applied', 'job', 'appliedposition', 'appliedrole'],
      department: ['department', 'dept', 'branchofstudy'],
      yearOfStudy: ['yearofstudy', 'year', 'yearofstudy*', 'studyyear'],
      facultyName: ['facultyname', 'faculty', 'oracleacademyfaculty', 'mentor', 'teacher'],
      rating: ['rating', 'servicerating', 'score', 'feedbackrating'],
      comments: ['comments', 'feedbackcomments', 'comment', 'feedback', 'message', 'suggestion'],
      recommend: ['recommend', 'recommendtoothers', 'recommendation', 'recommend?']
    };

    // 1. Direct normalized key matching
    for (const [key, val] of Object.entries(profileData)) {
      const cleanKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (cleanLabel === cleanKey) return val;
    }

    // 2. Synonyms mapping check
    for (const [profileKey, synonyms] of Object.entries(synonymsMap)) {
      const val = profileData[profileKey];
      if (val !== undefined && val !== null) {
        const isSynonymMatch = synonyms.some(syn => cleanLabel.includes(syn) || syn.includes(cleanLabel));
        if (isSynonymMatch) return val;
      }
    }

    // 3. Substring key matching fallback
    for (const [key, val] of Object.entries(profileData)) {
      const cleanKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (cleanKey.length > 2 && (cleanLabel.includes(cleanKey) || cleanKey.includes(cleanLabel))) {
        return val;
      }
    }

    return null;
  }
});

/**
 * Scans active webpage input fields (including Google Forms custom radios/checkboxes/dropdown listboxes).
 * Runs in target page context.
 */
function scanPageFieldsToExtract() {
  const elements = document.querySelectorAll('input, select, textarea, [role="radio"], [role="checkbox"], [role="listbox"]');
  const groups = [];
  
  elements.forEach((el, index) => {
    // Skip hidden/unfillable elements
    if (el.disabled || el.type === 'hidden' || el.type === 'submit' || el.type === 'button' || el.type === 'file') return;
    
    // Skip option elements belonging to dropdowns
    if (el.getAttribute('role') === 'option') return;
    
    // Skip standard radio/checkboxes that Google Forms hides behind its custom styled div widgets
    if ((el.type === 'radio' || el.type === 'checkbox') && el.style.display === 'none') return;
    
    const name = el.name || '';
    const id = el.id || '';
    const placeholder = el.placeholder || '';
    const ariaLabel = el.getAttribute('aria-label') || '';
    
    // Sibling label text matching
    let labelText = '';
    if (el.id) {
      const labelEl = document.querySelector(`label[for="${el.id}"]`);
      if (labelEl) labelText = labelEl.innerText.trim();
    }

    // Resolve Google Forms question card labels
    let containerText = '';
    let questionTitle = '';
    const container = el.closest('.Qr7Oae') || 
                      el.closest('.MocG8c') || 
                      el.closest('.geS5ne') || 
                      el.closest('.freebirdFormviewerComponentsQuestionBaseRoot') || 
                      el.closest('[role="listitem"]') || 
                      el.closest('form > div') || 
                      el.parentElement;
    if (container) {
      // Look for Google Forms specific title elements first
      const titleEl = container.querySelector('.M7eMe') || 
                      container.querySelector('.freebirdFormviewerComponentsQuestionBaseHeaderTitle') ||
                      container.querySelector('[role="heading"]') ||
                      container.querySelector('.exportHeaderTitle') ||
                      container.querySelector('.F4OMF');
      if (titleEl) {
        questionTitle = titleEl.innerText.trim();
      }
      containerText = container.innerText.trim().split('\n')[0].replace(/\*/g, '').trim();
    }
    
    // Resolve choice widget type
    const roleAttr = el.getAttribute('role');
    const isChoiceWidget = roleAttr === 'radio' || roleAttr === 'checkbox' || el.type === 'radio' || el.type === 'checkbox' || roleAttr === 'listbox';

    // Prioritize direct properties first before resolving parent container text blocks
    // CRITICAL: Choice widgets (radios, checkboxes, dropdowns) use their aria-label to hold their option value (data),
    // so we must skip using their aria-label for the question name card!
    let finalLabel = '';
    if (isChoiceWidget) {
      finalLabel = (questionTitle || containerText || '').trim();
    } else {
      finalLabel = (ariaLabel || labelText || questionTitle || containerText || placeholder || name || id || '').trim();
    }

    if (!finalLabel) return; 
    
    // Determine option label for radios, checkboxes, and listboxes
    let optionLabel = '';
    if (roleAttr === 'radio' || roleAttr === 'checkbox' || el.type === 'radio' || el.type === 'checkbox') {
      const optionContainer = el.closest('.freebirdFormviewerComponentsQuestionRadioOption') || 
                              el.closest('.appsMaterialWflowTv12McR3aee') || 
                              el.closest('label') || 
                              el.parentElement;
      if (optionContainer) {
        optionLabel = optionContainer.innerText.trim();
      }
      if (!optionLabel) {
        optionLabel = el.value || '';
      }
    }
    
    let group = groups.find(g => g.label === finalLabel);
    if (!group) {
      group = {
        label: finalLabel,
        inputs: []
      };
      groups.push(group);
    }
    
    group.inputs.push({
      index, 
      optionLabel: optionLabel.trim(),
      role: roleAttr || el.type || el.tagName.toLowerCase()
    });
  });
  
  return groups;
}

/**
 * Populates target form fields by their exact DOM index (fully supports standard inputs, ARIA radios, checkboxes, and listbox dropdowns).
 * Runs in target page context.
 */
function fillFormOnPageByIndexWrapper(fillData) {
  console.log('[FormBot AI] Filling webpage fields by index:', fillData);
  const elements = document.querySelectorAll('input, select, textarea, [role="radio"], [role="checkbox"], [role="listbox"]');
  
  fillData.forEach(item => {
    if (item.value === '' || item.value === null) return;
    
    item.inputs.forEach(inputInfo => {
      const el = elements[inputInfo.index];
      if (!el) return;
      
      const role = inputInfo.role;
      const val = item.value.toLowerCase().trim();
      const optLabel = inputInfo.optionLabel.toLowerCase().trim();
      
      el.focus();
      
      if (role === 'radio' || role === 'checkbox') {
        const isMatch = optLabel === val || 
                        optLabel.includes(val) || 
                        val.includes(optLabel) ||
                        (val.includes('first') && optLabel.includes('1st')) ||
                        (val.includes('second') && optLabel.includes('2nd')) ||
                        (val.includes('third') && optLabel.includes('3rd'));
                        
        if (isMatch) {
          el.click(); 
          if (el.tagName === 'INPUT') {
            el.checked = true;
          }
        }
      } else if (role === 'listbox') {
        // Custom Google Forms Dropdown menu support
        el.click();
        setTimeout(() => {
          const options = document.querySelectorAll('[role="option"], .quantumWizMenuPaperselectOption, .vR13t');
          for (const opt of options) {
            if (opt.innerText.trim().toLowerCase().includes(val)) {
              opt.click();
              break;
            }
          }
        }, 150);
      } else if (el.tagName === 'SELECT') {
        const options = el.options;
        for (let i = 0; i < options.length; i++) {
          const optText = options[i].text.toLowerCase();
          const optVal = options[i].value.toLowerCase();
          if (optText.includes(val) || optVal.includes(val)) {
            el.selectedIndex = i;
            break;
          }
        }
      } else {
        el.value = item.value;
      }
      
      el.classList.add('formbot-filled-highlight');
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.blur();
      
      setTimeout(() => {
        el.classList.remove('formbot-filled-highlight');
      }, 3000);
    });
  });

  // Inject glow style
  if (!document.getElementById('formbot-glow-style')) {
    const style = document.createElement('style');
    style.id = 'formbot-glow-style';
    style.innerHTML = `
      @keyframes formbotFillHighlight {
        0% { outline: 3px solid #38bdf8; box-shadow: 0 0 15px rgba(56, 189, 248, 0.6); }
        50% { outline: 3px solid #10b981; box-shadow: 0 0 15px rgba(16, 185, 129, 0.6); }
        100% { outline: none; box-shadow: none; }
      }
      .formbot-filled-highlight {
        animation: formbotFillHighlight 2.5s ease-out;
      }
    `;
    document.head.appendChild(style);
  }
}

/**
 * Resets all webpage form inputs (fully supports clearing custom Google Forms radio highlights).
 * Runs in target page context.
 */
function clearFormOnPageWrapper() {
  console.log('[FormBot AI] Clearing all form fields...');
  const elements = document.querySelectorAll('input, select, textarea, [role="radio"], [role="checkbox"]');
  elements.forEach(el => {
    if (el.disabled || el.type === 'hidden' || el.type === 'submit' || el.type === 'button') return;
    
    if (el.tagName === 'SELECT') {
      el.selectedIndex = 0;
    } else if (el.type === 'radio' || el.type === 'checkbox' || el.getAttribute('role') === 'radio' || el.getAttribute('role') === 'checkbox') {
      el.checked = false;
      el.setAttribute('aria-checked', 'false');
      // Google Forms specific selected class removal
      const parent = el.closest('.appsMaterialWflowTv12McR3aee');
      if (parent) parent.classList.remove('N21gnd');
    } else {
      el.value = '';
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
}
