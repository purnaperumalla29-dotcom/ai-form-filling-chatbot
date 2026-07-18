// Client Application Coordinator and Authentication Router
document.addEventListener('DOMContentLoaded', () => {
  // Select DOM Elements
  const authOverlay = document.getElementById('authOverlay');
  const appWrapper = document.getElementById('appWrapper');
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');
  const showRegisterBtn = document.getElementById('showRegisterBtn');
  const showLoginBtn = document.getElementById('showLoginBtn');
  const logoutBtn = document.getElementById('logoutBtn');
  
  const navChatBtn = document.getElementById('navChatBtn');
  const navFormsBtn = document.getElementById('navFormsBtn');
  const navAdminBtn = document.getElementById('navAdminBtn');
  const viewSections = document.querySelectorAll('.view-section');
  const currentViewTitle = document.getElementById('currentViewTitle');
  
  const profileUsername = document.getElementById('profileUsername');
  const profileEmail = document.getElementById('profileEmail');
  const userAvatar = document.getElementById('userAvatar');
  const activeFormBadge = document.getElementById('activeFormBadge');
  const authSubTitle = document.getElementById('authSubTitle');

  // API base route helper
  const API_URL = '/api';

  // -------------------------------------------------------------
  // Session management helper
  // -------------------------------------------------------------
  function checkSession() {
    const token = localStorage.getItem('token');
    const userStr = localStorage.getItem('user');

    if (token && userStr) {
      try {
        const user = JSON.parse(userStr);
        // User is logged in
        authOverlay.classList.add('d-none');
        appWrapper.classList.remove('d-none');
        
        // Populate profile card
        profileUsername.textContent = user.username;
        profileEmail.textContent = user.email;
        userAvatar.textContent = user.username.substring(0, 1).toUpperCase();

        // Show/hide admin button
        if (user.role === 'admin') {
          navAdminBtn.classList.remove('d-none');
        } else {
          navAdminBtn.classList.add('d-none');
        }

        // Initialize App Views
        window.initializeFormsTab();
        switchView('chatView', 'Chat Assistant');
        
        if (typeof window.restoreActiveSession === 'function') {
          window.restoreActiveSession();
        }
        
      } catch (err) {
        logout();
      }
    } else {
      // User is not logged in
      authOverlay.classList.remove('d-none');
      appWrapper.classList.add('d-none');
    }
  }

  function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('activeForm');
    activeFormBadge.textContent = 'Form: None selected';
    window.selectedForm = null;
    checkSession();
  }

  logoutBtn.addEventListener('click', logout);

  // -------------------------------------------------------------
  // Switch Form Tabs (Login <-> Register)
  // -------------------------------------------------------------
  showRegisterBtn.addEventListener('click', (e) => {
    e.preventDefault();
    loginForm.classList.add('d-none');
    registerForm.classList.remove('d-none');
    authSubTitle.textContent = 'Create your user account';
  });

  showLoginBtn.addEventListener('click', (e) => {
    e.preventDefault();
    registerForm.classList.add('d-none');
    loginForm.classList.remove('d-none');
    authSubTitle.textContent = 'Welcome, please sign in to continue';
  });

  // -------------------------------------------------------------
  // Auth Form Submissions
  // -------------------------------------------------------------
  
  // Handle Login Submission
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;

    try {
      const response = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      const data = await response.json();

      if (!response.ok) {
        alert(data.error || 'Login failed.');
        return;
      }

      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      
      loginForm.reset();
      checkSession();
    } catch (err) {
      console.error('Login error:', err);
      alert('Network error connecting to auth server.');
    }
  });

  // Handle Registration Submission
  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('registerUsername').value;
    const email = document.getElementById('registerEmail').value;
    const password = document.getElementById('registerPassword').value;

    try {
      const response = await fetch(`${API_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, email, password })
      });

      const data = await response.json();

      if (!response.ok) {
        alert(data.error || 'Registration failed.');
        return;
      }

      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));

      registerForm.reset();
      
      // Toggle form back to login state
      registerForm.classList.add('d-none');
      loginForm.classList.remove('d-none');
      
      checkSession();
    } catch (err) {
      console.error('Registration error:', err);
      alert('Network error connecting to auth server.');
    }
  });

  // -------------------------------------------------------------
  // View Router Navigation
  // -------------------------------------------------------------
  function switchView(targetId, viewTitle) {
    viewSections.forEach(section => {
      section.classList.remove('active');
    });

    const activeSection = document.getElementById(targetId);
    if (activeSection) {
      activeSection.classList.add('active');
    }

    currentViewTitle.textContent = viewTitle;

    // Toggle nav active states
    document.querySelectorAll('.nav-item-btn').forEach(btn => {
      if (btn.getAttribute('data-target') === targetId) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    // Custom view trigger events
    if (targetId === 'adminView') {
      window.loadAdminDashboard();
    }
    if (targetId === 'documentsView' || targetId === 'manualView') {
      if (typeof window.loadDocumentsDashboard === 'function') {
        window.loadDocumentsDashboard();
      }
    }
  }

  document.querySelectorAll('.nav-item-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-target');
      let title = 'Chat Assistant';
      if (target === 'formsView') title = 'Form Templates';
      if (target === 'documentsView') title = 'Upload Document';
      if (target === 'voiceView') title = 'Voice Input';
      if (target === 'manualView') title = 'Manual Entry';
      if (target === 'adminView') title = 'Admin Panel';
      
      switchView(target, title);
    });
  });

  // Expose routing function globally
  window.navigateToView = switchView;

  // Run on page load
  checkSession();
});
