export type DemoUser = {
  id: string;
  name: string;
  role: string;
  is_active: boolean;
  avatar_initials?: string | null;
};

export type Quarry = {
  id: string;
  quarry_name: string;
  quarry_code: string;
  latitude?: number | null;
  longitude?: number | null;
};

export type BlockOut = {
  id: string;
  block_code: string;
  quarry_id: string;
  granite_category_id: string;
  capture_date: string;
  operator_id: string;
  status: string;
};

export type SessionOut = {
  id: string;
  block_id: string;
  operator_id: string;
  status: string;
};

export type ImageOut = {
  id: string;
  capture_session_id: string;
  capture_side: string;
  accepted: boolean;
  rejected: boolean;
};
