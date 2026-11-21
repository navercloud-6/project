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

export const journeyService = createJourneys(journeyRepository, identity);
export const {
  journeys,
  saveJourney,
  saveRecord,
  getJourney,
  applyEdit,
  photoFor,
  savePhoto,
} = journeyService;
export const resolveSession = createSession(sessionRepository, identity);
export const auth = createAuth(
  authRepository,
  sessionRepository,
  identity,
  naverLogin,
);
export const { guide, proposeEdit } = createAssistant(naver);
export const recommend = createRecommendation(naver);
export const fetchWeather = createWeather({
  now: identity.now,
  demo: () => process.env.WEATHER_MODE === 'demo',
  current: liveWeather,
});
export const fetchRestaurants = createRestaurants(naverSearch, naver);
export const fetchAlerts = createAlerts(kmaAlerts);
export const operations = createOperations(
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
);
export const fetchCityWeather = createCityWeather({
  now: identity.now,
  demo: () => process.env.WEATHER_MODE === 'demo',
  current: liveCityWeather,
});
export const capabilities = naver.capabilities;
export { naverMapClientId };
