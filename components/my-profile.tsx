import { useState } from 'react';
import type { Journey } from '@/lib/domain/contracts';
import type { AuthStatus } from '@/lib/application/ports';

import type { TravelPreferences } from '@/lib/adapters/preferences';

export function MyProfile({
  saved,
  ready,
  regions,
  preferences,
  onSave,
  onJourneys,
  onRecommend,
  auth,
  onLogout,
  busy,
}: {
  saved: Journey[];
  ready: boolean;
  regions: string[];
  preferences: TravelPreferences;
  onSave: (preferences: TravelPreferences) => void;
  onJourneys: () => void;
  onRecommend: () => void;
  auth: AuthStatus | null;
  onLogout: () => void;
  busy: boolean;
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
      <section className="tool-section" aria-labelledby="profile-account-title">
        <h2 id="profile-account-title">네이버 계정</h2>
        {auth?.authenticated ? (
          <>
            <p>
              네이버 계정으로 로그인했어요. 같은 계정으로 다른 기기에서도 여행과
              방문 기록을 확인할 수 있어요.
            </p>
            <button className="secondary" onClick={onLogout} disabled={busy}>
              로그아웃
            </button>
          </>
        ) : (
          <>
            <p>
              로그인하면 이 브라우저에 저장한 여행·기록·사진을 네이버 계정에
              연결해요. 공용 기기에서는 본인의 여행인지 먼저 확인해 주세요.
            </p>
            <form action="/api/auth/naver" method="post">
              <button
                className="naver-login"
                disabled={!ready || !auth?.enabled || busy}
                type="submit"
              >
                네이버로 로그인
              </button>
            </form>
            <p className="fine">
              {auth === null
                ? '로그인 설정을 확인하고 있어요.'
                : !auth.enabled
                  ? '네이버 로그인 준비 중입니다. 지금은 회원가입 없이 이용할 수 있어요.'
                  : '계정 식별 정보만 사용하며 이름·이메일은 저장하지 않아요.'}
            </p>
          </>
        )}
      </section>
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
        <h2 id="profile-storage-title">여행 보관 안내</h2>
        <p>
          로그인 전에는 이 브라우저에서만 여행을 확인할 수 있어요. 네이버 로그인
          후에는 계정에 연결된 여행을 다른 기기에서도 불러올 수 있어요.
        </p>
        <p>
          익명 여행은 쿠키 삭제·30일 만료 후 접근할 수 없어요. 계정 여행은 다시
          로그인하면 확인할 수 있어요. 로그아웃해도 계정 여행은 보관됩니다. 여행
          취향은 이 브라우저에만 저장되며 사이트 데이터를 삭제하면 사라집니다.
        </p>
      </aside>
    </section>
  );
}
