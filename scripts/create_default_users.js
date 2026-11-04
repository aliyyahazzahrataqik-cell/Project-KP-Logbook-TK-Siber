// Script to ensure admin and guru users exist with password 'password123'
const bcrypt = require('bcryptjs');
const db = require('../config/database');

const users = [
  { username: 'admin', role: 'admin' },
  { username: 'guru', role: 'guru' }
];

async function ensureUsers() {
  for (const { username, role } of users) {
    const pwdHash = await bcrypt.hash('password123', 10);
    // Check if user exists
    db.query('SELECT id_user FROM users WHERE username = ?', [username], (err, rows) => {
      if (err) {
        console.error('Error checking user', username, err);
        return;
      }
      if (rows.length > 0) {
        // Update password & role just in case
        db.query('UPDATE users SET password = ?, role = ? WHERE username = ?', [pwdHash, role, username], (e) => {
          if (e) console.error('Error updating user', username, e);
          else console.log(`User '${username}' updated with role '${role}'.`);
        });
      } else {
        // Insert new user
        db.query('INSERT INTO users (username, password, role) VALUES (?, ?, ?)', [username, pwdHash, role], (e) => {
          if (e) console.error('Error inserting user', username, e);
          else console.log(`User '${username}' created with role '${role}'.`);
        });
      }
    });
  }
}

ensureUsers();

