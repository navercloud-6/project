import { useMemo, useState } from 'react';
import type { Journey } from '@/lib/domain/contracts';
import type { AuthStatus } from '@/lib/application/ports';

import type { TravelPreferences } from '@/lib/adapters/preferences';

export function MyProfile({
  saved,
  ready,
  loading,
  regions,
  preferences,
  onSave,
  onJourneys,
  onExplore,
  onRecommend,
  onRetrySession,
}: {
  saved: Journey[];
  ready: boolean;
  loading?: boolean;
  regions: string[];
  preferences: TravelPreferences;
  onSave: (preferences: TravelPreferences) => void;
  onJourneys: () => void;
  onExplore?: () => void;
  onRecommend: (draft?: TravelPreferences) => void;
  onRetrySession?: () => void;
  auth?: AuthStatus | null;
  onLogout?: () => void;
  busy?: boolean;
}) {
  const [region, setRegion] = useState(preferences.region);
  const [prompt, setPrompt] = useState(preferences.prompt);
  const dirty =
    region !== preferences.region || prompt.trim() !== preferences.prompt;
  const visitedCount = useMemo(
    () =>
      new Set(saved.flatMap((journey) => Object.keys(journey.records))).size,
    [saved],
  );

  return (
    <section className="profile-page">
      <div className="section-heading">
        <div>
          <span className="pill">나의 여행과 취향</span>
          <h1>프로필</h1>
          <p>저장한 여행 현황을 보고 다음 추천에 쓸 취향을 관리해 보세요.</p>
        </div>
      </div>
      <section
        className="profile-summary"
        aria-labelledby="profile-summary-title"
      >
        <h2 id="profile-summary-title">나의 경기 여행</h2>
        {ready ? (
          <>
            <dl className="profile-counts">
              <div>
                <dt>저장한 여행</dt>
                <dd>
                  {saved.length}
                  <small>개</small>
                </dd>
              </div>
              <div>
                <dt>기록한 방문 장소</dt>
                <dd>
                  {visitedCount}
                  <small>곳</small>
                </dd>
              </div>
            </dl>
            {!saved.length && (
              <p>
                아직 저장한 여행이 없어요. 취향에 맞는 첫 여행을 찾아보세요.
              </p>
            )}
            <div className="tool-actions">
              {!saved.length && onExplore && (
                <button
                  type="button"
                  className="primary compact"
                  onClick={onExplore}
                >
                  장소 찾기
                </button>
              )}
              <button
                type="button"
                className={saved.length ? 'primary compact' : 'secondary'}
                onClick={onJourneys}
              >
                내 여행 보기
              </button>
            </div>
          </>
        ) : (
          <>
            <p>
              {loading
                ? '여행 보관함을 연결하고 있어요…'
                : '여행 보관함에 연결하지 못했어요. 위에서 연결 상태를 확인해 주세요.'}
            </p>
            {!loading && onRetrySession && (
              <button
                type="button"
                className="secondary"
                onClick={onRetrySession}
              >
                다시 시도
              </button>
            )}
          </>
        )}
      </section>
      <form
        className="tool-section profile-preferences"
        onSubmit={(event) => {
          event.preventDefault();
          onSave({ region, prompt: prompt.trim() });
        }}
      >
        <div className="preference-heading">
          <h2>내 여행 취향</h2>
          <span className={dirty ? 'status-chip dirty' : 'status-chip'}>
            {dirty ? '변경 사항 있음' : '저장됨'}
          </span>
        </div>
        <p>
          저장한 취향은 추천 화면에 기본값으로 채워지며 여행마다 바꿀 수 있어요.
        </p>
        <label htmlFor="profile-region">선호 지역</label>
        <select
          id="profile-region"
          value={region}
          onChange={(event) => setRegion(event.target.value)}
        >
          {regions.map((value) => (
            <option key={value}>{value}</option>
          ))}
        </select>
        <div className="label-row">
          <label htmlFor="profile-prompt">좋아하는 여행</label>
          <span className="char-count">{prompt.length} / 500</span>
        </div>
        <textarea
          id="profile-prompt"
          maxLength={500}
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder="바다를 보며 걷거나 조용한 전시를 둘러보는 여행을 좋아해요."
        />
        <p className="fine">
          취향은 이 브라우저에 저장됩니다. 추천 요청 시 NAVER Cloud로 전달될 수
          있으니 개인정보는 입력하지 마세요.
        </p>
        <div className="tool-actions">
          <button className="primary compact" type="submit">
            취향 저장
          </button>
          <button
            className="secondary"
            type="button"
            onClick={() => onRecommend({ region, prompt: prompt.trim() })}
          >
            추천받기
          </button>
        </div>
        <p className="fine">
          다음 방문에도 기본값으로 쓰려면 먼저 취향 저장을 눌러 주세요.
        </p>
      </form>
      <section className="tool-section" aria-labelledby="profile-storage-title">
        <h2 id="profile-storage-title">여행 보관 정책</h2>
        <p>
          저장한 여행과 방문 기록·사진은 이 브라우저 세션(30일)에 보관되며,
          쿠키를 삭제하거나 세션이 만료되면 다시 접근할 수 없습니다. 여행 취향은
          이 브라우저에만 저장됩니다.
        </p>
      </section>
    </section>
  );
}
