// Linkedin connect request sender tool.

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

  // Exact XPaths for invite modal controls
  const modalXpaths = {
    addNoteButton: "//button[@aria-label='Add a note']",
    messageTextarea: "//textarea[@id='custom-message']",
    sendButton: "//button[@aria-label='Send invitation']"
  };

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
  
  /**
   * Wait for an element to appear in the DOM
   * @param {string} selector - CSS selector to wait for
   * @param {number} timeout - Maximum wait time in milliseconds
   * @param {number} interval - Check interval in milliseconds
   * @returns {Promise<Element|null>} The element if found, null if timeout
   */
  async function waitForElement(selector, timeout = 5000, interval = 100) {
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      const element = document.querySelector(selector);
      if (element) {
        return element;
      }
      await sleep(interval);
    }
    return null;
  }
  
  /**
   * Wait for the first node matching an XPath to appear
   * @param {string} xpath - XPath selector to evaluate
   * @param {number} timeout - Maximum wait time in milliseconds
   * @param {number} interval - Polling interval in milliseconds
   * @returns {Promise<Element|null>} The matched element or null on timeout
   */
  async function waitForXPath(xpath, timeout = 5000, interval = 100) {
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      const node = document
        .evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null)
        .singleNodeValue;
      if (node) return node;
      await sleep(interval);
    }
    return null;
  }
  
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

  // ===== MESSAGE SANITIZATION =====
  function sanitizeNote(text, maxLen = 280) {
    if (!text) return '';
    // Strip any HTML tags
    const noHtml = String(text).replace(/<[^>]*>/g, '');
    // Normalize whitespace
    const normalized = noHtml.replace(/\s+/g, ' ').trim();
    // Clamp length
    if (normalized.length > maxLen) return normalized.slice(0, maxLen);
    return normalized;
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
   * Returns: { first_name, aria_label, link_selector }
   */
  function extractPerson(node) {
    // Get full name and extract first name
    const fullName = firstCandidateText(xpaths.name, node);
    const firstName = cleanAndExtractFirstName(fullName);
    
    if (!firstName) {
      if (DEBUG_VERBOSE) console.warn('⚠️ No name found in container');
      return null;
    }
    
    // Find Invite link within this container (new LinkedIn DOM)
    const inviteLink = node.querySelector('a[href*="/preload/search-custom-invite/"]');
    
    if (!inviteLink) {
      if (DEBUG_VERBOSE) console.warn(`⚠️ No Invite link found for ${firstName} (may be already connected or pending)`);
      return null;
    }
    
    console.log(`✅ Found Invite link for ${firstName}`);
    
    const ariaLabel = inviteLink.getAttribute('aria-label') || `Invite ${firstName} to connect`;
    const inviteUrl = inviteLink.getAttribute('href') || '';
    const vanityMatch = inviteUrl.match(/vanityName=([^&]+)/);
    const vanityName = vanityMatch ? vanityMatch[1] : '';
    const linkSelector = `a[href*="vanityName=${vanityName}"][aria-label="${ariaLabel}"]`;
    
    const internalId = hashString(`${firstName}_${ariaLabel}`);
    const record = { 
      internalId, 
      first_name: firstName, 
      aria_label: ariaLabel, 
      link_selector: linkSelector,
      invite_url: inviteUrl,
      vanity_name: vanityName
    };
    
    // Send real-time data
    chrome.runtime.sendMessage({ 
      action: 'real_time_person_data', 
      data: { first_name: firstName, aria_label: ariaLabel, link_selector: linkSelector } 
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
    let skippedNoButton = 0;
    for (const n of nodes) {
      if (people.length >= limit) break;
      const p = extractPerson(n);
      if (p) { 
        people.push(p); 
      } else {
        skippedNoButton++;
      }
    }
    console.log(`📊 Scrape summary: Found ${people.length} people with Connect buttons, skipped ${skippedNoButton} without Connect button`);
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
    const msg = template.replace(/{first_name}/g, firstName || "there");
    return sanitizeNote(msg);
  }

  /**
   * Click Invite link and handle modal dialog
   * @param {string} linkSelector - CSS selector for the invite anchor link
   * @param {string} note - Personalized note to add (with {first_name} already replaced)
   * @param {boolean} addNote - Whether to add a note
   * @returns {Promise<boolean>} Success status
   */
  async function clickConnectButton(linkSelector, note, addNote) {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🎯 Starting connection request process');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    try {
      // STEP 1: Find and click the invite link
      console.log('📍 STEP 1: Locating invite link...');
      console.log('   Selector:', linkSelector);
      
      const inviteLink = document.querySelector(linkSelector);
      
      if (!inviteLink) {
        console.error('❌ FAILED: Invite link not found');
        console.error('   Selector:', linkSelector);
        return false;
      }
      
      console.log('✅ Invite link found');
      console.log('   href:', inviteLink.getAttribute('href'));
      console.log('   aria-label:', inviteLink.getAttribute('aria-label'));
      
      // Scroll link into view with delay
      console.log('📜 Scrolling link into view...');
      inviteLink.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await sleep(800); // Increased delay for smooth scrolling
      
      // Click the invite link
      console.log('👆 Clicking invite link...');
      inviteLink.click();
      console.log('✅ Invite link clicked successfully');
      
      // STEP 2: Wait for modal to appear with proper element detection
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('📍 STEP 2: Waiting for modal to appear...');
      
      // Wait for modal container to appear
      const modalSelectors = [
        'div[role="dialog"]',
        'div[data-test-modal]',
        'div.artdeco-modal',
        'div.send-invite'
      ];
      
      let modalFound = false;
      for (const selector of modalSelectors) {
        const modal = await waitForElement(selector, 3000);
        if (modal) {
          console.log('✅ Modal found:', selector);
          modalFound = true;
          break;
        }
      }
      
      if (!modalFound) {
        console.warn('⚠️ WARNING: Modal not detected (proceeding anyway)');
      }
      
      await sleep(1500); // Additional delay for modal content to load
      console.log('✅ Modal should be fully loaded now');
      
      // STEP 3: Add personalized note (if enabled)
      if (addNote && note) {
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('📍 STEP 3: Adding personalized note...');
        console.log('   Note enabled: true');
        console.log('   Note content:', note);
        
        // Wait and find "Add a note" button with exact LinkedIn selectors
        console.log('🔍 Looking for "Add a note" button...');
        await sleep(500); // Small delay before searching
        
        // Priority: Use exact XPath first, then fallback to CSS queries
        const addNoteBtn = await waitForXPath(modalXpaths.addNoteButton, 8000)
          || await waitForXPath("//button[.//span[normalize-space()='Add a note']]", 3000)
          || await waitForXPath("//span[normalize-space()='Add a note']/parent::button", 3000)
          || await waitForXPath("//button[descendant::text() = 'Add a note']", 3000)
          || document.querySelector("button[aria-label='Add a note'].artdeco-button--secondary")
          || document.querySelector("button[aria-label='Add a note']")
          || document.querySelector('button.artdeco-button--secondary .artdeco-button__text')?.closest('button')
          || Array.from(document.querySelectorAll('button.artdeco-button')).find(b => {
              const spanText = b.querySelector('.artdeco-button__text');
              return spanText && spanText.textContent.trim() === 'Add a note';
            })
          || Array.from(document.querySelectorAll('button')).find(b => 
              b.textContent.trim() === 'Add a note' ||
              b.getAttribute('aria-label') === 'Add a note'
            );
        
        if (addNoteBtn) {
          console.log('✅ "Add a note" button found');
          console.log('   Button classes:', addNoteBtn.className);
          console.log('   Button text:', addNoteBtn.textContent.trim());
          console.log('   aria-label:', addNoteBtn.getAttribute('aria-label'));
          console.log('   Button ID:', addNoteBtn.id || 'N/A');
          
          await sleep(300); // Delay before clicking
          console.log('👆 Clicking "Add a note" button...');
          addNoteBtn.click();
          console.log('✅ "Add a note" button clicked');
          
          // Wait for textarea to appear with proper detection using XPath first
          console.log('⏳ Waiting for textarea to appear...');
          const textarea = await waitForXPath(modalXpaths.messageTextarea, 3000)
            || await waitForElement('textarea#custom-message.connect-button-send-invite__custom-message', 2500)
            || await waitForElement('textarea#custom-message', 2500)
            || await waitForElement('textarea[name="message"]', 2000)
            || await waitForElement('textarea.ember-text-area', 1500)
            || document.querySelector('textarea');
          
          if (textarea) {
            console.log('✅ Textarea found');
            console.log('   ID:', textarea.id || 'N/A');
            console.log('   Name:', textarea.name || 'N/A');
            console.log('   Classes:', textarea.className || 'N/A');
            console.log('   Placeholder:', textarea.placeholder || 'N/A');
            console.log('   Min length:', textarea.minLength || 'N/A');
            console.log('   Rows:', textarea.rows || 'N/A');
            
            await sleep(400); // Increased delay before filling
            console.log('✍️ Filling textarea with personalized note...');
            
            // Focus and fill textarea
            textarea.focus();
            await sleep(150);
            
            // Clear any existing content first
            textarea.value = '';
            await sleep(50);
            
            // Set the personalized note
            textarea.value = note;
            
            // Trigger multiple events to ensure LinkedIn detects the change
            textarea.dispatchEvent(new Event('input', { bubbles: true }));
            await sleep(100);
            textarea.dispatchEvent(new Event('change', { bubbles: true }));
            await sleep(100);
            textarea.dispatchEvent(new Event('blur', { bubbles: true }));
            await sleep(100);
            
            // Re-focus to ensure LinkedIn sees the content
            textarea.focus();
            
            console.log('✅ Personalized note added successfully');
            console.log('   Final note:', textarea.value);
            console.log('   Character count:', textarea.value.length);
            console.log('   Meets min length:', textarea.value.length >= (textarea.minLength || 1));
            
            await sleep(1000); // Increased delay after filling note
          } else {
            console.warn('⚠️ WARNING: Textarea not found after waiting');
            console.warn('   Note will not be added');
            await sleep(500);
          }
        } else {
          console.warn('⚠️ WARNING: "Add a note" button not found');
          console.warn('   Available buttons:');
          const allButtons = Array.from(document.querySelectorAll('button')).map(b => ({
            text: b.textContent.trim().substring(0, 30),
            ariaLabel: b.getAttribute('aria-label'),
            classes: b.className.substring(0, 50)
          }));
          console.table(allButtons);
          console.warn('   Proceeding without note');
          await sleep(500);
        }
      } else {
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('📍 STEP 3: Skipping note (addNote:', addNote, ')');
        await sleep(500); // Small delay even when skipping
      }
      
      // STEP 4: Click Send (or "Send without a note") with proper waiting and exact LinkedIn selectors
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('📍 STEP 4: Sending invitation...');
      console.log('🔍 Looking for Send button...');
      
      await sleep(600); // Increased delay before searching for Send button
      
      // If not adding a note and the choice dialog offers "Send without a note", prefer that
      if (!addNote) {
        const sendWithoutNoteBtn = document.querySelector("button[aria-label='Send without a note']")
          || Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Send without a note');
        if (sendWithoutNoteBtn && !sendWithoutNoteBtn.disabled) {
          console.log('✅ Found "Send without a note" button');
          await sleep(400);
          console.log('👆 Clicking "Send without a note"...');
          sendWithoutNoteBtn.click();
          console.log('✅ Invitation sent without a note');
          await sleep(2000);
          return true;
        }
      }

      // Wait for Send button to be available using XPath first
      const sendBtn = await waitForXPath(modalXpaths.sendButton, 2500)
        || await waitForElement("button[aria-label='Send invitation'].artdeco-button--primary", 2000)
        || await waitForElement("button[aria-label='Send invitation']", 2000)
        || document.querySelector('button.artdeco-button--primary[aria-label*="Send"]')
        || Array.from(document.querySelectorAll('button.artdeco-button--primary')).find(b => {
            const spanText = b.querySelector('.artdeco-button__text');
            return spanText && spanText.textContent.trim() === 'Send';
          })
        || Array.from(document.querySelectorAll('button')).find(b => 
            b.textContent.trim() === 'Send' && 
            b.getAttribute('aria-label')?.includes('Send')
          );
      
      if (sendBtn) {
        console.log('✅ Send button found');
        console.log('   Button classes:', sendBtn.className);
        console.log('   Button text:', sendBtn.textContent.trim());
        console.log('   aria-label:', sendBtn.getAttribute('aria-label') || 'N/A');
        console.log('   Button ID:', sendBtn.id || 'N/A');
        console.log('   Disabled:', sendBtn.disabled);
        
        if (!sendBtn.disabled) {
          await sleep(600); // Increased delay before clicking Send
          console.log('👆 Clicking Send button...');
          sendBtn.click();
          console.log('✅ Send button clicked successfully');
          console.log('📤 CONNECTION REQUEST SENT!');
          console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
          
          await sleep(2500); // Increased delay after sending to ensure request processes
          return true;
        } else {
          console.error('❌ FAILED: Send button is disabled');
          console.error('   This may indicate missing required fields or invalid note');
          console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
          await closeModal();
          return false;
        }
      } else {
        console.error('❌ FAILED: Send button not found');
        console.error('   Searching for all buttons in modal...');
        const allButtons = Array.from(document.querySelectorAll('button')).map(b => ({
          text: b.textContent.trim(),
          ariaLabel: b.getAttribute('aria-label'),
          classes: b.className.substring(0, 50),
          disabled: b.disabled
        }));
        console.table(allButtons);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        await closeModal();
        return false;
      }
    } catch (error) {
      console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.error('❌ CRITICAL ERROR in clickConnectButton');
      console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.error('Error name:', error.name);
      console.error('Error message:', error.message);
      console.error('Stack trace:', error.stack);
      console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      
      await closeModal();
      return false;
    }
  }

  /**
   * Helper function to close the modal
   */
  async function closeModal() {
    try {
      console.log('🚪 Attempting to close modal...');
      const closeBtn = document.querySelector('button[aria-label*="Dismiss"]')
        || document.querySelector('button[data-test-modal-close-btn]')
        || document.querySelector('button[data-testid="modal-close-button"]')
        || Array.from(document.querySelectorAll('button')).find(b => 
            b.getAttribute('aria-label')?.includes('Dismiss') ||
            b.getAttribute('aria-label')?.includes('Close')
          );
      
      if (closeBtn) {
        closeBtn.click();
        console.log('✅ Modal closed');
        await sleep(500);
      } else {
        console.warn('⚠️ Close button not found, modal may still be open');
      }
    } catch (e) {
      console.warn('⚠️ Error closing modal:', e.message);
    }
  }

  /**
   * AUTO-PAGINATE CONNECTION SENDER
   * Scans current page → Sends all requests → Goes to next page → Repeats
   * @param {Object} options - Configuration options
   * @returns {Promise<Object>} Results object
   */
  async function autoSendConnectionRequests(options) {
    const {
      noteTemplate = "",
      addNote = false,
      delayMin = 3000,
      delayMax = 8000,
      maxConnections = 50,  // Total connections to send
      peoplePerPage = 10
    } = options;

    connectionState.cancelled = false;
    connectionState.sent = 0;
    connectionState.failed = 0;
    connectionState.total = 0;
    connectionState.currentIndex = 0;

    let currentPage = 1;
    let totalProcessed = 0;

    console.log(`🚀 Starting AUTO-PAGINATE connection sender (max ${maxConnections} connections)`);
    chrome.runtime.sendMessage({ 
      action: 'connection_progress', 
      data: { sent: 0, failed: 0, total: 0, status: 'started' }
    }, () => {});

    // MAIN LOOP: Process each page until we reach maxConnections
    while (totalProcessed < maxConnections && !connectionState.cancelled) {
      console.log(`\n📄 ===== PAGE ${currentPage} =====`);
      
      // Wait for page to load
      await sleep(2000);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      await sleep(1000);

      // STEP 1: Scan current page for people with Invite buttons
      const remainingLimit = maxConnections - totalProcessed;
      const peopleOnThisPage = scanPageForConnections(Math.min(peoplePerPage, remainingLimit));
      
      if (peopleOnThisPage.length === 0) {
        console.log(`⚠️ No people with Invite buttons found on page ${currentPage}`);
        break;
      }

      console.log(`✅ Found ${peopleOnThisPage.length} people to connect on page ${currentPage}`);
      connectionState.total += peopleOnThisPage.length;

      // STEP 2: Send connection request to each person on this page
      for (let i = 0; i < peopleOnThisPage.length; i++) {
        if (connectionState.cancelled) {
          console.log('🛑 Cancelled by user');
          break;
        }

        const person = peopleOnThisPage[i];
        totalProcessed++;

        console.log(`\n👤 [${totalProcessed}] Processing: ${person.first_name} (${person.full_name})`);

        // Scroll to invite link
        const linkElement = document.querySelector(person.link_selector);
        if (linkElement) {
          linkElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
          await sleep(800);
        }

        // Generate personalized note
        const personalizedNote = addNote ? generatePersonalizedNote(noteTemplate, person.first_name) : "";

        // Send the connection request
        const success = await clickConnectButton(person.link_selector, personalizedNote, addNote);

        if (success) {
          connectionState.sent++;
          console.log(`✅ Sent to ${person.first_name} (${connectionState.sent} total)`);
        } else {
          connectionState.failed++;
          console.log(`❌ Failed for ${person.first_name} (${connectionState.failed} total)`);
        }

        // Send progress update
        chrome.runtime.sendMessage({ 
          action: 'connection_progress', 
          data: { 
            sent: connectionState.sent, 
            failed: connectionState.failed, 
            total: connectionState.total,
            current: totalProcessed,
            currentName: person.first_name,
            currentPage: currentPage,
            status: 'processing'
          }
        }, () => {});

        // Random delay between requests (human-like behavior)
        if (i < peopleOnThisPage.length - 1) {
          const delay = Math.floor(Math.random() * (delayMax - delayMin + 1)) + delayMin;
          console.log(`⏳ Waiting ${(delay/1000).toFixed(1)}s...`);
          await sleep(delay);
        }
      }

      if (connectionState.cancelled) break;

      // STEP 3: Try to go to next page
      console.log(`\n🔄 Attempting to go to next page...`);
      const hasNext = clickNext();
      
      if (!hasNext) {
        console.log(`✋ No more pages available. Stopping.`);
        break;
      }

      console.log(`✅ Clicked Next button, waiting for page ${currentPage + 1} to load...`);
      await sleep(3000);  // Wait for next page to load
      
      currentPage++;
    }

    const results = {
      sent: connectionState.sent,
      failed: connectionState.failed,
      total: connectionState.total,
      pagesProcessed: currentPage,
      cancelled: connectionState.cancelled
    };

    console.log('\n🎉 ===== AUTO-SEND COMPLETED =====');
    console.log(`📊 Results: Sent: ${results.sent} | Failed: ${results.failed} | Pages: ${results.pagesProcessed}`);
    
    chrome.runtime.sendMessage({ 
      action: 'connection_progress', 
      data: { ...results, status: 'completed' }
    }, () => {});

    return results;
  }

  /**
   * Scan current page for people with Invite links (new LinkedIn DOM)
   * @param {number} limit - Max people to find on this page
   * @returns {Array} Array of {first_name, full_name, aria_label, link_selector, profile_url, vanity_name}
   */
  function scanPageForConnections(limit = 10) {
    const peopleToConnect = [];
    
    // Find all Invite anchor links with /preload/search-custom-invite/ on current page
    const inviteLinks = Array.from(document.querySelectorAll('a[href*="/preload/search-custom-invite/"]'))
      .filter(link => {
        const ariaLabel = link.getAttribute('aria-label') || '';
        return ariaLabel.includes('Invite') && ariaLabel.includes('to connect');
      })
      .slice(0, limit);  // Limit per page

    console.log(`🔍 Found ${inviteLinks.length} Invite links on current page`);

    for (const link of inviteLinks) {
      const ariaLabel = link.getAttribute('aria-label');
      const inviteUrl = link.getAttribute('href');
      
      // Extract vanity name from URL: /preload/search-custom-invite/?vanityName=neha-bisht-5080b1306
      const vanityMatch = inviteUrl.match(/vanityName=([^&]+)/);
      const vanityName = vanityMatch ? vanityMatch[1] : '';
      
      // Extract full name from "Invite Neha Bisht to connect"
      const nameMatch = ariaLabel.match(/Invite\s+(.+?)\s+to connect/);
      const fullName = nameMatch ? nameMatch[1].trim() : '';
      
      if (!fullName) continue;

      // Extract first name using the cleanAndExtractFirstName function
      const firstName = cleanAndExtractFirstName(fullName);
      
      if (!firstName) continue;

      // Try to find the associated profile link
      // Look for nearby <a> tag with href="https://www.linkedin.com/in/USERNAME/"
      let profileUrl = '';
      try {
        // Search in parent container for profile link
        const container = link.closest('li') || link.closest('div[class*="search-result"]');
        if (container) {
          const profileLink = container.querySelector('a[href*="/in/"][data-view-name="search-result-lockup-title"]')
            || container.querySelector('a[href*="/in/"]:not([href*="preload"])');
          if (profileLink) {
            profileUrl = profileLink.getAttribute('href');
          }
        }
      } catch (e) {
        console.warn('Could not find profile link:', e);
      }

      const linkSelector = `a[href*="vanityName=${vanityName}"][aria-label="${ariaLabel}"]`;

      peopleToConnect.push({
        first_name: firstName,
        full_name: fullName,
        aria_label: ariaLabel,
        link_selector: linkSelector,
        invite_url: inviteUrl,
        vanity_name: vanityName,
        profile_url: profileUrl
      });

      console.log(`  ✓ ${firstName} (${fullName}): ${vanityName}`);
    }

    return peopleToConnect;
  }

  /**
   * Original function: Send connection requests to specific people list
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

      // Check if invite link still exists on page
      const linkExists = document.querySelector(person.link_selector);
      
      if (!linkExists) {
        console.warn(`⚠️ Invite link not found for ${person.first_name}, scrolling...`);
        window.scrollBy({ top: 400, behavior: 'smooth' });
        await sleep(2000);
        
        // Check again after scroll
        if (!document.querySelector(person.link_selector)) {
          connectionState.failed++;
          console.warn(`⚠️ Invite link still not found for ${person.first_name}`);
          continue;
        }
      }

      // Generate personalized note
      const personalizedNote = addNote ? generatePersonalizedNote(noteTemplate, person.first_name) : "";

      console.log(`📧 Sending connection to: ${person.first_name}`);
      if (addNote) {
        console.log(`   Note: ${personalizedNote}`);
      }

      // Send the connection request using the stored link selector
      const success = await clickConnectButton(person.link_selector, personalizedNote, addNote);

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
        case 'auto_send_connection_requests': {
          const { noteTemplate, addNote, delayMin, delayMax, maxConnections, peoplePerPage } = req;
          (async () => {
            try {
              const result = await autoSendConnectionRequests({ 
                noteTemplate, 
                addNote, 
                delayMin: delayMin || 3000, 
                delayMax: delayMax || 8000,
                maxConnections: maxConnections || 50,
                peoplePerPage: peoplePerPage || 10
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
