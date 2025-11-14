import { DebateSession } from './types.js';
import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * Interface for session storage backends
 */
export interface SessionStore {
  initialize(): Promise<void>;
  get(id: string): Promise<DebateSession | null>;
  set(id: string, session: DebateSession): Promise<void>;
  delete(id: string): Promise<void>;
  list(): Promise<string[]>;
  cleanup(olderThanMs: number): Promise<number>;
}

/**
 * File-based session storage implementation
 * Stores sessions as JSON files in a .sessions directory
 */
export class FileSessionStore implements SessionStore {
  private sessionsDir: string;

  constructor(sessionsDir: string = '.sessions') {
    this.sessionsDir = path.resolve(sessionsDir);
  }

  /**
   * Initialize the sessions directory
   */
  async initialize(): Promise<void> {
    try {
      await fs.mkdir(this.sessionsDir, { recursive: true });
    } catch (error) {
      console.error('Failed to create sessions directory:', error);
      throw error;
    }
  }

  /**
   * Get session file path for a given ID
   */
  private getSessionPath(id: string): string {
    // Sanitize session ID to prevent directory traversal
    const sanitizedId = id.replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(this.sessionsDir, `${sanitizedId}.json`);
  }

  /**
   * Retrieve a session by ID
   */
  async get(id: string): Promise<DebateSession | null> {
    try {
      const sessionPath = this.getSessionPath(id);
      const data = await fs.readFile(sessionPath, 'utf-8');
      const session = JSON.parse(data);

      // Convert date strings back to Date objects
      session.created_at = new Date(session.created_at);
      session.updated_at = new Date(session.updated_at);
      session.rounds.forEach((round: any) => {
        round.timestamp = new Date(round.timestamp);
      });

      return session as DebateSession;
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return null; // Session not found
      }
      console.error(`Failed to read session ${id}:`, error);
      throw error;
    }
  }

  /**
   * Store a session
   */
  async set(id: string, session: DebateSession): Promise<void> {
    try {
      const sessionPath = this.getSessionPath(id);
      const data = JSON.stringify(session, null, 2);
      await fs.writeFile(sessionPath, data, 'utf-8');
    } catch (error) {
      console.error(`Failed to write session ${id}:`, error);
      throw error;
    }
  }

  /**
   * Delete a session
   */
  async delete(id: string): Promise<void> {
    try {
      const sessionPath = this.getSessionPath(id);
      await fs.unlink(sessionPath);
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        console.error(`Failed to delete session ${id}:`, error);
        throw error;
      }
      // Ignore if file doesn't exist
    }
  }

  /**
   * List all session IDs
   */
  async list(): Promise<string[]> {
    try {
      const files = await fs.readdir(this.sessionsDir);
      return files
        .filter(file => file.endsWith('.json'))
        .map(file => file.replace('.json', ''));
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return []; // Directory doesn't exist yet
      }
      console.error('Failed to list sessions:', error);
      throw error;
    }
  }

  /**
   * Clean up old sessions
   * @param olderThanMs Delete sessions older than this many milliseconds
   * @returns Number of sessions deleted
   */
  async cleanup(olderThanMs: number): Promise<number> {
    try {
      const sessionIds = await this.list();
      const now = Date.now();
      let deletedCount = 0;

      for (const id of sessionIds) {
        const session = await this.get(id);
        if (session) {
          const age = now - session.updated_at.getTime();
          if (age > olderThanMs) {
            await this.delete(id);
            deletedCount++;
          }
        }
      }

      return deletedCount;
    } catch (error) {
      console.error('Failed to cleanup sessions:', error);
      throw error;
    }
  }
}

/**
 * In-memory session storage (for testing or backward compatibility)
 */
export class InMemorySessionStore implements SessionStore {
  private sessions: Map<string, DebateSession> = new Map();

  async initialize(): Promise<void> {
    // No initialization needed for in-memory storage
  }

  async get(id: string): Promise<DebateSession | null> {
    return this.sessions.get(id) || null;
  }

  async set(id: string, session: DebateSession): Promise<void> {
    this.sessions.set(id, session);
  }

  async delete(id: string): Promise<void> {
    this.sessions.delete(id);
  }

  async list(): Promise<string[]> {
    return Array.from(this.sessions.keys());
  }

  async cleanup(olderThanMs: number): Promise<number> {
    const now = Date.now();
    let deletedCount = 0;

    for (const [id, session] of this.sessions.entries()) {
      const age = now - session.updated_at.getTime();
      if (age > olderThanMs) {
        this.sessions.delete(id);
        deletedCount++;
      }
    }

    return deletedCount;
  }
}
