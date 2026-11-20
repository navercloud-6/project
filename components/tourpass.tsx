'use client';
import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { BottomNavigation, type Tab } from './bottom-navigation';
import { Guide } from './assistant/guide';
import { Poster } from './assistant/poster';
import type { AuthStatus, Capabilities } from '@/lib/application/ports';
import { api } from '@/lib/adapters/client-api';
import { MyJourneys } from './my-journeys';
import { MyProfile } from './my-profile';
import {
  loadPreferences,
  storePreferences,
  type TravelPreferences,
} from '@/lib/adapters/preferences';
import { PlaceDetail } from './place-detail';
import { VisitRecord } from './visit-record';
import { PlaceCatalog } from './place-catalog';
import { TripBuilder } from './trip-builder';
import { RecommendationPanel } from './recommendation-panel';
import { WeatherPanel } from './weather-panel';
import { GyeonggiCityExplorer } from './gyeonggi-city-explorer';
import type { Place } from '@/lib/domain/catalog';
import type { Journey, Recommendation } from '@/lib/domain/contracts';

type ExploreTask = 'browse' | 'recommend' | 'review';

const today = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

const EXPLORE_COPY: Record<
  ExploreTask,
  { pill: (n: number) => string; title: string; body: string }
> = {
  browse: {
    pill: (n) => `경기 관광지 ${n}곳`,
    title: '경기 둘러보기',
    body: '마음에 드는 장소를 최대 8곳까지 담아 나만의 하루를 만드세요.',
  },
  recommend: {
    pill: () => '맞춤 코스 제안',
    title: '취향에 맞는 여행 추천',
    body: '선호 지역과 여행 취향을 알려주시면 어울리는 코스를 골라드려요.',
  },
  review: {
    pill: () => '여행 코스 완성',
    title: '담은 여행 확인',
    body: '방문 순서와 날짜를 정한 뒤 여행을 저장하세요.',
  },
};

export default function Tourpass({
  places,
  capabilities,
  naverMapClientId = '',
}: {
  places: Place[];
  capabilities: Capabilities;
  naverMapClientId?: string;
}) {
  const [tab, setTab] = useState<Tab>('explore');
  const [exploreTask, setExploreTask] = useState<ExploreTask>('browse');
  const [assistantTask, setAssistantTask] = useState<'guide' | 'poster'>(
    'guide',
  );
  const mainRef = useRef<HTMLElement>(null);
  const resultRef = useRef<HTMLElement>(null);
  const [sessionError, setSessionError] = useState('');
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'grid' | 'map'>('grid');
  const [query, setQuery] = useState('');
  const [region, setRegion] = useState('전체');
  const [selectedCityId, setSelectedCityId] = useState<string | null>(null);
  const [prompt, setPrompt] = useState('');
  const [preferences, setPreferences] = useState<TravelPreferences>({
    region: '전체',
    prompt: '',
  });
  const [selection, setSelection] = useState<string[]>([]);
  const [result, setResult] = useState<Recommendation | null>(null);
  const [name, setName] = useState('나의 경기 여행');
  const [date, setDate] = useState('');
  const [saved, setSaved] = useState<Journey[]>([]);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [auth, setAuth] = useState<AuthStatus | null>(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [detail, setDetail] = useState<Place | null>(null);
  const [record, setRecord] = useState<{
    journey: Journey;
    place: Place;
  } | null>(null);

  const regions = ['전체', ...new Set(places.map((p) => p.region))];
  const byId = new Map(places.map((p) => [p.id, p]));
  const filtered = places.filter(
    (p) =>
      (region === '전체' || p.region === region) &&
      [p.name, p.region, p.description, ...p.tags]
        .join(' ')
        .includes(query.trim()),
  );
  const selected = selection.map((id) => byId.get(id)!);
  const goExplore = (task: ExploreTask = 'browse') => {
    setTab('explore');
    setExploreTask(task);
  };

  async function loadSession() {
    setLoading(true);
    setSessionError('');
    try {
      await api('/api/session', 'POST');
      const [data, status] = await Promise.all([
        api<{ journeys: Journey[] }>('/api/journeys'),
        api<AuthStatus>('/api/session'),
      ]);
      setSaved(data.journeys);
      setAuth(status);
      setReady(true);
    } catch (e) {
      setSessionError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setDate(today());
    const url = new URL(window.location.href);
    const login = url.searchParams.get('login');
    if (login) {
      setTab('profile');
      if (login === 'success')
        setNotice('네이버 계정으로 로그인했습니다. 내 여행을 확인해 보세요.');
      else if (login === 'logout')
        setNotice(
          '로그아웃했습니다. 계정 여행은 다시 로그인하면 확인할 수 있어요.',
        );
      else
        setError(
          login === 'cancelled'
            ? '네이버 로그인을 취소했습니다.'
            : '네이버 로그인에 실패했습니다. 다시 시도해 주세요.',
        );
      url.searchParams.delete('login');
      window.history.replaceState(null, '', url);
    }
    void loadSession();
    try {
      const loaded = loadPreferences(localStorage, regions);
      if (loaded) {
        setPreferences(loaded);
        setPrompt(loaded.prompt);
        setRegion(loaded.region);
      }
    } catch {
      setNotice(
        '저장한 여행 취향을 불러오지 못했습니다. 마이에서 다시 설정할 수 있어요.',
      );
    }
  }, []);

  useEffect(() => {
    mainRef.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [tab, exploreTask, assistantTask]);

  useEffect(() => {
    if (result) {
      resultRef.current?.focus({ preventScroll: true });
      resultRef.current?.scrollIntoView({ block: 'start' });
    }
  }, [result]);

  async function logout() {
    setBusy(true);
    setError('');
    try {
      await api('/api/auth/logout', 'POST');
      window.location.assign('/?login=logout');
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  function savePreferences(next: TravelPreferences) {
    setError('');
    setNotice('');
    try {
      storePreferences(localStorage, next);
      setPreferences(next);
      setPrompt(next.prompt);
      setRegion(next.region);
      setResult(null);
      setNotice('여행 취향을 저장했습니다. 다음 추천에 사용할 수 있어요.');
    } catch {
      setError(
        '여행 취향을 저장하지 못했습니다. 브라우저의 사이트 저장 설정을 확인한 뒤 다시 시도해 주세요.',
      );
    }
  }

  function toggle(id: string) {
    setNotice('');
    setError('');
    if (selection.includes(id)) setSelection(selection.filter((x) => x !== id));
    else if (selection.length < 8) setSelection([...selection, id]);
    else setError('한 여행에 최대 8곳까지 담을 수 있습니다.');
  }

  async function generate() {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      setResult(
        await api<Recommendation>('/api/recommend', 'POST', { prompt, region }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    setBusy(true);
    setError('');
    try {
      const { journey } = await api<{ journey: Journey }>(
        '/api/journeys',
        'POST',
        { name, date, placeIds: selection },
      );
      setSaved((current) => [journey, ...current]);
      setSelection([]);
      setTab('journeys');
      setNotice('여행을 저장했습니다. 방문 후 기록을 남겨 보세요.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const updateJourney = (updated: Journey) =>
    setSaved((current) =>
      current.map((j) => (j.id === updated.id ? updated : j)),
    );

  const hero = byId.get('PLACE_REAL_007')!;
  const heading = EXPLORE_COPY[exploreTask];

  return (
    <>
      <a className="skip" href="#main">
        본문으로 이동
      </a>
      <header className="header">
        <a
          className="brand"
          href="#main"
          aria-label="경기 하루이음 홈"
          onClick={() => goExplore()}
        >
          <span className="brand-mark" aria-hidden="true">
            ≈
          </span>
          <span>
            경기 <b>하루이음</b>
            <small>가까운 곳에서, 새로운 하루</small>
          </span>
        </a>
        <span className="service-label">여행 시연 서비스</span>
      </header>
      <main id="main" ref={mainRef} tabIndex={-1}>
        <div className="messages" aria-live="polite">
          {error && (
            <div className="message error" role="alert">
              {error}
              <button onClick={() => setError('')} aria-label="오류 닫기">
                ×
              </button>
            </div>
          )}
          {notice && (
            <div className="message">
              {notice}
              <button onClick={() => setNotice('')} aria-label="알림 닫기">
                ×
              </button>
            </div>
          )}
        </div>
        {!ready && (
          <div className="session-status" role="status">
            {loading
              ? '여행 보관함을 연결하고 있습니다. 장소는 먼저 둘러볼 수 있어요.'
              : `여행 보관함을 연결하지 못했습니다. ${sessionError}`}
            {!loading && (
              <button className="secondary" onClick={() => void loadSession()}>
                다시 시도
              </button>
            )}
          </div>
        )}
        {tab === 'explore' ? (
          <>
            {exploreTask === 'browse' && (
              <GyeonggiCityExplorer
                places={places}
                selectedCityId={selectedCityId}
                selection={selection}
                onSelectCity={setSelectedCityId}
                onDetail={setDetail}
                onToggle={toggle}
              />
            )}
            <div className="explore-heading">
              <span className="pill">{heading.pill(places.length)}</span>
              {exploreTask === 'browse' ? (
                <h2>{heading.title}</h2>
              ) : (
                <h1>{heading.title}</h1>
              )}
              <p>{heading.body}</p>
            </div>
            <div
              className="task-switch"
              role="group"
              aria-label="여행 만들기 작업"
            >
              {(
                [
                  ['browse', '장소 찾기'],
                  ['recommend', '추천받기'],
                  ['review', `담은 여행 ${selection.length}`],
                ] as const
              ).map(([task, label]) => (
                <button
                  key={task}
                  type="button"
                  aria-pressed={exploreTask === task}
                  onClick={() => setExploreTask(task)}
                >
                  {label}
                </button>
              ))}
            </div>
            {exploreTask === 'browse' && (
              <div className="explore-banner">
                {hero.image && (
                  <Image
                    src={hero.image.path}
                    alt=""
                    fill
                    sizes="(max-width: 760px) calc(100vw - 36px), (max-width: 1400px) calc(100vw - 96px), 1304px"
                  />
                )}
                <p>바다를 따라 걷고, 갯골에서 쉬어가는 하루</p>
                <span>
                  배곧한울공원 · 사진: {hero.image?.author} /{' '}
                  {hero.image?.license} · 장소 상세에서 출처 확인
                </span>
              </div>
            )}
            <RecommendationPanel
              active={exploreTask === 'recommend'}
              aiEnabled={capabilities.clova}
              regions={regions}
              region={region}
              prompt={prompt}
              busy={busy}
              ready={ready}
              result={result}
              places={places}
              selectionCount={selection.length}
              resultRef={resultRef}
              onGenerate={() => void generate()}
              onRegion={setRegion}
              onPrompt={setPrompt}
              onDetail={setDetail}
              onApply={(recommendation) => {
                setSelection(recommendation.stops.map((stop) => stop.placeId));
                setName(recommendation.title.slice(0, 60));
                goExplore('review');
                setNotice(
                  '추천 장소를 담았습니다. 순서와 날짜를 확인하고 저장하세요.',
                );
              }}
            />
            <div className="explore-workspace">
              <PlaceCatalog
                places={places}
                regions={regions}
                filtered={filtered}
                selection={selection}
                query={query}
                region={region}
                viewMode={viewMode}
                hidden={exploreTask !== 'browse'}
                naverMapClientId={naverMapClientId}
                onQuery={setQuery}
                onRegion={setRegion}
                onViewMode={setViewMode}
                onToggle={toggle}
                onDetail={setDetail}
              />
              <TripBuilder
                selected={selected}
                name={name}
                date={date}
                ready={ready}
                busy={busy}
                hidden={exploreTask !== 'review'}
                onBrowse={() => setExploreTask('browse')}
                onRecommend={() => setExploreTask('recommend')}
                onDetail={setDetail}
                onMoveUp={(index) =>
                  setSelection((current) => {
                    const next = [...current];
                    [next[index - 1], next[index]] = [
                      next[index],
                      next[index - 1],
                    ];
                    return next;
                  })
                }
                onToggle={toggle}
                onName={setName}
                onDate={setDate}
                onSave={() => void save()}
              />
            </div>
          </>
        ) : tab === 'assistant' ? (
          <div className="assistant-page">
            <div className="section-heading">
              <div>
                <span className="pill">관광 안내와 행사 등록</span>
                <h1>여행 도우미</h1>
                <p>관광 자료를 찾아보고 행사 포스터를 여행으로 이어 보세요.</p>
              </div>
            </div>
            <div className="task-switch" role="group" aria-label="도우미 작업">
              {(
                [
                  ['guide', '관광 안내'],
                  ['poster', '행사 등록'],
                ] as const
              ).map(([task, label]) => (
                <button
                  key={task}
                  type="button"
                  aria-pressed={assistantTask === task}
                  onClick={() => setAssistantTask(task)}
                >
                  {label}
                </button>
              ))}
            </div>
            {ready ? (
              <div className="assistant-workspace">
                <div hidden={assistantTask !== 'guide'}>
                  <Guide
                    places={places}
                    capabilities={capabilities}
                    onDetail={setDetail}
                    onBrowse={() => goExplore()}
                  />
                </div>
                <div hidden={assistantTask !== 'poster'}>
                  <Poster
                    places={places}
                    capabilities={capabilities}
                    onSaved={(j) => {
                      setSaved((current) => [j, ...current]);
                      setTab('journeys');
                      setNotice('행사 여행을 저장했습니다.');
                    }}
                  />
                </div>
              </div>
            ) : (
              <div className="empty">
                <p>
                  보관함 연결 후 도우미를 사용할 수 있어요. 위에서 연결 상태를
                  확인해 주세요.
                </p>
                {!loading && (
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => void loadSession()}
                  >
                    다시 시도
                  </button>
                )}
              </div>
            )}
          </div>
        ) : tab === 'weather' ? (
          <WeatherPanel
            places={places}
            selection={selection}
            onTogglePlace={toggle}
            onDetailPlace={setDetail}
            onExploreRegion={(r) => {
              setRegion(r);
              setQuery('');
              goExplore();
            }}
          />
        ) : tab === 'profile' ? (
          <MyProfile
            auth={auth}
            onLogout={logout}
            busy={busy}
            saved={saved}
            ready={ready}
            loading={loading}
            regions={regions}
            preferences={preferences}
            onSave={savePreferences}
            onRetrySession={() => void loadSession()}
            onJourneys={() => setTab('journeys')}
            onExplore={() => goExplore()}
            onRecommend={(draft) => {
              setPrompt(draft?.prompt ?? preferences.prompt);
              setRegion(draft?.region ?? preferences.region);
              setResult(null);
              goExplore('recommend');
            }}
          />
        ) : (
          <MyJourneys
            saved={saved}
            ready={ready}
            loading={loading}
            auth={auth}
            places={places}
            capabilities={capabilities}
            naverMapClientId={naverMapClientId}
            onRetrySession={() => void loadSession()}
            onExplore={() => goExplore()}
            onRecommend={() => goExplore('recommend')}
            onProfile={() => setTab('profile')}
            onRecord={(journey, place) => setRecord({ journey, place })}
            onDetail={setDetail}
            onSaved={updateJourney}
          />
        )}
      </main>
      <footer>
        <a className="brand" href="#main" onClick={() => goExplore()}>
          ≈ 경기 하루이음
        </a>
        <p>경기도의 장소와 당신의 하루를 잇습니다.</p>
        <span>관광 정보·사진 출처는 각 장소의 상세에서 확인하세요.</span>
      </footer>
      {selection.length > 0 &&
        !(tab === 'explore' && exploreTask === 'review') && (
          <div className="selection-bar">
            <span role="status">장소 {selection.length}곳을 담았어요</span>
            <button
              type="button"
              className="primary compact"
              onClick={() => goExplore('review')}
            >
              담은 여행 확인
            </button>
          </div>
        )}
      <BottomNavigation tab={tab} savedCount={saved.length} onTab={setTab} />
      {detail && (
        <PlaceDetail
          detail={detail}
          selected={selection.includes(detail.id)}
          full={selection.length >= 8}
          capabilities={capabilities}
          onClose={() => setDetail(null)}
          onToggle={toggle}
          onReview={() => {
            setDetail(null);
            goExplore('review');
          }}
        />
      )}
      {record && (
        <VisitRecord
          key={`${record.journey.id}-${record.place.id}`}
          journey={record.journey}
          place={record.place}
          capabilities={capabilities}
          onSaved={updateJourney}
          onClose={() => setRecord(null)}
          onNotice={setNotice}
        />
      )}
    </>
  );
}
