import type { Case, Claim, Evidence, Gap, LegalNote, Lawyer, Message, TimelineItem } from '../domain/types.js';
import type { CaseRepository } from '../ports/CaseRepository.js';

type PersistedCase = Omit<Case, 'lastExportedAt' | 'evidence' | 'messages' | 'claims' | 'legalNotes' | 'tenancy' | 'timeline'> & {
  lastExportedAt: string | null;
  tenancy?: { startDate: string | null; monthlyRentOriginal: number | null; monthlyRentCurrent: number | null };
  timeline?: unknown[]; // stored as-is but treated as transient; rebuilt from evidence/messages on load
};

type PersistedEvidence = Omit<Evidence, 'dateTime' | 'provenance'> & {
  caseId: string;
  dateTime: string | null;
  provenance: {
    tier: Evidence['provenance']['tier'];
    extractedAt: string;
    engineVersion?: string;
  };
};

type PersistedMessage = Omit<Message, 'dateTime'> & {
  caseId: string;
  dateTime: string;
};

type PersistedClaim = Claim & { caseId: string };
type PersistedLegalNote = LegalNote & { caseId: string };
type PersistedLawyer = Lawyer & { caseId: string };

const DB_VERSION = 5;

export class IndexedDbCaseRepository implements CaseRepository {
  constructor(private readonly dbName = 'case-organizer') {}

  async saveCase(caseData: Case): Promise<void> {
    const db = await this.openDb();
    await transactionDone(
      db,
      ['cases'],
      'readwrite',
      (tx) => tx.objectStore('cases').put(serializeCase(caseData))
    );
  }

  async loadCase(caseId: string): Promise<Case | null> {
    const db = await this.openDb();
    const caseRecord = await transactionValue<PersistedCase | undefined>(db, ['cases'], 'readonly', (tx) =>
      tx.objectStore('cases').get(caseId)
    );

    if (!caseRecord) return null;

    const [evidence, messages, claims, legalNotes, lawyers] = await Promise.all([
      this.listEvidence(caseId),
      this.listMessages(caseId),
      this.listClaims(caseId),
      this.listLegalNotes(caseId),
      this.listLawyers(caseId)
    ]);
    return deserializeCase(caseRecord, evidence, messages, claims, legalNotes, lawyers);
  }

  async saveEvidence(caseId: string, evidence: Evidence[]): Promise<void> {
    const db = await this.openDb();
    await transactionDone(db, ['evidence'], 'readwrite', (tx) => {
      const store = tx.objectStore('evidence');
      for (const item of evidence) {
        store.put(serializeEvidence(caseId, item));
      }
    });
  }

  async listEvidence(caseId: string): Promise<Evidence[]> {
    const db = await this.openDb();
    const items = await transactionValue<PersistedEvidence[]>(db, ['evidence'], 'readonly', (tx) =>
      indexGetAll(tx.objectStore('evidence').index('caseId'), caseId)
    );
    return items.map(deserializeEvidence);
  }

  async saveMessages(caseId: string, messages: Message[]): Promise<void> {
    const db = await this.openDb();
    await transactionDone(db, ['messages'], 'readwrite', (tx) => {
      const store = tx.objectStore('messages');
      for (const item of messages) {
        store.put(serializeMessage(caseId, item));
      }
    });
  }

  async listMessages(caseId: string): Promise<Message[]> {
    const db = await this.openDb();
    const items = await transactionValue<PersistedMessage[]>(db, ['messages'], 'readonly', (tx) =>
      indexGetAll(tx.objectStore('messages').index('caseId'), caseId)
    );
    return items.map(deserializeMessage);
  }

  async saveClaims(caseId: string, claims: Claim[]): Promise<void> {
    const db = await this.openDb();
    await transactionDone(db, ['claims'], 'readwrite', (tx) => {
      const store = tx.objectStore('claims');
      for (const item of claims) {
        store.put({ ...item, caseId });
      }
    });
  }

  async listClaims(caseId: string): Promise<Claim[]> {
    const db = await this.openDb();
    const items = await transactionValue<PersistedClaim[]>(db, ['claims'], 'readonly', (tx) =>
      indexGetAll(tx.objectStore('claims').index('caseId'), caseId)
    );
    return items.map(({ caseId: _id, ...claim }) => claim as Claim);
  }

  async saveLegalNotes(caseId: string, legalNotes: LegalNote[]): Promise<void> {
    const db = await this.openDb();
    await transactionDone(db, ['legalNotes'], 'readwrite', (tx) => {
      const store = tx.objectStore('legalNotes');
      for (const item of legalNotes) {
        store.put({ ...item, caseId });
      }
    });
  }

  async listLegalNotes(caseId: string): Promise<LegalNote[]> {
    const db = await this.openDb();
    const items = await transactionValue<PersistedLegalNote[]>(db, ['legalNotes'], 'readonly', (tx) =>
      indexGetAll(tx.objectStore('legalNotes').index('caseId'), caseId)
    );
    return items.map(({ caseId: _id, ...note }) => note as LegalNote);
  }

  async saveLawyers(caseId: string, lawyers: Lawyer[]): Promise<void> {
    const db = await this.openDb();
    await transactionDone(db, ['lawyers'], 'readwrite', (tx) => {
      const store = tx.objectStore('lawyers');
      for (const item of lawyers) {
        store.put({ ...item, caseId });
      }
    });
  }

  async listLawyers(caseId: string): Promise<Lawyer[]> {
    const db = await this.openDb();
    const items = await transactionValue<PersistedLawyer[]>(db, ['lawyers'], 'readonly', (tx) =>
      indexGetAll(tx.objectStore('lawyers').index('caseId'), caseId)
    );
    return items.map(({ caseId: _id, ...lawyer }) => lawyer as Lawyer);
  }

  async deleteCase(caseId: string): Promise<void> {
    const db = await this.openDb();
    const relatedStores = ['evidence', 'messages', 'claims', 'legalNotes', 'lawyers'] as const;
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(['cases', ...relatedStores], 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Transaction failed'));
      tx.onabort = () => reject(tx.error ?? new Error('Transaction aborted'));
      tx.objectStore('cases').delete(caseId);
      for (const storeName of relatedStores) {
        const req = tx.objectStore(storeName).index('caseId').openCursor(IDBKeyRange.only(caseId));
        req.onsuccess = () => {
          const cursor = req.result;
          if (!cursor) return;
          cursor.delete();
          cursor.continue();
        };
      }
    });
  }

  async deleteEvidence(_caseId: string, evidenceId: string): Promise<void> {
    const db = await this.openDb();
    await transactionDone(db, ['evidence'], 'readwrite', (tx) => {
      tx.objectStore('evidence').delete(evidenceId);
    });
  }

  async listCases(): Promise<Case[]> {
    const db = await this.openDb();
    const caseRecords = await transactionValue<PersistedCase[]>(db, ['cases'], 'readonly', (tx) =>
      tx.objectStore('cases').getAll() as IDBRequest<PersistedCase[]>
    );

    return Promise.all(
      caseRecords.map(async (caseRecord) => {
        const [evidence, messages, claims, legalNotes, lawyers] = await Promise.all([
          this.listEvidence(caseRecord.id),
          this.listMessages(caseRecord.id),
          this.listClaims(caseRecord.id),
          this.listLegalNotes(caseRecord.id),
          this.listLawyers(caseRecord.id)
        ]);
        return deserializeCase(caseRecord, evidence, messages, claims, legalNotes, lawyers);
      })
    );
  }

  private openDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        const tx = request.transaction;
        if (!tx) {
          reject(new Error('Missing upgrade transaction'));
          return;
        }

        if (!db.objectStoreNames.contains('cases')) {
          db.createObjectStore('cases', { keyPath: 'id' });
        }

        if (!db.objectStoreNames.contains('evidence')) {
          const evidence = db.createObjectStore('evidence', { keyPath: 'id' });
          evidence.createIndex('caseId', 'caseId', { unique: false });
        }

        if (!db.objectStoreNames.contains('messages')) {
          const messages = db.createObjectStore('messages', { keyPath: 'id' });
          messages.createIndex('caseId', 'caseId', { unique: false });
        }

        if (!db.objectStoreNames.contains('claims')) {
          const claims = db.createObjectStore('claims', { keyPath: 'id' });
          claims.createIndex('caseId', 'caseId', { unique: false });
        }

        if (!db.objectStoreNames.contains('legalNotes')) {
          const legalNotes = db.createObjectStore('legalNotes', { keyPath: 'id' });
          legalNotes.createIndex('caseId', 'caseId', { unique: false });
        }

        if (!db.objectStoreNames.contains('lawyers')) {
          const lawyers = db.createObjectStore('lawyers', { keyPath: 'id' });
          lawyers.createIndex('caseId', 'caseId', { unique: false });
        }

        if (request.oldVersion < 2) {
          const casesStore = tx.objectStore('cases');
          const cursorRequest = casesStore.openCursor();
          cursorRequest.onsuccess = () => {
            const cursor = cursorRequest.result;
            if (!cursor) return;
            const value = cursor.value as Record<string, unknown>;
            if (!Object.hasOwn(value, 'lastExportedAt')) {
              cursor.update({ ...value, lastExportedAt: null });
            }
            cursor.continue();
          };
        }

        // v5: all new Case fields are optional — no data transformation needed
        // existing records remain valid as-is
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('Unable to open IndexedDB'));
    });
  }
}

function serializeCase(caseData: Case): PersistedCase {
  const persisted: PersistedCase = {
    id: caseData.id,
    title: caseData.title,
    lastExportedAt: caseData.lastExportedAt ? caseData.lastExportedAt.toISOString() : null,
    lawyers: caseData.lawyers
  };
  // v2 optional fields — only include when present
  if (caseData.parties !== undefined) persisted.parties = caseData.parties;
  if (caseData.property !== undefined) persisted.property = caseData.property;
  if (caseData.tenancy !== undefined) {
    persisted.tenancy = {
      ...caseData.tenancy,
      startDate: caseData.tenancy.startDate instanceof Date
        ? caseData.tenancy.startDate.toISOString()
        : caseData.tenancy.startDate,
    };
  }
  if (caseData.clientGoal !== undefined) persisted.clientGoal = caseData.clientGoal;
  if (caseData.status !== undefined) persisted.status = caseData.status;
  if (caseData.source !== undefined) persisted.source = caseData.source;
  if (caseData.timeline !== undefined) persisted.timeline = caseData.timeline;
  if (caseData.gaps !== undefined) persisted.gaps = caseData.gaps;
  if (caseData.libraryRefs !== undefined) persisted.libraryRefs = caseData.libraryRefs;
  return persisted;
}

function deserializeCase(
  caseData: PersistedCase,
  evidence: Evidence[],
  messages: Message[],
  claims: Claim[],
  legalNotes: LegalNote[],
  lawyers: Lawyer[]
): Case {
  const result: Case = {
    id: caseData.id,
    title: caseData.title,
    lastExportedAt: caseData.lastExportedAt ? new Date(caseData.lastExportedAt) : null,
    evidence,
    messages,
    claims,
    legalNotes,
    lawyers
  };
  // v2 optional fields — restore when present
  if (caseData.parties !== undefined) result.parties = caseData.parties;
  if (caseData.property !== undefined) result.property = caseData.property;
  if (caseData.tenancy !== undefined) {
    result.tenancy = {
      ...caseData.tenancy,
      startDate: caseData.tenancy.startDate != null
        ? new Date(caseData.tenancy.startDate)
        : null,
    };
  }
  if (caseData.clientGoal !== undefined) result.clientGoal = caseData.clientGoal;
  if (caseData.status !== undefined) result.status = caseData.status;
  if (caseData.source !== undefined) result.source = caseData.source;
  // timeline is a transient/derived field — stored for caching but treated as untrusted on load.
  // Phase 12 will rebuild it from evidence and messages via buildTimeline().
  if (caseData.timeline !== undefined) result.timeline = caseData.timeline as TimelineItem[];
  if (caseData.gaps !== undefined) result.gaps = caseData.gaps as Gap[];
  if (caseData.libraryRefs !== undefined) result.libraryRefs = caseData.libraryRefs;
  return result;
}

function serializeEvidence(caseId: string, evidence: Evidence): PersistedEvidence {
  return {
    ...evidence,
    caseId,
    dateTime: Number.isFinite(evidence.dateTime.getTime()) ? evidence.dateTime.toISOString() : null,
    provenance: {
      ...evidence.provenance,
      extractedAt: evidence.provenance.extractedAt.toISOString()
    }
  };
}

function deserializeEvidence(evidence: PersistedEvidence): Evidence {
  return {
    ...evidence,
    dateTime: evidence.dateTime ? new Date(evidence.dateTime) : new Date(NaN),
    provenance: {
      ...evidence.provenance,
      extractedAt: new Date(evidence.provenance.extractedAt)
    }
  };
}

function serializeMessage(caseId: string, message: Message): PersistedMessage {
  return {
    ...message,
    caseId,
    dateTime: message.dateTime.toISOString()
  };
}

function deserializeMessage(message: PersistedMessage): Message {
  return {
    ...message,
    dateTime: new Date(message.dateTime)
  };
}

async function transactionDone(
  db: IDBDatabase,
  stores: string[],
  mode: IDBTransactionMode,
  handler: (tx: IDBTransaction) => void
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(stores, mode);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Transaction failed'));
    tx.onabort = () => reject(tx.error ?? new Error('Transaction aborted'));

    try {
      handler(tx);
    } catch (error) {
      tx.abort();
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

async function transactionValue<T>(
  db: IDBDatabase,
  stores: string[],
  mode: IDBTransactionMode,
  handler: (tx: IDBTransaction) => IDBRequest<T>
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(stores, mode);
    const req = handler(tx);

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Request failed'));
    tx.onabort = () => reject(tx.error ?? new Error('Transaction aborted'));
    tx.onerror = () => reject(tx.error ?? new Error('Transaction failed'));
  });
}

function indexGetAll<T>(index: IDBIndex, value: IDBValidKey): IDBRequest<T[]> {
  return index.getAll(value) as IDBRequest<T[]>;
}
