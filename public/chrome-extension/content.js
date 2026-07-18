// Automatically runs on pages matching matches array in manifest.json
(function() {
  console.log('[FormBot AI] Content script active.');

  // Retrieve storage configuration
  chrome.storage.local.get(['lastUsername', 'autoFillEnabled'], async (result) => {
    const autoFillEnabled = result.autoFillEnabled !== false;
    const username = result.lastUsername;

    if (!autoFillEnabled) {
      console.log('[FormBot AI] Zero-Click Auto-Fill is disabled.');
      return;
    }

    if (!username) {
      console.log('[FormBot AI] No username configured in extension settings.');
      return;
    }

    try {
      console.log(`[FormBot AI] Auto-filling enabled. Fetching profile for "${username}"...`);
      const response = await fetch(`http://localhost:3000/api/extension/data/${username}`);
      if (!response.ok) {
        throw new Error('Local server unreachable or user not found.');
      }

      const data = await response.json();
      if (Object.keys(data).length === 0) {
        console.log('[FormBot AI] Profile contains no saved details.');
        return;
      }

      console.log('[FormBot AI] Fetched data successfully. Initiating zero-click autofill...', data);

      // Perform initial fill
      fillFormOnPage(data);

      // Set up MutationObserver to fill dynamically loaded forms (e.g., React/Vue/Angular apps)
      let debounceTimer = null;
      const observer = new MutationObserver(() => {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          fillFormOnPage(data);
        }, 500); // debounce form scans
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true
      });

    } catch (err) {
      console.warn('[FormBot AI] Auto-fill failed:', err.message);
    }
  });

  // Reusable fill logic matching popup.js
  function fillFormOnPage(data) {
    const inputs = document.querySelectorAll('input, select, textarea');
    let filledAny = false;

    inputs.forEach(async input => {
      // Avoid modifying user-filled inputs or hidden/disabled fields
      if (input.disabled || input.type === 'hidden' || input.value) return;

      const name = (input.name || '').toLowerCase();
      const id = (input.id || '').toLowerCase();
      const placeholder = (input.placeholder || '').toLowerCase();
      const ariaLabel = (input.getAttribute('aria-label') || '').toLowerCase();
      
      // Resolve aria-labelledby text (common in Google Forms)
      let ariaLabelledByText = '';
      const labelledBy = input.getAttribute('aria-labelledby');
      if (labelledBy) {
        const ids = labelledBy.split(' ');
        ids.forEach(lblId => {
          const lblEl = document.getElementById(lblId);
          if (lblEl) {
            ariaLabelledByText += ' ' + lblEl.innerText.trim();
          }
        });
      }
      ariaLabelledByText = ariaLabelledByText.trim().toLowerCase();

      // Check associated HTML label
      let labelText = '';
      if (input.id) {
        const labelEl = document.querySelector(`label[for="${input.id}"]`);
        if (labelEl) {
          labelText = labelEl.innerText.trim().toLowerCase();
        }
      }
      
      // Check parent label
      let parentLabelText = '';
      const parentLabel = input.closest('label');
      if (parentLabel) {
        parentLabelText = parentLabel.innerText.trim().toLowerCase();
      }

      // Combine all identifiers for matching
      const searchContext = `${name} ${id} ${placeholder} ${ariaLabel} ${ariaLabelledByText} ${labelText} ${parentLabelText}`;

      // Helper check
      const matches = (keyword) => searchContext.includes(keyword);

      // 1. Full Name check
      if (data.fullName && (matches('name') || matches('fullname') || matches('username')) 
          && !matches('email') 
          && !matches('father') 
          && !matches('mother')
          && !matches('college')
          && !matches('university')
          && !matches('school')
          && !matches('company')
          && !matches('employer')
          && !matches('bank')
          && !matches('institution')
          && !matches('institute')
          && !matches('department')
          && !matches('dept')
          && !matches('org')) {
        input.value = data.fullName;
        triggerInputEvents(input);
        filledAny = true;
      }
      
      // 2. Email check
      else if (data.email && (matches('email') || matches('mail') || input.type === 'email')) {
        input.value = data.email;
        triggerInputEvents(input);
        filledAny = true;
      }
      
      // 3. Phone check
      else if (data.phone && (matches('phone') || matches('mobile') || matches('tel') || matches('contact') || input.type === 'tel')) {
        input.value = data.phone;
        triggerInputEvents(input);
        filledAny = true;
      }
      
      // 4. DOB check
      else if (data.dob && (matches('dob') || matches('birth') || matches('date') || input.type === 'date')) {
        if (input.type === 'date') {
          input.value = data.dob.substring(0, 10);
        } else {
          input.value = data.dob;
        }
        triggerInputEvents(input);
        filledAny = true;
      }
      
      // 5. Gender selection check
      else if (data.gender && (matches('gender') || matches('sex'))) {
        if (input.tagName === 'SELECT') {
          selectOption(input, data.gender);
          filledAny = true;
        } else if (input.type === 'radio') {
          const textVal = getLabelTextFor(input) || input.value || '';
          if (textVal.toLowerCase() === data.gender.toLowerCase()) {
            if (!input.checked) {
              input.checked = true;
              triggerInputEvents(input);
              filledAny = true;
            }
          }
        }
      }

      // 6. Course selection check
      else if (data.course && (matches('course') || matches('degree') || matches('branch') || matches('study'))) {
        if (input.tagName === 'SELECT') {
          selectOption(input, data.course);
          filledAny = true;
        } else if (input.type === 'radio') {
          const textVal = getLabelTextFor(input) || input.value || '';
          if (textVal.toLowerCase() === data.course.toLowerCase()) {
            if (!input.checked) {
              input.checked = true;
              triggerInputEvents(input);
              filledAny = true;
            }
          }
        } else {
          input.value = data.course;
          triggerInputEvents(input);
          filledAny = true;
        }
      }

      // 7. Applied Position check
      else if (data.position && (matches('position') || matches('role') || matches('applied') || matches('job'))) {
        if (input.tagName === 'SELECT') {
          selectOption(input, data.position);
          filledAny = true;
        } else {
          input.value = data.position;
          triggerInputEvents(input);
          filledAny = true;
        }
      }

      // 8. Experience check
      else if (data.experience !== undefined && (matches('experience') || matches('exp') || matches('years'))) {
        input.value = data.experience;
        triggerInputEvents(input);
        filledAny = true;
      }

      // 9. Skills check
      else if (data.skills && (matches('skills') || matches('tech') || matches('know'))) {
        input.value = data.skills;
        triggerInputEvents(input);
        filledAny = true;
      }

      // 10. Address / Textarea check
      else if (data.address && (matches('address') || matches('location') || matches('street') || input.tagName === 'TEXTAREA')) {
        input.value = data.address;
        triggerInputEvents(input);
        filledAny = true;
      }

      // 11. Comments check
      else if (data.comments && (matches('comment') || matches('feedback') || matches('remarks') || matches('opinion'))) {
        input.value = data.comments;
        triggerInputEvents(input);
        filledAny = true;
      }

      // 12. Register Number check
      else if (data.registerNumber && (matches('register') || matches('regno') || matches('roll') || matches('reg'))) {
        input.value = data.registerNumber;
        triggerInputEvents(input);
        filledAny = true;
      }

      // 13. Father's Name check
      else if (data.fatherName && (matches('father') || matches('parent') || matches('dad'))) {
        input.value = data.fatherName;
        triggerInputEvents(input);
        filledAny = true;
      }

      // 14. Mother's Name check
      else if (data.motherName && (matches('mother') || matches('mom'))) {
        input.value = data.motherName;
        triggerInputEvents(input);
        filledAny = true;
      }

      // 15. Aadhar Number check
      else if (data.aadharNumber && (matches('aadhar') || matches('aadhaar') || matches('uidai') || matches('national id') || matches('id card'))) {
        input.value = data.aadharNumber;
        triggerInputEvents(input);
        filledAny = true;
      }

      // 16. Nationality check
      else if (data.nationality && matches('nationality')) {
        input.value = data.nationality;
        triggerInputEvents(input);
        filledAny = true;
      }

      // 17. Languages Known check
      else if (data.languages && (matches('language') || matches('lang'))) {
        input.value = data.languages;
        triggerInputEvents(input);
        filledAny = true;
      }

      // 18. Hobbies check
      else if (data.hobbies && (matches('hobby') || matches('hobbies') || matches('interest'))) {
        input.value = data.hobbies;
        triggerInputEvents(input);
        filledAny = true;
      }

      // 19. Projects check
      else if (data.projects && (matches('project') || matches('academic'))) {
        input.value = data.projects;
        triggerInputEvents(input);
        filledAny = true;
      }

      // 20. 10th Grade check
      else if (data.tenthPercentage && (matches('10th') || matches('ssc') || matches('tenth') || matches('school')) && (matches('percentage') || matches('cgpa') || matches('marks') || matches('gpa') || matches('grade'))) {
        input.value = data.tenthPercentage;
        triggerInputEvents(input);
        filledAny = true;
      }

      // 21. 10th Year check
      else if (data.tenthYear && (matches('10th') || matches('ssc') || matches('tenth') || matches('school')) && (matches('year') || matches('passing') || matches('passed'))) {
        input.value = data.tenthYear;
        triggerInputEvents(input);
        filledAny = true;
      }

      // 22. 12th Grade check
      else if (data.twelfthPercentage && (matches('12th') || matches('inter') || matches('twelfth') || matches('diploma') || matches('high school')) && (matches('percentage') || matches('cgpa') || matches('marks') || matches('gpa') || matches('grade'))) {
        input.value = data.twelfthPercentage;
        triggerInputEvents(input);
        filledAny = true;
      }

      // 23. 12th Year check
      else if (data.twelfthYear && (matches('12th') || matches('inter') || matches('twelfth') || matches('diploma') || matches('high school')) && (matches('year') || matches('passing') || matches('passed'))) {
        input.value = data.twelfthYear;
        triggerInputEvents(input);
        filledAny = true;
      }

      // 24. Graduation CGPA check
      else if (data.graduationCgpa && (matches('grad') || matches('ug') || matches('degree') || matches('university') || matches('college') || matches('btech') || matches('bca') || matches('bsc')) && (matches('percentage') || matches('cgpa') || matches('marks') || matches('gpa') || matches('grade'))) {
        input.value = data.graduationCgpa;
        triggerInputEvents(input);
        filledAny = true;
      }

      // 25. Graduation Year check
      else if (data.graduationYear && (matches('grad') || matches('ug') || matches('degree') || matches('university') || matches('college') || matches('btech') || matches('bca') || matches('bsc')) && (matches('year') || matches('passing') || matches('passed'))) {
        input.value = data.graduationYear;
        triggerInputEvents(input);
        filledAny = true;
      }
      
      // 26. College Name check
      else if (data.collegeName && (matches('college') || matches('university') || matches('school') || matches('institution') || matches('institute') || matches('academy'))
               && !matches('year') && !matches('passing') && !matches('passed') && !matches('percentage') && !matches('cgpa') && !matches('marks')) {
        input.value = data.collegeName;
        triggerInputEvents(input);
        filledAny = true;
      }
      
      // 27. File Input Upload check (maps your saved PDF resume)
      else if (input.type === 'file') {
        try {
          const fileRes = await fetch('http://localhost:3000/uploads/resume.pdf');
          if (fileRes.ok) {
            const blob = await fileRes.blob();
            const file = new File([blob], "resume.pdf", { type: "application/pdf" });
            const dt = new DataTransfer();
            dt.items.add(file);
            input.files = dt.files;
            triggerInputEvents(input);
            filledAny = true;
          }
        } catch (e) {
          console.error('[FormBot AI] Resume injection failed:', e.message);
        }
      }
    });

    if (filledAny) {
      console.log('[FormBot AI] Zero-click form filling executed successfully.');
    }
  }

  // Helper: Select dropdown option by text or value
  function selectOption(selectElement, val) {
    const options = selectElement.options;
    let selected = false;
    for (let i = 0; i < options.length; i++) {
      const optText = options[i].text.toLowerCase();
      const optVal = options[i].value.toLowerCase();
      if (optText === val.toLowerCase() || optVal === val.toLowerCase() || val.toLowerCase().includes(optText)) {
        selectElement.selectedIndex = i;
        selected = true;
        break;
      }
    }
    if (selected) {
      triggerInputEvents(selectElement);
    }
  }

  // Helper: Find text label associated with a radio/checkbox input
  function getLabelTextFor(inputElement) {
    if (inputElement.id) {
      const label = document.querySelector(`label[for="${inputElement.id}"]`);
      if (label) return label.innerText.trim();
    }
    const parent = inputElement.parentElement;
    if (parent && parent.tagName === 'LABEL') {
      return parent.innerText.trim();
    }
    return '';
  }

  // Helper: Dispatch standard change/input events so framework sites (React/Vue/Angular) register the auto-fill values
  function triggerInputEvents(element) {
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }
}
})();
