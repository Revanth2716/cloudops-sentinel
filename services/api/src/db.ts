import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { redactSensitive, type HealthSignal, type Incident } from '@cloudops/contracts';

export function createDb(path: string) {
  mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.exec(`CREATE TABLE IF NOT EXISTS health_signals (id INTEGER PRIMARY KEY AUTOINCREMENT, service TEXT NOT NULL, timestamp TEXT NOT NULL, status TEXT NOT NULL CHECK (status IN ('healthy','degraded','unhealthy')), response_time_ms REAL NOT NULL CHECK (response_time_ms >= 0), error TEXT); CREATE TABLE IF NOT EXISTS incidents (id TEXT PRIMARY KEY, service TEXT NOT NULL, severity TEXT NOT NULL CHECK (severity IN ('low','medium','high')), status TEXT NOT NULL CHECK (status IN ('detected','resolved')), detected_at TEXT NOT NULL, summary TEXT NOT NULL); CREATE INDEX IF NOT EXISTS idx_health_service_timestamp ON health_signals(service, timestamp DESC, id DESC); CREATE INDEX IF NOT EXISTS idx_incidents_ordering ON incidents(detected_at DESC, id DESC);`);
  return db;
}
export function saveSignalAndIncident(db: Database.Database, signal: HealthSignal, incident: Incident | null) {
  const save = db.transaction(() => {
    db.prepare('INSERT INTO health_signals (service,timestamp,status,response_time_ms,error) VALUES (?,?,?,?,?)').run(signal.service, signal.timestamp, signal.status, signal.responseTimeMs, signal.error ? redactSensitive(signal.error) : null);
    if (incident) db.prepare('INSERT OR IGNORE INTO incidents (id,service,severity,status,detected_at,summary) VALUES (?,?,?,?,?,?)').run(incident.id, incident.service, incident.severity, incident.status, incident.detectedAt, incident.summary);
  });
  save();
}
export function closeDb(db: Database.Database) { db.close(); }
export function listIncidents(db: Database.Database): Incident[] { return db.prepare('SELECT id,service,severity,status,detected_at as detectedAt,summary FROM incidents ORDER BY detected_at DESC').all() as Incident[]; }
export function listLatestServiceHealth(db: Database.Database) { return db.prepare('SELECT service,status,response_time_ms as responseTimeMs,timestamp FROM health_signals AS current WHERE NOT EXISTS (SELECT 1 FROM health_signals AS newer WHERE newer.service = current.service AND (newer.timestamp > current.timestamp OR (newer.timestamp = current.timestamp AND newer.id > current.id))) ORDER BY service').all(); }
