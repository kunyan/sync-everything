export interface Activity {
  id: string;
  rid: string | null;
  date: string | null;
  name: string | null;
  created_at: string;
  start_riding_time: string;
  distance_km: number;
  time_formatted: string;
  time_seconds: number;
  load_tss: number;
  avg_speed_kmh: number;
  avg_power_w: number;
  avg_heart_bpm: number;
}

export interface ActivityDetail {
  _id: string;
  id: number;
  date: string;
  startRidingTime: number;
  totalTime: number;
  totalDistance: number;
  elevation: number;
  cal: number;
  NP: number;
  TSS: number;
  avgPower: number;
  maxPower: number;
  avgHeart: number;
  maxHeart: number;
  avgSpeed: number;
  maxSpeed: number;
  avgCadence: number;
  maxCadence: number;
  fileKey: string;
  fitUrl: string;
  durl: string;
  type: number;
  FTP: number;
  [key: string]: unknown;
}

export interface Pagination {
  total_pages: number;
  has_more: boolean;
  current_page: number;
  per_page: number;
  total: number;
}

export interface LoginResponseData {
  token: string;
  refresh_token: string;
  userinfo: {
    uid: number;
  };
}

export interface LoginResponse {
  data: LoginResponseData[];
}

export interface TokenExchangeResponse {
  code: number;
  error: string;
  data: {
    token: string;
    uid: number;
  };
}

export interface ActivityListResponse {
  code: number;
  message: string;
  data: {
    list: Activity[];
    pagination: Pagination;
  };
}

export interface ActivityDetailResponse {
  code: number;
  data: {
    ridingRecord: ActivityDetail;
  };
}

export interface OnelapClientOptions {
  secret: string;
  timeout?: number;
}
