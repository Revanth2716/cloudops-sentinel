import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createDb, createProposal, listProposals } from '../services/api/src/db';

const incidentId='11111111-1111-4111-8111-111111111111';
const analysisId='22222222-2222-4222-8222-222222222222';
const proposalId='33333333-3333-4333-8333-333333333333';
function seed(d:Database.Database){d.prepare('INSERT INTO incidents VALUES(?,?,?,?,?,?,?,?,?,?)').run(incidentId,'svc','unhealthy','high','detected','2026-09-30T10:00:00.000Z',null,0,null,'summary');d.prepare('INSERT INTO ai_analyses VALUES(?,?,?,?,?,?,?)').run(analysisId,incidentId,'fake','test','v1','{}','2026-09-30T10:00:00.000Z');}
function withDb(fn:(path:string)=>void){const dir=mkdtempSync(join(tmpdir(),'cloudops-migration-'));const path=join(dir,'test.db');try{fn(path);}finally{try{rmSync(path,{force:true});}catch{}try{rmSync(dir,{recursive:true,force:true});}catch{}}}

describe('proposal parameters migration',()=>{
  it('creates parameters_json on a fresh database and remains idempotent',()=>withDb(path=>{const first=createDb(path);expect(first.prepare("SELECT name FROM pragma_table_info('proposals') WHERE name='parameters_json'").get()).toEqual({name:'parameters_json'});first.close();const second=createDb(path);expect(second.prepare("SELECT name FROM pragma_table_info('proposals') WHERE name='parameters_json'").get()).toEqual({name:'parameters_json'});second.close();}));
  it('upgrades a previous schema without losing existing proposals',()=>withDb(path=>{const legacy=new Database(path);legacy.exec("CREATE TABLE incidents(id TEXT PRIMARY KEY,service TEXT NOT NULL,condition TEXT NOT NULL,severity TEXT NOT NULL,status TEXT NOT NULL,detected_at TEXT NOT NULL,resolved_at TEXT,observation_count INTEGER NOT NULL,latest_observation_at TEXT,summary TEXT NOT NULL);CREATE TABLE ai_analyses(id TEXT PRIMARY KEY,incident_id TEXT NOT NULL,provider TEXT NOT NULL,model TEXT NOT NULL,prompt_version TEXT NOT NULL,result_json TEXT NOT NULL,created_at TEXT NOT NULL);CREATE TABLE proposals(id TEXT PRIMARY KEY,incident_id TEXT NOT NULL,analysis_id TEXT NOT NULL,action_type TEXT NOT NULL,description TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',created_at TEXT NOT NULL,decided_at TEXT,decided_by TEXT);");seed(legacy);legacy.prepare('INSERT INTO proposals VALUES(?,?,?,?,?,?,?,?,?)').run(proposalId,incidentId,analysisId,'restart_service','existing','pending','2026-09-30T10:00:00.000Z',null,null);legacy.close();const upgraded=createDb(path);expect(upgraded.prepare("SELECT name FROM pragma_table_info('proposals') WHERE name='parameters_json'").get()).toEqual({name:'parameters_json'});expect(upgraded.prepare('SELECT description FROM proposals WHERE id=?').get(proposalId)).toEqual({description:'existing'});const parameters={actionType:'restart_service',service:'api'};createProposal(upgraded,{id:'44444444-4444-4444-8444-444444444444',incidentId,analysisId,actionType:'restart_service',parameters,description:'new',actor:'local-operator',createdAt:'2026-09-30T10:01:00.000Z'});expect(listProposals(upgraded,incidentId).find(p=>p.id==='44444444-4444-4444-8444-444444444444')?.parameters).toEqual(parameters);upgraded.close();}));
});
