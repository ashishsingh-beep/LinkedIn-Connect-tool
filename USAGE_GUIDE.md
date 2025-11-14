# 🚀 LinkedIn Connection Automation - Complete Usage Guide

## ✨ Features Overview

### 🔍 **Smart People Scraping**
- Search by keywords or LinkedIn URL
- Extract: Name, First Name, Profile URL, Job Title, Location, Status
- Auto-pagination through search results

### 🤖 **Connection Automation**
- Send personalized connection requests
- Automatic professional title removal (Dr., Eng., Sr., CEO, etc.)
- Smart delays (3-8 seconds) between requests
- Real-time progress tracking

### 🎯 **Professional Title Handling**

Automatically removes 60+ titles from names:

| Original Name | Cleaned First Name |
|--------------|-------------------|
| Dr. Altaf Khan | Altaf |
| Eng. Alex Johnson | Alex |
| Sr. Priya Sharma MBA | Priya |
| Mr. John Doe | John |
| Prof. Sarah Williams PhD | Sarah |

## 📖 Step-by-Step Guide

### 1️⃣ Install the Extension

1. Download/clone this repository
2. Open Chrome → `chrome://extensions/`
3. Enable **Developer mode** (top right)
4. Click **Load unpacked**
5. Select the extension folder

### 2️⃣ Search for People

**Option A: Quick Search**
1. Click extension icon
2. Type keywords: "React Developer" or "Product Manager"
3. Click **Search**

**Option B: URL Search**
1. Copy LinkedIn search URL
2. Paste in "Search by URL" field
3. Click **Go to URL**

### 3️⃣ Scrape People Data

1. Set **Number of people** (e.g., 10)
2. Choose mode:
   - **Static**: Current page only
   - **Auto paginate**: Scrolls through results
3. Click **Scrape People**
4. Wait for completion

**Result Example:**
```json
{
  "name": "Dr. Altaf Khan",
  "firstName": "Altaf",
  "profileUrl": "https://linkedin.com/in/altaf-khan",
  "jobTitle": "Senior Software Engineer",
  "location": "San Francisco, CA"
}
```

### 4️⃣ Configure Connection Requests

1. **Enable Personalized Note** (Optional):
   - ✅ Check "Add personalized note"
   - Customize message template

2. **Message Template Examples:**

```
Hi {first_name}, I saw your profile and would love to connect!
```

**Output:**
- Dr. Altaf Khan → `Hi Altaf, I saw your profile...`
- Eng. Sarah Johnson → `Hi Sarah, I saw your profile...`

### 5️⃣ Send Connection Requests

1. Click **📤 Send Connection Requests**
2. Confirm in popup dialog
3. Watch progress bar:
   ```
   Sent: 7 | Failed: 1 | Total: 10 (80%)
   ```
4. Click **Cancel** to stop anytime

### 6️⃣ Download Data

- **Download JSON**: Structured data
- **Download CSV**: Excel-friendly format

## 🛠️ Technical Details

### Connect Button Detection
```javascript
//button[.//span[text()='Connect']]
```

### Professional Titles Removed
Academic: Dr., Prof., PhD, MD, MSc, BSc  
Engineering: Eng., Er., PE, CEng  
Business: MBA, CEO, CFO, CTO, CPA  
Seniority: Sr., Jr., Senior, Lead  

### Delays
Random 3-8 seconds between each request

## ⚠️ Safety Guidelines

### Best Practices
✅ Send 10-20 connections per session  
✅ Use personalized messages  
✅ Monitor the process  
✅ Take breaks between sessions  
❌ Don't spam  
❌ Don't run for hours continuously  

### LinkedIn Policy
Automated connection requests may violate LinkedIn's Terms of Service. Use responsibly.

## 🐛 Troubleshooting

### No Connect Buttons Found
- Scroll down to load more people
- Check if buttons say "Follow" instead of "Connect"
- Try different search filters

### Note Not Added
- Keep messages under 250 characters
- Check if `{first_name}` placeholder is used
- Disable note feature temporarily

### Extension Not Working
1. Refresh LinkedIn page
2. Reload extension (`chrome://extensions/`)
3. Check you're on people search page

## 📝 Message Templates

### Professional
```
Hi {first_name}, I came across your profile and was impressed by your work. I'd love to connect!
```

### Friendly
```
Hey {first_name}! I saw we share similar interests. Would love to connect!
```

### Short
```
Hi {first_name}, let's connect!
```

## 🎯 Use Cases

1. **Job Seekers**: Connect with recruiters
2. **Recruiters**: Find candidates
3. **Sales**: Build B2B network
4. **Networking**: Expand industry connections

## ⚖️ Legal Disclaimer

**Educational purposes only.** Users are responsible for compliance with LinkedIn's Terms of Service. Use ethically and responsibly.

---

**Version:** 1.1  
**Last Updated:** November 2025
