import { describe, it, expect } from 'vitest';
import { auditFlights, auditStays, type AuditPick } from './audit';

const pick = (name: string, extra: Partial<AuditPick> = {}): AuditPick => ({
  hotel: { name, nightly: 3000 }, note: '✅ 雙人房',
  sites: [{ site: 'Agoda', nightly: 3000 }, { site: 'Booking.com', nightly: 3100 }, { site: 'Trip.com', nightly: 3200 }],
  photos: { rooms: [{ name: 'Double Room', url: 'room' }], bedroom: [], bathroom: ['bath'] }, ...extra,
});

describe('audit', () => {
  it('passes a list that looks right', () => {
    expect(auditStays([pick('A'), pick('B')], 2)).toEqual([]);
  });

  // The mistakes the user had to find on 2026-10-18.
  it('flags a single room offered to two people, missing photos and sites, and repeats', () => {
    const problems = auditStays([
      pick('Single', { note: '✅ 單人房' }),
      pick('NoPhotos', { photos: { rooms: [], bedroom: [], bathroom: [] } }),
      pick('NoSites', { sites: [] }),
      pick('Twice'), pick('Twice'),
    ], 2);
    expect(problems).toEqual([
      'Single：列的是單人房，但設定 2 人同行',
      'NoPhotos：沒有房間照片',
      'NoSites：沒有任何訂房網站價格',
      'Twice：清單裡重複出現',
    ]);
    expect(auditStays([pick('Single', { note: '✅ 單人房' })], 1)).toEqual([]);
  });

  it('flags implausible prices', () => {
    expect(auditStays([pick('Cheap', { sites: [], hotel: { name: 'Cheap', nightly: 120 } })], 1)).toContain('Cheap：每晚 120 不合理');
  });

  it('flags a flight page without flights or a verdict', () => {
    expect(auditFlights(null)).toEqual(['航班頁沒有讀到']);
    expect(auditFlights({ market: null, flights: [] })).toEqual(['沒有航班', '沒有 Google 的價格判斷']);
  });
});
