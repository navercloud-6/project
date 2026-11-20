'use client';
import Image from 'next/image';
import { useState } from 'react';
import type { Place } from '@/lib/domain/catalog';
import type { Journey } from '@/lib/domain/contracts';
import type { AuthStatus, Capabilities } from '@/lib/application/ports';
import { EditJourney } from './assistant/edit-journey';
import { LanguageTools } from './assistant/language-tools';
import { PhotoCredit } from './photo-credit';
import { PlaceMap } from './place-map';

function JourneyCourseMap({
  journey,
  places,
  naverMapClientId,
  onDetail,
  onRecord,
}: {
  journey: Journey;
  places: Place[];
  naverMapClientId?: string;
  onDetail: (place: Place) => void;
  onRecord: (place: Place) => void;
}) {
  const [opened, setOpened] = useState(false);
  return (
    <details
      className="journey-options"
      onToggle={(event) => {
        if (event.currentTarget.open) setOpened(true);
      }}
    >
      <summary>코스 지도 보기</summary>
      {opened && (
        <PlaceMap
          compact
          places={places}
          visiblePlaces={journey.placeIds
            .map((id) => places.find((p) => p.id === id))
            .filter((p): p is Place => Boolean(p))}
          routeIds={journey.placeIds}
          records={journey.records}
          naverMapClientId={naverMapClientId}
          onDetail={onDetail}
          onRecord={onRecord}
        />
      )}
    </details>
  );
}

export function MyJourneys({
  saved,
  ready,
  loading,
  auth,
  places,
  capabilities,
  naverMapClientId = '',
  onExplore,
  onRecommend,
  onProfile,
  onRetrySession,
  onRecord,
  onDetail,
  onSaved,
}: {
  saved: Journey[];
  ready: boolean;
  loading?: boolean;
  auth?: AuthStatus | null;
  places: Place[];
  capabilities: Capabilities;
  naverMapClientId?: string;
  onExplore: () => void;
  onRecommend?: () => void;
  onProfile?: () => void;
  onRetrySession?: () => void;
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
          <p>계획한 코스를 다시 보고 다녀온 순간을 기록해 보세요.</p>
        </div>
        <button type="button" className="primary compact" onClick={onExplore}>
          새 여행 만들기
        </button>
      </div>
      <div className="privacy-note">
        <span>
          {auth?.authenticated
            ? '네이버 계정에 연결된 보관함입니다. 같은 계정으로 다른 기기에서도 여행과 방문 기록을 확인할 수 있어요.'
            : '이 브라우저 전용 보관함입니다. 쿠키를 지우거나 세션이 30일 후 만료되면 저장된 여행에 접근할 수 없습니다.'}
        </span>
        {onProfile && (
          <button type="button" className="detail-link" onClick={onProfile}>
            {auth?.authenticated ? '계정·보관 관리' : '네이버 계정·보관 안내'}
          </button>
        )}
      </div>
      {!ready ? (
        <div className="empty">
          <p>
            {loading
              ? '여행 보관함을 연결하고 있어요…'
              : '여행 보관함에 연결하지 못했어요. 위에서 연결 상태를 확인하거나 다시 시도해 주세요.'}
          </p>
          {!loading && onRetrySession && (
            <div className="empty-actions">
              <button
                type="button"
                className="secondary"
                onClick={onRetrySession}
              >
                다시 시도
              </button>
            </div>
          )}
        </div>
      ) : !saved.length ? (
        <div className="empty">
          <span className="empty-wave" aria-hidden="true">
            ≈
          </span>
          <h2>첫 번째 경기 여행을 만들어 보세요.</h2>
          <p>
            장소를 담고 저장하면 이곳에서 여행과 방문 기록을 확인할 수 있어요.
          </p>
          <div className="empty-actions">
            <button
              type="button"
              className="primary compact"
              onClick={onExplore}
            >
              장소 찾기
            </button>
            {onRecommend && (
              <button type="button" className="secondary" onClick={onRecommend}>
                추천받기
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="journey-grid">
          {saved.map((j) => {
            const cover = places.find((p) => p.id === j.placeIds[0]);
            const recordedCount = Object.keys(j.records).length;
            return (
              <article className="saved-journey" key={j.id}>
                {cover?.image && (
                  <figure className="journey-cover">
                    <button
                      type="button"
                      className="journey-cover-photo"
                      onClick={() => onDetail(cover)}
                      aria-label={`${cover.name} 상세 보기`}
                    >
                      <Image
                        fill
                        sizes="(max-width: 760px) calc(100vw - 36px), (max-width: 1400px) 50vw, 640px"
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
                  <div className="saved-top-meta">
                    <span className="pill">
                      {j.event ? '포스터 등록 일정' : '저장한 여행'}
                    </span>
                    <span className="saved-progress">
                      방문 기록 {recordedCount} / {j.placeIds.length}곳
                    </span>
                  </div>
                  <h2>{j.name}</h2>
                  <p>
                    {j.date} <span>· 장소 {j.placeIds.length}곳</span>
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
                              type="button"
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
                          type="button"
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
                <JourneyCourseMap
                  journey={j}
                  places={places}
                  naverMapClientId={naverMapClientId}
                  onDetail={onDetail}
                  onRecord={(p) => onRecord(j, p)}
                />
                <details className="journey-options">
                  <summary>대화로 여행 수정</summary>
                  <EditJourney
                    key={j.id}
                    journey={j}
                    places={places}
                    capabilities={capabilities}
                    onSaved={onSaved}
                  />
                </details>
                <details className="journey-options">
                  <summary>여행 번역</summary>
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
