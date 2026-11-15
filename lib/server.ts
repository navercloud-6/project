import {
  journeyRepository,
  sessionRepository,
  limits,
} from './adapters/sqlite';
import { identity } from './adapters/identity';
import { naver } from './adapters/naver';
import { liveWeather } from './adapters/open-meteo';
import { createJourneys } from './application/journeys';
import { createSession } from './application/session';
import { createAssistant } from './application/assistant';
import { createRecommendation } from './application/recommendation';
import { createOperations } from './application/operations';
import { createWeather } from './application/weather';

const models = {
  get functionModel() {
    return process.env.CLOVA_FUNCTION_MODEL || 'HCX-DASH-002';
  },
  get visionModel() {
    return process.env.CLOVA_VISION_MODEL || 'HCX-005';
  },
};
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
export const { guide, proposeEdit } = createAssistant(naver, models);
export const recommend = createRecommendation(naver);
export const operations = createOperations(
  journeyService,
  naver,
  limits,
  models,
);
export const fetchSiheungWeather = createWeather({
  demo: () => process.env.WEATHER_MODE === 'demo',
  current: liveWeather,
});
export const capabilities = naver.capabilities;
