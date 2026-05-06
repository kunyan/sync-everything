export interface StravaClientOptions {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  accessToken?: string;
  expiresAt?: number;
  timeout?: number;
  onTokenRefresh?: (tokens: TokenData) => void;
}

export interface TokenData {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

export interface AuthorizeOptions {
  clientId: string;
  clientSecret: string;
  port?: number;
  scopes?: string[];
}

export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  athlete: { id: number; firstname: string; lastname: string };
}

export interface SummaryActivity {
  id: number;
  name: string;
  sport_type: string;
  start_date: string;
  start_date_local: string;
  distance: number;
  moving_time: number;
  elapsed_time: number;
  total_elevation_gain: number;
  average_watts?: number;
  external_id?: string;
  [key: string]: unknown;
}

export interface Upload {
  id: number;
  id_str: string;
  external_id: string | null;
  error: string | null;
  status: string;
  activity_id: number | null;
}

export interface TokenResponse {
  token_type: string;
  access_token: string;
  refresh_token: string;
  expires_at: number;
  expires_in: number;
}

export interface AuthTokenResponse extends TokenResponse {
  athlete: {
    id: number;
    firstname: string;
    lastname: string;
    [key: string]: unknown;
  };
}
