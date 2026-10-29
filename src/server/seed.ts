import type { DatabaseConnection } from './database.ts';
import { markets, stores } from './schema.ts';

// Synthetic records exercise search and unknown information; they describe no real market.
export async function seedSampleCatalog(db: DatabaseConnection['db']) {
  await db.transaction(async (tx) => {
    await tx.insert(markets).values([
      { id: 'sample-haetsal', name: '햇살시장 (가상)', locationDescription: '개발용 가상 시장 · 실제 주소 없음', isSample: true },
      { id: 'sample-gangbyeon', name: '강변시장 (가상)', locationDescription: '개발용 가상 시장 · 실제 주소 없음', isSample: true },
    ]).onConflictDoNothing();
    await tx.insert(stores).values([
      { id: 'sample-pureun', marketId: 'sample-haetsal', name: '푸른채소 (가상)', locationDescription: '가상 도식 A구역', usualItems: ['대파', '당근', '감자'], source: '개발용 가상 자료', isSample: true },
      { id: 'sample-hankki', marketId: 'sample-haetsal', name: '한끼두부 (가상)', locationDescription: null, usualItems: ['두부', '콩나물'], source: '개발용 가상 자료', isSample: true },
      { id: 'sample-gangbyeon-vegetables', marketId: 'sample-gangbyeon', name: '강변채소 (가상)', locationDescription: '가상 도식 B구역', usualItems: ['대파', '양파'], source: '개발용 가상 자료', isSample: true },
    ]).onConflictDoNothing();
  });
}
