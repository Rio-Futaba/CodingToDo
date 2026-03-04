// Conversion functions
function dmojToCf(dmojDifficulty) {
  if (dmojDifficulty <= 0) return 0;
  const cfRating = 570 * Math.pow(dmojDifficulty, 0.329) * Math.log10(dmojDifficulty);
  return Math.round(cfRating / 50) * 50;
}

function cfToDmoj(cfRating) {
  if (cfRating <= 0) return 0;
  let low = 1.0, high = 100.0;
  let bestDmoj = 1;

  for (let i = 0; i < 100; i++) {
    const mid = (low + high) / 2;
    const cfCalc = 570 * Math.pow(mid, 0.329) * Math.log10(mid);

    if (Math.abs(cfCalc - cfRating) < 0.1) {
      bestDmoj = mid;
      break;
    } else if (cfCalc < cfRating) {
      low = mid;
      bestDmoj = mid;
    } else {
      high = mid;
    }
  }

  return Math.round(bestDmoj);
}

// Status priority: solved > snoozed > solving > unsolved
function getStatusPriority(status) {
  const priorities = {
    'solved': 4,
    'snoozed': 3,
    'solving': 2,
    'unsolved': 1
  };
  return priorities[status] || 0;
}

function mergeProblems(localProblems, remoteProblems) {
  const problemMap = new Map();

  // Add all local problems first
  localProblems.forEach(p => {
    problemMap.set(p.link, { ...p, source: 'local' });
  });

  // Merge with remote problems, using status priority
  remoteProblems.forEach(remoteProblem => {
    const existing = problemMap.get(remoteProblem.link);

    if (!existing) {
      // New problem from remote
      problemMap.set(remoteProblem.link, { ...remoteProblem, source: 'remote' });
    } else {
      // Problem exists in both - merge with priority logic
      const localPriority = getStatusPriority(existing.status);
      const remotePriority = getStatusPriority(remoteProblem.status);

      // Use the status with higher priority
      const mergedProblem = {
        ...existing,
        ...remoteProblem,
        status: localPriority >= remotePriority ? existing.status : remoteProblem.status,
        source: 'merged'
      };

      problemMap.set(remoteProblem.link, mergedProblem);
    }
  });

  return Array.from(problemMap.values());
}

// Storage functions
async function getAllProblems() {
  try {
    const result = await chrome.storage.local.get(['syncedProblems']);
    return result.syncedProblems || [];
  } catch (error) {
    console.error('Error loading problems:', error);
    return [];
  }
}

async function saveAllProblems(problems) {
  try {
    await chrome.storage.local.set({ syncedProblems: problems });
  } catch (error) {
    console.error('Error saving problems:', error);
  }
}

async function getPendingProblems() {
  try {
    const result = await chrome.storage.local.get(['pendingProblems']);
    return result.pendingProblems || [];
  } catch (error) {
    console.error('Error loading pending problems:', error);
    return [];
  }
}

async function clearPendingProblems() {
  try {
    await chrome.storage.local.set({ pendingProblems: [] });
  } catch (error) {
    console.error('Error clearing pending problems:', error);
  }
}

// API functions
async function fetchProblemsFromApp() {
  try {
    const response = await fetch('http://localhost:8765/get-problems', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error('Server responded with ' + response.status);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Fetch error:', error);
    throw error;
  }
}

async function pushProblemsToApp(problems) {
  try {
    const response = await fetch('http://localhost:8765/add-problem', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(problems)
    });

    if (!response.ok) {
      throw new Error('Server responded with ' + response.status);
    }

    return await response.json();
  } catch (error) {
    console.error('Push error:', error);
    throw error;
  }
}

async function checkServerConnection() {
  try {
    const response = await fetch('http://localhost:8765/ping', {
      method: 'GET',
      signal: AbortSignal.timeout(2000)
    });
    return response.ok;
  } catch (error) {
    return false;
  }
}

// UI functions
function showNotification(message, type = 'success') {
  const notification = document.getElementById('notification');
  const text = document.getElementById('notificationText');

  notification.className = `notification ${type} show`;
  text.textContent = message;

  setTimeout(() => {
    notification.classList.remove('show');
  }, 3500);
}

async function updateSyncStatus() {
  const statusDiv = document.getElementById('syncStatus');
  const statusText = document.getElementById('syncStatusText');

  const isConnected = await checkServerConnection();

  if (isConnected) {
    statusDiv.className = 'sync-status connected';
    statusText.textContent = 'Connected to Desktop App';
  } else {
    statusDiv.className = 'sync-status disconnected';
    statusText.textContent = 'Desktop App Offline';
  }
}

function renderProblemCard(problem, useCfRating) {
  const card = document.createElement('div');
  card.className = `problem-card ${problem.status}`;

  const ratingValue = useCfRating ? problem.cf_rating : problem.difficulty;
  const ratingLabel = useCfRating ? 'CF' : 'DMOJ';

  // FIX: Support both 'type' and 'tags' fields for tags
  const tags = problem.tags || problem.type || [];
  const tagsHtml = tags.map(tag => `<span class="tag">${tag}</span>`).join('');

  card.innerHTML = `
    <div class="problem-header">
      <div class="problem-title">${problem.name}</div>
      <div class="status-badge ${problem.status}">${problem.status}</div>
    </div>
    <div class="problem-meta">
      <span>🏛️ ${problem.platform}</span>
      <span>⭐ ${ratingLabel}: ${ratingValue}</span>
    </div>
    ${tags.length > 0 ? `<div class="problem-tags">${tagsHtml}</div>` : ''}
    <div class="action-buttons">
      <button class="btn btn-primary open-problem-btn" data-link="${problem.link}">Open Problem</button>
      <button class="btn btn-secondary change-status-btn" data-link="${problem.link}">Change Status</button>
    </div>
  `;

  // Attach event listeners to buttons
  const openBtn = card.querySelector('.open-problem-btn');
  const statusBtn = card.querySelector('.change-status-btn');

  openBtn.addEventListener('click', () => openProblem(problem.link));
  statusBtn.addEventListener('click', () => changeStatus(problem.link));

  return card;
}

async function renderProblems() {
  const listDiv = document.getElementById('problemList');
  const platformFilter = document.getElementById('platformFilter').value.toLowerCase().trim();
  const statusFilter = document.getElementById('statusFilter').value;
  const ratingRange = document.getElementById('ratingRange').value.trim();
  const searchQuery = document.getElementById('searchFilter').value.toLowerCase().trim();
  const useCfRating = document.querySelector('input[name="ratingSystem"]:checked').value === 'cf';

  const problems = await getAllProblems();

  // Apply filters
  let filtered = problems.filter(problem => {
    // Platform filter
    if (platformFilter && !problem.platform.toLowerCase().includes(platformFilter)) {
      return false;
    }

    // Status filter
    if (statusFilter !== 'all' && problem.status !== statusFilter) {
      return false;
    }

    // Search filter by problem name
    if (searchQuery && !problem.name.toLowerCase().includes(searchQuery)) {
      return false;
    }

    // Rating range filter
    if (ratingRange) {
      const parts = ratingRange.split('-').map(s => s.trim());
      if (parts.length === 2) {
        const min = parseInt(parts[0]) || 0;
        const max = parseInt(parts[1]) || 999;
        const rating = useCfRating ? problem.cf_rating : problem.difficulty;

        if (rating < min || rating > max) {
          return false;
        }
      }
    }

    return true;
  });

  // Clear list
  listDiv.innerHTML = '';

  if (filtered.length === 0) {
    listDiv.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🔍</div>
        <h3>No problems found</h3>
        <p>Try adjusting your filters or sync from your desktop app</p>
      </div>
    `;
    updateStatistics(problems);
    return;
  }

  // Render filtered problems
  filtered.forEach(problem => {
    const card = renderProblemCard(problem, useCfRating);
    listDiv.appendChild(card);
  });

  updateStatistics(problems);
}

function updateStatistics(problems) {
  document.getElementById('totalProblems').textContent = problems.length;
  document.getElementById('solvedProblems').textContent = problems.filter(p => p.status === 'solved').length;
  document.getElementById('solvingProblems').textContent = problems.filter(p => p.status === 'solving').length;
  document.getElementById('unsolvedProblems').textContent = problems.filter(p => p.status === 'unsolved').length;
}

async function updatePendingCount() {
  const pending = await getPendingProblems();
  const countDiv = document.getElementById('pendingCountDisplay');

  if (pending.length > 0) {
    countDiv.textContent = `${pending.length} problem${pending.length > 1 ? 's' : ''} ready to push`;
    countDiv.style.display = 'block';
  } else {
    countDiv.style.display = 'none';
  }
}

function openProblem(link) {
  chrome.tabs.create({ url: link });
}

async function changeStatus(link) {
  const problems = await getAllProblems();
  const problem = problems.find(p => p.link === link);

  if (!problem) {
    showNotification('Problem not found', 'error');
    return;
  }

  // Create modal for status change
  const modal = document.createElement('div');
  modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0,0,0,0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
  `;

  modal.innerHTML = `
    <div style="background: white; padding: 25px; border-radius: 12px; min-width: 300px; box-shadow: 0 10px 40px rgba(0,0,0,0.3);">
      <h3 style="margin: 0 0 20px 0; font-size: 18px; color: #333;">Change Problem Status</h3>
      <div style="margin-bottom: 20px;">
        <div style="font-weight: 600; margin-bottom: 8px; font-size: 14px; color: #666;">Select new status:</div>
        <div style="display: flex; flex-direction: column; gap: 10px;">
          <button class="status-option" data-status="unsolved" style="padding: 12px; border: 2px solid #f44336; background: ${problem.status === 'unsolved' ? '#f44336' : 'white'}; color: ${problem.status === 'unsolved' ? 'white' : '#f44336'}; border-radius: 6px; cursor: pointer; font-weight: 600; transition: all 0.2s;">
            ❌ Unsolved
          </button>
          <button class="status-option" data-status="solving" style="padding: 12px; border: 2px solid #ff9800; background: ${problem.status === 'solving' ? '#ff9800' : 'white'}; color: ${problem.status === 'solving' ? 'white' : '#ff9800'}; border-radius: 6px; cursor: pointer; font-weight: 600; transition: all 0.2s;">
            🔄 Solving
          </button>
          <button class="status-option" data-status="solved" style="padding: 12px; border: 2px solid #4CAF50; background: ${problem.status === 'solved' ? '#4CAF50' : 'white'}; color: ${problem.status === 'solved' ? 'white' : '#4CAF50'}; border-radius: 6px; cursor: pointer; font-weight: 600; transition: all 0.2s;">
            ✅ Solved
          </button>
          <button class="status-option" data-status="snoozed" style="padding: 12px; border: 2px solid #9e9e9e; background: ${problem.status === 'snoozed' ? '#9e9e9e' : 'white'}; color: ${problem.status === 'snoozed' ? 'white' : '#9e9e9e'}; border-radius: 6px; cursor: pointer; font-weight: 600; transition: all 0.2s;">
            ⭐ Snoozed
          </button>
        </div>
      </div>
      <button id="cancelStatusChange" style="width: 100%; padding: 10px; background: #e0e0e0; color: #333; border: none; border-radius: 6px; cursor: pointer; font-weight: 600;">
        Cancel
      </button>
    </div>
  `;

  document.body.appendChild(modal);

  // Add hover effects
  modal.querySelectorAll('.status-option').forEach(btn => {
    btn.addEventListener('mouseenter', function() {
      if (this.dataset.status !== problem.status) {
        const color = this.style.borderColor;
        this.style.background = color;
        this.style.color = 'white';
      }
    });
    btn.addEventListener('mouseleave', function() {
      if (this.dataset.status !== problem.status) {
        this.style.background = 'white';
        this.style.color = this.style.borderColor;
      }
    });
  });

  // Handle status selection
  modal.querySelectorAll('.status-option').forEach(btn => {
    btn.addEventListener('click', async () => {
      const newStatus = btn.dataset.status;
      problem.status = newStatus;
      await saveAllProblems(problems);

      // Also update in pending if it exists there
      const pending = await getPendingProblems();
      const pendingProblem = pending.find(p => p.link === link);
      if (pendingProblem) {
        pendingProblem.status = newStatus;
        await chrome.storage.local.set({ pendingProblems: pending });
      }

      showNotification(`Status updated to ${newStatus}`, 'success');
      await renderProblems();

      // Try to sync to desktop app
      try {
        await pushProblemsToApp(problems);
      } catch (error) {
        console.log('Could not sync to desktop app');
      }

      document.body.removeChild(modal);
    });
  });

  // Handle cancel
  modal.querySelector('#cancelStatusChange').addEventListener('click', () => {
    document.body.removeChild(modal);
  });

  // Click outside to close
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      document.body.removeChild(modal);
    }
  });
}

// Add this function to update popup.js for the sidebar button
document.getElementById('openSidebar')?.addEventListener('click', async () => {
  await chrome.sidePanel.open({ windowId: chrome.windows.WINDOW_ID_CURRENT });
});

// Event listeners
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    const tabName = tab.dataset.tab;

    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');

    document.querySelectorAll('.tab-content').forEach(content => {
      content.classList.remove('active');
    });
    document.getElementById(`${tabName}Tab`).classList.add('active');

    if (tabName === 'sync') {
      updatePendingCount();
    }
  });
});

document.getElementById('platformFilter').addEventListener('input', renderProblems);
document.getElementById('statusFilter').addEventListener('change', renderProblems);
document.getElementById('ratingRange').addEventListener('input', renderProblems);
document.getElementById('searchFilter').addEventListener('input', renderProblems);

document.querySelectorAll('input[name="ratingSystem"]').forEach(radio => {
  radio.addEventListener('change', (e) => {
    const label = document.getElementById('ratingLabel');
    label.textContent = e.target.value === 'cf' ? 'CF Rating' : 'DMOJ Difficulty';
    renderProblems();
  });
});

document.getElementById('pullFromApp').addEventListener('click', async () => {
  const btn = document.getElementById('pullFromApp');
  btn.disabled = true;
  btn.textContent = 'Pulling...';

  try {
    const data = await fetchProblemsFromApp();

    if (data.problems && Array.isArray(data.problems)) {
      // Merge with existing problems using status priority
      const localProblems = await getAllProblems();
      const mergedProblems = mergeProblems(localProblems, data.problems);

      await saveAllProblems(mergedProblems);
      showNotification(`✅ Synced ${mergedProblems.length} problems from desktop app`, 'success');
      await renderProblems();
    } else {
      throw new Error('Invalid response format');
    }
  } catch (error) {
    showNotification('❌ Failed to connect to desktop app. Make sure it\'s running.', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Pull Problems from Desktop';
  }
});

document.getElementById('pushToApp').addEventListener('click', async () => {
  const btn = document.getElementById('pushToApp');
  btn.disabled = true;
  btn.textContent = 'Pushing...';

  try {
    const pending = await getPendingProblems();

    if (pending.length === 0) {
      showNotification('No pending problems to push', 'error');
      btn.disabled = false;
      btn.textContent = 'Push Problems to Desktop';
      return;
    }

    await pushProblemsToApp(pending);
    await clearPendingProblems();
    showNotification(`✅ Pushed ${pending.length} problems to desktop app`, 'success');
    await updatePendingCount();
  } catch (error) {
    showNotification('❌ Failed to push to desktop app. Make sure it\'s running.', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Push Problems to Desktop';
  }
});

document.getElementById('fullSync').addEventListener('click', async () => {
  const btn = document.getElementById('fullSync');
  btn.disabled = true;
  btn.textContent = 'Syncing...';

  try {
    // Get both local and remote problems
    const pending = await getPendingProblems();
    const localProblems = await getAllProblems();

    // First push pending problems
    if (pending.length > 0) {
      await pushProblemsToApp(pending);
      await clearPendingProblems();
    }

    // Then pull all problems from desktop
    const data = await fetchProblemsFromApp();

    if (data.problems && Array.isArray(data.problems)) {
      // Merge using status priority
      const mergedProblems = mergeProblems(localProblems, data.problems);
      await saveAllProblems(mergedProblems);

      // Push merged problems back to desktop to ensure full sync
      await pushProblemsToApp(mergedProblems);

      showNotification(`✅ Full sync complete! ${mergedProblems.length} problems synchronized`, 'success');
      await renderProblems();
      await updatePendingCount();
    }
  } catch (error) {
    showNotification('❌ Sync failed. Make sure desktop app is running.', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Full Synchronization';
  }
});

// Initialize
(async () => {
  await updateSyncStatus();
  await renderProblems();
  await updatePendingCount();

  // Check connection status every 30 seconds
  setInterval(updateSyncStatus, 30000);
})();