const usernameInput = document.getElementById('username');
const checkButton = document.getElementById('check-username');
const errorMessage = document.getElementById('error-message');
const includeClaimedCheckbox = document.getElementById('include-claimed');
const usernameLengthSelect = document.getElementById('username-length');
const includeLettersCheckbox = document.getElementById('include-letters');
const includeNumbersCheckbox = document.getElementById('include-numbers');
const includeUnderscoreCheckbox = document.getElementById('include-underscore');
const launchScanButton = document.getElementById('launch-scan');
const pauseScanButton = document.getElementById('pause-scan');
const stopScanButton = document.getElementById('stop-scan');
const estimatedTimeLabel = document.getElementById('estimated-time');
const progressBarInner = document.getElementById('progress-bar-inner');
const progressText = document.getElementById('progress-text');
const outputDiv = document.getElementById('output');
const saveOutputButton = document.getElementById('save-output');
const saveMessage = document.getElementById('save-message');
const warningMessage = document.getElementById('warning-message');

let scanning = false;
let paused = false;
let scanData = {};
let totalPausedTime = 0;
let pauseStartTime = 0;
const MAX_BULK_SIZE = 10; // Max number of usernames per bulk request

// Populate username length options (1 to 16) and set default to 3
function populateUsernameLength() {
  for (let i = 1; i <= 16; i++) {
    const option = document.createElement('option');
    option.value = i;
    option.text = i;
    if (i === 3) {
      option.selected = true; // Default selection is 3
    }
    usernameLengthSelect.appendChild(option);
  }
}

// Run the function to populate the dropdown on page load
populateUsernameLength();

// Single Username Lookup Function (remains the same)
function checkUsername() {
  const username = usernameInput.value.trim();
  if (username.length === 0 || username.length > 16) {
    errorMessage.textContent = "A username must be between 1 and 16 characters long.";
    return;
  }
  if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    errorMessage.textContent = "The username cannot contain any special characters.";
    return;
  }
  errorMessage.textContent = "";
  outputDiv.innerHTML = "";

  const proxyUrl = "https://web-production-787c.up.railway.app/";
  const apiUrl = `https://api.mojang.com/users/profiles/minecraft/${username}`;

  fetchWithRetry(proxyUrl + apiUrl)
    .then((data) => {
      if (data === null || (data && data.errorMessage && data.errorMessage.includes("Couldn't find any profile with name"))) {
        outputDiv.innerHTML += `<span class="available">${username} is available</span>`;
      } else if (data && data.id) {
        outputDiv.innerHTML += `<span class="claimed">${username} is claimed - ${data.id}</span>`;
      } else {
        outputDiv.innerHTML += `<span class="error">Error: Unexpected response</span>`;
      }
    })
    .catch((error) => {
      outputDiv.innerHTML += `<span class="error">Error: ${error}</span>`;
    });
}

checkButton.addEventListener('click', checkUsername);

// Fetch with Retry Function (unchanged)
function fetchWithRetry(url, delay = 1000) {
  return new Promise((resolve) => {
    function attempt() {
      fetch(url)
        .then((response) => {
          if (response.status === 204) return resolve(null);
          return response.json();
        })
        .then((data) => {
          if (data === null || (data && data.errorMessage && data.errorMessage.includes("Couldn't find any profile with name"))) {
            resolve(null); // Username available
          } else if (data && data.id) {
            resolve(data); // Username claimed
          } else {
            // Retry on unexpected data
            setTimeout(attempt, delay);
          }
        })
        .catch(() => {
          // Retry on network error or rate limit
          setTimeout(attempt, delay);
        });
    }
    attempt();
  });
}

// Launch Scan with Bulk Requests
async function launchScan() {
  if (scanning) {
    errorMessage.textContent = "A scan is already in progress.";
    return;
  }

  // Disable individual username search during scan
  checkButton.disabled = true;
  checkButton.classList.add('flat');
  checkButton.classList.remove('active');

  const includeLetters = includeLettersCheckbox.checked;
  const includeNumbers = includeNumbersCheckbox.checked;
  const includeUnderscore = includeUnderscoreCheckbox.checked;
  const length = parseInt(usernameLengthSelect.value); // Get the selected value
  const includeClaimed = includeClaimedCheckbox.checked;

  if (!includeLetters && !includeNumbers && !includeUnderscore) {
    errorMessage.textContent = "You must include at least one of letters, numbers, or underscores.";
    return;
  }

  const totalPossibleUsernames = estimateTotalUsernames(length, includeLetters, includeNumbers, includeUnderscore);

  errorMessage.textContent = "";
  warningMessage.textContent = "";

  const usernameGenerator = generateUsernames(length, includeLetters, includeNumbers, includeUnderscore);

  scanData = {
    generator: usernameGenerator,
    total: totalPossibleUsernames,
    scanned: 0,
    startTime: Date.now(),
    pausedTime: 0,
  };

  outputDiv.innerHTML = '';
  progressBarInner.style.width = '0%';
  progressText.textContent = `0/${scanData.total}`;
  estimatedTimeLabel.textContent = `Estimated time: 0h 0m 0s`;

  scanning = true;
  paused = false;
  totalPausedTime = 0;

  // Update button states
  pauseScanButton.disabled = false;
  stopScanButton.disabled = false;

  // Animate buttons to "Active" state
  pauseScanButton.classList.remove('flat');
  pauseScanButton.classList.add('active');
  stopScanButton.classList.remove('flat');
  stopScanButton.classList.add('active');

  // Make Launch Scan button inactive
  launchScanButton.disabled = true;
  launchScanButton.classList.remove('active');
  launchScanButton.classList.add('flat');

  scanNextBulk(includeClaimed);
}

launchScanButton.addEventListener('click', launchScan);

// Scan in Bulk of 10 Usernames
async function scanNextBulk(includeClaimed) {
  if (!scanning || paused || scanData.scanned >= scanData.total) {
    if (scanData.scanned >= scanData.total) {
      // Scan complete
      scanning = false;
      pauseScanButton.disabled = true;
      stopScanButton.disabled = true;
      warningMessage.textContent = "Scan complete.";

      // Animate buttons back to "2D"
      pauseScanButton.classList.add('flat');
      pauseScanButton.classList.remove('active');
      stopScanButton.classList.add('flat');
      stopScanButton.classList.remove('active');

      // Re-enable Launch Scan button
      launchScanButton.disabled = false;
      launchScanButton.classList.remove('flat');
      launchScanButton.classList.add('active');

      // Re-enable individual username search
      checkButton.disabled = false;
      checkButton.classList.remove('flat');
      checkButton.classList.add('active');
    }
    return;
  }

  const usernames = [];
  for (let i = 0; i < MAX_BULK_SIZE; i++) {
    const { value: username, done } = scanData.generator.next();
    if (done) break;
    usernames.push(username);
  }

  if (usernames.length === 0) {
    scanning = false;
    return;
  }

  const proxyUrl = "https://web-production-787c.up.railway.app/";
  const apiUrl = `https://api.minecraftservices.com/minecraft/profile/lookup/bulk/byname`;

  try {
    const response = await fetch(proxyUrl + apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(usernames)
    });

    const data = await response.json();

    const claimedNames = new Set(data.map(item => item.name.toLowerCase()));

    usernames.forEach(username => {
      if (claimedNames.has(username.toLowerCase())) {
        const profile = data.find(item => item.name.toLowerCase() === username.toLowerCase());
        if (includeClaimed) {
          outputDiv.innerHTML += `<span class="claimed">${profile.name} is claimed - ${profile.id}</span>`;
        }
      } else {
        outputDiv.innerHTML += `<span class="available">${username} is available</span>`;
      }
    });

    scanData.scanned += usernames.length;
    updateProgress();

    // Scroll to bottom to show the latest result
    outputDiv.scrollTop = outputDiv.scrollHeight;

    // Proceed to the next bulk of usernames asynchronously to keep the UI responsive
    setTimeout(() => scanNextBulk(includeClaimed), 0);
  } catch (error) {
    scanData.scanned += usernames.length;
    updateProgress();
    setTimeout(() => scanNextBulk(includeClaimed), 0);
  }
}

// Update Progress Function (unchanged)
function updateProgress() {
  const progress = (scanData.scanned / scanData.total) * 100;
  progressBarInner.style.width = `${progress}%`;
  progressText.textContent = `${scanData.scanned}/${scanData.total}`;

  // Calculate estimated time remaining
  const now = Date.now();
  const elapsedTime = (now - scanData.startTime - scanData.pausedTime) / 1000; // in seconds
  const averageTimePerScan = scanData.scanned > 0 ? elapsedTime / scanData.scanned : 0;
  const estimatedTotalTime = averageTimePerScan * scanData.total;
  const estimatedTimeRemaining = estimatedTotalTime - elapsedTime;

  // Format ETA based on conditions
  let formattedETA = formatTime(estimatedTimeRemaining);
  if (estimatedTimeRemaining > 36000) { // Above 10 hours
    const hours = Math.floor(estimatedTimeRemaining / 3600);
    formattedETA = `${hours}h`;
  }
  if (estimatedTimeRemaining > 3.6e6) { // Above 1000 hours
    formattedETA = `${(estimatedTimeRemaining / 3.6e6).toExponential(2)}h`;
  }

  estimatedTimeLabel.textContent = `Estimated time: ${formattedETA}`;
}

// Format Time Function (unchanged)
function formatTime(seconds) {
  if (seconds < 0 || isNaN(seconds)) {
    return '0h 0m 0s';
  }
  const hours = Math.floor(seconds / 3600);
  seconds = seconds % 3600;
  const minutes = Math.floor(seconds / 60);
  const sec = Math.floor(seconds % 60);
  return `${hours}h ${minutes}m ${sec}s`;
}

// Save Output Function (unchanged)
function saveOutput() {
  const content = outputDiv.innerText;
  if (content.trim() === '') {
    saveMessage.textContent = 'Textbox is empty. Nothing to save.';
    saveMessage.style.color = '#ff4d4d'; // Red color for error
    return;
  }
  const currentTime = new Date();
  const filename = currentTime.toISOString().replace(/[:.]/g, '-') + '_Output.txt';
  const fileBlob = new Blob([content], { type: 'text/plain' });

  const downloadLink = document.createElement('a');
  downloadLink.href = URL.createObjectURL(fileBlob);
  downloadLink.download = filename;
  downloadLink.click();

  saveMessage.textContent = 'Output saved to file!';
  saveMessage.style.color = '#00ff85'; // Green color for success
}

saveOutputButton.addEventListener('click', saveOutput);
