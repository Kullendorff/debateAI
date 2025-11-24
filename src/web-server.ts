import express from 'express';
import cors from 'cors';
import * as fs from 'fs/promises';
import * as path from 'path';
import { DebateSession } from './types.js';

const app = express();
const PORT = 3001;
const SESSIONS_DIR = path.resolve('.sessions');

app.use(cors());
app.use(express.json());

/**
 * GET /api/sessions
 * List all debate sessions with summary info
 */
app.get('/api/sessions', async (req, res) => {
  try {
    // Ensure sessions directory exists
    await fs.mkdir(SESSIONS_DIR, { recursive: true });

    const files = await fs.readdir(SESSIONS_DIR);
    const sessionFiles = files.filter(f => f.endsWith('.json'));

    const sessions = await Promise.all(
      sessionFiles.map(async (file) => {
        try {
          const content = await fs.readFile(path.join(SESSIONS_DIR, file), 'utf-8');
          const session: DebateSession = JSON.parse(content);

          const lastRound = session.rounds[session.rounds.length - 1];

          return {
            id: session.id,
            question: session.question,
            status: session.status,
            rounds: session.rounds.length,
            consensus: lastRound?.consensus_score || 0,
            cost: session.current_cost_usd,
            created_at: session.created_at
          };
        } catch (error) {
          console.error(`Error reading session ${file}:`, error);
          return null;
        }
      })
    );

    // Filter out failed reads and sort by creation date (newest first)
    const validSessions = sessions
      .filter(s => s !== null)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    res.json(validSessions);
  } catch (error) {
    console.error('Error listing sessions:', error);
    res.status(500).json({ error: 'Failed to list sessions' });
  }
});

/**
 * GET /api/sessions/:id
 * Get full details of a specific session
 */
app.get('/api/sessions/:id', async (req, res) => {
  try {
    const sessionId = req.params.id;
    const sanitizedId = sessionId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const sessionPath = path.join(SESSIONS_DIR, `${sanitizedId}.json`);

    const content = await fs.readFile(sessionPath, 'utf-8');
    const session: DebateSession = JSON.parse(content);

    res.json(session);
  } catch (error) {
    if ((error as any).code === 'ENOENT') {
      res.status(404).json({ error: 'Session not found' });
    } else {
      console.error('Error reading session:', error);
      res.status(500).json({ error: 'Failed to read session' });
    }
  }
});

/**
 * GET /api/health
 * Health check endpoint
 */
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`🚀 DebateAI Web Server running on http://localhost:${PORT}`);
  console.log(`📁 Sessions directory: ${SESSIONS_DIR}`);
});
