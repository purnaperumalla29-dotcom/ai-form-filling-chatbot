// Chat Assistant, Form Selector, and Browser Automation Controller
window.selectedForm = null;
window.extractedData = {};

document.addEventListener('DOMContentLoaded', () => {
  const API_URL = '/api';

  // DOM Elements
  const chatMessages = document.getElementById('chatMessages');
  const chatInput = document.getElementById('chatInput');
  const sendChatBtn = document.getElementById('sendChatBtn');
  const clearChatBtn = document.getElementById('clearChatBtn');
  const typingIndicator = document.getElementById('typingIndicator');
  
  const activeFormBadge = document.getElementById('activeFormBadge');
  const progressPercentage = document.getElementById('progressPercentage');
  const progressFillBar = document.getElementById('progressFillBar');
  const fieldsPreviewContainer = document.getElementById('fieldsPreviewContainer');
  
  const triggerAutofillBtn = document.getElementById('triggerAutofillBtn');
  const downloadReportBtn = document.getElementById('downloadReportBtn');
  const formsGridContainer = document.getElementById('formsGridContainer');

  // -------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------
  function getAuthHeaders() {
    const token = localStorage.getItem('token');
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    };
  }

  function appendMessage(sender, message) {
    const bubble = document.createElement('div');
    bubble.className = `chat-bubble ${sender}`;
    bubble.innerHTML = message;
    chatMessages.appendChild(bubble);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  function showTyping(show) {
    if (show) {
      typingIndicator.classList.remove('d-none');
      chatMessages.scrollTop = chatMessages.scrollHeight;
    } else {
      typingIndicator.classList.add('d-none');
    }
  }

  // -------------------------------------------------------------
  // 1. Fetch and Load Form Templates
  // -------------------------------------------------------------
  async function initializeFormsTab() {
    try {
      const res = await fetch(`${API_URL}/forms`, {
        headers: getAuthHeaders()
      });

      if (!res.ok) throw new Error('Failed to retrieve form schemas.');
      
      const forms = await res.json();
      formsGridContainer.innerHTML = ''; // Clear loading placeholder

      forms.forEach(form => {
        // Build card for each template
        const cardCol = document.createElement('div');
        cardCol.className = 'col-md-4';
        
        // Count total fields in schema
        const fieldsCount = form.fields_schema.length;
        const requiredCount = form.fields_schema.filter(f => f.required).length;

        cardCol.innerHTML = `
          <div class="glass-panel p-4 h-100 glass-card d-flex flex-column justify-content-between">
            <div>
              <div class="d-flex align-items-center mb-3">
                <div class="user-avatar bg-primary text-white me-3" style="width: 45px; height: 45px; border-radius: 10px;">
                  <i class="fa-solid fa-file-signature"></i>
                </div>
                <h5 class="mb-0">${form.form_name}</h5>
              </div>
              <p class="text-muted small">Auto-fill target for AI assistance. Collects applicant info, validates and syncs.</p>
              <ul class="list-unstyled text-muted small mb-4">
                <li><i class="fa-solid fa-circle-check text-accent me-2"></i>Total variables: <b>${fieldsCount}</b></li>
                <li><i class="fa-solid fa-circle-exclamation text-warning me-2"></i>Required parameters: <b>${requiredCount}</b></li>
                <li><i class="fa-solid fa-window-maximize text-success me-2"></i>Browser automated target</li>
              </ul>
            </div>
            <button class="btn btn-primary-custom w-100 py-2 select-form-btn" data-id="${form.id}">
              <i class="fa-solid fa-comments me-2"></i>Start Chat to Fill
            </button>
          </div>
        `;
        
        formsGridContainer.appendChild(cardCol);
      });

      // Bind button events
      document.querySelectorAll('.select-form-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const formId = parseInt(btn.getAttribute('data-id'), 10);
          const selected = forms.find(f => f.id === formId);
          if (selected) {
            selectFormAndStart(selected);
          }
        });
      });

    } catch (err) {
      console.error(err);
      formsGridContainer.innerHTML = `
        <div class="col-12 text-center text-danger py-5">
          <i class="fa-solid fa-triangle-exclamation display-4 mb-3"></i>
          <p>Error loading form templates. Check backend and database connection.</p>
        </div>
      `;
    }
  }

  // Expose function to global scope
  window.initializeFormsTab = initializeFormsTab;

  // -------------------------------------------------------------
  // 2. Select a Form Template and Start Session
  // -------------------------------------------------------------
  async function selectFormAndStart(form) {
    window.selectedForm = form;
    localStorage.setItem('activeForm', JSON.stringify(form));

    // Update Header Badge
    activeFormBadge.textContent = `Form: ${form.form_name}`;

    // Enable inputs
    chatInput.removeAttribute('disabled');
    chatInput.placeholder = `Provide details for ${form.form_name}...`;
    sendChatBtn.removeAttribute('disabled');

    // Fetch current extracted data
    try {
      const dataRes = await fetch(`${API_URL}/forms/data/${form.id}`, {
        headers: getAuthHeaders()
      });
      if (dataRes.ok) {
        window.extractedData = await dataRes.json();
      } else {
        window.extractedData = {};
      }
    } catch (err) {
      console.warn('Failed to fetch extracted data:', err.message);
      window.extractedData = {};
    }

    // Fetch chat history
    try {
      const histRes = await fetch(`${API_URL}/chat/history`, {
        headers: getAuthHeaders()
      });
      if (histRes.ok) {
        const history = await histRes.json();
        chatMessages.innerHTML = '';
        if (history.length === 0) {
          appendMessage('bot', `I've loaded the <b>${form.form_name}</b> schema. Let's begin. Could you please state your full name to start?`);
        } else {
          history.forEach(h => {
            appendMessage(h.sender, h.message);
          });
        }
      }
    } catch (err) {
      console.warn('Failed to fetch chat history:', err.message);
      chatMessages.innerHTML = '';
      appendMessage('bot', `I've loaded the <b>${form.form_name}</b> schema. Let's begin. Could you please state your full name to start?`);
    }

    // Load dynamic data extraction preview pane
    updatePreviewPane();

    // Navigate user to the chatbot tab view
    window.navigateToView('chatView', 'Chat Assistant');
  }

  // Restore session on load
  async function restoreActiveSession() {
    const savedFormStr = localStorage.getItem('activeForm');
    if (!savedFormStr) return;

    try {
      const form = JSON.parse(savedFormStr);
      window.selectedForm = form;
      activeFormBadge.textContent = `Form: ${form.form_name}`;

      // Enable inputs
      chatInput.removeAttribute('disabled');
      chatInput.placeholder = `Provide details for ${form.form_name}...`;
      sendChatBtn.removeAttribute('disabled');

      // Fetch current extracted data
      const dataRes = await fetch(`${API_URL}/forms/data/${form.id}`, {
        headers: getAuthHeaders()
      });
      if (dataRes.ok) {
        window.extractedData = await dataRes.json();
      }

      // Fetch chat history
      const histRes = await fetch(`${API_URL}/chat/history`, {
        headers: getAuthHeaders()
      });
      if (histRes.ok) {
        const history = await histRes.json();
        chatMessages.innerHTML = '';
        if (history.length === 0) {
          appendMessage('bot', `I've loaded the <b>${form.form_name}</b> schema. Let's begin. Could you please state your full name to start?`);
        } else {
          history.forEach(h => {
            appendMessage(h.sender, h.message);
          });
        }
      }

      // Load dynamic data extraction preview pane
      updatePreviewPane();

    } catch (err) {
      console.warn('Failed to restore active session:', err.message);
    }
  }

  // Expose function to global scope
  window.restoreActiveSession = restoreActiveSession;


  // -------------------------------------------------------------
  // 3. Update Extracted Data Preview Panel
  // -------------------------------------------------------------
  function updatePreviewPane() {
    if (!window.selectedForm) return;

    const schema = window.selectedForm.fields_schema;
    const containers = [
      document.getElementById('fieldsPreviewContainer'),
      document.getElementById('voiceFieldsPreviewContainer')
    ];

    containers.forEach(container => {
      if (!container) return;
      
      container.innerHTML = '';
      schema.forEach(field => {
        const card = document.createElement('div');
        const isFilled = window.extractedData[field.name] !== undefined;

        if (isFilled) {
          card.className = 'schema-field-card filled';
          card.innerHTML = `
            <div>
              <div class="schema-field-label text-truncate">${field.label}</div>
              <small class="text-muted text-truncate d-block">${field.name}</small>
            </div>
            <div class="schema-field-value text-truncate" title="${window.extractedData[field.name]}">
              <i class="fa-solid fa-circle-check me-1"></i> ${window.extractedData[field.name]}
            </div>
          `;
        } else {
          card.className = 'schema-field-card';
          card.innerHTML = `
            <div>
              <div class="schema-field-label text-truncate">${field.label} ${field.required ? '<span class="text-danger">*</span>' : ''}</div>
              <small class="text-muted text-truncate d-block">${field.name}</small>
            </div>
            <div class="schema-field-value missing">
              <i class="fa-regular fa-circle me-1"></i> Waiting...
            </div>
          `;
        }

        container.appendChild(card);
      });
    });

    // Update Progress Indicator
    let filledCount = 0;
    schema.forEach(field => {
      if (window.extractedData[field.name] !== undefined) filledCount++;
    });
    const totalCount = schema.length;
    const percentage = Math.round((filledCount / totalCount) * 100) || 0;
    
    // Update main progress elements
    if (progressPercentage) progressPercentage.textContent = `${percentage}% Completed`;
    if (progressFillBar) progressFillBar.style.width = `${percentage}%`;
    
    // Update voice progress elements
    const voiceProgressPercentage = document.getElementById('voiceProgressPercentage');
    const voiceProgressFillBar = document.getElementById('voiceProgressFillBar');
    if (voiceProgressPercentage) voiceProgressPercentage.textContent = `${percentage}% Completed`;
    if (voiceProgressFillBar) voiceProgressFillBar.style.width = `${percentage}%`;

    // Manage button states
    if (filledCount > 0) {
      triggerAutofillBtn.removeAttribute('disabled');
      downloadReportBtn.removeAttribute('disabled');
    } else {
      triggerAutofillBtn.setAttribute('disabled', 'true');
      downloadReportBtn.setAttribute('disabled', 'true');
    }
  }

  // -------------------------------------------------------------
  // 4. Send Message and Query Chatbot API
  // -------------------------------------------------------------
  async function handleSendMessage() {
    const text = chatInput.value.trim();
    if (!text || !window.selectedForm) return;

    // Render User Message
    appendMessage('user', text);
    chatInput.value = '';

    // Trigger loading states
    chatInput.setAttribute('disabled', 'true');
    sendChatBtn.setAttribute('disabled', 'true');
    showTyping(true);

    try {
      const response = await fetch(`${API_URL}/chat`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          message: text,
          formId: window.selectedForm.id
        })
      });

      const data = await response.json();
      showTyping(false);

      if (!response.ok) {
        appendMessage('bot', `<span class="text-danger"><i class="fa-solid fa-triangle-exclamation"></i> Error: ${data.error || 'Failed to analyze request.'}</span>`);
        return;
      }

      // Render Bot Reply
      appendMessage('bot', data.reply);

      // Sync Extracted Data State
      window.extractedData = data.extractedData;
      updatePreviewPane();

    } catch (err) {
      console.error(err);
      showTyping(false);
      appendMessage('bot', '<span class="text-danger"><i class="fa-solid fa-circle-exclamation"></i> Communication error connecting to server.</span>');
    } finally {
      // Re-enable input focus
      chatInput.removeAttribute('disabled');
      sendChatBtn.removeAttribute('disabled');
      chatInput.focus();
    }
  }
  window.handleSendMessage = handleSendMessage;

  sendChatBtn.addEventListener('click', handleSendMessage);
  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleSendMessage();
  });

  // -------------------------------------------------------------
  // 5. Trigger Automation & PDF Download
  // -------------------------------------------------------------
  
  // Clear chat logs event
  clearChatBtn.addEventListener('click', async () => {
    if (!window.selectedForm) return;
    if (confirm('Are you sure you want to clear current chat logs and start over?')) {
      chatMessages.innerHTML = '';
      window.extractedData = {};
      updatePreviewPane();
      appendMessage('bot', `Session restarted. I've reloaded the <b>${window.selectedForm.form_name}</b> schema. What is your full name?`);
      
      try {
        await fetch(`${API_URL}/chat/clear`, {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({ formId: window.selectedForm.id })
        });
      } catch (err) {
        console.warn('Failed to clear logs on backend.');
      }
    }
  });

  // Trigger Selenium Auto-fill
  triggerAutofillBtn.addEventListener('click', async () => {
    if (!window.selectedForm) return;

    triggerAutofillBtn.setAttribute('disabled', 'true');
    appendMessage('bot', `<i class="fa-solid fa-gear fa-spin text-accent"></i> <i>Selenium automation launched! Opening browser window on server... Please watch your screen.</i>`);

    try {
      const response = await fetch(`${API_URL}/forms/fill`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ formId: window.selectedForm.id })
      });

      const data = await response.json();

      if (response.ok) {
        alert(data.message || 'Automation started successfully.');
        appendMessage('bot', `Auto-filling is active. Chrome will display the form, type values in real time, and remain open for 20 seconds for your review.`);
      } else {
        alert(data.error || 'Failed to start Selenium automation.');
        appendMessage('bot', `<span class="text-danger">Failed to execute auto-filling: ${data.error}</span>`);
        triggerAutofillBtn.removeAttribute('disabled');
      }

    } catch (err) {
      console.error(err);
      alert('Error launching Selenium automation.');
      triggerAutofillBtn.removeAttribute('disabled');
    }
  });

  // Securely Download PDF Report
  downloadReportBtn.addEventListener('click', async () => {
    if (!window.selectedForm) return;

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/reports/pdf/${window.selectedForm.id}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) throw new Error('Failed to download file.');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Form_${window.selectedForm.id}_AI_Report.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

    } catch (error) {
      console.error(error);
      alert('Error downloading PDF report. Ensure backend PDF generator is active.');
    }
  });
});
