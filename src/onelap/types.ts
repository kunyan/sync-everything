export interface Activity {
  _id: string;
  id: number;
  fileKey: string;
  date: string;
  durl: string;
}

export interface ActivityDetail {
  _id: string;
  [key: string]: unknown;
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

export interface ActivityListResponse {
  data: Activity[];
}

export interface ActivityDetailResponse {
  data: ActivityDetail;
}

export interface OnelapClientOptions {
  timeout?: number;
}
