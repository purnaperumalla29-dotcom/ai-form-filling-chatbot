// Admin Dashboard Metrics and Data Table Handlers
document.addEventListener('DOMContentLoaded', () => {
  const API_URL = '/api';

  // DOM Elements
  const adminTotalUsers = document.getElementById('adminTotalUsers');
  const adminTotalSubmissions = document.getElementById('adminTotalSubmissions');
  const adminTotalMessages = document.getElementById('adminTotalMessages');
  const adminTotalForms = document.getElementById('adminTotalForms');
  
  const adminSubmissionsTable = document.getElementById('adminSubmissionsTable').querySelector('tbody');
  const adminUsersTable = document.getElementById('adminUsersTable').querySelector('tbody');

  function getAuthHeaders() {
    const token = localStorage.getItem('token');
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    };
  }

  // -------------------------------------------------------------
  // Load and Render Admin Stats
  // -------------------------------------------------------------
  async function loadAdminDashboard() {
    const userStr = localStorage.getItem('user');
    if (!userStr) return;
    
    const user = JSON.parse(userStr);
    if (user.role !== 'admin') return;

    try {
      console.log('Fetching admin dashboard metrics...');
      const res = await fetch(`${API_URL}/admin/stats`, {
        headers: getAuthHeaders()
      });

      if (!res.ok) throw new Error('Failed to retrieve statistics.');

      const data = await res.json();

      // 1. Populate Metrics Cards
      adminTotalUsers.textContent = data.stats.totalUsers;
      adminTotalSubmissions.textContent = data.stats.totalSubmissions;
      adminTotalMessages.textContent = data.stats.totalMessages;
      adminTotalForms.textContent = data.stats.totalForms;

      // 1b. Render Analytics Chart
      const statusCounts = { pending: 0, filled: 0, submitted: 0, failed: 0 };
      data.submissions.forEach(sub => {
        const s = (sub.status || '').toLowerCase();
        if (statusCounts[s] !== undefined) {
          statusCounts[s]++;
        }
      });
      renderSubmissionsChart(statusCounts);

      // 2. Populate Submissions Table
      adminSubmissionsTable.innerHTML = '';
      if (data.submissions.length === 0) {
        adminSubmissionsTable.innerHTML = `
          <tr>
            <td colspan="6" class="text-center text-muted py-4">No form submissions recorded yet.</td>
          </tr>
        `;
      } else {
        data.submissions.forEach(sub => {
          const row = document.createElement('tr');
          row.className = 'table-row-item';
          
          // Format Date
          const date = new Date(sub.created_at).toLocaleDateString(undefined, {
            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
          });

          // Format extracted JSON preview
          const dataPreview = Object.entries(sub.extracted_json)
            .map(([k, v]) => `${k}: ${v}`)
            .slice(0, 3)
            .join(', ');
          const displayPreview = dataPreview ? `${dataPreview}...` : 'Empty';

          row.innerHTML = `
            <td><b>${sub.username}</b></td>
            <td>${sub.form_name}</td>
            <td class="text-muted small" title="${JSON.stringify(sub.extracted_json)}">${displayPreview}</td>
            <td><span class="status-badge ${sub.status}">${sub.status}</span></td>
            <td><small>${date}</small></td>
            <td>
              <button class="btn btn-sm btn-outline-light download-sub-pdf-btn" data-id="${sub.id}" title="Download Report">
                <i class="fa-solid fa-file-pdf text-danger"></i>
              </button>
            </td>
          `;
          
          adminSubmissionsTable.appendChild(row);
        });

        // Attach event listeners for PDF downloads
        document.querySelectorAll('.download-sub-pdf-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            const submissionId = btn.getAttribute('data-id');
            downloadSubmissionPDF(submissionId);
          });
        });
      }

      // 3. Populate Users Table
      adminUsersTable.innerHTML = '';
      data.users.forEach(u => {
        const row = document.createElement('tr');
        row.className = 'table-row-item';
        
        const joinedDate = new Date(u.created_at).toLocaleDateString(undefined, {
          month: 'short', year: 'numeric'
        });

        row.innerHTML = `
          <td>
            <div class="d-flex align-items-center gap-2">
              <div class="user-avatar" style="width: 26px; height: 26px; font-size: 0.75rem;">${u.username[0].toUpperCase()}</div>
              <div>
                <b>${u.username}</b>
                <small class="text-muted d-block" style="font-size: 0.7rem;">${u.email}</small>
              </div>
            </div>
          </td>
          <td><span class="badge ${u.role === 'admin' ? 'bg-primary' : 'bg-secondary'}">${u.role}</span></td>
          <td><small>${joinedDate}</small></td>
        `;

        adminUsersTable.appendChild(row);
      });

    } catch (err) {
      console.error('Failed to load admin stats:', err);
    }
  }

  // -------------------------------------------------------------
  // Securely Download Specific Submission PDF
  // -------------------------------------------------------------
  async function downloadSubmissionPDF(submissionId) {
    try {
      const res = await fetch(`${API_URL}/admin/reports/pdf/${submissionId}`, {
        method: 'GET',
        headers: getAuthHeaders()
      });

      if (!res.ok) throw new Error('Download failed.');

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Submission_${submissionId}_AI_Report.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      alert('Failed to download PDF report. Ensure the administration route is active.');
    }
  }

  let adminChartInstance = null;

  function renderSubmissionsChart(counts) {
    const ctx = document.getElementById('adminChart');
    if (!ctx) return;

    if (adminChartInstance) {
      adminChartInstance.destroy();
    }

    adminChartInstance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: ['Pending Review', 'Auto-Filled', 'Submitted (Mock)', 'Failed Fill'],
        datasets: [{
          label: 'Total Submissions by Status',
          data: [counts.pending, counts.filled, counts.submitted, counts.failed],
          backgroundColor: [
            'rgba(245, 158, 11, 0.4)',  // orange
            'rgba(79, 70, 229, 0.4)',   // indigo
            'rgba(16, 185, 129, 0.4)',  // green
            'rgba(239, 68, 68, 0.4)'    // red
          ],
          borderColor: [
            '#f59e0b',
            '#4f46e5',
            '#10b981',
            '#ef6868'
          ],
          borderWidth: 1.5,
          borderRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: false
          }
        },
        scales: {
          x: {
            grid: {
              color: 'rgba(255, 255, 255, 0.05)'
            },
            ticks: {
              color: '#94a3b8',
              font: {
                weight: 'bold'
              }
            }
          },
          y: {
            grid: {
              color: 'rgba(255, 255, 255, 0.05)'
            },
            ticks: {
              color: '#94a3b8',
              stepSize: 1,
              precision: 0
            }
          }
        }
      }
    });
  }

  // Expose load function globally for coordinating view updates
  window.loadAdminDashboard = loadAdminDashboard;
});
