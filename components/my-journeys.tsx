'use client';
import type { Place } from '@/lib/domain/catalog';
import type { Journey } from '@/lib/domain/contracts';
import type { Capabilities } from '@/lib/application/ports';
import { EditJourney } from './assistant/edit-journey';
import { LanguageTools } from './assistant/language-tools';
import { PhotoCredit } from './photo-credit';
import { PlaceMap } from './place-map';
export function MyJourneys({
  saved,
  ready,
  places,
  capabilities,
  onExplore,
  onRecord,
  onDetail,
  onSaved,
}: {
  saved: Journey[];
  ready: boolean;
  places: Place[];
  capabilities: Capabilities;
  onExplore: () => void;
  onRecord: (journey: Journey, place: Place) => void;
  onDetail: (place: Place) => void;
  onSaved: (journey: Journey) => void;
}) {
  return (
    <section className="my-journeys">
      <div className="section-heading">
        <div>
          <span className="pill">저장한 여행</span>
          <h1>내 여행</h1>
          <p>계획한 곳을 다시 보고, 다녀온 순간을 기록하세요.</p>
        </div>
        <button className="primary compact" onClick={onExplore}>
          새 여행 만들기
        </button>
      </div>
      <p className="privacy-note">
        이 브라우저 전용 보관함입니다. 쿠키를 지우거나 세션이 30일 후 만료되면
        저장된 여행에 접근할 수 없습니다.
      </p>
      {!ready ? (
        <div className="empty">
          위에서 여행 보관함의 연결 상태를 확인해 주세요.
        </div>
      ) : !saved.length ? (
        <div className="empty">
          <span className="empty-wave">≈</span>
          <h2>첫 번째 시흥 여행을 만들어 보세요.</h2>
          <p>
            장소를 담고 저장하면 이곳에서 여행과 방문 기록을 확인할 수 있어요.
          </p>
          <button className="secondary" onClick={onExplore}>
            장소 둘러보기
          </button>
        </div>
      ) : (
        <div className="journey-grid">
          {saved.map((j) => {
            const cover = places.find((p) => p.id === j.placeIds[0]);
            return (
              <article className="saved-journey" key={j.id}>
                {cover?.image && (
                  <figure className="journey-cover">
                    <button
                      className="journey-cover-photo"
                      onClick={() => onDetail(cover)}
                      aria-label={`${cover.name} 상세 보기`}
                    >
                      <img
                        src={cover.image.path}
                        alt={cover.image.alt}
                        loading="lazy"
                      />
                    </button>
                    <figcaption>
                      <PhotoCredit image={cover.image} />
                      {' · 표지에 맞게 크롭'}
                    </figcaption>
                  </figure>
                )}
                <div className="saved-top">
                  <span>시흥 하루이음 · 시연용</span>
                  <h2>{j.name}</h2>
                  <p>
                    {j.date}{' '}
                    <span>
                      · {j.placeIds.length}곳 · 기록{' '}
                      {Object.keys(j.records).length}곳
                    </span>
                  </p>
                </div>
                <ol>
                  {j.placeIds.map((id) => {
                    const p = places.find((p) => p.id === id)!;
                    const r = j.records[id];
                    return (
                      <li key={id}>
                        <div>
                          <strong>
                            <button
                              className="text-button"
                              onClick={() => onDetail(p)}
                              aria-label={`${p.name} 상세 보기`}
                            >
                              {p.name}
                            </button>
                          </strong>
                          <p>
                            {r
                              ? `${'★'.repeat(r.rating)} · ${r.note || '방문을 기록했어요.'}`
                              : p.region}
                          </p>
                        </div>
                        <button
                          className="secondary"
                          onClick={() => onRecord(j, p)}
                        >
                          {r ? '기록 수정' : '방문 기록'}
                        </button>
                      </li>
                    );
                  })}
                </ol>
                {j.event && (
                  <p className="event-note">
                    행사 장소: {j.event.location} · 포스터 입력 일정
                  </p>
                )}
                <details className="journey-options">
                  <summary>코스 지도 보기</summary>
                  <PlaceMap
                    compact
                    places={places}
                    visiblePlaces={j.placeIds.map(
                      (id) => places.find((p) => p.id === id)!,
                    )}
                    routeIds={j.placeIds}
                    records={j.records}
                    onDetail={onDetail}
                    onRecord={(p) => onRecord(j, p)}
                  />
                </details>
                <details className="journey-options">
                  <summary>여행 수정·번역</summary>
                  <EditJourney
                    key={j.id}
                    journey={j}
                    places={places}
                    capabilities={capabilities}
                    onSaved={onSaved}
                  />
                  <LanguageTools journeyId={j.id} capabilities={capabilities} />
                </details>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
