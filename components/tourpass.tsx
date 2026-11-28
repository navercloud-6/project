'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BottomNavigation, type Tab } from './bottom-navigation';
import { TodayGuide } from './today-guide';
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
import { AiTravelSearch } from './ai-travel-search';
import { WeatherPanel } from './weather-panel';
import { GyeonggiCityExplorer } from './gyeonggi-city-explorer';
import { gyeonggiCities, gyeonggiCityByName } from '@/lib/domain/gyeonggi';
import { searchPlaces } from '@/lib/domain/place-labels';
import { kstDate } from '@/lib/domain/weather';
import type { Place } from '@/lib/domain/catalog';
import type { Journey, Recommendation } from '@/lib/domain/contracts';

type ExploreTask = 'browse' | 'review';

const LOGIN_MESSAGES: Record<
  string,
  { kind: 'notice' | 'error'; text: string }
> = {
  success: {
    kind: 'notice',
    text: '네이버 계정으로 로그인했어요. 내 여행을 확인해 보세요.',
  },
  logout: {
    kind: 'notice',
    text: '로그아웃했어요. 계정 여행은 다시 로그인하면 확인할 수 있어요.',
  },
  cancelled: { kind: 'error', text: '네이버 로그인을 취소했어요.' },
};

const EXPLORE_COPY: Record<
  ExploreTask,
  { pill: (n: number) => string; title: string; body: string }
> = {
  browse: {
    pill: (n) => `경기 31개 시·군 · 관광지 ${n}곳`,
    title: '경기 둘러보기',
    body: '원하는 여행 방식을 AI로 검색하거나 지도에서 도시를 골라 최대 8곳까지 담아 보세요.',
  },
  review: {
    pill: () => '여행 코스 완성',
    title: '담은 여행 확인',
    body: '방문 순서와 날짜를 정리한 뒤 내 여행에 저장해 보세요.',
  },
};

const GYEONGGI_REGIONS = ['전체', ...gyeonggiCities.map((city) => city.name)];

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
  const mainRef = useRef<HTMLElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLElement>(null);
  const scrollToCatalogRef = useRef(false);
  const focusSearchRef = useRef(false);
  const recommendationRequestRef = useRef(0);
  const [sessionError, setSessionError] = useState('');
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'grid' | 'map'>('grid');
  const [query, setQuery] = useState('');
  const [region, setRegion] = useState('전체');
  const [selectedCityId, setSelectedCityId] = useState<string | null>(null);
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
  const [limitReached, setLimitReached] = useState(false);
  const [detail, setDetail] = useState<Place | null>(null);
  const [record, setRecord] = useState<{
    journey: Journey;
    place: Place;
  } | null>(null);

  const regions = GYEONGGI_REGIONS;
  const byId = useMemo(() => new Map(places.map((p) => [p.id, p])), [places]);
  const filtered = useMemo(
    () => searchPlaces(places, query, region),
    [places, query, region],
  );
  const clearError = useCallback(() => {
    setError('');
    setLimitReached(false);
  }, []);
  const clearRecommendation = useCallback(() => {
    recommendationRequestRef.current++;
    setResult(null);
  }, []);
  function focusSearchInput() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    searchInputRef.current?.focus({ preventScroll: true });
  }
  const selected = useMemo(
    () => selection.map((id) => byId.get(id)!),
    [selection, byId],
  );
  const goExplore = (task: ExploreTask = 'browse') => {
    if (tab === 'explore' && exploreTask === task) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    setTab('explore');
    setExploreTask(task);
  };
  const handleTab = (next: Tab) => {
    if (next === 'explore' && tab === 'explore' && exploreTask !== 'browse') {
      setExploreTask('browse');
      return;
    }
    if (next === tab) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    setTab(next);
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
    setDate(kstDate(Date.now()));
    const url = new URL(window.location.href);
    const login = url.searchParams.get('login');
    if (login) {
      setTab('profile');
      const feedback = LOGIN_MESSAGES[login] ?? {
        kind: 'error' as const,
        text: '네이버 로그인에 실패했어요. 다시 시도해 주세요.',
      };
      if (feedback.kind === 'notice') setNotice(feedback.text);
      else setError(feedback.text);
      url.searchParams.delete('login');
      window.history.replaceState(null, '', url);
    }
    void loadSession();
    try {
      const loaded = loadPreferences(localStorage, regions);
      if (loaded) {
        setPreferences(loaded);
        setRegion(loaded.region);
      }
    } catch {
      setNotice(
        '저장한 여행 취향을 불러오지 못했어요. 프로필에서 다시 설정할 수 있어요.',
      );
    }
  }, []);

  useEffect(() => {
    if (
      focusSearchRef.current &&
      tab === 'explore' &&
      exploreTask === 'browse'
    ) {
      focusSearchRef.current = false;
      focusSearchInput();
      return;
    }
    if (
      scrollToCatalogRef.current &&
      tab === 'explore' &&
      exploreTask === 'browse'
    ) {
      scrollToCatalogRef.current = false;
      const catalogEl = document.getElementById('places');
      if (catalogEl) {
        catalogEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
    }
    mainRef.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [tab, exploreTask]);

  useEffect(() => {
    if (result) {
      resultRef.current?.focus({ preventScroll: true });
      resultRef.current?.scrollIntoView({ block: 'start' });
    }
  }, [result]);

  async function logout() {
    setBusy(true);
    clearError();
    try {
      await api('/api/auth/logout', 'POST');
      window.location.assign('/?login=logout');
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  function savePreferences(next: TravelPreferences) {
    clearError();
    setNotice('');
    try {
      storePreferences(localStorage, next);
      setPreferences(next);
      setRegion(next.region);
      clearRecommendation();
      setNotice(
        '여행 취향을 저장했어요. 상단 AI 검색에서 바로 불러올 수 있어요.',
      );
    } catch {
      setError(
        '여행 취향을 저장하지 못했어요. 브라우저의 사이트 저장 설정을 확인한 뒤 다시 시도해 주세요.',
      );
    }
  }

  const toggle = useCallback(
    (id: string) => {
      setNotice('');
      clearError();
      setSelection((current) => {
        if (current.includes(id)) return current.filter((x) => x !== id);
        if (current.length < 8) return [...current, id];
        setLimitReached(true);
        setError('한 여행에는 최대 8곳까지 담을 수 있어요.');
        return current;
      });
    },
    [clearError],
  );

  const moveStop = useCallback((from: number, to: number) => {
    setSelection((current) => {
      if (to < 0 || to >= current.length) return current;
      const next = [...current];
      [next[from], next[to]] = [next[to], next[from]];
      return next;
    });
  }, []);

  async function generate() {
    const trimmed = query.trim();
    if (trimmed.length < 2 || busy || !ready || !filtered.length) return;
    const requestId = ++recommendationRequestRef.current;
    setResult(null);
    setBusy(true);
    clearError();
    setNotice('');
    try {
      const recommendation = await api<Recommendation>(
        '/api/recommend',
        'POST',
        {
          prompt: trimmed,
          region,
        },
      );
      if (recommendationRequestRef.current === requestId)
        setResult(recommendation);
    } catch (e) {
      if (recommendationRequestRef.current === requestId)
        setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function focusAiSearch(draft?: TravelPreferences) {
    if (draft) {
      setQuery(draft.prompt);
      setRegion(draft.region);
      clearRecommendation();
    }
    focusSearchRef.current = true;
    if (tab === 'explore' && exploreTask === 'browse') {
      focusSearchRef.current = false;
      focusSearchInput();
      return;
    }
    setTab('explore');
    setExploreTask('browse');
  }

  async function save() {
    setBusy(true);
    clearError();
    try {
      const { journey } = await api<{ journey: Journey }>(
        '/api/journeys',
        'POST',
        { name, date, placeIds: selection },
      );
      setSaved((current) => [journey, ...current]);
      setSelection([]);
      setTab('journeys');
      setNotice('여행을 저장했어요. 다녀온 뒤 방문 기록을 남겨 보세요.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const updateJourney = useCallback(
    (updated: Journey) =>
      setSaved((current) =>
        current.map((j) => (j.id === updated.id ? updated : j)),
      ),
    [],
  );

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
          onClick={(e) => {
            e.preventDefault();
            goExplore();
          }}
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
              <span>{error}</span>
              <div className="message-actions">
                {limitReached && (
                  <button
                    type="button"
                    className="secondary compact"
                    onClick={() => {
                      clearError();
                      goExplore('review');
                    }}
                  >
                    담은 여행 확인
                  </button>
                )}
                <button
                  type="button"
                  className="message-close"
                  onClick={clearError}
                  aria-label="오류 닫기"
                >
                  ×
                </button>
              </div>
            </div>
          )}
          {notice && (
            <div className="message">
              <span>{notice}</span>
              <button
                type="button"
                className="message-close"
                onClick={() => setNotice('')}
                aria-label="알림 닫기"
              >
                ×
              </button>
            </div>
          )}
        </div>
        {!ready && (
          <div className="session-status" role="status">
            <span>
              {loading
                ? '여행 보관함을 연결하고 있어요. 장소는 먼저 둘러볼 수 있어요.'
                : `여행 보관함을 연결하지 못했어요. ${sessionError}`}
            </span>
            {!loading && (
              <button
                type="button"
                className="secondary compact"
                onClick={() => void loadSession()}
              >
                다시 시도
              </button>
            )}
          </div>
        )}
        {tab === 'explore' ? (
          <>
            <div className="explore-heading">
              <span className="pill">{heading.pill(places.length)}</span>
              <h1>{heading.title}</h1>
              <p>{heading.body}</p>
            </div>
            {exploreTask === 'browse' && (
              <>
                <AiTravelSearch
                  aiEnabled={capabilities.clova}
                  regions={regions}
                  region={region}
                  query={query}
                  filtered={filtered}
                  selection={selection}
                  savedPrompt={preferences.prompt}
                  busy={busy}
                  ready={ready}
                  loading={loading}
                  result={result}
                  places={places}
                  inputRef={searchInputRef}
                  resultRef={resultRef}
                  onQuery={(nextQuery) => {
                    setQuery(nextQuery);
                    clearRecommendation();
                  }}
                  onRegion={(nextRegion) => {
                    setRegion(nextRegion);
                    clearRecommendation();
                  }}
                  onSearch={() => void generate()}
                  onReset={() => {
                    setQuery('');
                    setRegion('전체');
                    clearRecommendation();
                  }}
                  onClearResult={clearRecommendation}
                  onToggle={toggle}
                  onDetail={setDetail}
                  onScrollCatalog={() => {
                    document
                      .getElementById('places')
                      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }}
                  onRetrySession={() => void loadSession()}
                  onApply={(recommendation) => {
                    setSelection(
                      recommendation.stops.map((stop) => stop.placeId),
                    );
                    setName(recommendation.title.slice(0, 60));
                    goExplore('review');
                    setNotice(
                      '추천 장소를 담았어요. 순서와 날짜를 확인한 뒤 저장해 보세요.',
                    );
                  }}
                />
                <GyeonggiCityExplorer
                  places={places}
                  selectedCityId={selectedCityId}
                  selection={selection}
                  onSelectCity={setSelectedCityId}
                  onDetail={setDetail}
                  onToggle={toggle}
                />
              </>
            )}
            <div
              className="task-switch"
              role="group"
              aria-label="경기 둘러보기 작업"
            >
              {(
                [
                  ['browse', '장소 찾기'],
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
                hideFilters
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
                loading={loading}
                busy={busy}
                hidden={exploreTask !== 'review'}
                onBrowse={() => setExploreTask('browse')}
                onRecommend={() => focusAiSearch()}
                onRetrySession={() => void loadSession()}
                onDetail={setDetail}
                onMoveUp={(index) => moveStop(index, index - 1)}
                onMoveDown={(index) => moveStop(index, index + 1)}
                onClear={() => {
                  setSelection([]);
                  setNotice('담은 장소를 모두 비웠어요.');
                }}
                onToggle={toggle}
                onName={setName}
                onDate={setDate}
                onSave={() => void save()}
              />
            </div>
          </>
        ) : tab === 'assistant' ? (
          <div className="assistant-page">
            {ready ? (
              <TodayGuide
                places={places}
                selection={selection}
                selectedCityId={selectedCityId}
                onSelectCity={setSelectedCityId}
                onDetail={setDetail}
                onToggle={toggle}
                capabilities={capabilities}
              />
            ) : (
              <div className="empty">
                <p>
                  {loading
                    ? '여행 보관함을 연결하고 있어요…'
                    : '여행 보관함을 연결하지 못했어요. 위에서 연결 상태를 확인하거나 다시 시도해 주세요.'}
                </p>
                {!loading && (
                  <div className="empty-actions">
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => void loadSession()}
                    >
                      다시 시도
                    </button>
                    <button
                      type="button"
                      className="primary compact"
                      onClick={() => goExplore()}
                    >
                      장소 찾기
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : tab === 'weather' ? (
          <WeatherPanel
            selectedCityId={selectedCityId}
            onSelectCity={setSelectedCityId}
            places={places}
            selection={selection}
            onTogglePlace={toggle}
            onDetailPlace={setDetail}
            onExploreRegion={(r) => {
              const matchedCity = gyeonggiCityByName.get(r);
              setQuery('');
              if (r === '전체') {
                setSelectedCityId(null);
                setRegion('전체');
                scrollToCatalogRef.current = true;
                setNotice('전체 관광지 목록으로 이동했어요.');
              } else {
                setSelectedCityId(matchedCity?.id ?? null);
                setRegion(regions.includes(r) ? r : '전체');
                setNotice(`${r} 관광지 목록으로 이동했어요.`);
              }
              setTab('explore');
              setExploreTask('browse');
            }}
          />
        ) : tab === 'profile' ? (
          <MyProfile
            key={`${preferences.region}::${preferences.prompt}`}
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
            onRecommend={(draft) => focusAiSearch(draft ?? preferences)}
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
            onRecommend={() => focusAiSearch()}
            onProfile={() => setTab('profile')}
            onRecord={(journey, place) => setRecord({ journey, place })}
            onDetail={setDetail}
            onSaved={updateJourney}
          />
        )}
      </main>
      <footer>
        <a
          className="brand"
          href="#main"
          onClick={(e) => {
            e.preventDefault();
            goExplore();
          }}
        >
          ≈ 경기 하루이음
        </a>
        <p>경기도의 장소와 당신의 하루를 잇습니다.</p>
        <span>관광 정보·사진 출처는 각 장소 상세에서 확인할 수 있습니다.</span>
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
      <BottomNavigation tab={tab} savedCount={saved.length} onTab={handleTab} />
      {detail && (
        <PlaceDetail
          detail={detail}
          selected={selection.includes(detail.id)}
          full={selection.length >= 8}
          selectionCount={selection.length}
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
