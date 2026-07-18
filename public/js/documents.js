// Profile Documents Tab Logic
async function loadDocumentsDashboard() {
  const token = localStorage.getItem('token');
  const userStr = localStorage.getItem('user');
  if (!token || !userStr) return;

  const user = JSON.parse(userStr);

  try {
    // Fetch the user's latest stored fields from database
    const res = await fetch(`/api/extension/data/${user.username}`);
    if (res.ok) {
      const data = await res.json();
      updateExtractedFieldsUI(data);
    }
  } catch (err) {
    console.error('Failed to load profile fields:', err.message);
  }
}

function updateExtractedFieldsUI(data) {
  const fields = [
    'fullName', 'email', 'phone', 'dob', 'gender', 'course', 'position', 'experience', 'skills', 'address', 'registerNumber', 'collegeName',
    'fatherName', 'motherName', 'aadharNumber', 'nationality', 'languages', 'hobbies', 'projects',
    'tenthPercentage', 'tenthYear', 'twelfthPercentage', 'twelfthYear', 'graduationCgpa', 'graduationYear'
  ];
  fields.forEach(field => {
    const el = document.getElementById(`input-${field}`);
    if (el) {
      if (data[field] !== undefined && data[field] !== null) {
        el.value = data[field];
      } else {
        el.value = '';
      }
    }
  });
}

window.loadDocumentsDashboard = loadDocumentsDashboard;

// Document Upload & Manual Profile Save Handlers
document.addEventListener('DOMContentLoaded', () => {
  const docUploadForm = document.getElementById('docUploadForm');
  const docFile = document.getElementById('docFile');
  const uploadLoader = document.getElementById('uploadLoader');
  const uploadSuccess = document.getElementById('uploadSuccess');
  const saveProfileBtn = document.getElementById('saveProfileBtn');

  if (docUploadForm) {
    docUploadForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const file = docFile.files[0];
      if (!file) return;

      const formData = new FormData();
      formData.append('resume', file);

      // UI loading state
      docUploadForm.classList.add('d-none');
      uploadLoader.classList.remove('d-none');
      uploadSuccess.classList.add('d-none');

      try {
        const token = localStorage.getItem('token');
        const res = await fetch('/api/documents/upload', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`
          },
          body: formData
        });

        const data = await res.json();

        uploadLoader.classList.add('d-none');
        docUploadForm.classList.remove('d-none');

        if (res.ok) {
          uploadSuccess.classList.remove('d-none');
          docUploadForm.reset();
          
          // Re-load fields list
          loadDocumentsDashboard();
          
          alert('Document parsed and profile updated successfully!');
        } else {
          alert(`Error parsing document: ${data.error || 'Unknown error'}`);
        }

      } catch (err) {
        console.error(err);
        uploadLoader.classList.add('d-none');
        docUploadForm.classList.remove('d-none');
        alert('Network error uploading document.');
      }
    });
  }

  if (saveProfileBtn) {
    saveProfileBtn.addEventListener('click', async () => {
      const token = localStorage.getItem('token');
      if (!token) return;

      const fields = [
        'fullName', 'email', 'phone', 'dob', 'gender', 'course', 'position', 'experience', 'skills', 'address', 'registerNumber', 'collegeName',
        'fatherName', 'motherName', 'aadharNumber', 'nationality', 'languages', 'hobbies', 'projects',
        'tenthPercentage', 'tenthYear', 'twelfthPercentage', 'twelfthYear', 'graduationCgpa', 'graduationYear'
      ];
      const profileData = {};
      
      fields.forEach(field => {
        const el = document.getElementById(`input-${field}`);
        if (el) {
          profileData[field] = el.value.trim();
        }
      });

      try {
        saveProfileBtn.setAttribute('disabled', 'true');
        saveProfileBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin me-2"></i>Saving...';

        const res = await fetch('/api/profile/save', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(profileData)
        });

        const result = await res.json();

        if (res.ok) {
          alert('Profile changes saved successfully! These values will now be used by the browser extension.');
        } else {
          alert(`Error saving profile: ${result.error || 'Unknown error'}`);
        }

      } catch (err) {
        console.error(err);
        alert('Network error saving profile changes.');
      } finally {
        saveProfileBtn.removeAttribute('disabled');
        saveProfileBtn.innerHTML = '<i class="fa-solid fa-floppy-disk me-2"></i>Save Profile Changes';
      }
    });
  }

  // Resume PDF Upload Form (Slot 2)
  const resumeUploadForm = document.getElementById('resumeUploadForm');
  const resumeFile = document.getElementById('resumeFile');
  const resumeUploadLoader = document.getElementById('resumeUploadLoader');
  const resumeUploadSuccess = document.getElementById('resumeUploadSuccess');

  if (resumeUploadForm) {
    resumeUploadForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const file = resumeFile.files[0];
      if (!file) return;

      const formData = new FormData();
      formData.append('resume', file);

      // UI loading state
      resumeUploadForm.classList.add('d-none');
      resumeUploadLoader.classList.remove('d-none');
      resumeUploadSuccess.classList.add('d-none');

      try {
        const token = localStorage.getItem('token');
        const res = await fetch('/api/documents/upload-resume', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`
          },
          body: formData
        });

        const data = await res.json();

        resumeUploadLoader.classList.add('d-none');
        resumeUploadForm.classList.remove('d-none');

        if (res.ok) {
          resumeUploadSuccess.classList.remove('d-none');
          resumeUploadForm.reset();
          
          // Re-load fields list
          loadDocumentsDashboard();
          
          alert('PDF Resume file uploaded successfully!');
        } else {
          alert(`Error uploading resume: ${data.error || 'Unknown error'}`);
        }

      } catch (err) {
        console.error(err);
        resumeUploadLoader.classList.add('d-none');
        resumeUploadForm.classList.remove('d-none');
        alert('Network error uploading resume.');
      }
    });
  }
});
