// Storage functions using chrome.storage.local (official API)
async function getPendingProblems() {
    try {
        const result = await chrome.storage.local.get(['pendingProblems']);
        return result.pendingProblems || [];
    } catch (error) {
        console.error('Error loading pending problems:', error);
        return [];
    }
}

async function savePendingProblem(problemData) {
    try {
        const pending = await getPendingProblems();

        // Check if problem already exists (by link)
        const existingIndex = pending.findIndex(p => p.link === problemData.link);

        if (existingIndex !== -1) {
            // Update existing problem
            problemData.savedAt = pending[existingIndex].savedAt;
            problemData.updatedAt = new Date().toISOString();
            pending[existingIndex] = problemData;

            await chrome.storage.local.set({ pendingProblems: pending });
            return { status: 'updated', message: 'Problem updated in pending list' };
        } else {
            // Add new problem
            problemData.savedAt = new Date().toISOString();
            problemData.status = 'unsolved';
            pending.push(problemData);

            await chrome.storage.local.set({ pendingProblems: pending });
            return { status: 'success', message: 'Problem saved to browser storage' };
        }
    } catch (error) {
        console.error('Error saving problem:', error);
        return { status: 'error', message: 'Failed to save problem' };
    }
}

async function updateProblemStatus(link, newStatus) {
    try {
        const pending = await getPendingProblems();
        const problem = pending.find(p => p.link === link);

        if (problem) {
            problem.status = newStatus;
            problem.updatedAt = new Date().toISOString();

            await chrome.storage.local.set({ pendingProblems: pending });
            return { status: 'success', message: 'Status updated' };
        }

        return { status: 'error', message: 'Problem not found' };
    } catch (error) {
        console.error('Error updating status:', error);
        return { status: 'error', message: 'Failed to update status' };
    }
}

async function clearPendingProblems() {
    try {
        await chrome.storage.local.set({ pendingProblems: [] });
    } catch (error) {
        console.error('Error clearing problems:', error);
    }
}

async function checkIfProblemExists(url) {
    const pending = await getPendingProblems();
    return pending.find(p => p.link === url);
}

// Content script to extract problem name from page
function extractProblemName(url) {
    try {
        const hostname = new URL(url).hostname;

        // Codeforces: Omit index (e.g., "A. ")
        if (hostname.includes('codeforces.com')) {
            let title = document.querySelector('#pageContent .problem-statement .header .title')?.textContent?.trim();

            if (!title) {
                title = document.querySelector('.problem-statement .title')?.textContent?.trim();
            }

            if (!title) {
                title = document.querySelector('.header .title')?.textContent?.trim();
            }

            if (title) {
                // Removes "A. ", "B1. ", etc. at the start of the string
                return title.replace(/^[A-Z][0-9]*\.\s*/, '');
            }
        }

        // DMOJ
        if (hostname.includes('dmoj.ca')) {
            const title = document.querySelector('h2.problem-title')?.textContent?.trim() ||
                document.querySelector('.problem-title')?.textContent?.trim();
            if (title) return title;
        }

        // LeetCode
        if (hostname.includes('leetcode.com')) {
            const title = document.querySelector('[class*="text-title"]')?.textContent?.trim() ||
                document.querySelector('div[data-cy="question-title"]')?.textContent?.trim();
            if (title) return title;
        }

        // AtCoder: Extract from <title> and omit first 4 characters
        if (hostname.includes('atcoder.jp')) {
            const fullTitle = document.title || "";
            if (fullTitle.length > 4) {
                return fullTitle.substring(4).trim();
            }
            return fullTitle;
        }

        // USACO
        if (hostname.includes('usaco.org')) {
            // Get all h2 elements in the panel
            const h2Elements = document.querySelectorAll('div.panel h2');

            // The problem name is in the second h2 (index 1)
            if (h2Elements.length > 1) {
                let title = h2Elements[1].textContent.trim();
                // Remove "Problem X. " prefix if present
                title = title.replace(/^Problem\s+\d+\.\s*/, '');
                if (title) return title;
            }

            // Fallback to any h2 in panel
            const title = document.querySelector('div.panel h2')?.textContent?.trim();
            if (title) return title;
        }

        // Generic fallback - try h1
        const h1 = document.querySelector('h1')?.textContent?.trim();
        if (h1 && h1.length < 200) return h1;

        return null;
    } catch (error) {
        console.error('Extract error:', error);
        return null;
    }
}

// Get current page info and try to extract problem name
async function getPageInfo() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    const url = new URL(tab.url);
    const platform = url.hostname.replace('www.', '');

    let problemName = null;

    try {
        const results = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: extractProblemName,
            args: [tab.url]
        });

        if (results && results[0] && results[0].result) {
            problemName = results[0].result;
        }
    } catch (error) {
        console.log('Could not extract problem name:', error);
    }

    return {
        url: tab.url,
        platform: platform,
        title: tab.title,
        problemName: problemName
    };
}

// UI update functions
function showStatus(message, type) {
    const statusDiv = document.getElementById('status');
    statusDiv.textContent = message;

    statusDiv.className = `status-msg ${type}`;
    statusDiv.style.display = 'block';

    window.scrollTo(0, document.body.scrollHeight);

    setTimeout(() => {
        statusDiv.style.display = 'none';
    }, 3500);
}

async function displayPageInfo() {
    const pageInfo = await getPageInfo();
    const infoDiv = document.getElementById('pageInfo');

    infoDiv.innerHTML = `
    <strong>Current Page</strong>
    <div>Platform: ${pageInfo.platform}</div>
    <div style="font-size: 11px; color: #666; word-break: break-all;">${pageInfo.url}</div>
  `;

    document.getElementById('link').value = pageInfo.url;
    document.getElementById('platform').value = pageInfo.platform;

    if (pageInfo.platform.includes('codeforces')) {
        document.getElementById('platform').value = 'Codeforces';
    } else if (pageInfo.platform.includes('dmoj')) {
        document.getElementById('platform').value = 'DMOJ';
    } else if (pageInfo.platform.includes('leetcode')) {
        document.getElementById('platform').value = 'LeetCode';
    } else if (pageInfo.platform.includes('atcoder')) {
        document.getElementById('platform').value = 'AtCoder';
    }

    if (pageInfo.problemName) {
        document.getElementById('problemName').value = pageInfo.problemName;
        document.getElementById('problemName').style.backgroundColor = '#e7f3ff';
        const nameGroup = document.getElementById('problemName').parentElement;
        const label = nameGroup.querySelector('label');
        label.innerHTML = 'Problem Name <span style="color: #4CAF50; font-size: 10px;">✓ Auto-detected</span>';
    }
}

async function checkExistingProblem() {
    const pageInfo = await getPageInfo();
    const existing = await checkIfProblemExists(pageInfo.url);

    const existingDiv = document.getElementById('existingProblem');
    const addForm = document.getElementById('addForm');

    if (existing) {
        existingDiv.innerHTML = `
      <strong>✓ This problem is already saved</strong>
      <div><strong>Name:</strong> ${existing.name}</div>
      <div><strong>Status:</strong> ${existing.status}</div>
      <div style="margin-top: 10px;">
        <label style="font-size: 12px; font-weight: bold;">Update Status:</label>
        <select id="existingStatus" style="width: 100%; padding: 8px; margin-top: 5px;">
          <option value="unsolved" ${existing.status === 'unsolved' ? 'selected' : ''}>Unsolved</option>
          <option value="solving" ${existing.status === 'solving' ? 'selected' : ''}>Solving</option>
          <option value="solved" ${existing.status === 'solved' ? 'selected' : ''}>Solved</option>
          <option value="snoozed" ${existing.status === 'snoozed' ? 'selected' : ''}>Snoozed</option>
        </select>
      </div>
      <button id="updateStatus" class="update-btn" style="margin-top: 10px; width: 100%;">Update Status</button>
    `;
        existingDiv.classList.remove('hidden');

        setTimeout(() => {
            document.getElementById('updateStatus').addEventListener('click', async () => {
                const newStatus = document.getElementById('existingStatus').value;
                await updateProblemStatus(pageInfo.url, newStatus);
                showStatus('✅ Status updated!', 'success');
                await checkExistingProblem();
                await updatePendingDisplay();
            });
        }, 0);

        addForm.style.display = 'none';
    } else {
        existingDiv.classList.add('hidden');
        addForm.style.display = 'block';
    }
}

async function updatePendingDisplay() {
    const pending = await getPendingProblems();
    const count = pending.length;

    const countDiv = document.getElementById('pendingCount');
    const viewBtn = document.getElementById('viewPending');
    const exportBtn = document.getElementById('exportPending');
    const clearBtn = document.getElementById('clearPending');
    const syncBtn = document.getElementById('syncToApp');

    if (count > 0) {
        countDiv.textContent = `📋 ${count} problem${count > 1 ? 's' : ''} pending sync`;
        countDiv.classList.remove('hidden');
        viewBtn.classList.remove('hidden');
        exportBtn.classList.remove('hidden');
        clearBtn.classList.remove('hidden');
        syncBtn.classList.remove('hidden');
    } else {
        countDiv.classList.add('hidden');
        viewBtn.classList.add('hidden');
        exportBtn.classList.add('hidden');
        clearBtn.classList.add('hidden');
        syncBtn.classList.add('hidden');
        document.getElementById('pendingList').classList.add('hidden');
    }
}

async function syncToPythonApp() {
    const pending = await getPendingProblems();

    try {
        const response = await fetch('http://localhost:8765/add-problem', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(pending)
        });

        return await response.json();
    } catch (error) {
        console.error('Sync error:', error);
        return { status: 'error', message: 'Python app not running or CORS blocked' };
    }
}

function displayPendingList(problems) {
    const listDiv = document.getElementById('pendingList');

    if (problems.length === 0) {
        listDiv.classList.add('hidden');
        return;
    }

    const statusEmojis = {
        'unsolved': '❌',
        'solving': '🔄',
        'solved': '✅',
        'snoozed': '⭐'
    };

    listDiv.innerHTML = problems.map((p, i) => `
    <div class="pending-item">
        <strong>${statusEmojis[p.status] || ''} ${i + 1}. ${p.name}</strong>
        <div>
        ${p.platform} 
        ${p.difficulty > 0 ? `- DMOJ: ${p.difficulty}` : ''} 
        ${p.cf_rating > 0 ? `<span style="color: #2196F3;">(CF: ${p.cf_rating})</span>` : ''}
        </div>
        <div style="font-size: 10px; color: #666;">Saved: ${new Date(p.savedAt).toLocaleString()}</div>
    </div>
    `).join('');

    listDiv.classList.remove('hidden');
}

// Tab switching
document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
        const tabName = tab.dataset.tab;

        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');

        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });
        document.getElementById(`${tabName}Tab`).classList.add('active');
    });
});

function dmojToCf(x) {
    if (x <= 0) return 0;
    const cf = 570 * Math.pow(x, 0.329) * Math.log10(x);
    return Math.round(cf / 50) * 50;
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

// Handle rating type toggle
document.querySelectorAll('input[name="ratingType"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
        const label = document.getElementById('difficultyLabel');
        const input = document.getElementById('difficulty');

        if (e.target.value === 'cf') {
            label.textContent = 'Codeforces Rating (0 if unknown)';
            input.placeholder = '0';

            // Convert current DMOJ value to CF if exists
            const currentVal = parseInt(input.value) || 0;
            if (currentVal > 0) {
                input.value = dmojToCf(currentVal);
            }
        } else {
            label.textContent = 'Difficulty (DMOJ scale, 0 if unknown)';
            input.placeholder = '0';

            // Convert current CF value to DMOJ if exists
            const currentVal = parseInt(input.value) || 0;
            if (currentVal > 0) {
                input.value = cfToDmoj(currentVal);
            }
        }
    });
});

document.getElementById('difficulty').addEventListener('input', (e) => {
    const val = parseInt(e.target.value) || 0;
    const label = document.getElementById('difficultyLabel');
    const isDmoj = document.querySelector('input[name="ratingType"]:checked').value === 'dmoj';

    if (val > 0) {
        if (isDmoj) {
            const cfRating = dmojToCf(val);
            label.innerHTML = `Difficulty (DMOJ) <span style="color: #2196F3; margin-left: 10px;">→ Est. CF: ${cfRating}</span>`;
        } else {
            const dmojDiff = cfToDmoj(val);
            label.innerHTML = `Codeforces Rating <span style="color: #ff9800; margin-left: 10px;">→ Est. DMOJ: ${dmojDiff}</span>`;
        }
    } else {
        label.textContent = isDmoj ? 'Difficulty (DMOJ scale, 0 if unknown)' : 'Codeforces Rating (0 if unknown)';
    }
});

// Event Listeners
document.getElementById('saveProblem').addEventListener('click', async () => {
    const button = document.getElementById('saveProblem');
    const name = document.getElementById('problemName').value.trim();
    const inputValue = parseInt(document.getElementById('difficulty').value) || 0;
    const isCf = document.querySelector('input[name="ratingType"]:checked').value === 'cf';

    if (!name) {
        showStatus('❌ Please enter a problem name', 'error');
        return;
    }

    button.disabled = true;
    button.textContent = 'Saving...';

    try {
        // Determine DMOJ difficulty and CF rating based on input type
        let dmojDifficulty, cfRating;

        if (isCf) {
            // User entered CF rating
            cfRating = inputValue;
            dmojDifficulty = cfToDmoj(cfRating);
        } else {
            // User entered DMOJ difficulty
            dmojDifficulty = inputValue;
            cfRating = dmojToCf(dmojDifficulty);
        }

        const problemData = {
            name: name,
            platform: document.getElementById('platform').value.trim(),
            link: document.getElementById('link').value.trim(),
            difficulty: dmojDifficulty,
            cf_rating: cfRating,
            tags: document.getElementById('tags').value.split(',').map(t => t.trim()).filter(t => t),
            status: 'unsolved'
        };

        const result = await savePendingProblem(problemData);

        if (result.status === 'success' || result.status === 'updated') {
            showStatus(`✅ ${result.message}`, 'success');

            if (result.status === 'success') {
                document.getElementById('problemName').value = '';
                document.getElementById('tags').value = '';
                document.getElementById('difficulty').value = '0';
            }

            await updatePendingDisplay();
            await checkExistingProblem();
        } else {
            showStatus('❌ ' + result.message, 'error');
        }
    } catch (error) {
        showStatus('❌ Error: ' + error.message, 'error');
        console.error(error);
    } finally {
        button.disabled = false;
        button.textContent = 'Save Problem to Browser';
    }
});

document.getElementById('viewPending').addEventListener('click', async () => {
    const pending = await getPendingProblems();
    const listDiv = document.getElementById('pendingList');

    if (listDiv.classList.contains('hidden')) {
        displayPendingList(pending);
    } else {
        listDiv.classList.add('hidden');
    }
});

document.getElementById('exportPending').addEventListener('click', async () => {
    const pending = await getPendingProblems();

    if (pending.length === 0) {
        showStatus('No pending problems to export', 'info');
        return;
    }

    const jsonStr = JSON.stringify(pending, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `pending_problems_${new Date().toISOString().split('T')[0]}.json`;
    a.click();

    showStatus(`✅ Exported ${pending.length} problem${pending.length > 1 ? 's' : ''} to JSON`, 'success');
});

document.getElementById('clearPending').addEventListener('click', async () => {
    if (confirm('Are you sure you want to clear all pending problems? This cannot be undone.')) {
        await clearPendingProblems();
        await updatePendingDisplay();
        document.getElementById('pendingList').classList.add('hidden');
        showStatus('🗑️ All pending problems cleared', 'warning');
    }
});

document.getElementById('syncToApp').addEventListener('click', async () => {
    const button = document.getElementById('syncToApp');
    button.disabled = true;
    button.textContent = 'Syncing...';

    const result = await syncToPythonApp();

    if (result.status === 'success' || result.count > 0) {
        showStatus(`🚀 Successfully synced ${result.count || 'all'} problems!`, 'success');
        await clearPendingProblems();
        await updatePendingDisplay();
    } else {
        showStatus(`❌ Sync Failed: ${result.message}`, 'error');
    }

    button.disabled = false;
    button.textContent = '🔄 Sync to Python App';
});

// NEW: Open sidebar button handler
document.getElementById('openSidebar').addEventListener('click', async () => {
    try {
        const window = await chrome.windows.getCurrent();
        await chrome.sidePanel.open({ windowId: window.id });
    } catch (error) {
        console.error('Error opening sidebar:', error);
        showStatus('❌ Could not open sidebar: ' + error.message, 'error');
    }
});

// Initialize on popup open
(async () => {
    await displayPageInfo();
    await checkExistingProblem();
    await updatePendingDisplay();
})();