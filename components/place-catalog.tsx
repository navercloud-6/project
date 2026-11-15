import type { Place } from '@/lib/domain/catalog';
import { PlaceMap } from './place-map';
import { PlaceCard } from './place-card';

export function PlaceCatalog({
  places,
  regions,
  filtered,
  selection,
  query,
  region,
  viewMode,
  hidden,
  onQuery,
  onRegion,
  onViewMode,
  onToggle,
  onDetail,
}: {
  places: Place[];
  regions: string[];
  filtered: Place[];
  selection: string[];
  query: string;
  region: string;
  viewMode: 'grid' | 'map';
  hidden: boolean;
  onQuery: (query: string) => void;
  onRegion: (region: string) => void;
  onViewMode: (mode: 'grid' | 'map') => void;
  onToggle: (id: string) => void;
  onDetail: (place: Place) => void;
}) {
  return (
    <section id="places" className="catalog" hidden={hidden}>
      <div className="section-heading">
        <div>
          <h2>여행 장소 찾기</h2>
          <p>장소를 살펴보고 최대 8곳을 담으세요.</p>
        </div>
        <div className="catalog-header-actions">
          <span className="total">{filtered.length}곳</span>
          <div className="view-toggle" role="group" aria-label="장소 보기 방식">
            <button
              type="button"
              className={
                viewMode === 'grid' ? 'view-button active' : 'view-button'
              }
              aria-pressed={viewMode === 'grid'}
              onClick={() => onViewMode('grid')}
            >
              카드 보기
            </button>
            <button
              type="button"
              className={
                viewMode === 'map' ? 'view-button active' : 'view-button'
              }
              aria-pressed={viewMode === 'map'}
              onClick={() => onViewMode('map')}
            >
              지도 보기
            </button>
          </div>
        </div>
      </div>
      <div className="filters">
        <label className="search">
          <span className="sr-only">장소 검색</span>
          <input
            type="search"
            placeholder="장소 이름이나 취향 검색"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
          />
          <span aria-hidden="true">⌕</span>
        </label>
        <label>
          <span className="sr-only">지역 선택 (AI 추천에도 적용)</span>
          <select value={region} onChange={(e) => onRegion(e.target.value)}>
            {regions.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </label>
      </div>
      <p className="catalog-note">
        검토 전 관광 자료 · 방문 전 공식 안내에서 운영·요금·예약을 확인하세요.
      </p>
      {viewMode === 'map' ? (
        <PlaceMap
          places={places}
          visiblePlaces={filtered}
          routeIds={selection}
          onToggle={onToggle}
          onDetail={onDetail}
        />
      ) : (
        <div className="place-grid">
          {filtered.map((p) => (
            <PlaceCard
              key={p.id}
              place={p}
              selected={selection.includes(p.id)}
              onDetail={onDetail}
              onToggle={onToggle}
            />
          ))}
        </div>
      )}
      {!filtered.length && (
        <div className="empty">
          <h3>조건에 맞는 장소가 없어요.</h3>
          <p>검색어나 지역을 바꿔 보세요.</p>
          <button
            className="secondary"
            onClick={() => {
              onQuery('');
              onRegion('전체');
            }}
          >
            전체 장소 보기
          </button>
        </div>
      )}
    </section>
  );
}
