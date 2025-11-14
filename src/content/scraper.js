// LinkedIn People Scraper (single file) - now aligned to provided simplified XPaths
// Features: static scrape, auto paginate (Next button), real-time progress, cancellation
// Output fields: name, profileUrl, jobTitle (bio), location, currentTitle, followers, status
// Mapping note: user provided 'bio' XPath -> stored in existing 'jobTitle' field to avoid downstream schema changes.

(function () {
  if (window.__LINKEDIN_PEOPLE_SCRAPER__) {
    console.log('ℹ️ People scraper already initialized');
    return;
  }
  window.__LINKEDIN_PEOPLE_SCRAPER__ = true;
  console.log('✅ LinkedIn People Scraper Loaded');

  const DEBUG_VERBOSE = false; // toggle for deep per-field logging

  // ===== PROFESSIONAL TITLES REMOVAL =====
  // List of professional prefixes/titles to remove
  const PROFESSIONAL_TITLES = [
    "Dr", "Dr.", "Prof", "Prof.", "Assoc. Prof.", "Asst. Prof.", "PhD", "MD", "DDS", "DVM",
    "Eng", "Eng.", "Er.", "PE", "CEng", "MEng", "BEng", "MSc", "BSc",
    "MBA", "CFA", "CPA", "CA", "CFO", "CEO", "COO", "CTO", "CIO",
    "Sr.", "Jr.", "Snr.", "Senior", "Junior", "Lead", "Principal",
    "Hon.", "Adv.", "Judge", "Justice", "Gov.", "Amb.", "MP", "MLA",
    "Col.", "Lt.", "Lt. Col.", "Capt.", "Maj.", "Gen.", "Cmdr.", "Sgt.", "Off.",
    "Rev.", "Fr.", "Pastor", "Imam", "Rabbi", "Swami", "Guru", "Pandit",
    "Mr.", "Mrs.", "Ms.", "Miss", "Mx.", "Sir", "Dame", "Lady", "Lord"
  ];

  /**
   * Remove any professional title or prefix from a name string
   * @param {string} name - Raw LinkedIn name (e.g. "Dr. Altaf Khan", "Eng. Alex Johnson")
   * @returns {string} First name only (e.g. "Altaf")
   */
  function cleanAndExtractFirstName(name) {
    if (!name) return "";

    let cleaned = name.trim();

    // Remove any prefixes/titles at the start
    for (const title of PROFESSIONAL_TITLES) {
      const regex = new RegExp("^" + title.replace(/\./g, "\\.") + "\\s+", "i");
      cleaned = cleaned.replace(regex, "");
    }

    // Split by space and take the first word only
    const parts = cleaned.split(/\s+/);
    return parts[0] || "";
  }

  // Simplified: Only extract Connect button data for connection automation
  const xpaths = {
    name: [
      ".//div[@class='mb1']//a//span[@aria-hidden='true']",
      ".//span[contains(@class,'entity-result__title-text')]//span[@aria-hidden='true']",
      ".//a[contains(@href,'/in/')]//span[@aria-hidden='true'][1]",
      ".//a[contains(@href,'/in/')]"
    ]
  };

  // State
  const state = {
    cancelled: false,
    seenIds: new Set(),
    collected: [],
    iterations: 0,
    lastProgress: 0,
    limit: 0
  };

  // Utilities
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
  function hashString(str) { let h = 0, i = 0; while (i < str.length) { h = (h << 5) - h + str.charCodeAt(i++) | 0; } return 'p_' + (h >>> 0).toString(16); }
  function getText(xpath, context) {
    const res = document.evaluate(xpath, context, null, XPathResult.STRING_TYPE, null);
    return (res.stringValue || '').trim();
  }
  function getHref(xpath, context) {
    const res = document.evaluate(xpath, context, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
    return res.singleNodeValue ? res.singleNodeValue.href : '';
  }
  function safe(fn, ...args) { try { return fn(...args); } catch (e) { if (DEBUG_VERBOSE) console.warn('safe error', e); return null; } }

  // Container discovery (XPath-first). Updated for new DOM where results may be top-level <div componentkey="uuid"> blocks.
  const containerXPaths = [
    "//ul[@role='list']/li[.//div[@class='mb1']//a]", // primary provided container pattern
    "//div[@componentkey and .//a[@data-view-name='search-result-lockup-title']]",
    "//div[@componentkey and .//a[contains(@href,'/in/')]]",
    // legacy <li>-based containers:
    "//li[contains(@class,'reusable-search__result-container')][.//a[contains(@href,'/in/')]]",
    "//li[.//a[contains(@href,'/in/')]][contains(@class,'search')]",
    "//li[.//a[contains(@href,'/in/')]]"
  ];

  // Fallback: build synthetic containers from anchors if primary detection fails
  function buildContainersFromAnchors(max = 50) {
    const snap = document.evaluate("//a[contains(@href,'/in/')]/ancestor::li[1]", document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
    const arr = []; const seen = new Set();
    for (let i = 0; i < snap.snapshotLength && arr.length < max; i++) {
      const li = snap.snapshotItem(i);
      if (li && !seen.has(li)) { seen.add(li); arr.push(li); }
    }
    return arr;
  }

  function findAllContainers() {
    for (const xp of containerXPaths) {
      const snap = document.evaluate(xp, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
      if (snap.snapshotLength) {
        const arr = []; for (let i = 0; i < snap.snapshotLength; i++) arr.push(snap.snapshotItem(i));
        if (DEBUG_VERBOSE) console.log('Containers via', xp, arr.length);
        return { nodes: arr, xp, fallback: false };
      }
    }
    // fallback
    const anchors = buildContainersFromAnchors();
    if (anchors.length) {
      console.warn('⚠️ Using anchor-based fallback container detection. Count:', anchors.length);
      return { nodes: anchors, xp: 'fallback_anchor_li', fallback: true };
    }
    return { nodes: [], xp: null, fallback: false };
  }

  function countXPath(xpath) {
    try {
      const snap = document.evaluate(xpath, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
      return snap.snapshotLength;
    } catch (e) { return -1; }
  }

  function firstCandidateText(candidates, context) {
    if (!Array.isArray(candidates)) return '';
    for (const xp of candidates) {
      try {
        const res = document.evaluate(xp, context, null, XPathResult.STRING_TYPE, null).stringValue.trim();
        if (res) return res;
      } catch (_) { }
    }
    return '';
  }

  function firstCandidateHref(candidates, context) {
    if (!Array.isArray(candidates)) return '';
    for (const xp of candidates) {
      try {
        const res = document.evaluate(xp, context, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
        if (res && res.href) return res.href;
      } catch (_) { }
    }
    return '';
  }

  function globalFieldDiagnostics() {
    const diag = {};
    const nameXp = xpaths.name[0].startsWith('.//') ? xpaths.name[0].replace('.//', '//') : xpaths.name[0];
    diag.nameCount = countXPath(nameXp);
    diag.connectButtons = countXPath("//button[.//span[text()='Connect']]");
    diag.connectButtonsWithAria = countXPath("//button[contains(@aria-label, 'Connect with')]");
    return diag;
  }

  async function waitForPeopleDom(timeoutMs = 8000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const anchorCount = document.evaluate("//a[contains(@href,'/in/')]", document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null).snapshotLength;
      if (anchorCount > 2) return true;
      await sleep(250);
    }
    return false;
  }

  /**
   * Extract minimal connection data from a person container
   * Returns: { first_name, aria_label, btn_selector }
   */
  function extractPerson(node) {
    // Get full name and extract first name
    const fullName = firstCandidateText(xpaths.name, node);
    const firstName = cleanAndExtractFirstName(fullName);
    
    if (!firstName) return null;
    
    // Find Connect button within this container
    const connectBtn = node.querySelector('button[aria-label*="Connect with"]')
      || Array.from(node.querySelectorAll('button')).find(btn => 
        btn.querySelector('span') && btn.querySelector('span').textContent.trim() === 'Connect'
      );
    
    if (!connectBtn) {
      console.warn(`⚠️ No Connect button found for ${firstName}`);
      return null;
    }
    
    const ariaLabel = connectBtn.getAttribute('aria-label') || `Connect with ${firstName}`;
    const btnSelector = `button[aria-label="${ariaLabel}"]`;
    
    const internalId = hashString(`${firstName}_${ariaLabel}`);
    const record = { 
      internalId, 
      first_name: firstName, 
      aria_label: ariaLabel, 
      btn_selector: btnSelector 
    };
    
    // Send real-time data
    chrome.runtime.sendMessage({ 
      action: 'real_time_person_data', 
      data: { first_name: firstName, aria_label: ariaLabel, btn_selector: btnSelector } 
    }, () => { });
    
    return record;
  }

  function scrapeStatic(limit) {
    const { nodes, xp, fallback } = findAllContainers();
    if (nodes.length === 0) {
      console.warn('❌ No containers found during static scrape');
      console.table(globalFieldDiagnostics());
    } else {
      console.log(`📦 Using container XPath: ${xp} (fallback=${fallback}) count=${nodes.length}`);
    }
    const people = [];
    for (const n of nodes) {
      if (people.length >= limit) break;
      const p = extractPerson(n);
      if (p) { people.push(p); }
    }
    return people.map(({ internalId, ...rest }) => rest);
  }

  function scrapeNew(limitRemaining) {
    const { nodes } = findAllContainers();
    const batch = [];
    for (const n of nodes) {
      if (batch.length >= limitRemaining) break;
      if (n.getAttribute('data-li-scraped') === '1') continue;
      const p = extractPerson(n);
      n.setAttribute('data-li-scraped', '1');
      if (p) { batch.push(p); chrome.runtime.sendMessage({ action: 'real_time_new_person', person: { ...p, internalId: undefined } }, () => { }); }
    }
    return batch;
  }

  async function autoPaginate(limit, waitMs) {
    state.cancelled = false;
    state.seenIds.clear();
    state.collected = [];
    state.iterations = 0;
    state.limit = limit;
    const baseWait = waitMs || 1600;
    let emptyStreak = 0;

    while (!state.cancelled && state.collected.length < limit) {
      const before = state.collected.length;
      const newPeople = scrapeNew(limit - state.collected.length);
      for (const p of newPeople) {
        if (!state.seenIds.has(p.internalId)) {
          state.seenIds.add(p.internalId);
          state.collected.push(p);
          if (state.collected.length >= limit) break;
        }
      }
      const gained = state.collected.length - before;
      emptyStreak = gained === 0 ? emptyStreak + 1 : 0;
      maybeProgress();
      if (state.collected.length >= limit) break;
      if (emptyStreak >= 5) {
        console.warn('🛑 Stopping after 5 empty iterations. Diagnostics:');
        console.table(globalFieldDiagnostics());
        break;
      }
      // Attempt to click Next
      clickNext();
      // Scroll stimulation
      window.scrollBy({ top: 600, behavior: 'smooth' });
      await sleep(baseWait * 0.5);
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });
      await sleep(baseWait * 0.5);
      state.iterations++;
    }
    if (state.cancelled) chrome.runtime.sendMessage({ action: 'scrape_cancelled' }, () => { });
    return state.collected.slice(0, limit).map(({ internalId, ...r }) => r);
  }

  function clickNext() {
    try {
      const nextBtn = document.querySelector('button.artdeco-pagination__button--next:not([disabled])')
        || document.querySelector('button[aria-label="Next"]:not([disabled])')
        || document.querySelector('button[aria-label="Next page"]:not([disabled])')
        || document.querySelector('button[data-testid="pagination-control-next-btn"]:not([disabled])');
      if (nextBtn) { nextBtn.click(); return true; }
    } catch (e) { }
    return false;
  }

  function maybeProgress() {
    const now = Date.now();
    if (now - state.lastProgress > 700) {
      chrome.runtime.sendMessage({ action: 'scrape_progress', mode: 'auto', count: state.collected.length, limit: state.limit, iterations: state.iterations }, () => { });
      state.lastProgress = now;
    }
  }

  function pageInfo() {
    const { nodes, xp } = findAllContainers();
    return { url: window.location.href, containerXPathUsed: xp, containerCount: nodes.length };
  }

  // ===== CONNECTION REQUEST AUTOMATION =====
  const connectionState = {
    cancelled: false,
    sent: 0,
    failed: 0,
    total: 0,
    currentIndex: 0
  };

  /**
   * Find all visible Connect buttons on the page using XPath
   * @returns {Array} Array of button elements
   */
  function findConnectButtons() {
    const buttons = [];
    const xpath = "//button[.//span[text()='Connect']]";
    const result = document.evaluate(xpath, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
    
    for (let i = 0; i < result.snapshotLength; i++) {
      const btn = result.snapshotItem(i);
      // Check if button is visible and not disabled
      if (btn && !btn.disabled && btn.offsetParent !== null) {
        buttons.push(btn);
      }
    }
    
    console.log(`🔍 Found ${buttons.length} Connect buttons`);
    return buttons;
  }

  /**
   * Generate personalized note from template
   * @param {string} template - Message template with {first_name} placeholder
   * @param {string} firstName - Person's first name
   * @returns {string} Personalized message
   */
  function generatePersonalizedNote(template, firstName) {
    if (!template) return "";
    return template.replace(/{first_name}/g, firstName || "there");
  }

  /**
   * Click a Connect button using selector and add note if enabled
   * @param {string} btnSelector - CSS selector for the Connect button
   * @param {string} note - Personalized note to add
   * @param {boolean} addNote - Whether to add a note
   * @returns {Promise<boolean>} Success status
   */
  async function clickConnectButton(btnSelector, note, addNote) {
    try {
      // Find and click the Connect button using the stored selector
      const button = document.querySelector(btnSelector);
      
      if (!button) {
        console.error(`❌ Button not found: ${btnSelector}`);
        return false;
      }
      
      button.click();
      console.log('✅ Clicked Connect button:', btnSelector);
      
      // Wait for modal to appear
      await sleep(1500);
      
      if (addNote && note) {
        // Try to find "Add a note" button
        const addNoteBtn = document.querySelector('button[aria-label*="note"]') 
          || Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Add a note'));
        
        if (addNoteBtn) {
          addNoteBtn.click();
          await sleep(800);
          
          // Find the textarea and insert note
          const textarea = document.querySelector('textarea[name="message"]')
            || document.querySelector('textarea[aria-label*="note"]')
            || document.querySelector('textarea');
          
          if (textarea) {
            textarea.value = note;
            textarea.dispatchEvent(new Event('input', { bubbles: true }));
            console.log('📝 Note added:', note);
            await sleep(500);
          }
        }
      }
      
      // Find and click Send button
      const sendBtn = document.querySelector('button[aria-label*="Send"]')
        || Array.from(document.querySelectorAll('button')).find(b => 
            b.textContent.trim() === 'Send' || b.textContent.includes('Send invitation')
          );
      
      if (sendBtn && !sendBtn.disabled) {
        sendBtn.click();
        console.log('📤 Sent connection request');
        await sleep(1000);
        return true;
      } else {
        console.warn('⚠️ Send button not found or disabled');
        // Try to close modal
        const closeBtn = document.querySelector('button[aria-label*="Dismiss"]')
          || document.querySelector('button[data-test-modal-close-btn]');
        if (closeBtn) closeBtn.click();
        return false;
      }
    } catch (error) {
      console.error('❌ Error in clickConnectButton:', error);
      return false;
    }
  }

  /**
   * Send connection requests to all found people
   * @param {Object} options - Configuration options
   * @returns {Promise<Object>} Results object
   */
  async function sendConnectionRequests(options) {
    const {
      people = [],
      noteTemplate = "",
      addNote = false,
      delayMin = 3000,
      delayMax = 8000
    } = options;

    connectionState.cancelled = false;
    connectionState.sent = 0;
    connectionState.failed = 0;
    connectionState.total = people.length;
    connectionState.currentIndex = 0;

    console.log(`🚀 Starting to send ${people.length} connection requests`);
    chrome.runtime.sendMessage({ 
      action: 'connection_progress', 
      data: { sent: 0, failed: 0, total: people.length, status: 'started' }
    }, () => {});

    for (let i = 0; i < people.length; i++) {
      if (connectionState.cancelled) {
        console.log('🛑 Connection sending cancelled by user');
        break;
      }

      const person = people[i];
      connectionState.currentIndex = i;

      // Check if button still exists on page
      const buttonExists = document.querySelector(person.btn_selector);
      
      if (!buttonExists) {
        console.warn(`⚠️ Button not found for ${person.first_name}, scrolling...`);
        window.scrollBy({ top: 400, behavior: 'smooth' });
        await sleep(2000);
        
        // Check again after scroll
        if (!document.querySelector(person.btn_selector)) {
          connectionState.failed++;
          console.warn(`⚠️ Button still not found for ${person.first_name}`);
          continue;
        }
      }

      // Generate personalized note
      const personalizedNote = addNote ? generatePersonalizedNote(noteTemplate, person.first_name) : "";

      console.log(`📧 Sending connection to: ${person.first_name}`);
      if (addNote) {
        console.log(`   Note: ${personalizedNote}`);
      }

      // Send the connection request using the stored button selector
      const success = await clickConnectButton(person.btn_selector, personalizedNote, addNote);

      if (success) {
        connectionState.sent++;
      } else {
        connectionState.failed++;
      }

      // Send progress update
      chrome.runtime.sendMessage({ 
        action: 'connection_progress', 
        data: { 
          sent: connectionState.sent, 
          failed: connectionState.failed, 
          total: connectionState.total,
          current: i + 1,
          currentName: person.first_name,
          status: 'processing'
        }
      }, () => {});

      // Random delay between requests (human-like behavior)
      if (i < people.length - 1) {
        const delay = Math.floor(Math.random() * (delayMax - delayMin + 1)) + delayMin;
        console.log(`⏳ Waiting ${(delay/1000).toFixed(1)}s before next request...`);
        await sleep(delay);

        // Scroll to keep new buttons in view
        window.scrollBy({ top: 300, behavior: 'smooth' });
        await sleep(500);
      }
    }

    const results = {
      sent: connectionState.sent,
      failed: connectionState.failed,
      total: connectionState.total,
      cancelled: connectionState.cancelled
    };

    console.log('✅ Connection sending completed:', results);
    chrome.runtime.sendMessage({ 
      action: 'connection_progress', 
      data: { ...results, status: 'completed' }
    }, () => {});

    return results;
  }


  // Messaging API
  chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
    try {
      switch (req.action) {
        case 'ping_scraper':
          sendResponse({ ok: true, loaded: true, people: true });
          return false;
    
        case 'get_page_info':
          sendResponse({ ok: true, info: pageInfo() });
          return false;
        case 'scrape_people': {
          (async () => { await waitForPeopleDom(); })();
          const data = scrapeStatic(req.limit || 50);
          sendResponse({ ok: true, mode: 'static', people: data, count: data.length });
          return false;
        }
        case 'auto_scrape_people': {
          const limit = req.limit || 50;
          (async () => {
            try {
              const result = await autoPaginate(limit, (req.options && req.options.waitMs) || 1600);
              sendResponse({ ok: true, mode: 'auto', people: result, count: result.length, cancelled: state.cancelled });
            } catch (e) { sendResponse({ ok: false, error: e.message }); }
          })();
          return true; // async
        }
        case 'cancel_scrape':
          state.cancelled = true;
          sendResponse({ ok: true, cancelling: true });
          return false;
        case 'send_connection_requests': {
          const { people, noteTemplate, addNote, delayMin, delayMax } = req;
          (async () => {
            try {
              const result = await sendConnectionRequests({ 
                people, 
                noteTemplate, 
                addNote, 
                delayMin: delayMin || 3000, 
                delayMax: delayMax || 8000 
              });
              sendResponse({ ok: true, result });
            } catch (e) { 
              sendResponse({ ok: false, error: e.message }); 
            }
          })();
          return true; // async
        }
        case 'cancel_connections':
          connectionState.cancelled = true;
          sendResponse({ ok: true, cancelling: true });
          return false;
        case 'find_connect_buttons': {
          const buttons = findConnectButtons();
          sendResponse({ ok: true, count: buttons.length });
          return false;
        }
        default:
          sendResponse({ ok: false, error: 'Unknown action' });
          return false;
      }
    } catch (e) {
      try { sendResponse({ ok: false, error: e.message }); } catch (_) { }
      return false;
    }
  });
})();
