import { z } from 'zod';
import {
  journeyInput,
  recordInput,
  recommendationInput,
  recommendationOutput,
} from '@/lib/domain/contracts';
import {
  historySchema,
  editOutput,
  posterOutput,
} from '@/lib/domain/assistant';
import { weatherResponseSchema } from '@/lib/domain/weather';
import { briefingOutput } from '@/lib/domain/briefing';
import { restaurantsResponseSchema } from '@/lib/domain/restaurants';
import {
  cityWeatherResponseSchema,
  cityWeatherLocations,
  DEFAULT_WEATHER_CITY_ID,
} from '@/lib/domain/city-weather';

const toSchema = (schema: z.ZodType): Record<string, unknown> => {
  const { $schema: _, ...rest } = z.toJSONSchema(schema, {
    unrepresentable: 'any',
  }) as Record<string, unknown>;
  return rest;
};
const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const obj = (
  properties: Record<string, unknown>,
  required = Object.keys(properties),
  extra: Record<string, unknown> = {},
) => ({ type: 'object', properties, required, ...extra });
const json = (schema: Record<string, unknown>, description?: string) => ({
  ...(description ? { description } : {}),
  content: { 'application/json': { schema } },
});
const err = (description: string) => json(ref('ErrorResponse'), description);
const uuid = { type: 'string', format: 'uuid' };
const binary = { type: 'string', format: 'binary' };
const imageUpload = {
  required: true,
  content: {
    'image/jpeg': { schema: binary },
    'image/png': { schema: binary },
    'image/webp': { schema: binary },
  },
};
const photoParams = [
  { name: 'journey', in: 'query', required: true, schema: uuid },
  { name: 'place', in: 'query', required: true, schema: { type: 'string' } },
];
const auth = [{ sessionCookie: [] }];

export const openApiDocument = {
  openapi: '3.1.0',
  info: {
    title: '경기 하루이음 HTTP API',
    version: '1.0.0',
    description:
      '경기도 관광지 탐색, 자연어 여행 추천(CLOVA Studio / 데모), 여행 패스·방문 기록·사진 보관(PostgreSQL), 근거 기반 관광 안내·대화형 여행 편집·번역(Papago)·음성(CLOVA Voice)·포스터 OCR 연동을 제공하는 내부 Route Handler API 명세입니다.',
  },
  servers: [{ url: '/', description: '현재 애플리케이션 오리진 (APP_ORIGIN)' }],
  tags: [
    { name: 'Session', description: '브라우저 세션과 네이버 로그인' },
    {
      name: 'Journeys',
      description: '여행 패스 조회·저장 및 장소별 방문 기록',
    },
    { name: 'Recommend', description: '자연어·지역·만족도 기반 여행 추천' },
    {
      name: 'Assistant',
      description: '관광 안내·대화형 편집·번역·음성·사진 일기 도우미',
    },
    { name: 'Photos', description: '비공개 방문 사진 업로드·조회' },
    { name: 'Poster', description: '행사 포스터 OCR 추출 및 일정 초안 생성' },
    {
      name: 'Weather',
      description:
        '경기도 전체 및 31개 시·군별 실시간·데모 기상 예보 및 맞춤 관광지 조회',
    },
    { name: 'Docs', description: 'OpenAPI 3.1 명세 및 Scalar API 레퍼런스' },
  ],
  components: {
    securitySchemes: {
      sessionCookie: {
        type: 'apiKey',
        in: 'cookie',
        name: 'tourpass-session',
        description:
          'POST /api/session이 발급하는 HttpOnly 세션 쿠키 (DB에는 SHA-256 해시만 저장)',
      },
    },
    schemas: {
      ErrorResponse: obj(
        { error: { type: 'string', description: '한국어 오류 안내 메시지' } },
        ['error'],
        { additionalProperties: false },
      ),
      JourneyInput: toSchema(journeyInput),
      Journey: {
        allOf: [
          ref('JourneyInput'),
          obj(
            {
              id: uuid,
              createdAt: { type: 'string', format: 'date-time' },
              revision: uuid,
              records: {
                type: 'object',
                additionalProperties: obj({
                  rating: { type: 'integer', minimum: 1, maximum: 5 },
                  note: { type: 'string', maxLength: 500 },
                }),
              },
            },
            ['id', 'createdAt', 'records'],
          ),
        ],
      },
      RecordInput: toSchema(recordInput),
      RecommendationInput: toSchema(recommendationInput),
      RecommendationOutput: toSchema(recommendationOutput),
      Recommendation: {
        allOf: [
          ref('RecommendationOutput'),
          obj({ mode: { type: 'string', enum: ['demo', 'clova'] } }),
        ],
      },
      History: toSchema(historySchema),
      EditOutput: toSchema(editOutput),
      PosterOutput: toSchema(posterOutput),
      WeatherResponse: toSchema(weatherResponseSchema),
      BriefingOutput: toSchema(briefingOutput),
      RestaurantsResponse: toSchema(restaurantsResponseSchema),
      CityWeatherResponse: toSchema(cityWeatherResponseSchema),
      AssistantRequest: {
        oneOf: [
          obj(
            {
              action: { type: 'string', const: 'guide' },
              question: { type: 'string', minLength: 2, maxLength: 500 },
              placeId: { type: 'string' },
              history: ref('History'),
            },
            ['action', 'question'],
            { title: 'guide (관광 안내)' },
          ),
          obj(
            {
              action: { type: 'string', const: 'edit' },
              journeyId: uuid,
              prompt: { type: 'string', minLength: 2, maxLength: 500 },
              history: ref('History'),
            },
            ['action', 'journeyId', 'prompt'],
            { title: 'edit (대화형 여행 수정 미리보기)' },
          ),
          obj(
            {
              action: { type: 'string', const: 'apply' },
              journeyId: uuid,
              revision: { type: 'string', maxLength: 80 },
              proposal: ref('EditOutput'),
            },
            ['action', 'journeyId', 'revision', 'proposal'],
            { title: 'apply (여행 수정 제안 적용)' },
          ),
          obj(
            {
              action: { type: 'string', const: 'translate' },
              placeId: { type: 'string' },
              journeyId: uuid,
              target: { type: 'string', enum: ['en', 'ja', 'zh-CN'] },
            },
            ['action', 'target'],
            { title: 'translate (장소·여행 다국어 번역)' },
          ),
          obj(
            {
              action: { type: 'string', const: 'voice' },
              placeId: { type: 'string' },
            },
            ['action', 'placeId'],
            { title: 'voice (장소 음성 안내 MP3)' },
          ),
          obj(
            {
              action: { type: 'string', const: 'briefing' },
              region: {
                type: 'string',
                description:
                  '`전체` 또는 경기도 31개 시·군 이름(날씨 API와 동일)',
              },
              lang: { type: 'string', enum: ['ko', 'en'] },
            },
            ['action', 'region', 'lang'],
            {
              title:
                'briefing (시·군 날씨·옷차림·추천 명소 통합 안내 원고·MP3)',
            },
          ),
          obj(
            {
              action: { type: 'string', const: 'diary' },
              journeyId: uuid,
              placeId: { type: 'string' },
            },
            ['action', 'journeyId', 'placeId'],
            { title: 'diary (방문 사진 기반 AI 일기 초안)' },
          ),
        ],
      },
    },
  },
  paths: {
    '/api/auth/naver': {
      post: {
        tags: ['Session'],
        summary: '네이버 로그인 시작',
        description:
          'Origin 검증 후 10분 일회용 state와 세션 쿠키를 발급하고 네이버 인증 화면으로 이동합니다.',
        responses: {
          '303': { description: '네이버 인증 URL로 이동' },
          '403': { description: 'Origin 불일치' },
          '503': { description: '로그인 설정 없음' },
        },
      },
    },
    '/api/auth/naver/callback': {
      get: {
        tags: ['Session'],
        summary: '네이버 인증 콜백',
        description:
          'state 쿠키·서버 상태·세션을 검증하고 코드를 교환합니다. 익명 여행·사진을 계정에 연결하고 세션을 교체합니다.',
        parameters: ['state', 'code', 'error'].map((name) => ({
          name,
          in: 'query',
          required: name === 'state',
          schema: { type: 'string' },
        })),
        responses: {
          '303': { description: '/?login=success|cancelled|failed 로 이동' },
        },
      },
    },
    '/api/auth/logout': {
      post: {
        tags: ['Session'],
        summary: '현재 세션 로그아웃',
        description:
          'Origin 검증 후 현재 세션을 폐기하고 새 익명 세션을 발급합니다. 계정 여행은 유지합니다.',
        responses: {
          '200': { description: '로그아웃 성공' },
          '403': { description: 'Origin 불일치' },
        },
      },
    },
    '/api/session': {
      get: {
        tags: ['Session'],
        summary: '로그인 설정·인증 상태 조회',
        responses: {
          '200': json(
            obj({
              enabled: { type: 'boolean' },
              authenticated: { type: 'boolean' },
            }),
            '로그인 상태',
          ),
        },
      },
      post: {
        tags: ['Session'],
        summary: '익명 브라우저 세션 발급·갱신',
        description:
          '32바이트 무작위 토큰을 tourpass-session HttpOnly 쿠키(30일)로 발급합니다. Origin 헤더가 APP_ORIGIN과 일치해야 합니다.',
        responses: {
          '200': json(
            obj({ ok: { type: 'boolean', const: true } }),
            '세션 발급 성공',
          ),
          '403': err('허용되지 않은 Origin'),
        },
      },
    },
    '/api/journeys': {
      get: {
        tags: ['Journeys'],
        summary: '현재 세션의 저장된 여행 목록 조회',
        security: auth,
        responses: {
          '200': json(
            obj({ journeys: { type: 'array', items: ref('Journey') } }),
            '저장된 여행 목록',
          ),
          '401': err('세션 없음 또는 만료'),
        },
      },
      post: {
        tags: ['Journeys'],
        summary: '새 여행(또는 포스터 행사 여행) 저장',
        security: auth,
        requestBody: { required: true, ...json(ref('JourneyInput')) },
        responses: {
          '201': json(obj({ journey: ref('Journey') }), '저장된 여행 반환'),
          '400': err('입력 검증 오류'),
          '401': err('세션 없음 또는 만료'),
          '403': err('허용되지 않은 Origin'),
          '429': err('시간당 저장 한도(30회) 초과'),
        },
      },
      patch: {
        tags: ['Journeys'],
        summary: '여행 내 장소별 방문 만족도·메모 저장',
        security: auth,
        requestBody: { required: true, ...json(ref('RecordInput')) },
        responses: {
          '200': json(obj({ journey: ref('Journey') }), '갱신된 여행 반환'),
          '400': err('입력 검증 오류'),
          '404': err('여행 또는 장소 미존재'),
        },
      },
    },
    '/api/recommend': {
      post: {
        tags: ['Recommend'],
        summary: '자연어·지역·과거 만족도 기반 여행 추천',
        security: auth,
        requestBody: { required: true, ...json(ref('RecommendationInput')) },
        responses: {
          '200': json(
            ref('Recommendation'),
            '추천 여행 결과 (CLOVA 또는 데모)',
          ),
          '400': err('입력 검증 오류'),
          '429': err('시간당 추천 한도 초과'),
          '502': err('상위 AI 응답 오류'),
        },
      },
    },
    '/api/assistant': {
      post: {
        tags: ['Assistant'],
        summary: '관광 안내·편집 제안/적용·번역·음성·통합 안내·일기 초안',
        security: auth,
        requestBody: { required: true, ...json(ref('AssistantRequest')) },
        responses: {
          '200': {
            description: 'action별 JSON 응답 또는 음성(audio/mpeg) 스트림',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  description:
                    'guide/edit/apply/translate/diary 결과 객체, briefing은 BriefingOutput(audio는 base64 MP3 또는 null)',
                },
              },
              'audio/mpeg': { schema: binary },
            },
          },
          '400': err('입력 검증 오류'),
          '404': err('여행 또는 사진 미존재'),
          '409': err('리비전 불일치 또는 기록·사진 보유 장소 삭제 차단'),
          '429': err('시간당 도우미 한도 초과'),
          '503': err('외부 NAVER Cloud API 키 미설정'),
        },
      },
    },
    '/api/photos': {
      get: {
        tags: ['Photos'],
        summary: '장소 방문 사진 조회 또는 존재 여부 확인',
        security: auth,
        parameters: [
          ...photoParams,
          {
            name: 'metadata',
            in: 'query',
            required: false,
            schema: { type: 'string', enum: ['1'] },
          },
        ],
        responses: {
          '200': {
            description: 'JPEG 이미지 바이너리 또는 {exists: boolean}',
            content: {
              'image/jpeg': { schema: binary },
              'application/json': {
                schema: obj({ exists: { type: 'boolean' } }),
              },
            },
          },
          '404': err('저장한 사진 없음'),
        },
      },
      post: {
        tags: ['Photos'],
        summary: '장소 방문 사진 검증·재인코딩·저장',
        security: auth,
        parameters: photoParams,
        requestBody: imageUpload,
        responses: {
          '200': json(
            obj({ journey: ref('Journey') }),
            '사진 저장 및 리비전 갱신된 여행 반환',
          ),
          '400': err('잘못된 이미지 또는 여행 미포함 장소'),
          '413': err('2MB 초과 이미지'),
          '415': err('지원하지 않는 이미지 형식'),
          '429': err('시간당 사진 저장 한도 초과'),
        },
      },
    },
    '/api/poster': {
      post: {
        tags: ['Poster'],
        summary: '행사 포스터 OCR 추출 및 일정 초안 생성',
        security: auth,
        requestBody: imageUpload,
        responses: {
          '200': json(
            obj({
              text: { type: 'string' },
              draft: ref('PosterOutput'),
              mode: { type: 'string', enum: ['ocr', 'ocr-clova'] },
              message: { type: 'string' },
            }),
            'OCR 추출 원문 및 일정 초안',
          ),
          '429': err('시간당 포스터 인식 한도 초과'),
          '503': err('CLOVA OCR 설정 누락'),
        },
      },
    },
    '/api/restaurants': {
      get: {
        tags: ['Weather'],
        summary: '경기도 시·군 맛집과 후기 기반 인기 메뉴 조회',
        description:
          'NAVER 지역 검색(리뷰 많은 순)에서 술집과 다른 시·도·시·군 주소를 제외하고 최대 5곳을 반환합니다. 메뉴는 블로그 후기 한 건에 실제로 적힌 이름만 표시하며 결과는 지역별 10분간 공유합니다. 검색 키 미설정 시 mode=unavailable과 안내 문구를 반환합니다.',
        parameters: [
          {
            name: 'region',
            in: 'query',
            required: false,
            description: '`전체` 또는 경기도 31개 시·군 이름(날씨 API와 동일)',
            schema: { type: 'string', default: '전체' },
          },
        ],
        responses: {
          '200': {
            description: '지역·모드·출처·조회/만료 시각·맛집 목록',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/RestaurantsResponse' },
              },
            },
          },
          '400': err('지원하지 않는 지역'),
          '502': err('NAVER 검색 응답 오류'),
          '504': err('NAVER 검색 시간 초과'),
        },
      },
    },
    '/api/weather/current': {
      get: {
        tags: ['Weather'],
        summary: '경기도 시·군 대표 지점의 현재 날씨 조회',
        description:
          '선택한 시·군의 대표 좌표로 Open-Meteo 현재 날씨를 조회합니다. 미지정 시 수원시 기준이며 성공 결과는 지역별 10분간 공유합니다. 실제 조회 실패는 오류로 반환하고 WEATHER_MODE=demo를 명시한 경우에만 예시 자료를 제공합니다.',
        parameters: [
          {
            name: 'cityId',
            in: 'query',
            required: false,
            description: '경기도 시·군 식별자',
            schema: {
              type: 'string',
              enum: cityWeatherLocations.map((city) => city.id),
              default: DEFAULT_WEATHER_CITY_ID,
            },
          },
        ],
        responses: {
          '200': {
            description:
              '지역·좌표·현재 날씨·기준/조회/만료 시각·출처·실제/예시 구분',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/CityWeatherResponse' },
              },
            },
          },
          '400': {
            description: '지원하지 않는 시·군',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
          '502': {
            description: '날씨 응답·자료 시각 확인 실패',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
          '503': {
            description: '날씨 제공 서비스 연결 실패',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
          '504': {
            description: '날씨 제공 서비스 시간 초과',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
        },
      },
    },
    '/api/weather': {
      get: {
        tags: ['Weather'],
        summary: '경기도 시·군별 현재 기상·5일 예보 및 맞춤 관광지 조회',
        parameters: [
          {
            name: 'region',
            in: 'query',
            required: false,
            description: '경기도 시·군명 (미지정 시 전체)',
            schema: { type: 'string', default: '전체' },
          },
        ],
        responses: {
          '200': json(
            ref('WeatherResponse'),
            '시·군별 기상 정보 및 추천 관광지 ID 목록',
          ),
          '400': err('지원하지 않는 지역 파라미터'),
        },
      },
    },
    '/api/openapi': {
      get: {
        tags: ['Docs'],
        summary: 'OpenAPI 3.1.0 JSON 명세 조회',
        responses: { '200': json({ type: 'object' }, 'OpenAPI 3.1.0 문서') },
      },
    },
    '/api/docs': {
      get: {
        tags: ['Docs'],
        summary: 'Scalar 대화형 API 레퍼런스 화면',
        responses: {
          '200': {
            description: 'Scalar API Reference HTML',
            content: { 'text/html': { schema: { type: 'string' } } },
          },
        },
      },
    },
  },
} as const;
