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

function toSchema(schema: z.ZodType): Record<string, unknown> {
  const { $schema: _schema, ...rest } = z.toJSONSchema(schema, {
    unrepresentable: 'any',
  }) as Record<string, unknown>;
  return rest;
}

const errorResponse = {
  type: 'object',
  properties: {
    error: { type: 'string', description: '한국어 오류 안내 메시지' },
  },
  required: ['error'],
  additionalProperties: false,
};

const journeySchema = {
  allOf: [
    { $ref: '#/components/schemas/JourneyInput' },
    {
      type: 'object',
      properties: {
        id: { type: 'string', format: 'uuid' },
        createdAt: { type: 'string', format: 'date-time' },
        revision: { type: 'string', format: 'uuid' },
        records: {
          type: 'object',
          additionalProperties: {
            type: 'object',
            properties: {
              rating: { type: 'integer', minimum: 1, maximum: 5 },
              note: { type: 'string', maxLength: 500 },
            },
            required: ['rating', 'note'],
          },
        },
      },
      required: ['id', 'createdAt', 'records'],
    },
  ],
};

const recommendationSchema = {
  allOf: [
    { $ref: '#/components/schemas/RecommendationOutput' },
    {
      type: 'object',
      properties: { mode: { type: 'string', enum: ['demo', 'clova'] } },
      required: ['mode'],
    },
  ],
};

export const openApiDocument = {
  openapi: '3.1.0',
  info: {
    title: '경기 하루이음 HTTP API',
    version: '1.0.0',
    description:
      '경기도 관광지 탐색(시흥권 시연 데이터 기반), 자연어 여행 추천(CLOVA Studio / 데모), 여행 패스·방문 기록·사진 보관(SQLite), 근거 기반 관광 안내·대화형 여행 편집·번역(Papago)·음성(CLOVA Voice)·포스터 OCR 연동을 제공하는 내부 Route Handler API 명세입니다.',
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
        '경기(시흥권) 권역별 실시간·데모 기상 예보 및 맞춤 관광지 조회',
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
      ErrorResponse: errorResponse,
      JourneyInput: toSchema(journeyInput),
      Journey: journeySchema,
      RecordInput: toSchema(recordInput),
      RecommendationInput: toSchema(recommendationInput),
      RecommendationOutput: toSchema(recommendationOutput),
      Recommendation: recommendationSchema,
      History: toSchema(historySchema),
      EditOutput: toSchema(editOutput),
      PosterOutput: toSchema(posterOutput),
      WeatherResponse: toSchema(weatherResponseSchema),
      AssistantRequest: {
        oneOf: [
          {
            type: 'object',
            title: 'guide (관광 안내)',
            properties: {
              action: { type: 'string', const: 'guide' },
              question: { type: 'string', minLength: 2, maxLength: 500 },
              placeId: { type: 'string' },
              history: { $ref: '#/components/schemas/History' },
            },
            required: ['action', 'question'],
          },
          {
            type: 'object',
            title: 'edit (대화형 여행 수정 미리보기)',
            properties: {
              action: { type: 'string', const: 'edit' },
              journeyId: { type: 'string', format: 'uuid' },
              prompt: { type: 'string', minLength: 2, maxLength: 500 },
              history: { $ref: '#/components/schemas/History' },
            },
            required: ['action', 'journeyId', 'prompt'],
          },
          {
            type: 'object',
            title: 'apply (여행 수정 제안 적용)',
            properties: {
              action: { type: 'string', const: 'apply' },
              journeyId: { type: 'string', format: 'uuid' },
              revision: { type: 'string', maxLength: 80 },
              proposal: { $ref: '#/components/schemas/EditOutput' },
            },
            required: ['action', 'journeyId', 'revision', 'proposal'],
          },
          {
            type: 'object',
            title: 'translate (장소·여행 다국어 번역)',
            properties: {
              action: { type: 'string', const: 'translate' },
              placeId: { type: 'string' },
              journeyId: { type: 'string', format: 'uuid' },
              target: { type: 'string', enum: ['en', 'ja', 'zh-CN'] },
            },
            required: ['action', 'target'],
          },
          {
            type: 'object',
            title: 'voice (장소 음성 안내 MP3)',
            properties: {
              action: { type: 'string', const: 'voice' },
              placeId: { type: 'string' },
            },
            required: ['action', 'placeId'],
          },
          {
            type: 'object',
            title: 'diary (방문 사진 기반 AI 일기 초안)',
            properties: {
              action: { type: 'string', const: 'diary' },
              journeyId: { type: 'string', format: 'uuid' },
              placeId: { type: 'string' },
            },
            required: ['action', 'journeyId', 'placeId'],
          },
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
          'state 쿠키·서버 상태·세션을 검증하고 코드를 교환합니다. 익명 여행·사진을 계정에 연결하고 세션을 교체합니다. 성공·취소·실패는 마이 화면에 표시합니다.',
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
          '200': {
            description: '로그인 상태',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    enabled: { type: 'boolean' },
                    authenticated: { type: 'boolean' },
                  },
                  required: ['enabled', 'authenticated'],
                },
              },
            },
          },
        },
      },
      post: {
        tags: ['Session'],
        summary: '익명 브라우저 세션 발급·갱신',
        description:
          '32바이트 무작위 토큰을 tourpass-session HttpOnly 쿠키(30일)로 발급합니다. Origin 헤더가 APP_ORIGIN과 일치해야 합니다.',
        responses: {
          '200': {
            description: '세션 발급 성공',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { ok: { type: 'boolean', const: true } },
                  required: ['ok'],
                },
              },
            },
          },
          '403': {
            description: '허용되지 않은 Origin',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
        },
      },
    },
    '/api/journeys': {
      get: {
        tags: ['Journeys'],
        summary: '현재 세션의 저장된 여행 목록 조회',
        security: [{ sessionCookie: [] }],
        responses: {
          '200': {
            description: '저장된 여행 목록',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    journeys: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/Journey' },
                    },
                  },
                  required: ['journeys'],
                },
              },
            },
          },
          '401': {
            description: '세션 없음 또는 만료',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
        },
      },
      post: {
        tags: ['Journeys'],
        summary: '새 여행(또는 포스터 행사 여행) 저장',
        security: [{ sessionCookie: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/JourneyInput' },
            },
          },
        },
        responses: {
          '201': {
            description: '저장된 여행 반환',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    journey: { $ref: '#/components/schemas/Journey' },
                  },
                  required: ['journey'],
                },
              },
            },
          },
          '400': {
            description: '입력 검증 오류',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
          '401': {
            description: '세션 없음 또는 만료',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
          '403': {
            description: '허용되지 않은 Origin',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
          '429': {
            description: '시간당 저장 한도(30회) 초과',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
        },
      },
      patch: {
        tags: ['Journeys'],
        summary: '여행 내 장소별 방문 만족도·메모 저장',
        security: [{ sessionCookie: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/RecordInput' },
            },
          },
        },
        responses: {
          '200': {
            description: '갱신된 여행 반환',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    journey: { $ref: '#/components/schemas/Journey' },
                  },
                  required: ['journey'],
                },
              },
            },
          },
          '400': {
            description: '입력 검증 오류',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
          '404': {
            description: '여행 또는 장소 미존재',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
        },
      },
    },
    '/api/recommend': {
      post: {
        tags: ['Recommend'],
        summary: '자연어·지역·과거 만족도 기반 여행 추천',
        security: [{ sessionCookie: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/RecommendationInput' },
            },
          },
        },
        responses: {
          '200': {
            description: '추천 여행 결과 (CLOVA 또는 데모)',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Recommendation' },
              },
            },
          },
          '400': {
            description: '입력 검증 오류',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
          '429': {
            description: '시간당 추천 한도 초과',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
          '502': {
            description: '상위 AI 응답 오류',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
        },
      },
    },
    '/api/assistant': {
      post: {
        tags: ['Assistant'],
        summary: '관광 안내·편집 제안/적용·번역·음성·일기 초안',
        security: [{ sessionCookie: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/AssistantRequest' },
            },
          },
        },
        responses: {
          '200': {
            description: 'action별 JSON 응답 또는 음성(audio/mpeg) 스트림',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  description: 'guide/edit/apply/translate/diary 결과 객체',
                },
              },
              'audio/mpeg': {
                schema: { type: 'string', format: 'binary' },
              },
            },
          },
          '400': {
            description: '입력 검증 오류',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
          '404': {
            description: '여행 또는 사진 미존재',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
          '409': {
            description: '리비전 불일치 또는 기록·사진 보유 장소 삭제 차단',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
          '429': {
            description: '시간당 도우미 한도 초과',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
          '503': {
            description: '외부 NAVER Cloud API 키 미설정',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
        },
      },
    },
    '/api/photos': {
      get: {
        tags: ['Photos'],
        summary: '장소 방문 사진 조회 또는 존재 여부 확인',
        security: [{ sessionCookie: [] }],
        parameters: [
          {
            name: 'journey',
            in: 'query',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
          {
            name: 'place',
            in: 'query',
            required: true,
            schema: { type: 'string' },
          },
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
              'image/jpeg': { schema: { type: 'string', format: 'binary' } },
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { exists: { type: 'boolean' } },
                  required: ['exists'],
                },
              },
            },
          },
          '404': {
            description: '저장한 사진 없음',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
        },
      },
      post: {
        tags: ['Photos'],
        summary: '장소 방문 사진 검증·재인코딩·저장',
        security: [{ sessionCookie: [] }],
        parameters: [
          {
            name: 'journey',
            in: 'query',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
          {
            name: 'place',
            in: 'query',
            required: true,
            schema: { type: 'string' },
          },
        ],
        requestBody: {
          required: true,
          content: {
            'image/jpeg': { schema: { type: 'string', format: 'binary' } },
            'image/png': { schema: { type: 'string', format: 'binary' } },
            'image/webp': { schema: { type: 'string', format: 'binary' } },
          },
        },
        responses: {
          '200': {
            description: '사진 저장 및 리비전 갱신된 여행 반환',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    journey: { $ref: '#/components/schemas/Journey' },
                  },
                  required: ['journey'],
                },
              },
            },
          },
          '400': {
            description: '잘못된 이미지 또는 여행 미포함 장소',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
          '413': {
            description: '2MB 초과 이미지',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
          '415': {
            description: '지원하지 않는 이미지 형식',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
          '429': {
            description: '시간당 사진 저장 한도 초과',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
        },
      },
    },
    '/api/poster': {
      post: {
        tags: ['Poster'],
        summary: '행사 포스터 OCR 추출 및 일정 초안 생성',
        security: [{ sessionCookie: [] }],
        requestBody: {
          required: true,
          content: {
            'image/jpeg': { schema: { type: 'string', format: 'binary' } },
            'image/png': { schema: { type: 'string', format: 'binary' } },
            'image/webp': { schema: { type: 'string', format: 'binary' } },
          },
        },
        responses: {
          '200': {
            description: 'OCR 추출 원문 및 일정 초안',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    text: { type: 'string' },
                    draft: { $ref: '#/components/schemas/PosterOutput' },
                    mode: { type: 'string', enum: ['ocr', 'ocr-clova'] },
                    message: { type: 'string' },
                  },
                  required: ['text', 'draft', 'mode', 'message'],
                },
              },
            },
          },
          '429': {
            description: '시간당 포스터 인식 한도 초과',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
          '503': {
            description: 'CLOVA OCR 설정 누락',
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
        summary: '경기(시흥권) 권역별 현재 기상·5일 예보 및 맞춤 관광지 조회',
        parameters: [
          {
            name: 'region',
            in: 'query',
            required: false,
            description: '경기(시흥권) 권역명 (미지정 시 전체)',
            schema: { type: 'string', default: '전체' },
          },
        ],
        responses: {
          '200': {
            description: '권역별 기상 정보 및 추천 관광지 ID 목록',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/WeatherResponse' },
              },
            },
          },
          '400': {
            description: '지원하지 않는 권역 파라미터',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
        },
      },
    },
    '/api/openapi': {
      get: {
        tags: ['Docs'],
        summary: 'OpenAPI 3.1.0 JSON 명세 조회',
        responses: {
          '200': {
            description: 'OpenAPI 3.1.0 문서',
            content: { 'application/json': { schema: { type: 'object' } } },
          },
        },
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
