import { describe, expect, it, vi } from 'vitest';
import {
  classify,
  extractMeta,
  assignToCase,
  autoProcess
} from '../../app/application/autoProcess.js';
import { createCase } from '../../app/domain/factories.js';
import type { Case } from '../../app/domain/types.js';
import type { CaseRepository } from '../../app/ports/CaseRepository.js';
import type { OcrService } from '../../app/ports/OcrService.js';

// ─── classify() tests ──────────────────────────────────────────────────────────

describe('classify()', () => {
  it('classifies lease by keyword in filename', () => {
    const result = classify('my-lease-agreement.pdf');
    expect(result.category).toBe('lease');
  });

  it('classifies rent-notice by keyword in filename', () => {
    const result = classify('rent-increase-notice.pdf');
    expect(result.category).toBe('rent-notice');
  });

  it('classifies payment by keyword in filename', () => {
    const result = classify('payment-ledger.csv');
    expect(result.category).toBe('payment');
  });

  it('classifies fee-notice by keyword in filename', () => {
    const result = classify('notice-to-pay-or-quit.pdf');
    expect(result.category).toBe('fee-notice');
  });

  it('classifies repair by keyword in filename', () => {
    const result = classify('repair-request.pdf');
    expect(result.category).toBe('repair');
  });

  it('classifies photo by extension (.jpg)', () => {
    const result = classify('photo-of-damage.jpg');
    expect(result.category).toBe('photo');
  });

  it('classifies photo by extension (.png)', () => {
    const result = classify('screenshot.png');
    expect(result.category).toBe('photo');
  });

  it('classifies message by extension (.csv when no payment keyword)', () => {
    const result = classify('sms-backup.xml');
    expect(result.category).toBe('message');
  });

  it('classifies amendment by amendment keyword + lease keyword', () => {
    const result = classify('lease-amendment-addendum.pdf');
    expect(result.category).toBe('amendment');
  });

  it('amendment requires amendment keyword AND a lease/tenant/landlord keyword', () => {
    // "addendum" alone without a lease-related keyword — should NOT be amendment
    // but addendum IS an amendment keyword per spec; must also have lease/tenant/landlord
    const result = classify('addendum-only.pdf');
    // addendum without lease keyword — classify as other or by fallback
    expect(result.category).not.toBe('amendment');
  });

  it('returns other for unrecognized extension and no keywords', () => {
    const result = classify('unknownfile.xyz');
    expect(result.category).toBe('other');
  });

  it('returns a non-empty label', () => {
    const result = classify('lease.pdf');
    expect(typeof result.label).toBe('string');
    expect(result.label.length).toBeGreaterThan(0);
  });

  it('classification is case-insensitive', () => {
    const result = classify('LEASE-AGREEMENT.PDF');
    expect(result.category).toBe('lease');
  });

  it('classifies fee-notice with eviction keyword', () => {
    const result = classify('unlawful-detainer.pdf');
    expect(result.category).toBe('fee-notice');
  });

  it('classifies photo for .heic extension', () => {
    const result = classify('iphone-photo.heic');
    expect(result.category).toBe('photo');
  });
});

// ─── extractMeta() tests ───────────────────────────────────────────────────────

describe('extractMeta()', () => {
  it('extracts ISO date from filename', () => {
    const result = extractMeta('lease-2024-03-15.pdf', '');
    expect(result.date).toBeInstanceOf(Date);
    expect(result.date?.getFullYear()).toBe(2024);
    expect(result.date?.getMonth()).toBe(2); // 0-indexed March
    expect(result.date?.getDate()).toBe(15);
  });

  it('extracts US date from text body', () => {
    const result = extractMeta('notice.pdf', 'This notice is dated 3/15/2024');
    expect(result.date).toBeInstanceOf(Date);
    expect(result.date?.getFullYear()).toBe(2024);
    expect(result.date?.getMonth()).toBe(2);
  });

  it('extracts written month date from text', () => {
    const result = extractMeta('agreement.pdf', 'Effective February 2024');
    expect(result.date).toBeInstanceOf(Date);
    expect(result.date?.getFullYear()).toBe(2024);
    expect(result.date?.getMonth()).toBe(1); // February is index 1
    expect(result.date?.getDate()).toBe(1);
  });

  it('extracts dollar amount from text', () => {
    const result = extractMeta('payment.pdf', 'Amount due: $1,500.00');
    expect(result.amount).toBe(1500);
  });

  it('extracts dollar amount without cents', () => {
    const result = extractMeta('ledger.csv', 'Balance $250');
    expect(result.amount).toBe(250);
  });

  it('extracts address from text', () => {
    const result = extractMeta('lease.pdf', '123 Main St is the property address');
    expect(result.address).toBeTruthy();
    expect(result.address).toContain('123 Main St');
  });

  it('extracts tenant party from text', () => {
    const result = extractMeta('lease.pdf', 'Tenant: Jane Smith');
    expect(result.parties.tenant).toBeTruthy();
  });

  it('extracts landlord party from text', () => {
    const result = extractMeta('lease.pdf', 'Landlord: Bob Jones');
    expect(result.parties.landlord).toBeTruthy();
  });

  it('returns nulls when no patterns match', () => {
    const result = extractMeta('file.txt', 'no patterns here');
    expect(result.date).toBeNull();
    expect(result.amount).toBeNull();
    expect(result.address).toBeNull();
    expect(result.parties.tenant).toBeNull();
    expect(result.parties.landlord).toBeNull();
  });
});

// ─── assignToCase() tests ─────────────────────────────────────────────────────

describe('assignToCase()', () => {
  function makeCase(id: string, address?: string, tenant?: string): Case {
    const c = createCase({ id, title: `Case ${id}` });
    if (address) c.property = { address, unit: '', jurisdiction: '' };
    if (tenant) c.parties = { tenant, landlord: 'Owner' };
    return c;
  }

  it('matches by address (case-insensitive)', () => {
    const existing = makeCase('c1', '123 Main St', undefined);
    const meta = {
      date: null,
      amount: null,
      address: '123 main st',
      parties: { tenant: null, landlord: null }
    };
    expect(assignToCase(meta, [existing])).toBe(existing);
  });

  it('matches by tenant name (case-insensitive)', () => {
    const existing = makeCase('c2', undefined, 'Jane Smith');
    const meta = {
      date: null,
      amount: null,
      address: null,
      parties: { tenant: 'jane smith', landlord: null }
    };
    expect(assignToCase(meta, [existing])).toBe(existing);
  });

  it('returns null when no match', () => {
    const existing = makeCase('c3', '456 Oak Ave', 'Tom Jones');
    const meta = {
      date: null,
      amount: null,
      address: '999 Unknown Blvd',
      parties: { tenant: 'Someone Else', landlord: null }
    };
    expect(assignToCase(meta, [existing])).toBeNull();
  });

  it('returns null when existing cases array is empty', () => {
    const meta = {
      date: null,
      amount: null,
      address: '123 Main St',
      parties: { tenant: 'Jane', landlord: null }
    };
    expect(assignToCase(meta, [])).toBeNull();
  });
});

// ─── autoProcess() integration tests ─────────────────────────────────────────

function makeFile(name: string, type = 'application/pdf'): File {
  return new File(['file content'], name, { type });
}

function makeMockRepo(): CaseRepository {
  return {
    saveCase: vi.fn().mockResolvedValue(undefined),
    loadCase: vi.fn().mockResolvedValue(null),
    saveEvidence: vi.fn().mockResolvedValue(undefined),
    listEvidence: vi.fn().mockResolvedValue([]),
    saveMessages: vi.fn().mockResolvedValue(undefined),
    listMessages: vi.fn().mockResolvedValue([]),
    saveClaims: vi.fn().mockResolvedValue(undefined),
    listClaims: vi.fn().mockResolvedValue([]),
    saveLegalNotes: vi.fn().mockResolvedValue(undefined),
    listLegalNotes: vi.fn().mockResolvedValue([]),
    saveLawyers: vi.fn().mockResolvedValue(undefined),
    listLawyers: vi.fn().mockResolvedValue([]),
    listCases: vi.fn().mockResolvedValue([])
  };
}

describe('autoProcess() integration', () => {
  it('processes files and returns a case with evidence', async () => {
    const repo = makeMockRepo();
    const files = [makeFile('lease-2024-01-01.pdf'), makeFile('payment-ledger.csv')];
    const result = await autoProcess(files, { existingCases: [], repo });
    expect(result).toBeDefined();
    expect(result.evidence.length).toBe(2);
  });

  it('sets timeline on the returned case', async () => {
    const repo = makeMockRepo();
    const files = [makeFile('lease.pdf')];
    const result = await autoProcess(files, { existingCases: [], repo });
    expect(Array.isArray(result.timeline)).toBe(true);
  });

  it('sets gaps on the returned case', async () => {
    const repo = makeMockRepo();
    const files = [makeFile('rent-increase.pdf')];
    const result = await autoProcess(files, { existingCases: [], repo });
    expect(Array.isArray(result.gaps)).toBe(true);
  });

  it('sets status to gaps when gaps are detected', async () => {
    const repo = makeMockRepo();
    // rent-notice without lease → should trigger gap.missingLease
    const files = [makeFile('rent-increase-notice.pdf')];
    const result = await autoProcess(files, { existingCases: [], repo });
    // If gaps exist, status should be 'gaps'
    if (result.gaps && result.gaps.length > 0) {
      expect(result.status).toBe('gaps');
    } else {
      expect(result.status).toBe('ready');
    }
  });

  it('sets status to ready when no gaps', async () => {
    const repo = makeMockRepo();
    // photo files alone don't trigger gap detection
    const files = [makeFile('photo.jpg', 'image/jpeg')];
    const result = await autoProcess(files, { existingCases: [], repo });
    expect(result.status).toBe('ready');
  });

  it('saves case via repo.saveCase', async () => {
    const repo = makeMockRepo();
    const files = [makeFile('lease.pdf')];
    await autoProcess(files, { existingCases: [], repo });
    expect(repo.saveCase).toHaveBeenCalledTimes(1);
  });

  it('saves evidence via repo.saveEvidence', async () => {
    const repo = makeMockRepo();
    const files = [makeFile('lease.pdf'), makeFile('payment.csv')];
    await autoProcess(files, { existingCases: [], repo });
    expect(repo.saveEvidence).toHaveBeenCalled();
  });

  it('calls OCR service for non-photo/message files when provided', async () => {
    const repo = makeMockRepo();
    const ocrService: OcrService = {
      extractText: vi.fn().mockResolvedValue({
        text: 'Some extracted text from 123 Main St',
        tier: 'manual',
        requiresUserReview: false,
        confidence: 'high',
        extractedAt: new Date()
      }),
      isAvailable: () => true
    };
    const files = [makeFile('lease.pdf')];
    await autoProcess(files, { existingCases: [], repo, ocrService });
    expect(ocrService.extractText).toHaveBeenCalledTimes(1);
  });

  it('does not call OCR service for photo files', async () => {
    const repo = makeMockRepo();
    const ocrService: OcrService = {
      extractText: vi.fn().mockResolvedValue({
        text: '',
        tier: 'manual',
        requiresUserReview: false,
        confidence: 'high',
        extractedAt: new Date()
      }),
      isAvailable: () => true
    };
    const files = [makeFile('photo.jpg', 'image/jpeg')];
    await autoProcess(files, { existingCases: [], repo, ocrService });
    expect(ocrService.extractText).not.toHaveBeenCalled();
  });

  it('sets source to upload by default', async () => {
    const repo = makeMockRepo();
    const files = [makeFile('lease.pdf')];
    const result = await autoProcess(files, { existingCases: [], repo });
    expect(result.source).toBe('upload');
  });

  it('sets source to drop-folder when specified', async () => {
    const repo = makeMockRepo();
    const files = [makeFile('lease.pdf')];
    const result = await autoProcess(files, { existingCases: [], repo, source: 'drop-folder' } as any);
    expect(result.source).toBe('drop-folder');
  });

  it('assigns to existing case when address matches', async () => {
    const existingCase = createCase({ id: 'existing-1', title: 'Existing Case' });
    existingCase.property = { address: '123 Main St', unit: '1', jurisdiction: 'CA' };
    const repo = makeMockRepo();

    const ocrService: OcrService = {
      extractText: vi.fn().mockResolvedValue({
        text: 'Property at 123 Main St tenant: Alice',
        tier: 'manual',
        requiresUserReview: false,
        confidence: 'high',
        extractedAt: new Date()
      }),
      isAvailable: () => true
    };

    const files = [makeFile('new-notice.pdf')];
    const result = await autoProcess(files, {
      existingCases: [existingCase],
      repo,
      ocrService
    });
    expect(result.id).toBe('existing-1');
  });

  it('sets suggestClaims results on returned case', async () => {
    const repo = makeMockRepo();
    const files = [makeFile('rent-increase-notice.pdf')];
    const result = await autoProcess(files, { existingCases: [], repo });
    expect(Array.isArray(result.claims)).toBe(true);
  });
});
