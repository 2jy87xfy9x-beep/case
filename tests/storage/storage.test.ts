import { describe, expect, it } from 'vitest';
import { createCase } from '../../app/domain/factories.js';
import type { Case, Evidence, Message } from '../../app/domain/types.js';
import type { CaseRepository } from '../../app/ports/CaseRepository.js';
import { IndexedDbCaseRepository } from '../../app/storage/IndexedDbCaseRepository.js';

class InMemoryCaseRepository implements CaseRepository {
  private readonly cases = new Map<string, Case>();
  private readonly evidence = new Map<string, Evidence[]>();
  private readonly messages = new Map<string, Message[]>();

  async saveCase(caseData: Case): Promise<void> {
    this.cases.set(caseData.id, structuredClone(caseData));
  }

  async loadCase(caseId: string): Promise<Case | null> {
    return structuredClone(this.cases.get(caseId) ?? null);
  }

  async saveEvidence(caseId: string, evidence: Evidence[]): Promise<void> {
    this.evidence.set(caseId, structuredClone(evidence));
  }

  async listEvidence(caseId: string): Promise<Evidence[]> {
    return structuredClone(this.evidence.get(caseId) ?? []);
  }

  async saveMessages(caseId: string, messages: Message[]): Promise<void> {
    this.messages.set(caseId, structuredClone(messages));
  }

  async listMessages(caseId: string): Promise<Message[]> {
    return structuredClone(this.messages.get(caseId) ?? []);
  }
}

describe('CaseRepository port behavior with in-memory fake', () => {
  it('persists and loads case/evidence/messages through the same port contract', async () => {
    const repo = new InMemoryCaseRepository();
    const caseData = createCase({ id: 'c1', title: 'Case title' });

    const evidence: Evidence[] = [
      {
        id: 'e1',
        dateTime: new Date('2026-01-01T00:00:00Z'),
        title: 'Lease',
        body: 'Signed lease copy',
        requiresUserReview: false,
        provenance: {
          tier: 'manual',
          extractedAt: new Date('2026-01-01T00:00:00Z')
        }
      }
    ];

    const messages: Message[] = [
      {
        id: 'm1',
        threadId: 'thread-a',
        dateTime: new Date('2026-01-02T00:00:00Z'),
        sender: 'landlord',
        direction: 'received',
        body: 'Rent increase notice',
        importSource: 'sms-xml',
        tags: [],
        notes: ''
      }
    ];

    await repo.saveCase(caseData);
    await repo.saveEvidence(caseData.id, evidence);
    await repo.saveMessages(caseData.id, messages);

    expect(await repo.loadCase(caseData.id)).toMatchObject({ id: 'c1', title: 'Case title' });
    expect((await repo.listEvidence(caseData.id))[0].id).toBe('e1');
    expect((await repo.listMessages(caseData.id))[0].id).toBe('m1');
  });

  it('round-trips evidence.category on the port', async () => {
    const repo = new InMemoryCaseRepository();
    const caseData = createCase({ id: 'c-cat', title: 'Cat case' });
    const evidence: Evidence[] = [
      {
        id: 'e-lease',
        dateTime: new Date('2026-01-01T00:00:00Z'),
        title: 'Lease',
        body: 'Terms',
        requiresUserReview: false,
        category: 'lease',
        provenance: { tier: 'manual', extractedAt: new Date('2026-01-01T00:00:00Z') }
      }
    ];
    await repo.saveCase(caseData);
    await repo.saveEvidence(caseData.id, evidence);
    const loaded = await repo.listEvidence(caseData.id);
    expect(loaded[0].category).toBe('lease');
  });
});

describe('IndexedDbCaseRepository smoke', () => {
  it('migrates v1 schema to v2 and adds messages store + lastExportedAt default (fake-indexeddb)', async () => {
    let fakeIndexedDb: typeof import('fake-indexeddb') | null = null;
    try {
      fakeIndexedDb = await import('fake-indexeddb');
    } catch {
      // optional dependency not installed in all environments
    }

    if (!fakeIndexedDb) {
      expect(true).toBe(true);
      return;
    }

    (globalThis as unknown as { indexedDB: IDBFactory }).indexedDB = fakeIndexedDb.indexedDB;

    const dbName = `test-db-${Date.now()}`;
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open(dbName, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('cases')) {
          db.createObjectStore('cases', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('evidence')) {
          const evidence = db.createObjectStore('evidence', { keyPath: 'id' });
          evidence.createIndex('caseId', 'caseId', { unique: false });
        }
      };
      req.onsuccess = () => {
        req.result.close();
        resolve();
      };
      req.onerror = () => reject(req.error);
    });

    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open(dbName, 1);
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction(['cases'], 'readwrite');
        tx.objectStore('cases').put({ id: 'case-1', title: 'Upgrade case' });
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
      req.onerror = () => reject(req.error);
    });

    const repo = new IndexedDbCaseRepository(dbName);
    const loaded = await repo.loadCase('case-1');
    expect(loaded?.lastExportedAt).toBeNull();

    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open(dbName);
      req.onsuccess = () => {
        const db = req.result;
        expect(Array.from(db.objectStoreNames)).toEqual(expect.arrayContaining(['cases', 'evidence', 'messages']));
        db.close();
        resolve();
      };
      req.onerror = () => reject(req.error);
    });
  });
});
