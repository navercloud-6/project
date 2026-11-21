import {
  journeyRepository,
  sessionRepository,
  limits,
  authRepository,
} from './adapters/postgres';
import { identity } from './adapters/identity';
import { naver } from './adapters/naver';
import { liveWeather, liveCityWeather } from './adapters/open-meteo';
import { createCityWeather } from './application/city-weather';
import {
  createPlaceReviews,
  createRestaurants,
} from './application/restaurants';
import { naverSearch } from './adapters/naver-search';
import { createJourneys } from './application/journeys';
import { createSession } from './application/session';
import { createAssistant } from './application/assistant';
import { createRecommendation } from './application/recommendation';
import { createOperations } from './application/operations';
import { createBriefing } from './application/briefing';
import { createAlerts } from './application/alerts';
import { kmaAlerts } from './adapters/kma-alerts';
import { createWeather } from './application/weather';
import { createAuth } from './application/auth';
import { naverLogin } from './adapters/naver-login';
import { naverMapClientId } from './adapters/naver-map';

function createServerContainer() {
  const journeyService = createJourneys(journeyRepository, identity);
  const resolveSession = createSession(sessionRepository, identity);
  const auth = createAuth(
    authRepository,
    sessionRepository,
    identity,
    naverLogin,
  );
  const { guide, proposeEdit } = createAssistant(naver);
  const recommend = createRecommendation(naver, identity.now);
  const fetchWeather = createWeather({
    now: identity.now,
    demo: () => process.env.WEATHER_MODE === 'demo',
    current: liveWeather,
  });
  const fetchRestaurants = createRestaurants(naverSearch, naver);
  const fetchAlerts = createAlerts(kmaAlerts);
  const operations = createOperations(
    journeyService,
    naver,
    limits,
    createBriefing({
      ai: naver,
      now: identity.now,
      weather: fetchWeather,
      restaurants: fetchRestaurants,
      placeReviews: createPlaceReviews(naverSearch),
      alerts: fetchAlerts,
    }),
    identity.now,
  );
  const fetchCityWeather = createCityWeather({
    now: identity.now,
    demo: () => process.env.WEATHER_MODE === 'demo',
    current: liveCityWeather,
  });
  return {
    journeyService,
    resolveSession,
    auth,
    guide,
    proposeEdit,
    recommend,
    fetchWeather,
    fetchRestaurants,
    fetchAlerts,
    operations,
    fetchCityWeather,
  };
}

type ServerContainer = ReturnType<typeof createServerContainer>;

const globalServer = globalThis as unknown as {
  tourpassServer?: ServerContainer;
};
const server = (globalServer.tourpassServer ??= createServerContainer());

export const {
  journeyService,
  resolveSession,
  auth,
  guide,
  proposeEdit,
  recommend,
  fetchWeather,
  fetchRestaurants,
  fetchAlerts,
  operations,
  fetchCityWeather,
} = server;
export const {
  journeys,
  saveJourney,
  saveRecord,
  getJourney,
  applyEdit,
  photoFor,
  savePhoto,
} = journeyService;
export const capabilities = naver.capabilities;
export { naverMapClientId };
