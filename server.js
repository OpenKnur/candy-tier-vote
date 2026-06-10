const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3456;
const DB_FILE = path.join(__dirname, 'data.json');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Initialize DB
function loadDB() {
  if (!fs.existsSync(DB_FILE)) {
    return { votes: [], rankings: {} };
  }
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}

function saveDB(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

// Get current week key (ISO week)
function getWeekKey() {
  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const days = Math.floor((now - startOfYear) / 86400000);
  const weekNum = Math.ceil((days + startOfYear.getDay() + 1) / 7);
  return `${now.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

// Check if user already voted this week
function hasVotedThisWeek(db, fullName) {
  const weekKey = getWeekKey();
  return db.votes.some(v => v.week === weekKey && v.fullName.toLowerCase() === fullName.toLowerCase());
}

// Submit vote
app.post('/api/vote', (req, res) => {
  const { fullName, rankings } = req.body;
  
  if (!fullName || !fullName.trim()) {
    return res.status(400).json({ error: 'Podaj imię i nazwisko!' });
  }
  
  const trimmedName = fullName.trim();
  if (trimmedName.split(/\s+/).length < 2) {
    return res.status(400).json({ error: 'Podaj imię ORAZ nazwisko!' });
  }
  
  if (!rankings || typeof rankings !== 'object') {
    return res.status(400).json({ error: 'Ranking jest pusty!' });
  }

  const db = loadDB();
  
  if (hasVotedThisWeek(db, trimmedName)) {
    return res.status(409).json({ error: 'Już głosowałeś/aś w tym tygodniu! Następne głosowanie w poniedziałek 🗓️' });
  }

  const weekKey = getWeekKey();
  const vote = {
    id: crypto.randomUUID(),
    fullName: trimmedName,
    week: weekKey,
    rankings,
    timestamp: new Date().toISOString()
  };

  db.votes.push(vote);
  saveDB(db);

  res.json({ success: true, message: `Dziękujemy, ${trimmedName}! Twój głos został zapisany 🍬` });
});

// Get current standings
app.get('/api/results', (req, res) => {
  const db = loadDB();
  const weekKey = getWeekKey();
  
  // Get all candy names
  const allCandies = [
    'Jeżyki', 'Delicje', 'Delicje Wiśniowe', 'Oreo', 
    'Ciastka Maślane', 'Ciastka Kakaowe', 'BelVita'
  ];

  // Calculate average tier per candy (S=5, A=4, B=3, C=2, D=1)
  const tierValues = { S: 5, A: 4, B: 3, C: 2, D: 1 };
  const candyTotals = {};
  const candyCounts = {};
  
  allCandies.forEach(c => {
    candyTotals[c] = 0;
    candyCounts[c] = 0;
  });

  // Process ALL votes ever
  db.votes.forEach(vote => {
    allCandies.forEach(candy => {
      const tier = vote.rankings[candy];
      if (tier && tierValues[tier] !== undefined) {
        candyTotals[candy] += tierValues[tier];
        candyCounts[candy] += 1;
      }
    });
  });

  const tierNames = ['D', 'C', 'B', 'A', 'S'];
  const standings = {};
  
  tierNames.forEach(t => { standings[t] = []; });

  allCandies.forEach(candy => {
    if (candyCounts[candy] > 0) {
      const avg = candyTotals[candy] / candyCounts[candy];
      // Map average back to tier
      let tier;
      if (avg >= 4.5) tier = 'S';
      else if (avg >= 3.5) tier = 'A';
      else if (avg >= 2.5) tier = 'B';
      else if (avg >= 1.5) tier = 'C';
      else tier = 'D';
      
      standings[tier].push({ 
        name: candy, 
        avgScore: avg.toFixed(2),
        voteCount: candyCounts[candy]
      });
    } else {
      standings['D'].push({ name: candy, avgScore: '0.00', voteCount: 0 });
    }
  });

  // Sort within each tier by average
  Object.keys(standings).forEach(t => {
    standings[t].sort((a, b) => b.avgScore - a.avgScore);
  });

  // Week stats
  const weekVotes = db.votes.filter(v => v.week === weekKey);

  res.json({
    week: weekKey,
    standings,
    totalVotes: db.votes.length,
    weekVotes: weekVotes.length,
    voters: weekVotes.map(v => v.fullName),
    allTimeVotes: db.votes.length
  });
});

// Check if user voted this week
app.get('/api/check/:name', (req, res) => {
  const db = loadDB();
  const voted = hasVotedThisWeek(db, req.params.name);
  res.json({ voted });
});

// Admin: reset (with secret)
app.post('/api/reset', (req, res) => {
  if (req.body.secret !== 'delicje2024') {
    return res.status(403).json({ error: 'Wrong secret' });
  }
  saveDB({ votes: [], rankings: {} });
  res.json({ success: true });
});

app.listen(PORT, () => {
  console.log(`🍬 Candy Tier Vote running on http://localhost:${PORT}`);
});
