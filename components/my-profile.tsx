import { useState } from 'react';
import type { Journey } from '@/lib/domain/contracts';

import type { TravelPreferences } from '@/lib/adapters/preferences';

export function MyProfile({
  saved,
  ready,
  regions,
  preferences,
  onSave,
  onJourneys,
  onRecommend,
}: {
  saved: Journey[];
  ready: boolean;
  regions: string[];
  preferences: TravelPreferences;
  onSave: (preferences: TravelPreferences) => void;
  onJourneys: () => void;
  onRecommend: () => void;
}) {
  const [region, setRegion] = useState(preferences.region);
  const [prompt, setPrompt] = useState(preferences.prompt);
  const visited = new Set(
    saved.flatMap((journey) => Object.keys(journey.records)),
  );

  return (
    <section className="profile-page">
      <div className="section-heading">
        <div>
          <h1>마이</h1>
          <p>나의 여행을 돌아보고, 다음 하루의 취향을 남겨 보세요.</p>
        </div>
      </div>
      <section
        className="profile-summary"
        aria-labelledby="profile-summary-title"
      >
        <h2 id="profile-summary-title">나의 시흥 여행</h2>
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
                  {visited.size}
                  <small>곳</small>
                </dd>
              </div>
            </dl>
            {!saved.length && (
              <p>
                아직 저장한 여행이 없어요. 취향에 맞는 첫 여행을 찾아보세요.
              </p>
            )}
            <button className="secondary" onClick={onJourneys}>
              내 여행 보기
            </button>
          </>
        ) : (
          <p>위에서 여행 보관함의 연결 상태를 확인해 주세요.</p>
        )}
      </section>
      <form
        className="tool-section profile-preferences"
        onSubmit={(event) => {
          event.preventDefault();
          onSave({ region, prompt: prompt.trim() });
        }}
      >
        <h2>내 여행 취향</h2>
        <p>
          저장한 취향은 추천 화면에 미리 채워져요. 여행마다 바꿀 수도 있어요.
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
        <label htmlFor="profile-prompt">좋아하는 여행</label>
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
          <button className="primary" type="submit">
            취향 저장
          </button>
          <button className="secondary" type="button" onClick={onRecommend}>
            여행 추천받기
          </button>
        </div>
        <p className="fine">
          여행 추천에는 저장한 취향을 사용합니다. 변경한 취향은 먼저 저장해
          주세요.
        </p>
      </form>
      <aside
        className="profile-storage"
        aria-labelledby="profile-storage-title"
      >
        <h2 id="profile-storage-title">이 브라우저에 보관돼요</h2>
        <p>
          회원가입 없이 사용하는 여행 보관함입니다. 다른 기기나 브라우저와
          동기화되지 않습니다.
        </p>
        <p>
          쿠키를 지우거나 세션이 30일 후 만료되면 저장한 여행에 접근할 수
          없습니다. 여행 취향은 브라우저의 사이트 데이터를 삭제하면 사라집니다.
        </p>
      </aside>
    </section>
  );
}
