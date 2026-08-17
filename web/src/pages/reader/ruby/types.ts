export interface RubySegment {
  text: string;
  reading?: string;
}

export interface RubyRequest {
  id: number;
  text: string;
}

export type RubyResponse =
  | { id: number; segments: RubySegment[] }
  | { id: number; error: string };
