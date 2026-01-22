const { google } = require('googleapis');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  const DEMO_OAUTH_TOKEN = process.env.DEMO_GMAIL_OAUTH_TOKEN;
  if (!DEMO_OAUTH_TOKEN) {
    res.status(500).json({ error: 'Missing DEMO_GMAIL_OAUTH_TOKEN' });
    return;
  }
  try {
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: DEMO_OAUTH_TOKEN });
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    const { data } = await gmail.users.messages.list({
      userId: 'me',
      q: 'in:inbox category:primary',
      maxResults: 20,
    });
    const messages = [];
    for (const msg of data.messages || []) {
      const msgData = await gmail.users.messages.get({ userId: 'me', id: msg.id });
      const headers = msgData.data.payload?.headers || [];
      const subject = headers.find(h => h.name === 'Subject')?.value || '';
      const from = headers.find(h => h.name === 'From')?.value || '';
      const snippet = msgData.data.snippet || '';
      messages.push({ id: msg.id, subject, from, snippet });
    }
    res.status(200).json({ messages });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch demo emails', details: err });
  }
}