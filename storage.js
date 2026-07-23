'use strict';

const fs = require('node:fs');
const path = require('node:path');

class JsonStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.tmpPath = `${filePath}.tmp`;
    this.data = { users: {}, usernames: {}, sessions: {}, lobbies: {}, archives: {} };
    this.load();
  }

  load() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    if (!fs.existsSync(this.filePath)) {
      this.save();
      return;
    }
    try {
      const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
      this.data = {
        users: parsed.users || {},
        usernames: parsed.usernames || {},
        sessions: parsed.sessions || {},
        lobbies: parsed.lobbies || {},
        archives: parsed.archives || {},
      };
      this.pruneSessions();
    } catch (error) {
      const backup = `${this.filePath}.corrupt-${Date.now()}`;
      fs.copyFileSync(this.filePath, backup);
      this.save();
      console.error(`Database was unreadable. A backup was written to ${backup}.`, error);
    }
  }

  pruneSessions() {
    const now = Date.now();
    for (const [token, session] of Object.entries(this.data.sessions)) {
      if (!session.expiresAt || new Date(session.expiresAt).getTime() <= now) delete this.data.sessions[token];
    }
  }

  save() {
    this.pruneSessions();
    fs.writeFileSync(this.tmpPath, `${JSON.stringify(this.data, null, 2)}\n`, 'utf8');
    fs.renameSync(this.tmpPath, this.filePath);
  }
}

module.exports = { JsonStore };
