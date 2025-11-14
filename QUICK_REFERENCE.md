# 🚀 Quick Reference Card

## 📝 Professional Titles Removed (Examples)

| Input | Output |
|-------|--------|
| Dr. Altaf Khan | Altaf |
| Eng. Sarah Johnson | Sarah |
| Sr. Priya Sharma MBA | Priya |
| Mr. John Doe | John |
| Prof. Emily Williams PhD | Emily |

**Total: 60+ titles automatically removed!**

## 🎯 Quick Start (5 Steps)

1. **Install** → Load unpacked in `chrome://extensions/`
2. **Search** → Type "React Developer" or paste LinkedIn URL
3. **Scrape** → Set limit (10) → Click "Scrape People"
4. **Configure** → ✅ Add note → Customize template
5. **Send** → Click "Send Connection Requests"

## 💬 Message Template Format

```
Hi {first_name}, I saw your profile and would love to connect!
```

**Result:**
- `Dr. Altaf Khan` → `Hi Altaf, I saw your profile...`
- `Eng. Alex` → `Hi Alex, I saw your profile...`

## ⚙️ Key Features

✅ XPath Connect button detection: `//button[.//span[text()='Connect']]`  
✅ Random delays: 3-8 seconds between requests  
✅ Progress tracking: Sent/Failed/Total counter  
✅ Cancellation: Stop anytime  
✅ Data export: JSON & CSV  

## ⚠️ Safety Limits

| Metric | Recommended |
|--------|-------------|
| Per session | 10-15 connections |
| Per day | 20-30 connections |
| Between sessions | 2-4 hours |
| Message length | Under 250 chars |

## 🐛 Common Issues

**No Connect buttons found?**
- Scroll down to load more
- Check if "Follow" instead of "Connect"

**Note not added?**
- Keep under 250 characters
- Check `{first_name}` placeholder exists

**Extension not working?**
- Refresh LinkedIn page
- Reload extension
- Check you're on people search page

## 📂 Files Modified

```
✏️ src/content/scraper.js    → Main automation logic
✏️ src/popup/popup.html       → UI with note template
✏️ src/popup/popup.js         → Connection handlers
✏️ src/popup/popup.css        → Styling
📄 USAGE_GUIDE.md             → Full documentation
📄 IMPLEMENTATION_SUMMARY.md  → Technical details
```

## 🎉 Test It Out!

1. Search: `"Software Engineer"`
2. Scrape: `10 people`
3. Template: `"Hi {first_name}, let's connect!"`
4. Send → Watch the magic! ✨

---

**Version 1.1** | November 2025 | Educational Use Only
