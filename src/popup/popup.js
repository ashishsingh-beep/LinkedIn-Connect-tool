// PEOPLE MODE POPUP
const downloadJSONBtn = document.getElementById('downloadJSONBtn');
const downloadCSVBtn = document.getElementById('downloadCSVBtn');
const peopleDiv = document.getElementById('people');

// Connection request elements
const connectionLimit = document.getElementById('connectionLimit');
const addNoteToggle = document.getElementById('addNoteToggle');
const noteTemplateWrapper = document.getElementById('noteTemplateWrapper');
const noteTemplate = document.getElementById('noteTemplate');
const sendConnectionsBtn = document.getElementById('sendConnectionsBtn');
const cancelConnectionsBtn = document.getElementById('cancelConnectionsBtn');
const connectionProgress = document.getElementById('connectionProgress');
const connectionProgressFill = document.getElementById('connectionProgressFill');
const connectionProgressText = document.getElementById('connectionProgressText');
const connectButtonsInfo = document.getElementById('connectButtonsInfo');

// Verify critical elements exist
if (!sendConnectionsBtn) {
  console.error('❌ sendConnectionsBtn element not found in DOM!');
}

let connectionSendingActive = false;
let scrapedPeople = [];

// Quick search elements
const quickSearchInput = document.getElementById('liQuickSearch');
const quickSearchBtn = document.getElementById('liQuickSearchBtn');
const urlSearchInput = document.getElementById('liUrlSearch');
const urlSearchBtn = document.getElementById('liUrlSearchBtn');

if(quickSearchInput && quickSearchBtn){
  function updateSearchBtn(){
    const hasValue = quickSearchInput.value.trim().length>0;
    quickSearchBtn.disabled = !hasValue;
  }
  quickSearchInput.addEventListener('input', updateSearchBtn);
  quickSearchInput.addEventListener('keydown', e=>{ if(e.key==='Enter' && !quickSearchBtn.disabled){ quickSearchBtn.click(); }});
  quickSearchBtn.addEventListener('click', ()=>{
    const q = quickSearchInput.value.trim();
    if(!q) return; // safety
    const url = `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(q)}`;
    // Open in current active tab if it's LinkedIn, else new tab
    chrome.tabs.query({active:true,currentWindow:true}, tabs => {
      if(tabs && tabs[0] && /linkedin\.com/.test(tabs[0].url||'')){
        chrome.tabs.update(tabs[0].id, {url});
      } else {
        chrome.tabs.create({url});
      }
    });
  });
  updateSearchBtn();
}

// URL search functionality
if(urlSearchInput && urlSearchBtn){
  function updateUrlSearchBtn(){
    const hasValue = urlSearchInput.value.trim().length>0;
    urlSearchBtn.disabled = !hasValue;
  }
  urlSearchInput.addEventListener('input', updateUrlSearchBtn);
  urlSearchInput.addEventListener('keydown', e=>{ if(e.key==='Enter' && !urlSearchBtn.disabled){ urlSearchBtn.click(); }});
  urlSearchBtn.addEventListener('click', ()=>{
    const url = urlSearchInput.value.trim();
    if(!url) return;
    if(!url.includes('linkedin.com')){
      alert('Please enter a valid LinkedIn URL');
      return;
    }
    chrome.tabs.query({active:true,currentWindow:true}, tabs => {
      if(tabs && tabs[0]){
        chrome.tabs.update(tabs[0].id, {url});
      } else {
        chrome.tabs.create({url});
      }
    });
  });
  updateUrlSearchBtn();
}

// Note template toggle
if(addNoteToggle && noteTemplateWrapper){
  addNoteToggle.addEventListener('change', ()=>{
    noteTemplateWrapper.style.display = addNoteToggle.checked ? 'block' : 'none';
  });
}

function setStatus(msg, type='info') {
  peopleDiv.innerHTML = `<div class="status status-${type}">${msg}</div>`;
}
function enableDownloadButtons(on){ downloadJSONBtn.disabled = !on; downloadCSVBtn.disabled = !on; }

// Robust messaging with timeout
function sendMessageSafely(tabId, message, cb, timeoutMs=10000){
  let done=false; const to=setTimeout(()=>{ if(!done){done=true; cb && cb(null,{message:'timeout'});} },timeoutMs);
  chrome.tabs.sendMessage(tabId, message, resp=>{
    if(done) return; done=true; clearTimeout(to);
    if(chrome.runtime.lastError) return cb && cb(null, chrome.runtime.lastError);
    cb && cb(resp,null);
  });
}

// Listen for real-time events
chrome.runtime.onMessage.addListener(msg => {
  if(msg.action==='connection_progress'){
    // Update connection progress
    const { sent, failed, total, current, currentName, currentPage, status } = msg.data;
    
    if(status === 'started'){
      connectionProgress.style.display = 'block';
      connectionProgressFill.style.width = '0%';
      connectionProgressText.textContent = '🚀 Starting auto-paginate connection sender...';
    } else if(status === 'processing'){
      const pct = total > 0 ? Math.round((sent + failed) / total * 100) : 0;
      connectionProgressFill.style.width = pct + '%';
      const pageInfo = currentPage ? ` | Page ${currentPage}` : '';
      connectionProgressText.textContent = `✅ Sent: ${sent} | ❌ Failed: ${failed}${pageInfo}`;
      if(currentName){
        connectionProgressText.textContent += ` | Current: ${currentName}`;
      }
    } else if(status === 'completed'){
      const pct = 100;
      connectionProgressFill.style.width = pct + '%';
      connectionProgressText.textContent = `🎉 Completed! Sent: ${sent} | Failed: ${failed}`;
      connectionSendingActive = false;
      sendConnectionsBtn.disabled = false;
      cancelConnectionsBtn.disabled = true;
    }
  }
});

enableDownloadButtons(false);

downloadJSONBtn.addEventListener('click', ()=>{
  if(!scrapedPeople.length) return alert('No data yet');
  triggerJSON(scrapedPeople);
});
downloadCSVBtn.addEventListener('click', ()=>{
  if(!scrapedPeople.length) return alert('No data yet');
  triggerCSV(scrapedPeople);
});

function triggerJSON(data){
  const blob = new Blob([JSON.stringify(data,null,2)], {type:'application/json'});
  const url = URL.createObjectURL(blob); const a=document.createElement('a');
  a.href=url; a.download=`linkedin_people_${Date.now()}.json`; a.click(); URL.revokeObjectURL(url);
}
function triggerCSV(data){
  const headers = Object.keys(data[0]);
  const esc=v=> (''+v).replace(/"/g,'""');
  const rows = [headers.join(','), ...data.map(r=> headers.map(h=>`"${esc(r[h])}"`).join(','))];
  const blob = new Blob([rows.join('\n')], {type:'text/csv'});
  const url = URL.createObjectURL(blob); const a=document.createElement('a');
  a.href=url; a.download=`linkedin_people_${Date.now()}.csv`; a.click(); URL.revokeObjectURL(url);
}
// autoDownload removed per specification (user must click)

// Send Connection Requests Button
if (sendConnectionsBtn) {
  sendConnectionsBtn.addEventListener('click', () => {
    if(connectionSendingActive) return;
  
    const addNote = addNoteToggle.checked;
    const template = addNote ? noteTemplate.value.trim() : '';
    const limit = parseInt(connectionLimit.value) || 50;
  
    if(addNote && !template){
      alert('Please enter a note template or disable "Add personalized note"');
      return;
    }
  
    if(addNote && !template.includes('{first_name}')){
      const confirm = window.confirm('Your template does not contain {first_name} placeholder. Continue anyway?');
      if(!confirm) return;
    }
  
    // Start AUTO-PAGINATE mode (scans page, sends requests, goes to next page)
    connectionSendingActive = true;
    sendConnectionsBtn.disabled = true;
    cancelConnectionsBtn.disabled = false;
    connectionProgress.style.display = 'block';
    connectionProgressFill.style.width = '0%';
    connectionProgressText.textContent = `🚀 Sending up to ${limit} connection requests...`;
  
    chrome.tabs.query({active:true,currentWindow:true}, tabs => {
      if(!tabs||!tabs.length){ 
        alert('No active tab found');
        connectionSendingActive = false;
        sendConnectionsBtn.disabled = false;
        cancelConnectionsBtn.disabled = true;
        return; 
      }
    
      const tabId = tabs[0].id;
    
      // Use AUTO-SEND mode with connection limit
      sendMessageSafely(tabId, {
        action: 'auto_send_connection_requests',
        noteTemplate: template,
        addNote: addNote,
        delayMin: 3000,  // 3 seconds minimum
        delayMax: 8000,  // 8 seconds maximum
        maxConnections: limit,  // User-specified limit
        peoplePerPage: 10  // 10 people per page
      }, (resp, err) => {
        connectionSendingActive = false;
        sendConnectionsBtn.disabled = false;
        cancelConnectionsBtn.disabled = true;
      
        if(err || !resp || !resp.ok){
          alert(`Error sending connections: ${err?.message || resp?.error || 'Unknown error'}`);
          connectionProgressText.textContent = '❌ Error occurred';
          return;
        }
      
        const { sent, failed, pagesProcessed, cancelled } = resp.result;
      
        if(cancelled){
          alert(`Connection sending cancelled.\n\nSent: ${sent}\nFailed: ${failed}\nPages: ${pagesProcessed || 0}`);
        } else {
          alert(`✅ Auto-send completed!\n\nSent: ${sent}\nFailed: ${failed}\nPages processed: ${pagesProcessed || 0}`);
        }
      }, 600000); // 10 minute timeout for auto-paginate
    });
  });
} else {
  console.error('❌ sendConnectionsBtn not found, cannot attach event listener!');
}

// Cancel Connection Requests Button
if (cancelConnectionsBtn) {
  cancelConnectionsBtn.addEventListener('click', () => {
  if(!connectionSendingActive) return;
  
  const confirmCancel = window.confirm('Are you sure you want to cancel sending connection requests?');
  if(!confirmCancel) return;
  
  chrome.tabs.query({active:true,currentWindow:true}, tabs => {
    if(!tabs||!tabs.length) return;
    
    sendMessageSafely(tabs[0].id, {action: 'cancel_connections'}, () => {
      connectionProgressText.textContent += ' (Cancelling...)';
    });
  });
  });
} else {
  console.error('❌ cancelConnectionsBtn not found, cannot attach event listener!');
}

// Initial status based on active tab URL
chrome.tabs.query({active:true,currentWindow:true}, tabs => {
  if(tabs && tabs[0] && tabs[0].url){
    const u = tabs[0].url;
    if(!/linkedin\.com/.test(u)) setStatus('Open LinkedIn people search page to begin','info');
    else if(!/\/search\/results\/people\//.test(u)) setStatus('Navigate to LinkedIn People Search results','info');
    else setStatus('Ready to scrape people','info');
  }
  setScrapingState(false);
});
