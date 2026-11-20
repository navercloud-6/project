export interface NaverLatLng {
  lat(): number;
  lng(): number;
}

export interface NaverLatLngBounds {
  extend(coord: NaverLatLng): void;
}

export interface NaverPoint {
  x: number;
  y: number;
}

export interface NaverMapEventListener {
  eventName?: string;
}

export interface NaverMap {
  setCenter(coord: NaverLatLng): void;
  setZoom(zoom: number, effect?: boolean): void;
  panTo(coord: NaverLatLng, transitionOptions?: Record<string, unknown>): void;
  fitBounds(
    bounds: NaverLatLngBounds,
    margin?: { top?: number; right?: number; bottom?: number; left?: number },
  ): void;
  destroy(): void;
}

export interface NaverMarker {
  setMap(map: NaverMap | null): void;
  setZIndex(zIndex: number): void;
}

export interface NaverPolyline {
  setMap(map: NaverMap | null): void;
}

export interface NaverMaps {
  LatLng: new (lat: number, lng: number) => NaverLatLng;
  LatLngBounds: new (sw?: NaverLatLng, ne?: NaverLatLng) => NaverLatLngBounds;
  Point: new (x: number, y: number) => NaverPoint;
  Map: new (element: HTMLElement, options: Record<string, unknown>) => NaverMap;
  Marker: new (options: Record<string, unknown>) => NaverMarker;
  Polyline: new (options: Record<string, unknown>) => NaverPolyline;
  Position?: {
    TOP_RIGHT?: number;
    BOTTOM_RIGHT?: number;
  };
  Event: {
    addListener(
      target: unknown,
      eventName: string,
      handler: () => void,
    ): NaverMapEventListener;
    removeListener(listener: NaverMapEventListener): void;
    trigger(target: unknown, eventName: string): void;
  };
}

declare global {
  interface Window {
    naver?: { maps?: NaverMaps };
    navermap_authFailure?: () => void;
  }
}

const CLIENT_ID_PATTERN = /^[A-Za-z0-9._-]{1,128}$/;

export function normalizeNaverMapClientId(value?: string | null): string {
  const trimmed = value?.trim() ?? '';
  return CLIENT_ID_PATTERN.test(trimmed) ? trimmed : '';
}

export function naverMapClientId(): string {
  return normalizeNaverMapClientId(process.env.NAVER_MAP_CLIENT_ID);
}

export function naverMapScriptUrl(clientId: string): string | null {
  const normalized = normalizeNaverMapClientId(clientId);
  if (!normalized) return null;
  return `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${encodeURIComponent(normalized)}`;
}

export function naverMapSearchUrl(place: {
  name: string;
  address?: string | null;
}): string {
  const query = place.address?.trim() || place.name.trim();
  return `https://map.naver.com/p/search/${encodeURIComponent(query)}`;
}

let loadedKey = '';
let pendingLoad: Promise<NaverMaps> | null = null;
let authFailed = false;
let authHookInstalled = false;
const authFailureListeners = new Set<() => void>();

function installAuthFailureHook() {
  if (typeof window === 'undefined' || authHookInstalled) return;
  authHookInstalled = true;
  const previous = window.navermap_authFailure;
  window.navermap_authFailure = () => {
    authFailed = true;
    pendingLoad = null;
    for (const listener of authFailureListeners) listener();
    if (typeof previous === 'function') previous();
  };
}

export function onNaverMapAuthFailure(listener: () => void): () => void {
  if (authFailed) {
    listener();
    return () => {};
  }
  installAuthFailureHook();
  authFailureListeners.add(listener);
  return () => {
    authFailureListeners.delete(listener);
  };
}

export function loadNaverMaps(
  clientId: string,
  timeoutMs = 10000,
): Promise<NaverMaps> {
  const normalized = normalizeNaverMapClientId(clientId);
  const url = naverMapScriptUrl(normalized);
  if (!url) {
    return Promise.reject(
      new Error('네이버 지도 Client ID 형식이 올바르지 않습니다.'),
    );
  }
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.reject(
      new Error('브라우저 환경에서만 네이버 지도를 불러올 수 있습니다.'),
    );
  }
  if (authFailed) {
    return Promise.reject(new Error('네이버 지도 인증에 실패했습니다.'));
  }
  installAuthFailureHook();

  if (window.naver?.maps?.Map) {
    return Promise.resolve(window.naver.maps);
  }
  if (pendingLoad && loadedKey === normalized) {
    return pendingLoad;
  }

  loadedKey = normalized;
  pendingLoad = new Promise<NaverMaps>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[data-naver-maps-sdk="true"]',
    );
    const script =
      existing && existing.dataset.naverMapsKey === normalized
        ? existing
        : document.createElement('script');

    let settled = false;
    const finish = (error?: Error, maps?: NaverMaps) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      unsubscribeAuth();
      if (error || !maps) {
        pendingLoad = null;
        if (!existing && script.parentNode) {
          script.parentNode.removeChild(script);
        }
        reject(error ?? new Error('네이버 지도를 초기화하지 못했습니다.'));
      } else {
        resolve(maps);
      }
    };

    const unsubscribeAuth = onNaverMapAuthFailure(() => {
      finish(new Error('네이버 지도 인증에 실패했습니다.'));
    });

    const timer = setTimeout(() => {
      finish(new Error('네이버 지도 응답 시간이 초과되었습니다.'));
    }, timeoutMs);

    const onLoad = () => {
      if (authFailed) {
        finish(new Error('네이버 지도 인증에 실패했습니다.'));
        return;
      }
      if (window.naver?.maps?.Map) {
        finish(undefined, window.naver.maps);
      } else {
        finish(new Error('네이버 지도 SDK를 확인하지 못했습니다.'));
      }
    };

    const onError = () => {
      finish(new Error('네이버 지도 스크립트를 불러오지 못했습니다.'));
    };

    script.addEventListener('load', onLoad, { once: true });
    script.addEventListener('error', onError, { once: true });

    if (script !== existing) {
      script.type = 'text/javascript';
      script.async = true;
      script.defer = true;
      script.src = url;
      script.dataset.naverMapsSdk = 'true';
      script.dataset.naverMapsKey = normalized;
      document.head.appendChild(script);
    }
  });

  return pendingLoad;
}

export function resetNaverMapsLoader() {
  loadedKey = '';
  pendingLoad = null;
  authFailed = false;
  authHookInstalled = false;
  authFailureListeners.clear();
}
